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
import { AntiSpamAction, PermissionGroup } from '@prisma/client'
import _ from 'lodash'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { embedBase } from '../utils/discordUtils'
import prisma from '../clients/prisma'
import { alphabetical, errMessage, errStack, humanLikely } from '../utils'
import { run, getAssignedGuilds, handleCommand, sendFailure, sendSuccess } from '../utils/commands'

export default class CCASConfigCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'ccas-config',
      description: 'Edit Cross-Channel Anti-Spam (CCAS) system settings. Infra admins only.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
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
              type: CommandOptionType.INTEGER,
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
                  type: CommandOptionType.INTEGER,
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
                  type: CommandOptionType.INTEGER,
                  name: 'points',
                  description: 'The point threshold at which to trigger the action.',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The action to perform.',
                  choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action })),
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
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN], {
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
    })
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, options } = ctx

    switch (focused) {
      case 'setting': {
        const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
          orderBy: {
            version: 'desc'
          },
          where: {
            guildID: ctx.guildID
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
      where: {
        guildID: ctx.guildID
      },
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found!', ctx)
      return
    }

    const fields: EmbedField[] = _
      .entries(settings)
      .filter(([option]) => !['pointOverrides', 'actionMappings'].includes(option)) // Print point overrides & action mappings separately
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
      },
      where: {
        guildID: ctx.guildID
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found!', ctx)
      return
    }

    if (!(setting in settings)) {
      await sendFailure(`Unknown CCAS setting **${setting}**.`, ctx)
      return
    }

    if (setting === 'version') {
      await sendFailure('Editing the CCAS settings version is not allowed.', ctx)
      return
    }

    try {
      await prisma.crossChannelAntiSpamSettings.update({
        where: {
          version: settings.version,
          guildID: ctx.guildID
        },
        data: {
          [setting]: value
        }
      })

      logger.info(`${ctx.user.username} updated CCAS setting ${setting} to ${value}`)
      await sendSuccess(`CCAS setting **${setting}** set to **${value}**.`, ctx)
    } catch (err) {
      logger.error(`CCAS setting update  ${setting} -> ${value} failed:\n${errStack(err)}`)
      await sendFailure(`Failed to update CCAS setting ${setting} to ${value}: ${errMessage(err)}`, ctx, false)
    }
  }

  private async setActionMapping (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { points, action } = options.actions.set as { points: number, action: AntiSpamAction }

    if (!_.isFinite(points)) {
      await sendFailure('Point amount must be a valid number.', ctx)
      return
    }

    try {
      const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
        orderBy: {
          version: 'desc'
        },
        where: {
          guildID: ctx.guildID
        }
      })

      if (!settings) {
        await sendFailure('No CCAS settings found, cannot set action mapping!', ctx)
        return
      }

      await prisma.antiSpamActionMapping.create({
        data: {
          action,
          points,
          settings: {
            connect: {
              version: settings.version
            }
          }
        }
      })

      logger.info(`${ctx.user.username} added CCAS action mapping for "${action}" to happen at ${points} points`)
      await sendSuccess(`Will **${action.toLowerCase()}** when user accumulates **${points}** points.`, ctx)
    } catch (err) {
      logger.error(`CCAS action mapping creation for ${points} points -> ${action} failed:\n${errStack(err)}`)
      await sendFailure(`Failed to add CCAS action mapping: ${errMessage(err)}`, ctx, false)
    }
  }

  private async removeActionMapping (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { mapping: entityId } = options.actions.remove as { mapping: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      },
      where: {
        guildID: ctx.guildID
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found, cannot remove action mapping!', ctx)
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
      await sendFailure('No data found for that mapping.', ctx)
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
      await sendSuccess(`Removed mapping **${points}** => **${action}**.`, ctx)
    } catch (err) {
      logger.error(`CCAS action mapping removal for ${points} -> ${action} failed:\n${errStack(err)}`)
      await sendFailure(`Failed to remove CCAS action mapping: ${errMessage(err)}`, ctx, false)
    }
  }

  private async setPointOverride (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { word, points } = options['point-overrides'].set as { word: string, points: number }

    try {
      const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
        orderBy: {
          version: 'desc'
        },
        where: {
          guildID: ctx.guildID
        }
      })

      if (!settings) {
        await sendFailure('No CCAS settings found, cannot set point overrides!', ctx)
        return
      }

      await prisma.pointOverride.create({
        data: {
          word,
          points,
          settings: {
            connect: {
              version: settings.version
            }
          }
        }
      })

      logger.info(`${ctx.user.username} set CCAS point override for "${word}" to ${points} points`)
      await sendSuccess(`Point override for word **${word}** set to **${points}** points.`, ctx)
    } catch (err) {
      logger.error(`CCAS point override setting for "${word}" -> ${points} points failed:\n${errStack(err)}`)
      await sendFailure(`Failed to set CCAS point override: ${errMessage(err)}`, ctx, false)
    }
  }

  private async removePointOverride (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { word } = options['point-overrides'].remove as { word: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      },
      where: {
        guildID: ctx.guildID
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found, cannot remove point overrides!', ctx)
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
      await sendFailure(`No point override found for word **${word}** in settings version **${settings.version}**.`, ctx)
      return
    }

    try {
      await prisma.pointOverride.delete({
        where: {
          id: override.id
        }
      })

      logger.info(`${ctx.user.username} removed CCAS point override for "${word}"`)
      await sendSuccess(`Point override for word **${word}** removed.`, ctx)
    } catch (err) {
      logger.error(`CCAS point override removal for "${word}" failed:\n${errStack(err)}`)
      await sendFailure(`Failed to remove CCAS point override: ${errMessage(err)}`, ctx, false)
    }
  }
}
