import Discord, { GatewayIntentBits } from 'discord.js'
import { onGuildMessage } from '../event/guild-message'
import { onAutomodHit } from '../event/automod'

const client = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.AutoModerationExecution
  ]
})

client.on('messageCreate', async message => await onGuildMessage(message))
client.on('autoModerationActionExecution', async event => await onAutomodHit(event))

export default client
