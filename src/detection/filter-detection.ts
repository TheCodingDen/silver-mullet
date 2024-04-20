import prisma from '../clients/prisma'
import decancer from 'decancer'
import { CachedMessage } from '../clients/redis'
import { Guild } from 'discord.js'
import { FilterDetectionResult } from './types'

export async function executeFilterDetection (message: CachedMessage, guild: Guild): Promise<FilterDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({
    where: {
      guildID: guild.id
    },
    include: {
      presets: true
    }
  })

  if (!filters.length) {
    logger.debug(`No filters found for guild ${guild.id}`)
    return
  }

  const content = decancer(message.content).toString()

  const matchedFilter = filters.find(f => {
    const mainRegexp = new RegExp(f.regex, f.flags)
    if (!mainRegexp.test(content)) {
      return false
    }

    for (const preset of f.presets) {
      const presetRegexp = new RegExp(preset.regex, preset.flags)
      if (!presetRegexp.test(content)) {
        return false
      }
    }

    return true
  })

  if (matchedFilter) {
    const author = await guild.members.fetch(message.authorId)
    return {
      source: 'filter',
      action: matchedFilter.action,
      trippedFilter: matchedFilter,
      message,
      guild,
      author
    }
  }
}
