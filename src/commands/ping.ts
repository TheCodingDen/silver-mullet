import { SlashCommand, SlashCreator, CommandContext } from 'slash-create'
import client from '../clients/discord'
import { getAssignedGuilds } from '../utils/commands'

export default class PingCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'ping',
      description: 'Check whether the bot is responding.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false })
    })
  }

  async run (ctx: CommandContext): Promise<string> {
    return `Pong! WebSocket ping: ${client.ws.ping}ms`
  }
}
