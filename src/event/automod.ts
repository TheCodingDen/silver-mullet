import { AutoModerationActionExecution, AutoModerationActionType } from 'discord.js'
import { addMessage } from '../cache/op'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import { actionFilterHit } from '../detection/actions'
import { executeFilterDetection } from '../detection/filter-detection'
import { shouldIgnoreMessage } from '../utils/ignore'
import Nilsimsa from '../vendor/nilsimsa'
import emoji from '../utils/emoji'

export async function onAutomodHit (event: AutoModerationActionExecution): Promise<void> {
  const { alertSystemMessageId, user, channel, guild } = event
  logger.debug(`Got automod event from @${user?.username ?? '<unknown-user>'} in channel ${channel?.id ?? '<unknown-channel>'}`)

  // Due to Discord not being able to structure an API to save its life, we must ignore every single event that isn't a
  // SendAlertMessage. This is because SendAlertMessage is the only event type that contains the alertSystemMessageId, which we require.
  if (event.action.type !== AutoModerationActionType.SendAlertMessage) {
    logger.debug(`Ignoring event type ${event.action.type}`)
    return
  }

  // Fatal error, there was no log attached with this execution
  // 1) We use the message ID of the log as the unique ID in the cache
  // 2) All automod executions in TCD should be logged. If not, there is a misconfiguration that should
  // be immediately reported
  if (!alertSystemMessageId) {
    logger.error(`No log message received for automod rule ${event.ruleId} (name: ${event.autoModerationRule?.name})`)
    return
  }

  if (!user || !channel) {
    logger.error(`Cannot action AutoMod event, the event is missing critical details (user: @${user?.username ?? '<unknown-user>'}, channel: ${channel?.id ?? '<unknown-channel>'})`)
    return
  }

  if (channel.isDMBased()) {
    logger.error(`Somehow got an automod event from a "DM based" channel: ${channel.id}`)
    return
  }

  if (user.bot) {
    return
  }

  // Thank d.js for their lovely API design regarding this song and dance
  const automodLogChannelId = event.action.metadata.channelId
  if (!automodLogChannelId) {
    // We check the type of the event above, so we should always get a channel ID.
    logger.error('No automodChannelId recieved? This should be impossible')
    return
  }

  const automodLogChannel = await guild.channels.fetch(automodLogChannelId)
  if (!automodLogChannel) {
    logger.error(`Automod log channel ${automodLogChannelId} was not in guild ${guild.id}?`)
    return
  }

  if (!automodLogChannel.isTextBased()) {
    logger.error(`Somehow automod log channel ${automodLogChannelId} was not text based?`)
    return
  }

  const automodMessage = await automodLogChannel.messages.fetch(alertSystemMessageId)
  const member = await event.guild.members.fetch(user.id)
  if (await shouldIgnoreMessage(channel.id, channel.parentId, member)) {
    logger.debug(`Ignoring message from ${user.id} in channel ${channel.id} (parent: ${channel.parentId})`)
  }

  const messageToCache: CachedMessage = {
    eventId: alertSystemMessageId,
    authorId: user.id,
    channelId: channel.id,
    content: event.content,
    hexHash: new Nilsimsa(event.content).digest('hex')
  }

  const filterResult = await executeFilterDetection(messageToCache, guild.id)
  if (filterResult) {
    const actionResult = await actionFilterHit(filterResult, member)

    if (actionResult.success) {
      await automodMessage.react(emoji.success)
    } else {
      await automodMessage.react(emoji.error)
    }

    return
  }

  const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
    orderBy: {
      version: 'desc'
    }
  })

  // It's *okay* to abort here, because we already actioned a filter above
  if (!settings) {
    logger.error('Cannot continue to caching stage of message handler without CCAS settings present')
    return
  }

  await addMessage(messageToCache, settings.cacheTTLSeconds)
}
