import { Filter } from '@prisma/client'
import prisma from '../clients/prisma'
import decancer from 'decancer'
import { CachedMessage } from '../clients/redis'
import { Message } from 'discord.js'

export interface FilterDetectionResult {
  trippedFilter: Filter
  message: CachedMessage
  automodMessage?: Message<true>
  guildId: string
}

export async function executeFilterDetection (message: CachedMessage, automodMessage?: Message<true>, guildId?: string): Promise<FilterDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({})
  const content = decancer(message.content).toString()

  const matchedFilter = filters.find(f => {
    const regexp = new RegExp(f.regex, f.flags)
    return regexp.test(content)
  })

  if (!automodMessage && !guildId) {
    throw new Error('Need one of guildId, automodMessage')
  }

  const id = guildId ?? automodMessage?.guildId
  if (!id) {
    throw new Error('impossible, should have a passed ID or an ID from the automodMessage')
  }

  if (matchedFilter) {
    return {
      trippedFilter: matchedFilter,
      message,
      guildId: id,
      automodMessage
    }
  }
}
