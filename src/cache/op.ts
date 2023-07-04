import { Entity } from 'redis-om'
import { CachedMessage, messageRepository } from '../clients/redis'

export async function addMessage (message: CachedMessage, expireAfterSeconds: number): Promise<Entity> {
  const result = await messageRepository.save(message.messageId, message)
  await messageRepository.expire(message.messageId, expireAfterSeconds)
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
