import { createClient } from 'redis'
import {
  BooleanFieldDefinition,
  NumberFieldDefinition,
  Repository,
  Schema,
  StringFieldDefinition,
  TextFieldDefinition,
  StringArrayFieldDefinition,
  Entity
} from 'redis-om'

const redis = createClient({
  url: process.env.REDIS_URL
})

redis.on('error', (err) => logger.error(err))
redis.on('connect', () => logger.info('Redis initiating connection'))
redis.on('ready', () => {
  logger.info('Redis connected and ready')
  initRepositories().catch((err) => logger.error(err))
})
redis.on('end', () => logger.info('Redis disconnected'))

export default redis

interface CachedMessageBase {
  messageId: string
  authorId: string
  guildId: string
  channelId: string
  content: string
  hexHash: string
}

export type CachedMessage = CachedMessageBase & Entity

export enum ActionUpgrade {
  BAN = 'ban',
  KICK = 'kick',
}

interface QueuedActionBase {
  authorId: string
  queueMessageId: string
  createdAt: number
  upgradeTo: ActionUpgrade
}

export type QueuedAction = QueuedActionBase & Entity

type MapFieldDefinition<Type, Key extends string> = Type extends boolean
  ? BooleanFieldDefinition
  : Type extends number
    ? NumberFieldDefinition
    : Type extends string
      ? StringFieldDefinition | TextFieldDefinition
      : Type extends string[]
        ? StringArrayFieldDefinition
        : { error: `unsupported property type for key '${Key}'` }

type DefinitionFor<Interface> = {
  [Key in keyof Interface as Exclude<
  keyof Interface,
  symbol
  >]: MapFieldDefinition<Interface[Key], Key & string>;
}

function validateSchema<Interface> (definition: {
  [K in keyof DefinitionFor<Interface>]: DefinitionFor<Interface>[K];
}): typeof definition {
  return definition
}

export const messageSchema = new Schema(
  'message',
  validateSchema<CachedMessageBase>({
    messageId: { type: 'string' },
    authorId: { type: 'string' },
    channelId: { type: 'string' },
    guildId: { type: 'string' },
    content: { type: 'text' },
    hexHash: { type: 'string' }
  })
)

export const queuedActionSchema = new Schema(
  'queuedAction',
  validateSchema<QueuedActionBase>({
    authorId: { type: 'string' },
    queueMessageId: { type: 'string' },
    upgradeTo: { type: 'text' },
    createdAt: { type: 'number', sortable: true }
  })
)

export const messageRepository = new Repository(messageSchema, redis)
export const queuedActionRepository = new Repository(queuedActionSchema, redis)

export async function initRepositories (): Promise<void> {
  await messageRepository.createIndex()
  await queuedActionRepository.createIndex()
}
