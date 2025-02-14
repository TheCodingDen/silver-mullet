import prisma from '../src/clients/prisma'
import client from '../src/clients/discord'
import { DomainVerdict, Link } from '@prisma/client'
import { APIEmbed } from 'discord.js'
import { embedBase } from '../src/utils/discordUtils'
import _ from 'lodash'

import logger from './utils/logger'
global.logger = logger

function makeEmbed (links: Link[]): APIEmbed {
  const groups = _.groupBy(links, l => l.verdict)
  const benign = _.groupBy(groups[DomainVerdict.BENIGN], l => l.domain)
  const malicious = _.groupBy(groups[DomainVerdict.MALICIOUS], l => l.domain)

  const formatCollection = (col: Record<string, Link[]>): string => {
    let out = ''

    // Sort by highest count first
    const entries = Object.entries(col).sort((a, b) => b[1].length - a[1].length)

    for (const [k, v] of entries) {
      out += `- \`${k}\`: ${v.length}\n`
    }

    return out
  }

  return {
    ...embedBase(),
    description: `
**Domains seen today**:

**MALICIOUS:**
${formatCollection(malicious) || 'None'}  

**BENIGN:**
${formatCollection(benign) || 'None'}  
    `
  }
}

async function runReport (): Promise<void> {
  await client.login(process.env.DISCORD_BOT_TOKEN)

  const today = new Date()
  const sinceMidnight = new Date(today.setHours(0))

  const linksFromToday = await prisma.link.findMany({
    where: {
      AND: {
        scannedAt: {
          gte: sinceMidnight
        }
      }
    }
  })

  const reportChannelId = process.env.REPORT_CHANNEL
  if (!reportChannelId) {
    throw new Error('No report channel found in environment')
  }

  const reportChannel = await client.channels.fetch(reportChannelId)
  if (!reportChannel) {
    throw new Error(`Report channel ${reportChannelId} not found by client`)
  }

  if (!reportChannel.isTextBased()) {
    throw new Error(`Report channel ${reportChannelId} not text`)
  }

  await reportChannel.send({
    embeds: [
      makeEmbed(linksFromToday)
    ]
  })

  client.destroy()
  await prisma.$disconnect()
}

runReport().catch(err => logger.error(err))
