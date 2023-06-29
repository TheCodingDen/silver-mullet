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
import { IgnoreTarget, PermissionGroup } from '@prisma/client'
import _ from 'lodash'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { assertPermissionGroupMembership, embedBase, getAssignedGuilds } from '../utils/discordUtils'
import prisma from '../clients/prisma'
import emoji from '../utils/emoji'
import { alphabetical, humanLikely } from '../utils'

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
        }
      ]
    })
  }

  async run (ctx: CommandContext): Promise<void> {
    if (!await assertPermissionGroupMembership([PermissionGroup.INFRA_ADMIN], ctx)) {
      return
    }

    _.values(IgnoreTarget).map(async type => await prisma.ignore.findMany({ where: { type } }))

    const { subcommands } = ctx

    switch (subcommands[0]) {
      case 'get':
        await this.get(ctx)
        break
      case 'set': {
        await this.set(ctx)
        break
      }
      case 'point-overrides': {
        switch (subcommands[1]) {
          case 'set':
            await this.setPointOverride(ctx)
            break
          case 'remove':
            await this.removePointOverride(ctx)
            break
          default:
            logger.warn(`Unknown subcommand ${subcommands[1]} for command '${this.commandName}' -> ${subcommands[0]}!`)
            await ctx.send(`${emoji.error} No handler found for that subcommand.`, { ephemeral: true })
        }

        break
      }
      default:
        logger.warn(`Unknown subcommand ${subcommands[0]} for command '${this.commandName}'!`)
        await ctx.send(`${emoji.error} No handler found for that subcommand.`, { ephemeral: true })
    }
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
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  private async get (ctx: CommandContext): Promise<void> {
    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      include: {
        pointOverrides: true
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
      .filter(([option]) => option !== 'pointOverrides') // Print point overrides separately
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
