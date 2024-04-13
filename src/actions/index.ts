import { DiscordAPIError, Guild, GuildMember, GuildTextBasedChannel } from 'discord.js'
import { AntiSpamAction } from '@prisma/client'
import { ban } from './ban'
import { kick } from './kick'
import { queueBan, queueKick } from './queue'
import { DetectionResult } from '../detection/types'

export const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: ban,
  KICK: kick,
  QUEUE_BAN: queueBan,
  QUEUE_KICK: queueKick
}

export { actionFilterHit } from './filter'
export { initActionComponents } from './init'

export const ignoreFailedDeliver = (err: unknown): boolean => (err instanceof DiscordAPIError) && err.code === 5007 // Cannot send messages to this user
export type ActionFunction = (member: GuildMember, message: TriggeringMessage, result: DetectionResult) => Promise<unknown>

// A message which triggered an automod action within the bot. Abstracts over AutoMod messages & Discord messages
export interface TriggeringMessage {
  author: GuildMember
  guild: Guild
  content: string
  channel: GuildTextBasedChannel
}

export const REMOVAL_OPTIONS = {
  ban: {
    opts: {
      deleteMessageSeconds: 604800, // 7 days
      reason: 'Spam detected.'
    },
    message: (guild: Guild) =>
`You have been banned from ${guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.
If you are not aware of what may have caused this, your account is likely compromised. See <https://discord.com/safety/360044104071-Tips-against-spam-and-hacking#title-3> for steps to secure your account.`
  },
  kick: {
    opts: 'Filter triggered.',
    message: (guild: Guild) =>
`You have been kicked from ${guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.
If you are not aware of what may have caused this, your account is likely compromised. See <https://discord.com/safety/360044104071-Tips-against-spam-and-hacking#title-3> for steps to secure your account.`
  }
}
