import { PermissionGroup, Prisma } from '@prisma/client'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, AutocompleteContext, AutocompleteChoice } from 'slash-create'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import _ from 'lodash'
import { assertPermissionGroupMembership, getAssignedGuilds, isDiscordID } from '../utils/discordUtils'
import client from '../clients/discord'
import prisma from '../clients/prisma'
import emoji from '../utils/emoji'
import { alphabetical, humanLikely } from '../utils'

export default class ConfigCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'permissions',
      description: 'Edit role => bot permission group mappings. Infra admins only.',
      guildIDs: getAssignedGuilds({ includeMain: true }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'get',
          description: 'Retrieve current permission group mappings.',
          options: [
            {
              type: CommandOptionType.BOOLEAN,
              name: 'all',
              description: 'Include guilds other than the current one?',
              required: false
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'assign',
          description: 'Assign a role to a permission group.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'role',
              description: 'The role to assign a permission group to.',
              required: true,
              autocomplete: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'group',
              description: 'The permission group to assign for the given role.',
              required: true,
              autocomplete: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a role from a permission group.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'role',
              description: 'The role to remove from its permission group.',
              required: true,
              autocomplete: true
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

    const { subcommands } = ctx

    switch (subcommands[0]) {
      case 'get':
        await this.get(ctx)
        break
      case 'assign':
        await this.assign(ctx)
        break
      case 'remove':
        await this.remove(ctx)
        break
      default:
        logger.warn(`Unknown subcommand ${subcommands[0]} for command '${this.commandName}'!`)
        await ctx.send(`${emoji.error} No handler found for that subcommand.`, { ephemeral: true })
    }
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, guildID, options } = ctx

    switch (focused) {
      case 'role': {
        if (!guildID) {
          logger.warn('Cannot determine guild ID in order to list roles for permissions assignment')
          return []
        }

        const guild = client.guilds.cache.get(guildID)

        if (!guild) {
          logger.warn(`Guild ${guildID} is missing from cache, cannot list roles for permissions assignment`)
          return []
        }

        const roles = Array.from(guild.roles.cache.values())

        const input = (options?.assign?.role ?? options?.remove?.role) as string

        const likely = didYouMean(
          input,
          roles.map(role => role.name),
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return roles
          .filter(role => humanLikely(input, likely, role.name))
          .map(role => ({ name: role.name, value: role.id }))
          .sort(alphabetical)
      }
      case 'group': {
        const groups = [
          { name: 'Root', value: PermissionGroup.ROOT },
          { name: 'Infra Admin', value: PermissionGroup.INFRA_ADMIN },
          { name: 'Admin', value: PermissionGroup.ADMIN },
          { name: 'Moderator', value: PermissionGroup.MODERATOR }
        ]

        const input = options.assign.group as string

        const likely = didYouMean(
          input,
          groups.map(group => group.name),
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return groups
          .filter(mapping => humanLikely(input, likely, mapping.name))
          .sort(alphabetical)
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  private async get (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    const { all } = options.get as { all: boolean }

    const where: Prisma.PermissionGroupMappingWhereInput = !all
      ? { guildID }
      : {}

    const allMappings = await prisma.permissionGroupMapping.findMany({
      where
    })

    const mappings = allMappings
      .map(mapping => {
        const guild = client.guilds.cache.get(mapping.guildID)

        return {
          guild: guild?.name ?? mapping.guildID,
          role: guild?.roles.cache.get(mapping.roleID)?.name ?? mapping.roleID,
          group: mapping.group
        }
      })
      .sort((a, b) => a.guild.localeCompare(b.guild))

    const byGuild = _.groupBy(mappings, 'guild')

    const content = _
      .entries(byGuild)
      .map(([guild, mappings]) => {
        return `**${guild}:**\n${mappings.map(mapping => `${mapping.role}: \`${mapping.group}\``).join('\n')}`
      })
      .join('\n')

    await ctx.send(content, { ephemeral: true })
  }

  private async assign (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    const { role: roleID, group } = options.assign as { role: string, group: PermissionGroup }

    if (!guildID) {
      await ctx.send(`${emoji.error} I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being assigned.`)
      return
    }

    if (!isDiscordID(roleID)) {
      await ctx.send(`${emoji.error} Invalid role ID.`, { ephemeral: true })
      return
    }

    if (!(group in PermissionGroup)) {
      await ctx.send(`${emoji.error} Invalid permission group. Valid permission groups are: ${_.keys(PermissionGroup).join(', ')}`, { ephemeral: true })
      return
    }

    try {
      await prisma.permissionGroupMapping.upsert({
        where: {
          roleID
        },
        create: {
          roleID,
          guildID,
          group
        },
        update: {
          group
        }
      })
    } catch (err) {
      await ctx.send({
        content: `${emoji.error} Permission group assignment failed: ${err instanceof Error ? err.message : err}`,
        ephemeral: true
      })
      return
    }

    const assigned = client.guilds.cache.get(guildID)?.roles.cache.get(roleID)

    await ctx.send(`${emoji.success} Assigned role **${assigned?.name ?? roleID}** to permission group **${group}**.`, { ephemeral: true })
  }

  private async remove (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    const { role: roleID } = options.remove as { role: string }

    if (!guildID) {
      await ctx.send(`${emoji.error} I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being removed.`)
      return
    }

    if (!isDiscordID(roleID)) {
      await ctx.send(`${emoji.error} Invalid role ID.`, { ephemeral: true })
      return
    }

    if (!await prisma.permissionGroupMapping.findFirst({ where: { roleID } })) {
      await ctx.send(`${emoji.error} That role is not assigned to a permission group.`, { ephemeral: true })
      return
    }

    try {
      await prisma.permissionGroupMapping.delete({
        where: {
          roleID
        }
      })
    } catch (err) {
      await ctx.send({
        content: `Failed to remove permission group assignment: ${err instanceof Error ? err.message : err}`,
        ephemeral: true
      })
      return
    }

    await ctx.send(`${emoji.success} Permission group asssignment removed.`, { ephemeral: true })
  }
}
