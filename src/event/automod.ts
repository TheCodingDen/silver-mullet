import { AutoModerationActionExecution, AutoModerationActionType } from 'discord.js'
import { addMessage } from '../cache/op'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import { actionFilterHit } from '../detection/actions'
import { executeFilterDetection } from '../detection/filter-detection'
import { shouldIgnoreMessage } from '../utils/ignore'
import Nilsimsa from '../vendor/nilsimsa'

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
    await actionFilterHit(filterResult, member)
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
