import { IgnoreTarget, PermissionGroup } from '@prisma/client'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { Guild, GuildBasedChannel, Role, User } from 'discord.js'
import _ from 'lodash'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, AutocompleteContext, AutocompleteChoice } from 'slash-create'
import discord from '../clients/discord'
import prisma from '../clients/prisma'
import { assertPermissionGroupMembership, getAssignedGuilds } from '../utils/discordUtils'
import emoji from '../utils/emoji'
import { alphabetical, humanLikely } from '../utils/index'

const fetchers = {
  CATEGORY: async (id: string, guild: Guild) => await guild.channels.fetch(id),
  CHANNEL: async (id: string, guild: Guild) => await guild.channels.fetch(id),
  ROLE: async (id: string, guild: Guild) => await guild.roles.fetch(id)
}

export default class IgnoreCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'ignore',
      description: 'Manage channels, categories and roles ignored by the bot',
      guildIDs: getAssignedGuilds({ includeMain: true }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'add',
          description: 'Add a channel, role or user to the ignore list. Infra admins only.',
          options: [
            {
              type: CommandOptionType.CHANNEL,
              name: 'channel',
              description: 'The channel or category to ignore.'
            },
            {
              type: CommandOptionType.ROLE,
              name: 'role',
              description: 'The role to ignore.'
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a channel, role, or user from the ignore list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'entity',
              description: 'The entity to remove.',
              required: true,
              autocomplete: true
            }
          ]
        }
      ]
    })
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, options } = ctx

    switch (focused) {
      case 'entity': {
        const ignoredEntities = await prisma.ignore.findMany({})

        if (!ctx.guildID) {
          logger.warn('Could not fulfill autocomplete request, request came from DMs')
          return []
        }

        if (!ignoredEntities) {
          return []
        }

        const guild = await discord.guilds.fetch(ctx.guildID)

        // Mappings to allow us to go easily between entity names, and their entities, by their CUID
        const entityToDiscord: Record<string, GuildBasedChannel | Role | User> = {}
        const entityToName: Record<string, string> = {}

        for (const ignore of ignoredEntities) {
          const discordData = await fetchers[ignore.type](ignore.snowflake, guild)
          if (!discordData) {
            logger.warn(`Ignored entity "${ignore.id}" (${ignore.snowflake}) could not be resolved in Discord, does it still exist?`)
            continue
          }

          entityToName[ignore.id] = discordData.name
          entityToDiscord[ignore.id] = discordData
        }

        const validOptions = ignoredEntities.map(e => entityToName[e.id])
        const input = options?.remove?.entity

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return ignoredEntities
          .filter(option => humanLikely(input, likely, entityToName[option.id]))
          .map(option => ({ name: entityToName[option.id], value: option.id }))
          .sort(alphabetical)
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  async run (ctx: CommandContext): Promise<void> {
    if (!await assertPermissionGroupMembership([PermissionGroup.INFRA_ADMIN], ctx)) {
      return
    }

    const { subcommands } = ctx

    switch (subcommands[0]) {
      case 'add':
        await this.add(ctx)
        break
      case 'remove':
        await this.remove(ctx)
        break
      default:
        logger.warn(`Unknown subcommand ${subcommands[0]} for command '${this.commandName}'!`)
        await ctx.send(`${emoji.error} No handler found for that subcommand.`, { ephemeral: true })
    }
  }

  private async add (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    if (!guildID) {
      await ctx.send(`${emoji.error} I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being removed.`)
      return
    }

    const guild = await discord.guilds.fetch(guildID)

    // Entity ID
    const { role, channel } = options.add as { channel: string | undefined, role: string | undefined }
    const entityId = role ?? channel

    if (!entityId) {
      await ctx.send(`${emoji.error} Provide a channel or role.`, { ephemeral: true })
      return
    }

    let discordEntity: Role | GuildBasedChannel | null = null
    let entityType: IgnoreTarget | null = null

    // Just try every fetcher, there's no easy way to get this data otherwise.
    // Discord only gives us the ID for some unknown reason
    for (const [type, fetcher] of _.entries(fetchers)) {
      try {
        discordEntity = await fetcher(entityId, guild)
        entityType = type as IgnoreTarget
        if (discordEntity) {
          break
        }
      } catch (err) {
        logger.debug(`Fetcher error\n${err}`)
      }
    }

    if (discordEntity === null || entityType === null) {
      await ctx.send({
        content: `${emoji.error} Could not resolve ${entityId}. It may not exist or Discord may be having issues.`,
        ephemeral: true
      })
      return
    }

    try {
      await prisma.ignore.create({
        data: {
          snowflake: discordEntity.id,
          type: entityType
        }
      })
    } catch (err) {
      await ctx.send({
        content: `Failed to create the database entity, target has not been ignored. (${err})`,
        ephemeral: true
      })
      return
    }

    const mention = discordEntity instanceof Role ? `<@&${entityId}>` : `<#${entityId}>`

    await ctx.send({
      content: `${emoji.success} Added: ${discordEntity.name} (${mention}, ${entityId}) to the ignore list`,
      ephemeral: true
    })

    logger.info(`${ctx.user.username} added ignore with name: ${discordEntity.name} (${discordEntity.id})`)
  }

  private async remove (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    if (!guildID) {
      await ctx.send(`${emoji.error} I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being removed.`)
      return
    }

    const guild = await discord.guilds.fetch(guildID)
    // CUID of ignored item
    const { entity: entityId } = options.remove as { entity: string }

    const found = await prisma.ignore.findFirst({
      where: {
        id: entityId
      }
    })

    if (!found) {
      await ctx.send({
        // Should never happen
        content: `${emoji.error} CUID ${entityId} could not be located in the database, this means Discord gave us garbage, or the autocomplete implementation is bugged, please report this.`,
        ephemeral: true
      })
      return
    }

    const discordEntity = await fetchers[found.type](found.snowflake, guild)

    if (discordEntity === null) {
      await ctx.send({
        content: `${emoji.error} Could not resolve ${found.snowflake}? Is Discord experiencing issues? This should never happen, please report.`,
        ephemeral: true
      })
      return
    }

    try {
      await prisma.ignore.delete({
        where: {
          id: entityId
        }
      })
    } catch (err) {
      await ctx.send({
        content: `Failed to delete the database entity, target is still ignored. (${err})`,
        ephemeral: true
      })
      return
    }

    await ctx.send({
      content: `${emoji.success} Ignore removed.`,
      ephemeral: true
    })
  }
}
