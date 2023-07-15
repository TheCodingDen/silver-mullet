import { AntiSpamAction } from '@prisma/client'
import { Guild, GuildMember, Message, MessageEditOptions } from 'discord.js'
import { ComponentContext, SlashCreator } from 'slash-create'
import { expireQueuedAction, fetchQueuedActionByAuthorId, fetchQueuedActionByMessageId, removeQueuedAction } from '../cache/op'
import client from '../clients/discord'
import { ActionUpgrade, QueuedAction } from '../clients/redis'
import color from '../utils/color'
import { sendFailure, sendSuccess } from '../utils/commands'
import { errStack } from '../utils/index'
import { retryCallback } from '../utils/retry'
import { DetectionResult } from './spam-detection'
import { makeDefaultEmbed, getLogChannel, getQueueChannel, makeComponents, makeQueueCallback, messageUser, handleRetryResult } from './utils'

export type ActionFunction = (member: GuildMember, message: Message<true>, result: DetectionResult) => Promise<unknown>

const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: async (member, message, result) => {
    if (process.env.NODE_ENV === 'production') {
      const [banResult, messageResult] = await Promise.all([
        retryCallback(async () => await member.ban({
          reason: 'Spam detected.'
        }), {
          attempts: 3
        }),
        retryCallback(async () => await messageUser(member.user, {
          content: `You have been banned from ${member.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
        }), {
          attempts: 3
        })
      ])

      handleRetryResult(banResult, `When banning user ${member.user.username}`)
      handleRetryResult(messageResult, `When messaging banned user ${member.user.username}`)
    } else {
      const result = await retryCallback(async () => await messageUser(member.user, {
        content: `You would have been banned from ${member.guild.name} due to spam.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake banning ${member.user.username}`)
    }

    const queuedAction = await fetchQueuedActionByAuthorId(member.id)
    if (queuedAction) {
      logger.debug(`Updating embed for author ${member.id} to ban`)
      await updateQueueMessage(queuedAction, message.guild, () => ({
        embeds: [{
          ...makeDefaultEmbed(message, result),
          title: 'Automatically upgraded to ban, spam detected',
          color: color.red
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: ActionUpgrade.BAN
        })]
      }))
      // Expire it soon, but not immediately, so that any pending actions will be able to see that there's
      // a queued action waiting and abort accordingly
      await expireQueuedAction(queuedAction)
    } else {
      const logChannel = await getLogChannel(message.guild)
      await logChannel.send({
        embeds: [makeDefaultEmbed(message, result)]
      })
    }
  },
  KICK: async (member, message, result) => {
    if (process.env.NODE_ENV === 'production') {
      const [kickResult, messageResult] = await Promise.all([
        retryCallback(async () => await member.kick('Spam detected.'), {
          attempts: 3
        }),
        retryCallback(async () => await messageUser(member.user, {
          content: `You have been kicked from ${member.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
        }), {
          attempts: 3
        })
      ])

      handleRetryResult(kickResult, `When kicking user ${member.user.username}`)
      handleRetryResult(messageResult, `When messaging kicked user ${member.user.username}`)
    } else {
      const result = await retryCallback(async () => await messageUser(member.user, {
        content: `You would have been kicked from ${member.guild.name} due to spam.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake kicking ${member.user.username}`)
    }

    const queuedAction = await fetchQueuedActionByMessageId(member.id)
    if (queuedAction) {
      logger.debug(`Updating embed for author ${member.id} to kick`)
      await updateQueueMessage(queuedAction, message.guild, () => ({
        embeds: [{
          ...makeDefaultEmbed(message, result),
          title: 'Automatically upgraded to kick, spam detected',
          color: color.red
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: ActionUpgrade.KICK
        })]
      }))
      // Expire it soon, but not immediately, so that any pending actions will be able to see that there's
      // a queued action waiting and abort accordingly
      await expireQueuedAction(queuedAction)
    } else {
      const logChannel = await getLogChannel(message.guild)
      await logChannel.send({
        embeds: [makeDefaultEmbed(message, result)]
      })
    }
  },
  QUEUE_BAN: makeQueueCallback(ActionUpgrade.BAN),
  QUEUE_KICK: makeQueueCallback(ActionUpgrade.KICK)
}

type WrappedComponentCallback = (ctx: ComponentContext, guild: Guild, moderator: GuildMember, author: GuildMember, action: QueuedAction) => Promise<void>
function makeComponentCallback (cb: WrappedComponentCallback): (ctx: ComponentContext) => void {
  function assertValue (value: unknown, thrownMessage: string, ctx: ComponentContext): asserts value {
    if (!value) {
      // Cant use await because assertion functions must be sync
      sendFailure(`Could not confirm the action. Reason: "${thrownMessage}"`, ctx, true)
        .catch(err => logger.error(`Failed to send button response\n${errStack(err)}`))
      throw new Error(thrownMessage)
    }
  }

  return ctx => {
    (async () => {
      await ctx.acknowledge()

      // Both fields on `ctx` should be set here, as we are using guild only interactions
      assertValue(ctx.guildID, 'No guild ID set, this should never happen', ctx)
      assertValue(ctx.member, 'Member not set, this should never happen', ctx)

      const guild = await client.guilds.fetch(ctx.guildID)

      assertValue(guild, `Could not resolve guild ${ctx.guildID}`, ctx)
      const member = await guild.members.fetch(ctx.member.id)

      assertValue(member, `Could not resolve member ${ctx.member.id}`, ctx)

      const queuedAction = await fetchQueuedActionByMessageId(ctx.message.id)
      assertValue(queuedAction, `Could not find queued action for message ${ctx.message.id}, it may have been expired.`, ctx)

      const author = await guild.members.fetch(queuedAction.authorId)
      assertValue(author, `Could not fetch author ${queuedAction.authorId}`, ctx)

      await cb(ctx, guild, member, author, queuedAction)
    })().catch(err => logger.error(`Error running component callback:\n${errStack(err)}`))
  }
}

export function initActionComponents (creator: SlashCreator): void {
  creator.registerGlobalComponent('confirm', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    const { upgradeTo } = queuedAction
    logger.debug(`Confirming ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    if (process.env.NODE_ENV === 'production') {
      if (upgradeTo === ActionUpgrade.BAN) {
        const [banResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.ban({
            reason: 'Spam detected.'
          }), {
            attempts: 3
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: `You have been banned from ${author.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
          }), {
            attempts: 3
          })
        ])

        handleRetryResult(banResult, `When banning user ${author.user.username}`)
        handleRetryResult(messageResult, `When messaging banned user ${author.user.username}`)
      } else if (upgradeTo === ActionUpgrade.KICK) {
        const [kickResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.kick('Spam detected.'), {
            attempts: 3
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: `You have been kicked from ${author.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
          }), {
            attempts: 3
          })
        ])

        handleRetryResult(kickResult, `When kicking user ${author.user.username}`)
        handleRetryResult(messageResult, `When messaging kicked user ${author.user.username}`)
      } else {
        throw new Error(`Unactionable action ${upgradeTo}`)
      }
    } else {
      const result = await retryCallback(async () => await messageUser(author.user, {
        content: `Moderator confirmed ${upgradeTo} from ${author.guild.name} due to spam.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake kicking ${author.user.username}`)
    }

    await updateQueueMessage(queuedAction, guild, queueMessage => ({
      embeds: [{
        ...queueMessage.embeds[0].data,
        title: `Moderator approved ${upgradeTo}`,
        color: color.red,
        footer: {
          text: `Actioned by @${moderator.user.username}`,
          icon_url: moderator.user.displayAvatarURL()
        }
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: upgradeTo
      })]
    }))

    await removeQueuedAction(queuedAction)

    await sendSuccess('Confirmed the action.', ctx, true)
  }))

  creator.registerGlobalComponent('cancel', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    await removeQueuedAction(queuedAction)

    const { upgradeTo } = queuedAction
    logger.debug(`Cancelling ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    if (process.env.NODE_ENV !== 'production') {
      const result = await retryCallback(async () => await messageUser(author.user, {
        content: `Moderator canceled ${upgradeTo} from ${author.guild.name}.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake kicking ${author.user.username}`)
    }

    await updateQueueMessage(queuedAction, guild, queueMessage => ({
      embeds: [{
        ...queueMessage.embeds[0].data,
        title: `Moderator cancelled ${upgradeTo}`,
        color: color.grey,
        footer: {
          text: `Cancelled by @${moderator.user.username}`,
          icon_url: moderator.user.displayAvatarURL()
        }
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: upgradeTo
      })]
    }))

    await sendSuccess('Cancelled the action.', ctx, true)
  }))
}

async function updateQueueMessage (queuedAction: QueuedAction, guild: Guild, newMessage: (queueMessage: Message) => MessageEditOptions): Promise<void> {
  const { queueMessageId } = queuedAction

  const queueChannel = await getQueueChannel(guild)
  try {
    const queueMessage = await queueChannel.messages.fetch(queueMessageId)
    await queueMessage.edit(newMessage(queueMessage))
  } catch (err) {
    logger.warn(`Queue message ${queueMessageId} was not found, presumably it was deleted, ignoring`)
  }
}

export default actions
