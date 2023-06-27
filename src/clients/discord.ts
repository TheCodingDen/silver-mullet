import Discord, { GatewayIntentBits } from 'discord.js'
import { onGuildMessage } from '../event/guild-message'

const client = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

client.on('messageCreate', async message => await onGuildMessage(message))

export default client
