import { Message } from 'discord.js'
import { addMessage, fetchMessagesByAuthor } from '../cache/op'
import prisma from '../clients/prisma'
import actions from '../detection/actions'
import { executeFilterDetection } from '../detection/filter-detection'
import { executeAntiSpamDetection } from '../detection/spam-detection'
import { errStack } from '../utils/index'
import Nilsimsa from '../vendor/nilsimsa'

// Store currently executing actions per user, so that we get order between actions as to avoid collision
const actionPromises = new Map<string, Promise<unknown>>()

export async function onGuildMessage (message: Message): Promise<void> {
  if (message.author.bot || message.channel.isDMBased() || !message.inGuild()) {
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
  const authorMessages = await fetchMessagesByAuthor(message.author.id)
  logger.debug(`Got ${authorMessages.length} messages from ${message.author.id}`)

  const messageToCache = {
    messageId: message.id,
    authorId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    hexHash: new Nilsimsa(message.content).digest('hex')
  }

  await addMessage(messageToCache, settings.cacheTTLSeconds)

  logger.debug('Entering anti spam detection')

  const [antiSpamResult, filterResult] = await Promise.all([
    executeAntiSpamDetection(messageToCache, authorMessages),
    executeFilterDetection(messageToCache)
  ])

  const { averageSimilarity, comparisons } = antiSpamResult
  const { highestAppliedRule, hits } = filterResult

  // Log all of our debug stuff before potentially aborting

  logger.debug(
    `antispam: action: ${antiSpamResult.action}, average similarity: ${averageSimilarity}, original-content: ${message.content.substring(0, 10)}`
  )
  for (const comparison of comparisons) {
    logger.debug(
      `antispam: similarity: ${comparison.similarityToPostedContent}, matches: ${
        JSON.stringify(comparison.pointsFromMatches ?? {}, undefined, 2)
      }, content-preview: ${comparison.comparedContent.content.substring(0, 10)}`
    )
  }

  logger.debug(
    `filter: action: ${highestAppliedRule?.action}, rule: ${JSON.stringify(highestAppliedRule, undefined, 2)}`
  )

  for (const hit of hits) {
    logger.debug(
      `filter: "${hit.message.content}" matched "${hit.rule.triggeringPhrase}" (action: ${hit.rule.action})`
    )
  }

  let applicableResult
  if (filterResult.action !== 'NOTHING') {
    applicableResult = filterResult
  } else if (antiSpamResult.action !== 'NOTHING') {
    applicableResult = antiSpamResult
  } else {
    // No valid result, abort here
    logger.debug(`No spam or filter result found for user ${message.author.id}`)
    return
  }

  if (applicableResult.action === 'NOTHING') {
    // For type inferrence in the index below, better than a cast
    throw new Error('impossible')
  }

  const actionFn = actions[applicableResult.action]

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
      const promise = actionFn(member, message, applicableResult)
      actionPromises.set(member.id, promise)
      await promise
      actionComplete = true
      actionPromises.delete(member.id)
    } catch (err) {
      logger.warn(`Failed to ${applicableResult.action} member (${tries} tries left):\n${err}`)
    }

    tries--
  }

  logger.debug('Anti spam finished')
}
