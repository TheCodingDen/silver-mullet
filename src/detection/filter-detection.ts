import prisma from '../clients/prisma'
import decancer from 'decancer'
import { CachedMessage } from '../clients/redis'
import { Guild, GuildMember } from 'discord.js'
import { FilterDetectionResult, ReactivationDetectionResult } from './types'

export async function executeFilterDetection (
  message: CachedMessage,
  oldMessage: CachedMessage | undefined,
  author: GuildMember,
  guild: Guild
): Promise<FilterDetectionResult | ReactivationDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({
    where: {
      guildID: guild.id
    }
  })

  if (!filters.length) {
    logger.debug(`No filters found for guild ${guild.id}`)
    return
  }

  const content = decancer(message.content).toString()

  for (const filter of filters) {
    const regexp = new RegExp(filter.regex, filter.flags)
    const regexMatch = regexp.test(content)

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Regex match ${regexMatch} ${filter.regex}`)
    }

    if (regexMatch) {
      // This is a reactivation filter
      if (filter.dayThreshold !== 0) {
        const lastSeen = await prisma.lastSeen.findUnique({
          where: {
            userId: author.id
          }
        })

        const threshold = new Date()
        threshold.setDate(threshold.getDate() - filter.dayThreshold)

        const lastSeenDate = lastSeen?.lastMessageDate ?? author.joinedAt

        if (!lastSeenDate) {
          logger.warn(`No last seen date found for user ${author.id} (joined at ${author?.joinedAt}, last message date ${lastSeen?.lastMessageDate})`)
          return
        }

        const isOverThreshold = lastSeenDate < threshold
        logger.debug(`Last seen for ${author.id} is ${JSON.stringify(lastSeen)}`)

        if (isOverThreshold) {
          return {
            source: 'reactivation' as const,
            member: author,
            action: filter.action,
            guild,
            message,
            lastSeen,
            trippedFilter: filter
          }
        } else {
          logger.debug(`User ${author.id} failed reactivation. thresholdDate: ${threshold.toLocaleString()}, thresholdDays: ${filter.dayThreshold}`)
        }
      } else {
        return {
          source: 'filter',
          action: filter.action,
          trippedFilter: filter,
          message,
          oldMessage,
          guild,
          author
        }
      }
    }
  }
}
