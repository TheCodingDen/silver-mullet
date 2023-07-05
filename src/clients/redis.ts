import { createClient } from 'redis'
import { Entity, Repository, Schema } from 'redis-om'

const redis = createClient({
  url: process.env.REDIS_URL
})

redis.on('error', (err) => logger.error(err))
redis.on('connect', () => logger.info('Redis initiating connection'))
redis.on('ready', () => {
  logger.info('Redis connected and ready')
  initRepositories().catch(logger.error)
})
redis.on('end', () => logger.info('Redis disconnected'))

export default redis

export interface CachedMessage extends Entity {
  messageId: string
  authorId: string
  channelId: string
  content: string
  hexHash: string
}

export interface QueuedAction extends Entity {
  authorId: string
  queueMessageId: string
  originalMessageId: string
  originalChannelId: string
  upgradeTo: 'kick' | 'ban'
}

export const messageSchema = new Schema('message', {
  messageId: { type: 'string' },
  authorId: { type: 'string' },
  channelId: { type: 'string' },
  content: { type: 'text' },
  hexHash: { type: 'string' }
})

export const queuedActionSchema = new Schema('queuedAction', {
  authorId: { type: 'string' },
  queueMessageId: { type: 'string' },
  originalMessageId: { type: 'string' },
  originalChannelId: { type: 'string' },
  upgradeTo: { type: 'text' }
})

export const messageRepository = new Repository(messageSchema, redis)
export const queuedActionRepository = new Repository(queuedActionSchema, redis)

export async function initRepositories (): Promise<void> {
  await messageRepository.createIndex()
  await queuedActionRepository.createIndex()
}
