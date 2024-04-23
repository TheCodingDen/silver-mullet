import prisma from '../clients/prisma'
import decancer from 'decancer'
import { CachedMessage } from '../clients/redis'
import { Guild } from 'discord.js'
import { DebugFilterResult, FilterDetectionResult } from './types'
import { FilterMode } from '@prisma/client'

export async function executeFilterDetection (message: CachedMessage, guild: Guild): Promise<FilterDetectionResult | undefined> {
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

  const matchedFilter = filters
    .filter(f => f.mode === FilterMode.ACTIVE)
    .find(f => {
      const regexp = new RegExp(f.regex, f.flags)
      return regexp.test(content)
    })

  const debuggedFilters: DebugFilterResult[] = filters
    .filter(f => f.mode === FilterMode.DEBUG)
    .filter(f => {
      const regexp = new RegExp(f.regex, f.flags)
      const testResult = regexp.test(content)
      return testResult
    })
    .map(f => ({
      action: f.action,
      filter: f
    }))

  const author = await guild.members.fetch(message.authorId)
  if (matchedFilter) {
    return {
      source: 'filter',
      action: matchedFilter.action,
      trippedFilter: matchedFilter,
      debuggedFilters,
      message,
      guild,
      author
    }
  }

  // We did not hit an active filter, but did hit one in debug
  if (!matchedFilter && debuggedFilters.length) {
    // Call the 'matched' one the first debug hit, we will check this on display anyways
    const matchedFilter = debuggedFilters[0].filter
    return {
      source: 'filter',
      action: matchedFilter.action,
      trippedFilter: matchedFilter,
      debuggedFilters,
      message,
      guild,
      author
    }
  }
}
