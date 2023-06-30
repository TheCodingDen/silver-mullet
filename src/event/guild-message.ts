import { Message } from 'discord.js'
import Nilsimsa from '../vendor/nilsimsa'
import { addMessage, fetchMessagesByAuthor } from '../cache/op'
import { executeAntiSpamDetection } from '../detection/spam-detection'
import prisma from '../clients/prisma'

const MATCH_WEIGHTS = {
  nitro: 2,
  '@everyone': 3
}

export async function onGuildMessage (message: Message): Promise<void> {
  if (message.author.bot || message.channel.isDMBased() || !message.guild) {
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

  await addMessage(messageToCache)

  logger.debug('Entering anti spam detection')

  const antiSpamResult = executeAntiSpamDetection(messageToCache, authorMessages, MATCH_WEIGHTS)

  logger.debug(
    `action: ${antiSpamResult.action}, average similarity: ${antiSpamResult.averageSimilarity}, original-content: ${message.content.substring(0, 10)}`
  )
  for (const comparison of antiSpamResult.comparisons) {
    logger.debug(
      `similarity: ${comparison.similarityToPostedContent}, matches: ${
        JSON.stringify(comparison.pointsFromMatches ?? {}, undefined, 2)
      }, content-preview: ${comparison.comparedContent.content.substring(0, 10)}`
    )
  }

  // TODO: Action anti spam result here
  logger.debug('Anti spam finished')
}
