import {
  SlashCommand,
  SlashCreator,
  CommandContext,
  CommandOptionType,
  MessageEmbedOptions,
  EmbedField,
  AutocompleteContext,
  AutocompleteChoice
} from 'slash-create'
import { AntiSpamAction, IgnoreTarget, PermissionGroup } from '@prisma/client'
import _ from 'lodash'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { assertPermissionGroupMembership, embedBase, getAssignedGuilds } from '../utils/discordUtils'
import prisma from '../clients/prisma'
import emoji from '../utils/emoji'
import { alphabetical, humanLikely } from '../utils'
import { validateSubcommandTree, run } from '../utils/commands'

export default class CCASConfigCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'ccas-config',
      description: 'Edit Cross-Channel Anti-Spam (CCAS) system settings. Infra admins only.',
      guildIDs: getAssignedGuilds({ includeMain: true }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'get',
          description: 'Print current CCAS settings.'
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'set',
          description: 'Update a CCAS setting.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'setting',
              description: 'The setting to update.',
              required: true,
              autocomplete: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'value',
              description: 'The value to set for the given setting.',
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND_GROUP,
          name: 'point-overrides',
          description: 'Edit CCAS point overrides.',
          options: [
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'set',
              description: 'Set a CCAS point override for a given word.',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'word',
                  description: 'The word that triggers the point override.',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'points',
                  description: 'The amount of points a message containing this word will incur.',
                  required: true
                }
              ]
            },
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'remove',
              description: 'Remove a CCAS point override.',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'word',
                  description: 'The point override to remove.',
                  required: true
                }
              ]
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND_GROUP,
          name: 'actions',
          description: 'Edit CCAS point-based actioning.',
          options: [
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'set',
              description: 'Set a CCAS action for a given point threshold.',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'points',
                  description: 'The point threshold at which to trigger the action.',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The action to perform.',
                  choices: _.keys(AntiSpamAction).map(k => ({ name: k, value: k })),
                  required: true
                }
              ]
            },
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'remove',
              description: 'Remove a CCAS action mapping.',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'mapping',
                  description: 'The mapping to remove.',
                  required: true,
                  autocomplete: true
                }
              ]
            }
          ]
        }
      ]
    })
  }

  async run (ctx: CommandContext): Promise<void> {
    if (!await assertPermissionGroupMembership([PermissionGroup.INFRA_ADMIN], ctx)) {
      return
    }

    _.values(IgnoreTarget).map(async type => await prisma.ignore.findMany({ where: { type } }))

    const result = validateSubcommandTree(['ccas-config', ...ctx.subcommands], {
      'ccas-config': {
        get: {
          [run]: this.get.bind(this)
        },
        set: {
          [run]: this.set.bind(this)
        },
        'point-overrides': {
          set: {
            [run]: this.setPointOverride.bind(this)
          },
          remove: {
            [run]: this.removePointOverride.bind(this)
          }
        },
        actions: {
          set: {
            [run]: this.setActionMapping.bind(this)
          },
          remove: {
            [run]: this.removeActionMapping.bind(this)
          }
        }
      }
    })

    if (!result.ok) {
      logger.error(result.err)
      await ctx.send({
        content: `${emoji.error} ${result.humanReadableErr}`,
        ephemeral: true
      })
      return
    }

    await result.node[run](ctx)
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, options } = ctx

    switch (focused) {
      case 'setting': {
        const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
          orderBy: {
            version: 'desc'
          }
        })

        if (!settings) {
          logger.warn('No CCAS settings found, cannot autocomplete option names')
          return []
        }

        const validOptions = _.keys(settings).filter(key => key !== 'version')
        const input = options?.set?.setting

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return validOptions
          .filter(option => humanLikely(input, likely, option))
          .map(option => ({ name: option, value: option }))
          .sort(alphabetical)
      }
      case 'mapping': {
        const mappings = await prisma.antiSpamActionMapping.findMany({})
        const validOptions = mappings.map(m => `${m.points} - ${m.action}`)
        const input = options?.actions?.remove?.mapping

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return mappings
          .filter(option => humanLikely(input, likely, `${option.points} - ${option.action}`))
          .map(option => ({ name: `${option.points} - ${option.action}`, value: option.id }))
          .sort(alphabetical)
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  private async get (ctx: CommandContext): Promise<void> {
    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      include: {
        pointOverrides: true,
        actionMappings: true
      },
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await ctx.send(`${emoji.error} No CCAS settings found!`, { ephemeral: true })
      return
    }

    const fields: EmbedField[] = _
      .entries(settings)
      .filter(([option]) => option !== 'pointOverrides' && option !== 'actionMappings') // Print point overrides & action mappings separately
      .map(([option, value]) => ({
        name: option,
        value: value.toString(),
        inline: true
      }))

    const settingsEmbed: MessageEmbedOptions = {
      ...embedBase(),
      title: 'Cross-Channel Anti-Spam (CCAS) system settings',
      fields
    }

    const embeds = [settingsEmbed]

    if (settings.pointOverrides.length > 0) {
      const pointOverridesEmbed: MessageEmbedOptions = {
        ...embedBase(),
        title: 'CCAS point overrides',
        fields: settings.pointOverrides.map(override => ({
          name: override.word,
          value: override.points.toString()
        }))
      }

      embeds.push(pointOverridesEmbed)
    }

    if (settings.actionMappings.length > 0) {
      const pointOverridesEmbed: MessageEmbedOptions = {
        ...embedBase(),
        title: 'CCAS action mappings',
        fields: settings.actionMappings.map(override => ({
          name: override.points.toString(),
          value: override.action.toString()
        }))
      }

      embeds.push(pointOverridesEmbed)
    }

    await ctx.send({ embeds })
  }

  private async set (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { setting, value } = options.set as { setting: string, value: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await ctx.send(`${emoji.error} No CCAS settings found!`, { ephemeral: true })
      return
    }

    if (!(setting in settings)) {
      await ctx.send(`${emoji.error} Unknown CCAS setting **${setting}**.`, { ephemeral: true })
      return
    }

    if (setting === 'version') {
      await ctx.send(`${emoji.error} Editing the CCAS settings version is not allowed.`, { ephemeral: true })
      return
    }

    const parsed = parseInt(value)

    if (!_.isFinite(parsed)) {
      await ctx.send(`${emoji.error} Setting must be a valid number.`, { ephemeral: true })
      return
    }

    try {
      await prisma.crossChannelAntiSpamSettings.update({
        where: {
          version: settings.version
        },
        data: {
          [setting]: +value
        }
      })

      logger.info(`${ctx.user.username} updated CCAS setting ${setting} to ${value}`)
      await ctx.send(`${emoji.success} CCAS setting **${setting}** set to **${value}**.`, { ephemeral: true })
    } catch (err) {
      await ctx.send(`${emoji.error} Failed to update CCAS setting ${setting}: ${err instanceof Error ? err.message : err}`, { ephemeral: true })
    }
  }

  private async setActionMapping (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { points, action } = options.actions.set as { points: string, action: string }

    const parsed = parseInt(points)

    if (!_.isFinite(parsed)) {
      await ctx.send(`${emoji.error} Point amount must be a valid number.`, { ephemeral: true })
      return
    }

    if (!isAntiSpamAction(action)) {
      await ctx.send(`${emoji.error} Provided action was not in the enum, Discord must have screwed up.`, { ephemeral: true })
      return
    }

    try {
      const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
        orderBy: {
          version: 'desc'
        }
      })

      if (!settings) {
        await ctx.send(`${emoji.error} No CCAS settings found, cannot set action mapping!`, { ephemeral: true })
        return
      }

      await prisma.antiSpamActionMapping.create({
        data: {
          action,
          points: parsed,
          settings: {
            connect: {
              version: settings.version
            }
          }
        }
      })

      logger.info(`${ctx.user.username} added CCAS action mapping for "${action}" to happen at ${points} points`)
      await ctx.send(`${emoji.success} Will **${action}** when user accumulates **${points}** points.`, { ephemeral: true })
    } catch (err) {
      await ctx.send(`${emoji.error} Failed to add CCAS action mapping: ${err instanceof Error ? err.message : err}`, { ephemeral: true })
    }
  }

  private async removeActionMapping (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { mapping: entityId } = options.actions.remove as { mapping: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await ctx.send(`${emoji.error} No CCAS settings found, cannot set action mapping!`, { ephemeral: true })
      return
    }

    const mapping = await prisma.antiSpamActionMapping.findFirst({
      where: {
        id: entityId,
        settings: {
          version: settings.version
        }
      }
    })

    if (!mapping) {
      await ctx.send(`${emoji.error} No data found for mapping, Discord must haved screwed up, or our autocomplete implementation is bugged.`, { ephemeral: true })
      return
    }

    const { points, action } = mapping

    try {
      await prisma.antiSpamActionMapping.delete({
        where: {
          id: mapping.id
        }
      })

      logger.info(`${ctx.user.username} removed mapping **${points}** => **${action}**.`)
      await ctx.send(`${emoji.error} Removed mapping **${points}** => **${action}**.`, { ephemeral: true })
    } catch (err) {
      await ctx.send(`${emoji.error} Failed to remove CCAS: ${err instanceof Error ? err.message : err}`, { ephemeral: true })
    }
  }

  private async setPointOverride (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { word, points } = options['point-overrides'].set as { word: string, points: string }

    const parsed = parseInt(points)

    if (!_.isFinite(parsed)) {
      await ctx.send(`${emoji.error} Point amount must be a valid number.`, { ephemeral: true })
      return
    }

    try {
      const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
        orderBy: {
          version: 'desc'
        }
      })

      if (!settings) {
        await ctx.send(`${emoji.error} No CCAS settings found, cannot set point overrides!`, { ephemeral: true })
        return
      }

      await prisma.pointOverride.create({
        data: {
          word,
          points: parsed,
          settings: {
            connect: {
              version: settings.version
            }
          }
        }
      })

      logger.info(`${ctx.user.username} set CCAS point override for "${word}" to ${points} points`)
      await ctx.send(`${emoji.success} Point override for word **${word}** set to **${points}** points.`, { ephemeral: true })
    } catch (err) {
      await ctx.send(`${emoji.error} Failed to set CCAS point override: ${err instanceof Error ? err.message : err}`, { ephemeral: true })
    }
  }

  private async removePointOverride (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { word } = options['point-overrides'].remove as { word: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await ctx.send(`${emoji.error} No CCAS settings found, cannot remove point overrides!`, { ephemeral: true })
      return
    }

    const override = await prisma.pointOverride.findFirst({
      where: {
        word,
        settings: {
          version: settings.version
        }
      }
    })

    if (!override) {
      await ctx.send(`${emoji.error} No point override found for word **${word}** in settings version **${settings.version}**.`, { ephemeral: true })
      return
    }

    try {
      await prisma.pointOverride.delete({
        where: {
          id: override.id
        }
      })

      logger.info(`${ctx.user.username} removed CCAS point override for "${word}"`)
      await ctx.send(`${emoji.success} Point override for word **${word}** removed.`, { ephemeral: true })
    } catch (err) {
      await ctx.send(`${emoji.error} Failed to remove CCAS point override: ${err instanceof Error ? err.message : err}`, { ephemeral: true })
    }
  }
}

function isAntiSpamAction (value: string): value is AntiSpamAction {
  return value in AntiSpamAction
}
