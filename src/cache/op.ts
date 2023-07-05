import { Entity } from 'redis-om'
import { CachedMessage, messageRepository, QueuedAction, queuedActionRepository } from '../clients/redis'

const actionTTLAfterAction = 15

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

// FIXME: Should we set some long expiry here in case entries are not deleted (erronous cases)
export async function addQueuedAction (action: QueuedAction): Promise<Entity> {
  return await queuedActionRepository.save(action.authorId, action)
}

export async function removeQueuedAction (action: QueuedAction): Promise<void> {
  return void queuedActionRepository.remove(action.authorId)
}

export async function fetchQueuedActionByAuthorId (authorId: string): Promise<QueuedAction | null> {
  return (await queuedActionRepository.search()
    .where('authorId').equals(authorId)
    .return.first()) as QueuedAction | null
}

export async function fetchQueuedActionByMessageId (messageId: string): Promise<QueuedAction | null> {
  return (await queuedActionRepository.search()
    .where('queueMessageId').equals(messageId)
    .return.first()) as QueuedAction | null
}

export async function expireQueuedAction (action: QueuedAction): Promise<void> {
  return void await queuedActionRepository.expire(action.authorId, actionTTLAfterAction)
}
