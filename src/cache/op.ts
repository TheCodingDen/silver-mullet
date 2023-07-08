import { Entity } from 'redis-om'
import { CachedMessage, messageRepository, QueuedAction, queuedActionRepository } from '../clients/redis'

// How long, in seconds, to expire the action after when we automatically
// upgrade it. Used to stop events that come in after the upgrade from triggering
// another round of anti spam.
const expireActionAfterUpgradeSeconds = 15
// Expire actions that are never removed (upgraded or handled by a moderator) after this time (1 week)
const expireUnactionedActionSeconds = 60 * 60 * 24 * 7

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

export async function addQueuedAction (action: QueuedAction): Promise<Entity> {
  const result = await queuedActionRepository.save(action.queueMessageId, action)
  await queuedActionRepository.expire(action.queueMessageId, expireUnactionedActionSeconds)
  return result
}

export async function removeQueuedAction (action: QueuedAction): Promise<void> {
  return void queuedActionRepository.remove(action.queueMessageId)
}

export async function fetchQueuedActionByAuthorId (authorId: string): Promise<QueuedAction | null> {
  // Since users can have multiple active queued actions at once, get the latest one when we query by user id
  // We need to be able to query by user id instead of queue message id because that information is not
  // available when we get user message events, but we still need to lookup actions (to append to the message, for example)
  return (await queuedActionRepository.search()
    .where('authorId').equals(authorId)
    .sortDesc('createdAt')
    .return.first()) as QueuedAction | null
}

export async function fetchQueuedActionByMessageId (messageId: string): Promise<QueuedAction | null> {
  return (await queuedActionRepository.search()
    .where('queueMessageId').equals(messageId)
    .return.first()) as QueuedAction | null
}

export async function expireQueuedAction (action: QueuedAction): Promise<void> {
  return void await queuedActionRepository.expire(action.queueMessageId, expireActionAfterUpgradeSeconds)
}
