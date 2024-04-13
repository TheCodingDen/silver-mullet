import { Guild, GuildMember, Message, MessageEditOptions } from 'discord.js'
import { QueuedAction } from '../clients/redis'
import { getQueueChannel, makeComponents } from '../detection/utils'
import { ComponentContext } from 'slash-create'
import { errStack } from '../utils'
import { sendFailure } from '../utils/commands'
import client from '../clients/discord'
import { fetchQueuedActionByMessageId, removeQueuedAction } from '../cache/op'
import color from '../utils/color'

export async function updateQueueMessage (queuedAction: QueuedAction, guild: Guild, newMessage: (queueMessage: Message) => MessageEditOptions): Promise<void> {
  const { queueMessageId } = queuedAction

  const queueChannel = await getQueueChannel(guild)
  try {
    const queueMessage = await queueChannel.messages.fetch(queueMessageId)
    await queueMessage.edit(newMessage(queueMessage))
  } catch (err) {
    logger.warn(`Queue message ${queueMessageId} was not found, presumably it was deleted, ignoring`)
  }
}

export type WrappedComponentCallback = (ctx: ComponentContext, guild: Guild, moderator: GuildMember, author: GuildMember, action: QueuedAction) => Promise<void>
export function makeComponentCallback (cb: WrappedComponentCallback): (ctx: ComponentContext) => void {
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
      const moderator = await guild.members.fetch(ctx.member.id)

      // Okay to assert, needs to exist (and should, the moderator triggered this event)
      assertValue(moderator, `Could not resolve moderator ${ctx.member.id}`, ctx)

      const queuedAction = await fetchQueuedActionByMessageId(ctx.message.id)
      assertValue(queuedAction, `Could not find queued action for message ${ctx.message.id}, it may have been expired.`, ctx)

      // Try to fetch multiple times, in case the API decided to die
      let target

      try {
        target = await guild.members.fetch(queuedAction.authorId)
      } catch {
        // Target may have been banned, left, etc
        await removeQueuedAction(queuedAction)
        await updateQueueMessage(queuedAction, guild, queueMessage => ({
          embeds: [{
            ...queueMessage.embeds[0].data,
            title: 'User could not be found, cancelled automatically.',
            color: color.grey
          }],
          components: [makeComponents({
            disabled: true,
            confirmAction: queuedAction.upgradeTo
          })]
        }))

        await ctx.send({
          content: `Could not resolve member with ID ${queuedAction.authorId}, assuming already actioned. Cancelling this action.`,
          ephemeral: true
        })
        return
      }

      await cb(ctx, guild, moderator, target, queuedAction)
    })().catch(err => logger.error(`Error running component callback:\n${errStack(err)}`))
  }
}
