import { AntiSpamAction } from '@prisma/client'
import { GuildMember } from 'discord.js'

export type ActionFunction = (member: GuildMember) => Promise<void>

const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: async member => void await member.ban({
    reason: 'Spam detected.'
  }),
  KICK: async member => void await member.kick('Spam detected.'),
  QUEUE: async member => { throw new Error('Unimplemented') }
}

export default actions
