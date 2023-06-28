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

  // Check if the channel, its parent, the author, or any of their roles are ignored
  const shouldIgnoreMessage = await (prisma.ignore.count({
    where: {
      OR: [
        {
          snowflake: message.channelId
        },
        {
          // Just default to something that cant exist, it's the easiest way to formulate the query
          snowflake: message.channel.parentId ?? 'nil'
        },
        {
          snowflake: message.author.id
        },
        ...member.roles.cache.map((r) => ({
          snowflake: r.id
        }))
      ]
    }
  })) > 0

  if (shouldIgnoreMessage) {
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
