import { IgnoreTarget, PermissionGroup } from '@prisma/client'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import { Guild, GuildBasedChannel, Role, User } from 'discord.js'
import _ from 'lodash'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, AutocompleteContext, AutocompleteChoice } from 'slash-create'
import discord from '../clients/discord'
import prisma from '../clients/prisma'
import { alphabetical, errMessage, errStack, humanLikely } from '../utils/index'
import { GuildCommandContext, getAssignedGuilds, handleCommand, run, sendFailure, sendSuccess } from '../utils/commands'

const fetchers = {
  CATEGORY: async (id: string, guild: Guild) => await guild.channels.fetch(id),
  CHANNEL: async (id: string, guild: Guild) => await guild.channels.fetch(id),
  ROLE: async (id: string, guild: Guild) => await guild.roles.fetch(id)
}

export default class IgnoreCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'ignore',
      description: 'Manage channels, categories and roles ignored by the bot. Infra admins only.',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'add',
          description: 'Add a channel, role or user to the ignore list.',
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
    const { focused, options, guildID } = ctx

    switch (focused) {
      case 'entity': {
        if (!guildID) {
          logger.warn('Could not fulfill autocomplete request, request came from DMs')
          return []
        }

        const ignoredEntities = await prisma.ignore.findMany({
          where: {
            guildId: guildID
          }
        })

        if (ignoredEntities.length === 0) {
          return []
        }

        const guild = await discord.guilds.fetch(guildID)

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
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN], {
      add: {
        [run]: this.add.bind(this)
      },
      remove: {
        [run]: this.remove.bind(this)
      }
    })
  }

  private async add (ctx: GuildCommandContext): Promise<void> {
    const { options, guildID } = ctx

    const guild = await discord.guilds.fetch(guildID)

    // Entity ID
    const { role, channel } = options.add as { channel: string | undefined, role: string | undefined }
    const entityId = role ?? channel

    if (!entityId) {
      await sendFailure('Provide a channel or role.', ctx)
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
        logger.debug(`Fetcher failed\n${err}`)
      }
    }

    if (!discordEntity || !entityType) {
      await sendFailure(`Could not resolve ${entityId}. It may not exist or Discord may be having issues.`, ctx)
      return
    }

    try {
      await prisma.ignore.create({
        data: {
          snowflake: discordEntity.id,
          guildId: discordEntity.guild.id,
          type: entityType
        }
      })

      const mention = discordEntity instanceof Role ? `<@&${entityId}>` : `<#${entityId}>`

      logger.info(`${ctx.user.username} added ignore for ${mention} (${discordEntity.id})`)
      await sendSuccess(`Added **${discordEntity.name}** (${mention}, ${entityId}) to the ignore list.`, ctx)
    } catch (err) {
      logger.error(`Ignore creating for ${entityType.toLowerCase()} ${discordEntity.id} failed: ${errStack(err)}`)
      await sendFailure(`Failed to create ignore, target is still not ignored: ${errMessage(err)}`, ctx, false)
    }
  }

  private async remove (ctx: GuildCommandContext): Promise<void> {
    const { options, guildID } = ctx

    const guild = await discord.guilds.fetch(guildID)
    // CUID of ignored item
    const { entity: entityId } = options.remove as { entity: string }

    const found = await prisma.ignore.findFirst({
      where: {
        id: entityId
      }
    })

    if (!found) {
      // Should never happen
      await sendFailure('That entity could not found.', ctx)
      return
    }

    const discordEntity = await fetchers[found.type](found.snowflake, guild)

    if (!discordEntity) {
      await sendFailure(`Could not resolve ${found.snowflake}. Is Discord experiencing issues?`, ctx)
      return
    }

    try {
      await prisma.ignore.delete({
        where: {
          id: entityId
        }
      })

      logger.info(`${ctx.user.username} removed an ignore for ${discordEntity.name} (${discordEntity.id})`)
      await sendSuccess('Ignore removed.', ctx)
    } catch (err) {
      logger.error(`Ignore removal for ${found.type.toLowerCase()} ${found.snowflake} failed:\n${errStack(err)}`)
      await sendFailure(`Failed to remove ignore, target is still ignored: ${errMessage(err)}`, ctx, false)
    }
  }
}
