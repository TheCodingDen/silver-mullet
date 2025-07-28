import { ChannelType, GuildMember } from 'discord.js'
import { errMessage, errStack } from '../utils'
import { TriggeringMessage, actions } from '.'
import { FilterDetectionResult, ReactivationDetectionResult } from '../detection/types'

export interface FilterActionResult {
  success: boolean
}

export async function actionFilterHit (hit: FilterDetectionResult | ReactivationDetectionResult, member: GuildMember): Promise<FilterActionResult> {
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

  const actionToTake = hit.source === 'filter' ? hit.trippedFilter.action : hit.action
  const action = actions[actionToTake]

  try {
    await action(member, message, hit)
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
