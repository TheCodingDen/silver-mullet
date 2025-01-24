import { ChannelType, GuildMember } from 'discord.js'
import { errMessage, errStack } from '../utils'
import { TriggeringMessage, actions } from '.'
import { URLDetectionResult } from '../detection/types'

export interface URLActionResult {
  success: boolean
}

export async function actionURLHit (
  hit: URLDetectionResult,
  member: GuildMember
): Promise<URLActionResult> {
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

  const action = actions[hit.action]
  try {
    await action(member, message, hit)
  } catch (err) {
    logger.error(
      `Failed to action URL: ${errMessage(err)}\n${errStack(err)}`
    )

    return {
      success: false
    }
  }

  return {
    success: true
  }
}
