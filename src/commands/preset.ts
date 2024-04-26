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
  allowFor,
  getAssignedGuilds,
  handleCommand,
  run,
  sendFailure,
  sendSuccess
} from '../utils/commands'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'

export default class PresetCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'preset',
      description: 'Manage the regex preset system of the bot.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'get',
          description: 'Retrieve current presets.'
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'add',
          description: 'Add a new preset. Admins only.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'name',
              description: 'The name of the preset, used as the key in filters.',
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'regex',
              description: 'The regex to trigger with. Supplied as-is, without / / syntax.',
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
          description: 'Remove a preset. Admins only.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'preset',
              description: 'The preset to remove',
              autocomplete: true,
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'edit',
          description: 'Edit the regex of a prefix. Admins only.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'preset',
              description: 'The preset to edit',
              autocomplete: true,
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'regex',
              description: 'The new regex value',
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
      case 'preset': {
        const presets = await prisma.preset.findMany({})

        const validOptions = presets.map(f => f.regex)
        const input = (options?.remove ?? options?.edit).preset

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return presets
          .filter(option => humanLikely(input, likely, option.name))
          .map(option => ({ name: `"${option.name}": /${option.regex}/`, value: option.name }))
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
      },
      edit: {
        [run]: this.edit.bind(this)
      }
    })
  }

  private async get (ctx: GuildCommandContext): Promise<void> {
    const presets = await prisma.preset.findMany({})

    if (presets.length === 0) {
      await ctx.send('No presets have been set.')
    } else {
      const content = presets
        .map((f, i) => `${i}: \`"${f.name}": /${f.regex}/\``)
        .join('\n') || 'No presets set.'

      await ctx.send(content)
    }
  }

  private async add (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    let { regex: rawRegex, name, flags } = options.add as {
      regex: string
      flags: string
      name: string
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
      const { flags: newFlags } = await prisma.preset.create({
        data: {
          regex: regex.source,
          guildID: ctx.guildID,
          flags,
          name
        }
      })

      logger.info(
        `${ctx.user.username} added preset "${name}" /${regex.source}/${newFlags}`
      )
      await sendSuccess(
        `Added preset "${name}" \`/${regex.source}/${newFlags}\`.`,
        ctx
      )
    } catch (err) {
      logger.error(
        `Failed to add preset "${name}" /${regex.source}/: ${errStack(err)}`
      )
      await sendFailure(
        `Failed to add preset "${name}" \`/${regex.source}\`/: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }

  private async remove (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    const { preset: presetName } = options.remove as { preset: string }

    if (!(await prisma.preset.findFirst({ where: { name: presetName } }))) {
      await sendFailure(
        'That preset does not exist.',
        ctx
      )
      return
    }

    try {
      await prisma.preset.delete({
        where: {
          name: presetName
        }
      })

      logger.info(
        `${ctx.user.username} removed preset ${presetName}`
      )
      await sendSuccess(`Removed preset "${presetName}".`, ctx)
    } catch (err) {
      logger.error(
        `Failed to remove preset ${presetName}: ${errStack(
          err
        )}`
      )
      await sendFailure(
        `Failed to remove preset: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }

  private async edit (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    const { preset: presetName, regex } = options.edit as { preset: string, regex: string }

    if (!(await prisma.preset.findFirst({ where: { name: presetName } }))) {
      await sendFailure(
        'That preset does not exist.',
        ctx
      )
      return
    }

    try {
      await prisma.preset.update({
        where: {
          name: presetName
        },
        data: {
          regex
        }
      })

      logger.info(
        `${ctx.user.username} update preset ${presetName} regex => /${regex}/`
      )
      await sendSuccess(`Updated preset "${presetName}" regex to \`/${regex}/\`.`, ctx)
    } catch (err) {
      logger.error(
        `Failed to update preset ${presetName}: ${errStack(
          err
        )}`
      )
      await sendFailure(
        `Failed to update preset: ${errMessage(err)}`,
        ctx,
        false
      )
    }
  }
}
