import { Entity, Repository, Schema } from 'redis-om'
import { redis } from '../index.js'

export interface Message extends Entity {
  messageId: string
  authorId: string
  channelId: string
  content: string
  hash: string
}

export const messageSchema = new Schema('message', {
  messageId: { type: 'string' },
  authorId: { type: 'string' },
  channelId: { type: 'string' },
  content: { type: 'text' },
  hash: { type: 'string' }
})

export const messageRepository = new Repository(messageSchema, redis)
