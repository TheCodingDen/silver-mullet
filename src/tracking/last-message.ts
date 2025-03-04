import { CachedMessage } from '../clients/redis'
import { SnowflakeUtil } from 'discord.js'
import prisma from '../clients/prisma'

export async function trackSentMessage (msg: CachedMessage): Promise<void> {
  const timestamp = extractDate(msg.messageId)
  await prisma.lastSeen.upsert({
    where: {
      userId: msg.authorId
    },
    update: {
      lastMessageId: msg.messageId,
      lastMessageDate: timestamp
    },
    create: {
      userId: msg.authorId,
      lastMessageId: msg.messageId,
      lastMessageDate: timestamp
    }
  })

  logger.debug(`Tracked message ${msg.messageId} from ${msg.authorId} (date: ${timestamp})`)
}

export function extractDate (timestamp: string): Date {
  const unixEpochMillis = SnowflakeUtil.timestampFrom(timestamp)
  return new Date(unixEpochMillis)
}
