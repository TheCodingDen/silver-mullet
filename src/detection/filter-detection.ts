import { Filter } from '@prisma/client'
import prisma from '../clients/prisma'
import decancer from 'decancer'
import { CachedMessage } from '../clients/redis'

export interface FilterDetectionResult {
  trippedFilter: Filter
  message: CachedMessage
  guildId: string
}

export async function executeFilterDetection (message: CachedMessage, guildId: string): Promise<FilterDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({
    where: {
      guildID: guildId
    }
  })

  if (!filters.length) {
    logger.debug(`No filters found for guilod ${guildId}`)
    return undefined
  }

  const content = decancer(message.content).toString()

  const matchedFilter = filters.find(f => {
    const regexp = new RegExp(f.regex, f.flags)
    return regexp.test(content)
  })

  if (matchedFilter) {
    return {
      trippedFilter: matchedFilter,
      message,
      guildId
    }
  }
}
