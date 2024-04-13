import { APIEmbed, SnowflakeUtil } from 'discord.js'
import color from './color'
import client from '../clients/discord'

export const channelLink = (channelId: string): string => {
  return `<#${channelId}>`
}

export const isDiscordID = (id: string): boolean => {
  try {
    SnowflakeUtil.decode(id)
    return true
  } catch (err) {
    return false
  }
}

export const embedBase = (): APIEmbed => ({
  timestamp: new Date().toISOString(),
  footer: {
    text: 'Silver Mullet',
    icon_url: client.user?.avatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/0.png'
  },
  color: color.blurple
})
