import { ChannelType, GuildMember } from 'discord.js'
import { errMessage, errStack } from '../utils'
import { DetectionResult, FilterDetectionResult, TriggeringMessage, actions } from '.'

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
    guild: member.guild
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
