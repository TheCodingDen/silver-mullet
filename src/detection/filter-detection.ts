import { Filter } from '@prisma/client'
import { GuildMember, Message } from 'discord.js'
import { ignoreFailedDeliver } from './actions'
import { retryCallback } from '../utils/retry'
import { getLogChannel, handleRetryResult, messageUser } from './utils'
import { embedBase, messageLink } from '../utils/discordUtils'
import color from '../utils/color'
import prisma from '../clients/prisma'

export interface FilterDetectionResult {
  trippedFilter: Filter
  message: Message<true>
}

export async function executeFilterDetection (message: Message<true>): Promise<FilterDetectionResult | undefined> {
  const filters = await prisma.filter.findMany({})
  const matchedFilter = filters.find(f => message.content.match(f.regex))

  if (matchedFilter) {
    return {
      trippedFilter: matchedFilter,
      message
    }
  }
}

export async function actionFilterHit (hit: FilterDetectionResult, member: GuildMember): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const [banResult, messageResult] = await Promise.all([
      retryCallback(async () => await member.ban({
        reason: 'Spam detected.'
      }), {
        attempts: 3,
        errorPredicate: ignoreFailedDeliver
      }),
      retryCallback(async () => await messageUser(member.user, {
        content: `You have been banned from ${member.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
      }), {
        attempts: 3,
        errorPredicate: ignoreFailedDeliver
      })
    ])

    handleRetryResult(banResult, `When banning user ${member.user.username}`)
    handleRetryResult(messageResult, `When messaging banned user ${member.user.username}`)
  } else {
    const result = await retryCallback(async () => await messageUser(member.user, {
      content: `You would have been banned from ${member.guild.name} due to spam (through filter \`/${hit.trippedFilter.regex}/\`).`
    }), {
      attempts: 1
    })

    handleRetryResult(result, `When fake banning ${member.user.username}`)
  }

  const logChannel = await getLogChannel(hit.message.guild)

  await logChannel.send({
    embeds: [{
      ...embedBase(),
      title: 'Filter triggered',
      color: color.red,
      author: {
        name: `@${member.user.username}`,
        icon_url: member.user.displayAvatarURL()
      },
      description: `
          **Triggered by** (${messageLink({ guildId: hit.message.guild.id, messageId: hit.message.id, channelId: hit.message.channelId })}):
          \`\`\`
${hit.message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\` 
          **Action taken**:
          BAN
        `
    }]
  })
}
