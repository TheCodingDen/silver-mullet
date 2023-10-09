import { Filter } from '@prisma/client'
import { Message } from 'discord.js'
import prisma from '../clients/prisma'
import decancer from 'decancer'

export interface FilterDetectionResult {
  trippedFilter: Filter
  message: Message<true>
}

export async function executeFilterDetection (message: Message<true>): Promise<FilterDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({})
  const content = decancer(message.content).toString()

  const matchedFilter = filters.find(f => {
    const regexp = new RegExp(f.regex, f.flags)
    return regexp.test(content)
  })

  if (matchedFilter) {
    return {
      trippedFilter: matchedFilter,
      message
    }
  }
}
