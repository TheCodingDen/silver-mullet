
import { PermissionGroup, Preset } from '@prisma/client'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, AutocompleteContext, AutocompleteChoice } from 'slash-create'
import prisma from '../clients/prisma'
import { alphabetical, errMessage, errStack, humanLikely } from '../utils/index'
import { GuildCommandContext, getAssignedGuilds, handleCommand, run, sendFailure, sendSuccess } from '../utils/commands'

export default class PairingCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'pairing',
      description: 'Manage pairings between filters and presets.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'set',
          description: 'Sets presets for a filter.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'filter',
              description: 'The filter to modify.',
              autocomplete: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'presets',
              description: 'The presets to set, comma separated.'
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

        const validOptions = filters.map(f => f.regex)
        console.log(options)
        const input = options.set.filter

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return filters
          .filter(option => humanLikely(input, likely, option.regex))
          .map(option => ({ name: `/${option.regex}/${option.flags}`, value: option.id }))
          .sort(alphabetical)
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  async run (ctx: CommandContext): Promise<void> {
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN], {
      set: {
        [run]: this.set.bind(this)
      }
    })
  }

  private async loadPresetsForInput (input: string | undefined): Promise<Preset[]> {
    let result: Preset[] = []

    if (input) {
      const splitPresets = input.split(/\s+,\s+/)
      result = await Promise.all(
        splitPresets.map(async (p) => {
          const data = await prisma.preset.findFirst({
            where: {
              name: p
            }
          })

          if (!data) {
            throw new Error(`Preset ${p} does not exist`)
          }

          return data
        })
      )
    }

    return result
  }

  private async set (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx

    const { filter, presets } = options.set as { filter: string, presets: string }

    if (!(await prisma.filter.findFirst({ where: { id: filter } }))) {
      await sendFailure('That filter does not exist.', ctx)
      return
    }

    let presetsToAdd
    try {
      presetsToAdd = await this.loadPresetsForInput(presets)
    } catch (err) {
      await sendFailure(`Presets "${presets}" could not be loaded: ${errMessage(err)}`, ctx)
      logger.error(`Presets "${presets}" could not be loaded: ${errMessage(err)}\n${errStack(err)}`)
      return
    }

    try {
      await prisma.filter.update({
        where: {
          id: filter
        },
        data: {
          presets: {
            set: presetsToAdd
          }
        }
      })

      logger.info(`${ctx.user.username} added presets ${presets} to filter ${filter}`)
      await sendSuccess(`Added filter presets \`${presets}\` to filter`, ctx)
    } catch (err) {
      logger.error(`Failed to edit filter ${filter}: ${errStack(err)}`)
      await sendFailure(
        `Failed to edit filter: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }
}
