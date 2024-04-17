import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, ComponentType, ButtonStyle } from 'slash-create'
import { getAssignedGuilds, handleCommand, run, sendFailure } from '../utils/commands'
import { PermissionGroup } from '@prisma/client'
import client from '../clients/discord'
import color from '../utils/color'

// From the Discord client. Not sure why this is set / what the value means
const UNUSUAL_DM_DELTA = 172800000

export interface SearchResult {
  guild_id: string
  members: FoundMember[]
  page_result_count: number
  total_result_count: number
}

export interface FoundMember {
  member: SearchMember
  source_invite_code: string
  join_source_type: number
  inviter_id: string | null
}

export interface SearchMember {
  avatar: string | null
  communication_disabled_until: string | null
  flags: number
  joined_at: string
  nick: string | null
  pending: boolean
  premium_since: string | null
  roles: string[]
  unusual_dm_activity_until: Date
  user: User
  mute: boolean
  deaf: boolean
}

export interface User {
  id: string
  username: string
  avatar: string | null
  discriminator: string
  public_flags: number
  flags: number
  banner: string | null
  accent_color: null
  global_name: string
  avatar_decoration_data: unknown
  banner_color: unknown
  clan: unknown
}

export default class SignalCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'signal',
      description: 'Query Discord-assigned signals for members',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'dm',
          description: 'Fetch all members who have the "Unusual DM" signal',
          options: [
          ]
        }
      ]
    })
  }

  async run (ctx: CommandContext): Promise<void> {
    await handleCommand(this, ctx, [PermissionGroup.MODERATOR], {
      dm: {
        [run]: this.dm.bind(this)
      }
    })
  }

  private async dm (ctx: CommandContext): Promise<void> {
    await ctx.defer()

    const delta = Date.now() - UNUSUAL_DM_DELTA
    const searchResult = await client.rest.post(`/guilds/${ctx.guildID}/members-search`, {
      body: {
        or_query: {
          safety_signals: {
            unusual_dm_activity_until: {
              range: {
                gte: delta
              }
            }
          }
        },
        and_query: {},
        limit: 250
      }
    }) as SearchResult

    if (searchResult.total_result_count === 0) {
      await sendFailure('No members found.', ctx)
      return
    }

    const hasMorePages = searchResult.total_result_count !== searchResult.page_result_count
    let description = `Found **${searchResult.total_result_count}** members:\n\n`

    for (const result of searchResult.members) {
      const date = new Date(result.member.joined_at)
      const unix = Math.floor(date.getTime() / 1000)
      const joinedAgo = `<t:${unix}:R>`
      const joinedAbs = `<t:${unix}:F>`

      description += `__@${result.member.user.global_name}__ [\`${result.member.user.id}\`]:\njoined ${joinedAgo} (${joinedAbs})\n\n`
    }

    if (hasMorePages) {
      description += '**More than one page was found, but pagination is not yet supported.**'
    }

    const message = await ctx.send({
      embeds: [{
        description,
        color: color.grey
      }],
      components: [{
        type: ComponentType.ACTION_ROW,
        components: [{
          type: ComponentType.BUTTON,
          style: ButtonStyle.SUCCESS,
          label: 'Get massban message',
          custom_id: 'signal.massban-message'
        }]
      }]
    })

    if (typeof message === 'boolean') {
      throw new TypeError('expected message got boolean')
    }

    ctx.registerComponentFrom(message.id, 'signal.massban-message', (ctx) => {
      const cb = async (): Promise<void> => {
        const massbanMembers = searchResult.members.map(m => m.member.user.id).join(' ')
        await ctx.send(`!!massban ${massbanMembers}`)
      }

      cb().catch(err => logger.error(err))
    })
  }
}
