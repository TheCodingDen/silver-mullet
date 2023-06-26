import { Message } from 'discord.js'
import { Nilsimsa } from '../vendor/nilsimsa.js'
import { addMessage, fetchMessagesByAuthor } from '../cache/op.js'

export async function onGuildMessage (message: Message): Promise<void> {
  // TODO: Ignore functionality goes here

  // Fetch author messages from Redis cache
  logger.debug(`Fetching messages from author "${message.author.id}"`)
  const authorMessages = await fetchMessagesByAuthor(message.author.id)
  logger.debug(`Got messages ${JSON.stringify(authorMessages, undefined, 2)}`)

  const messageToCache = {
    messageId: message.id,
    authorId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    hash: (new Nilsimsa(message.content).digest('hex'))
  }

  authorMessages.push(messageToCache)
  logger.debug(`Adding ${JSON.stringify(messageToCache, undefined, 2)} to the cache`)

  // Push that message to the cache
  await addMessage(messageToCache)

  logger.debug('Entering anti spam detection')

  // TODO: Anti spam logic goes here

  // TODO: Action anti spam result here
  logger.debug('Anti spam finished')
}
