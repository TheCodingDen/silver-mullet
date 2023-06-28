import { Entity } from 'redis-om'
import { CachedMessage, messageRepository } from './schema'

// TODO: Move this into config
// 3 minutes, same as MS
const TTL = 3 * 60

export async function addMessage (message: CachedMessage): Promise<Entity> {
  const result = await messageRepository.save(message.messageId, message)
  await messageRepository.expire(message.messageId, TTL)
  return result
}

export async function removeMessage (message: CachedMessage): Promise<void> {
  return void messageRepository.remove(message.messageId)
}

export async function fetchMessageById (messageId: string): Promise<CachedMessage> {
  return await messageRepository.fetch(messageId) as CachedMessage
}

export async function fetchMessagesByAuthor (authorId: string): Promise<CachedMessage[]> {
  return (await messageRepository.search()
    .where('authorId').equals(authorId)
    .return.all()) as CachedMessage[]
}
