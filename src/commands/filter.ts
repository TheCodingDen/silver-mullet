import { PermissionGroup } from '@prisma/client'
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
  getAssignedGuilds,
  handleCommand,
  run,
  sendFailure,
  sendSuccess
} from '../utils/commands'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'

export default class FilterCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'filter',
      description: 'Manage the regex filter system of the bot',
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
          description: 'Add a new filter.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'regex',
              description: 'The regex to trigger with. Supplied as-is, without / / syntax.',
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'flags',
              description: 'The flags to use. defaults to "g". Pass "none" to have no flags. Strings are automatically lowercased, so "i" has no effect.',
              required: false
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a filter.',
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
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN], {
      get: {
        [run]: this.get.bind(this)
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

    const content = allFilters
      .map((f, i) => `${i}: \`/${f.regex}/\` (${f.flags})`)
      .join('\n') || 'No filters set'

    await ctx.send(content)
  }

  private async add (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    let { regex: rawRegex, flags } = options.add as {
      regex: string
      flags: string
    }

    if (flags === 'none') {
      flags = ''
    }

    if (flags === undefined) {
      flags = 'g'
    }

    let regex: RegExp

    try {
      regex = new RegExp(rawRegex, flags)
    } catch (err) {
      await sendFailure(`Regex \`/${rawRegex}/\` is invalid: ${errMessage(err)}`, ctx)
      return
    }

    try {
      await prisma.filter.create({
        data: {
          regex: regex.source,
          flags
        }
      })

      logger.info(
        `${ctx.user.username} added filter /${regex.source}/ with flags \`${flags}\``
      )
      await sendSuccess(
        `Added filter \`/${regex.source}/\` with flags \`${flags}`,
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
