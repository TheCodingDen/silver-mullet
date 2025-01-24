import { Message, MessageType } from 'discord.js'
import { addMessage, fetchMessagesByAuthor } from '../cache/op'
import prisma from '../clients/prisma'
import { actionFilterHit, actionURLHit, actions } from '../actions/'
import { executeAntiSpamDetection } from '../detection/spam-detection'
import { errStack } from '../utils/index'
import { scanURLs } from '../detection/url-scan'
import Nilsimsa from '../vendor/nilsimsa'
import { retryCallback } from '../utils/retry'
import { executeFilterDetection } from '../detection/filter-detection'
import { CachedMessage } from '../clients/redis'

const IGNORED_TYPES: MessageType[] = [
  // Ignore "system automod logs" because they cause confusing events to get sent to us
  // (Discord makes it look like the user who tripped the automod sent this log)
  MessageType.AutoModerationAction
]

// Store currently executing actions per user, so that we get order between actions as to avoid collision
const actionPromises = new Map<string, Promise<unknown>>()

export async function onGuildMessage (message: Message): Promise<void> {
  if (message.author.bot || message.channel.isDMBased() || !message.inGuild()) {
    return
  }

  if (IGNORED_TYPES.includes(message.type)) {
    return
  }

  const member = await message.guild.members.fetch(message.author.id)

  // Declare all conditions for the DB to check against
  // will search channels, categories, and roles.
  const conditions = [
    {
      snowflake: message.channel.id
    }
  ]

  // Only search for the parent if it exists
  if (message.channel.parentId) {
    conditions.push({
      snowflake: message.channel.parentId
    })
  }

  // Search for each role the author has
  for (const [, role] of member.roles.cache) {
    conditions.push({
      snowflake: role.id
    })
  }

  // If there's > 0 entries in the DB, that means there's
  // an ignore entry for a part of the message, so ignore it.
  const ignoreEntryCount = await prisma.ignore.count({
    where: {
      OR: conditions
    }
  })

  if (ignoreEntryCount > 0) {
    logger.debug(`Ignoring message from ${message.author.id} in channel ${message.channel.id} (parent: ${message.channel.parentId})`)
    return
  }

  const messageToCache: CachedMessage = {
    messageId: message.id,
    guildId: message.guild.id,
    authorId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    hexHash: new Nilsimsa(message.content).digest('hex')
  }

  // IMPORTANT: Run this concurrently
  void scanURLs(messageToCache, message.guild).then(urlResult => {
    if (urlResult) {
      logger.info(`Got a hit on URLs ${urlResult.trippedURLs}`)
      void actionURLHit(urlResult, member)
    }
  })

  const filterResult = await executeFilterDetection(messageToCache, message.guild)
  if (filterResult) {
    const actionResult = await actionFilterHit(filterResult, member)
    if (actionResult.success) {
      return
    }

    // Otherwise, if we could not action due to error, continue on to anti spam
  }

  const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
    orderBy: {
      version: 'desc'
    }
  })

  // Allow ignore handling, but disallow caching. Even though fetching could occur, it makes no sense to proceed here
  // because without settings we will have to abort anyways
  if (!settings) {
    logger.error('Cannot continue to caching stage of message handler without CCAS settings present')
    return
  }

  // Fetch author messages from Redis cache
  logger.debug(`Fetching messages from author "${message.author.id}"`)
  const authorMessagesResult = await retryCallback(async () => await fetchMessagesByAuthor(message.author.id, message.guildId), {
    attempts: 3
  })

  if (!authorMessagesResult.success) {
    // FIXME: This should not be required, tracking https://github.com/redis/redis-om-node/issues/195
    logger.error(`Tried 3 times to fetch author messages, all 3 attempts failed. Error(s):\n${authorMessagesResult.errors.map(errStack).join('\n\n')}`)
    return
  }

  const authorMessages = authorMessagesResult.value
  logger.debug(`Got ${authorMessages.length} messages from ${message.author.id}`)

  await addMessage(messageToCache, settings.cacheTTLSeconds)

  logger.debug('Entering anti spam detection')

  const antiSpamResult = await executeAntiSpamDetection(messageToCache, message.guildId, authorMessages)
  if (antiSpamResult === undefined) {
    logger.debug('No spam detected.')
    return
  }

  const { action, averageSimilarity, comparisons } = antiSpamResult

  const content = process.env.NODE_ENV === 'production' ? '<content ommited in production>' : message.content.substring(0, 10)
  logger.debug(
    `action: ${action}, average similarity: ${averageSimilarity}, original-content: ${content}`
  )
  for (const comparison of comparisons) {
    const comparisonContent = process.env.NODE_ENV === 'production' ? '<omitted>' : comparison.comparedContent.content.substring(0, 10)
    logger.debug(
      `similarity: ${comparison.similarityToPostedContent}, matches: ${
        JSON.stringify(comparison.pointsFromMatches ?? {}, undefined, 2)
      }, content-preview: ${comparisonContent}`
    )
  }

  const actionFn = actions[action]
  const runningAction = actionPromises.get(member.id)

  // Run this as late as possible before executing the new action, so that we do not miss it
  if (runningAction) {
    try {
      logger.debug(`Waiting for already executing action to complete on user ${member.id}`)
      await runningAction
      logger.debug(`Executing existing action completed on user ${member.id}, proceding with next action`)
    } catch (err) {
      // Log, but proceed with our event
      logger.error(`Error whilst waiting for already executing action on user ${member.id}\n${errStack(err)}`)
    }
  }

  let actionComplete = false
  let tries = 3

  while (!actionComplete && tries !== 0) {
    try {
      const promise = actionFn(member, {
        author: member,
        content: message.content,
        guild: message.guild,
        channel: message.channel
      }, antiSpamResult)
      actionPromises.set(member.id, promise)
      await promise
      actionComplete = true
      actionPromises.delete(member.id)
    } catch (err) {
      logger.warn(`Failed to ${action} member (${tries} tries left):\n${err}`)
    }

    tries--
  }

  logger.debug('Anti spam finished')
}
