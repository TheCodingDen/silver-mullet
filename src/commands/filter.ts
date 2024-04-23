import { AntiSpamAction, FilterMode, PermissionGroup } from '@prisma/client'
import {
  SlashCommand,
  SlashCreator,
  CommandOptionType,
  CommandContext,
  AutocompleteChoice,
  AutocompleteContext
} from 'slash-create'
import prisma from '../clients/prisma'
import { errStack, errMessage, alphabetical, humanLikely } from '../utils'
import {
  GuildCommandContext,
  allowFor,
  getAssignedGuilds,
  handleCommand,
  run,
  sendFailure,
  sendSuccess
} from '../utils/commands'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import _ from 'lodash'

export default class FilterCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'filter',
      description: 'Manage the regex filter system of the bot.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'get',
          description: 'Retrieve current filters.'
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'add',
          description: 'Add a new filter. Admins only.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'regex',
              description: 'The regex to trigger with. Supplied as-is, without / / syntax.',
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'action',
              description: 'The action to perform.',
              choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action })),
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'mode',
              description: 'The mode to use the filter with.',
              choices: _.keys(FilterMode).map(action => ({ name: action, value: action })),
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'flags',
              description: 'The flags to use. Defaults to "g", "i" is always enabled. Pass "none" to have no flags.',
              required: false
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a filter. Admins only.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'filter',
              description: 'The filter to remove',
              autocomplete: true,
              required: true
            }
          ]
        }
      ]
    })
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, options } = ctx

    switch (focused) {
      case 'filter': {
        const filters = await prisma.filter.findMany({})

        const idToRegex = filters.reduce<Record<string, string>>((acc, val) => {
          acc[val.id] = val.regex
          return acc
        }, {})

        const validOptions = filters.map(f => idToRegex[f.id])
        const input = options?.remove?.filter

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return filters
          .filter(option => humanLikely(input, likely, idToRegex[option.id]))
          .map(option => ({ name: `/${idToRegex[option.id]}/${option.flags}`, value: option.id }))
          .sort(alphabetical)
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  async run (ctx: CommandContext): Promise<void> {
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN, PermissionGroup.ADMIN], {
      get: {
        [run]: this.get.bind(this),
        [allowFor]: [PermissionGroup.MODERATOR]
      },
      add: {
        [run]: this.add.bind(this)
      },
      remove: {
        [run]: this.remove.bind(this)
      }
    })
  }

  private async get (ctx: GuildCommandContext): Promise<void> {
    const allFilters = await prisma.filter.findMany({})

    if (allFilters.length === 0) {
      await ctx.send('No filters have been set.')
    } else {
      const content = allFilters
        .map((f, i) => `${i}: \`/${f.regex}/\` (${f.flags}) => ${f.action}`)
        .join('\n') || 'No filters set.'

      await ctx.send(content)
    }
  }

  private async add (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    let { regex: rawRegex, flags, action, mode } = options.add as {
      regex: string
      action: AntiSpamAction
      mode: FilterMode
      flags: string
    }

    if (flags === 'none') {
      flags = ''
    }

    let regex: RegExp

    try {
      regex = new RegExp(rawRegex, flags)
    } catch (err) {
      await sendFailure(`Regex \`/${rawRegex}/\` is invalid: ${errMessage(err)}`, ctx)
      return
    }

    try {
      const { flags: newFlags } = await prisma.filter.create({
        data: {
          regex: regex.source,
          guildID: ctx.guildID,
          flags,
          mode,
          action
        }
      })

      logger.info(
        `${ctx.user.username} added filter /${regex.source}/${newFlags} which will ${action} when it is hit`
      )
      await sendSuccess(
        `Added filter \`/${regex.source}/${newFlags}\`.`,
        ctx
      )
    } catch (err) {
      logger.error(
        `Failed to add filter /${regex.source}/: ${errStack(err)}`
      )
      await sendFailure(
        `Failed to add filter \`/${regex.source}\`/: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }

  private async remove (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    const { filter: filterCuid } = options.remove as { filter: string }

    if (!(await prisma.filter.findFirst({ where: { id: filterCuid } }))) {
      await sendFailure(
        'That filter does not exist.',
        ctx
      )
      return
    }

    try {
      await prisma.filter.delete({
        where: {
          id: filterCuid
        }
      })

      logger.info(
        `${ctx.user.username} removed filter ${filterCuid}`
      )
      await sendSuccess('Removed filter.', ctx)
    } catch (err) {
      logger.error(
        `Failed to remove filter ${filterCuid}: ${errStack(
          err
        )}`
      )
      await sendFailure(
        `Failed to remove filter: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }
}
