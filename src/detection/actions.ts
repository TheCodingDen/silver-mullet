import { AntiSpamAction } from '@prisma/client'
import { GuildMember } from 'discord.js'

export type ActionFunction = (member: GuildMember) => Promise<unknown>

const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: async member => await member.ban({
    reason: 'Spam detected.'
  }),
  KICK: async member => await member.kick('Spam detected.'),
  QUEUE: async member => { throw new Error('Unimplemented') }
}

export default actions
