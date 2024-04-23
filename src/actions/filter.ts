import { ChannelType, GuildMember } from 'discord.js'
import { errMessage, errStack } from '../utils'
import { TriggeringMessage, actions } from '.'
import { DetectionResult, FilterDetectionResult } from '../detection/types'
import { FilterMode } from '@prisma/client'
import { getLogChannel, makeDefaultEmbed } from '../detection/utils'

export interface FilterActionResult {
  success: boolean
}

export async function actionFilterHit (hit: FilterDetectionResult, member: GuildMember): Promise<FilterActionResult> {
  const channel = await hit.guild.channels.fetch(hit.message.channelId)
  if (!channel) {
    logger.error(`Could not locate channel ${hit.message.channelId}`)
    return {
      success: false
    }
  }
  if (channel.type !== ChannelType.GuildText) {
    logger.error('Channel was not of type GuildText')
    return {
      success: false
    }
  }

  const message: TriggeringMessage = {
    author: member,
    channel,
    content: hit.message.content,
    guild: member.guild
  }

  const result: DetectionResult = {
    source: 'filter',
    action: hit.action,
    trippedFilter: hit.trippedFilter,
    author: member,
    message: hit.message,
    debuggedFilters: hit.debuggedFilters,
    guild: member.guild
  }

  // The only real hit was for a debug filter, simply log.
  if (hit.trippedFilter.mode === FilterMode.DEBUG) {
    const logChannel = await getLogChannel(message.guild)
    await logChannel.send({
      embeds: [makeDefaultEmbed(message, result)]
    })
    return {
      success: true
    }
  }

  const action = actions[hit.trippedFilter.action]
  try {
    await action(member, message, result)
  } catch (err) {
    logger.error(`Failed to action filter: ${errMessage(err)}\n${errStack(err)}`)

    return {
      success: false
    }
  }

  return {
    success: true
  }
}
