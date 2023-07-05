import { AntiSpamAction } from '@prisma/client'
import { Guild, GuildMember, Message } from 'discord.js'
import { ComponentContext, SlashCreator } from 'slash-create'
import { expireQueuedAction, fetchQueuedActionByAuthorId, fetchQueuedActionByMessageId, removeQueuedAction } from '../cache/op'
import client from '../clients/discord'
import { QueuedAction } from '../clients/redis'
import color from '../utils/color'
import { errStack } from '../utils/index'
import { DetectionResult } from './spam-detection'
import { defaultLogEmbed, getChannel, getLogChannel, getQueueChannel, makeComponents, makeQueueCallback } from './utils'

export type ActionFunction = (member: GuildMember, message: Message<true>, result: DetectionResult) => Promise<unknown>

const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: async (member, message, result) => {
    if (process.env.NODE_ENV === 'production') {
      await member.ban({
        reason: 'Spam detected.'
      })
    } else {
      await message.reply({
        content: `Action taken: ${result.action}`
      })
    }

    const queuedAction = await fetchQueuedActionByAuthorId(member.id)
    if (queuedAction) {
      logger.debug(`Updating embed for author ${member.id} to ban`)
      const queueChannel = await getQueueChannel(message.guild)
      const queueMessage = await queueChannel.messages.fetch(queuedAction.queueMessageId)

      await queueMessage.edit({
        embeds: [{
          ...defaultLogEmbed(message, result),
          title: `Automatically upgraded to ban, spam detected (@${member.user.username})`,
          color: color.red
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: 'ban'
        })]
      })
      // Expire it soon, but not immediately, so that any pending actions will be able to see that there's
      // a queued action waiting and abort accordingly
      await expireQueuedAction(queuedAction)
    } else {
      const logChannel = await getLogChannel(message.guild)
      await logChannel.send({
        embeds: [defaultLogEmbed(message, result)]
      })
    }
  },
  KICK: async (member, message, result) => {
    if (process.env.NODE_ENV === 'production') {
      await member.kick('Spam detected.')
    } else {
      await message.reply({
        content: `Action taken: ${result.action}`
      })
    }

    const queuedAction = await fetchQueuedActionByMessageId(member.id)
    if (queuedAction) {
      logger.debug(`Updating embed for author ${member.id} to kick`)
      const queueChannel = await getQueueChannel(message.guild)
      const queueMessage = await queueChannel.messages.fetch(queuedAction.queueMessageId)

      await queueMessage.edit({
        embeds: [{
          ...defaultLogEmbed(message, result),
          title: `Automatically upgraded to kick, spam detected (@${member.user.username})`,
          color: color.red
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: 'kick'
        })]
      })
      // Expire it soon, but not immediately, so that any pending actions will be able to see that there's
      // a queued action waiting and abort accordingly
      await expireQueuedAction(queuedAction)
    } else {
      const logChannel = await getLogChannel(message.guild)
      await logChannel.send({
        embeds: [defaultLogEmbed(message, result)]
      })
    }
  },
  QUEUE_BAN: makeQueueCallback('ban'),
  QUEUE_KICK: makeQueueCallback('kick')

}

type WrappedComponentCallback = (ctx: ComponentContext, guild: Guild, moderator: GuildMember, author: GuildMember, action: QueuedAction) => Promise<void>
function makeComponentCallback (cb: WrappedComponentCallback): (ctx: ComponentContext) => void {
  function assertValue (value: unknown, thrownMessage: string, ctx: ComponentContext): asserts value {
    if (!value) {
      // Cant use await because assertion functions must be sync
      ctx.send('Could not confirm the action', {
        ephemeral: true
      }).catch(err => logger.error(`Failed to send button response\n${errStack(err)}`))
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
      assertValue(queuedAction, `Could not find queued action for message ${ctx.message.id}`, ctx)

      const author = await guild.members.fetch(queuedAction.authorId)
      assertValue(author, `Could not fetch author ${queuedAction.authorId}`, ctx)

      await cb(ctx, guild, member, author, queuedAction)
    })().catch(err => logger.error(errStack(err)))
  }
}

export function initActionComponents (creator: SlashCreator): void {
  creator.registerGlobalComponent('confirm', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    const { queueMessageId, originalMessageId, originalChannelId, upgradeTo } = queuedAction
    logger.debug(`Confirming ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    const queueChannel = await getQueueChannel(guild)

    if (process.env.NODE_ENV === 'production') {
      if (upgradeTo === 'ban') {
        await author.ban({
          reason: 'Spam detected.'
        })
      } else if (upgradeTo === 'kick') {
        await author.kick('Spam detected.')
      } else {
        throw new Error(`Unactionable action ${upgradeTo}`)
      }
    } else {
      try {
        const originalChannel = await getChannel(guild, 'orignal', originalChannelId)
        const originalMessage = await originalChannel.messages.fetch(originalMessageId)
        await originalMessage.reply({
          content: `Action upgraded to: ${upgradeTo}`
        })
      } catch (err) {
        logger.warn(`Failed to fetch/reply to original action with upgradeTo = ${upgradeTo}\n${errStack(err)}`)
      }
    }

    try {
      const queueMessage = await queueChannel.messages.fetch(queueMessageId)

      await queueMessage.edit({
        embeds: [{
          ...queueMessage.embeds[0].data,
          title: `Moderator (@${moderator.user.username}) approved ${upgradeTo}, spam detected (@${author.user.username})`,
          color: color.red
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: upgradeTo
        })]
      })
    } catch (err) {
      logger.warn(`Queue message ${queueMessageId} was not found, presumably it was deleted, ignoring`)
    }

    await removeQueuedAction(queuedAction)

    await ctx.send('Confirmed the action', {
      ephemeral: true
    })
  }))

  creator.registerGlobalComponent('cancel', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    await removeQueuedAction(queuedAction)

    const { queueMessageId, originalMessageId, originalChannelId, upgradeTo } = queuedAction
    logger.debug(`Cancelling ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    const queueChannel = await getQueueChannel(guild)

    if (process.env.NODE_ENV !== 'production') {
      try {
        const originalChannel = await getChannel(guild, 'orignal', originalChannelId)
        const originalMessage = await originalChannel.messages.fetch(originalMessageId)
        await originalMessage.reply({
          content: `Action ${upgradeTo} cancelled`
        })
      } catch (err) {
        logger.warn(`Failed to fetch/reply to original action with upgradeTo = ${upgradeTo}\n${errStack(err)}`)
      }
    }
    try {
      const queueMessage = await queueChannel.messages.fetch(queueMessageId)

      await queueMessage.edit({
        embeds: [{
          ...queueMessage.embeds[0].data,
          title: `Moderator (@${moderator.user.username}) cancelled ${upgradeTo} for (@${author.user.username})`,
          color: color.grey
        }],
        components: [makeComponents({
          disabled: true,
          confirmAction: upgradeTo
        })]
      })
    } catch (err) {
      logger.warn(`Queue message ${queueMessageId} was not found, presumably it was deleted, ignoring`)
    }

    await ctx.send('Cancelled the action', {
      ephemeral: true
    })
  }))
}

export default actions
