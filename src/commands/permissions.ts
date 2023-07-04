import { PermissionGroup, Prisma } from '@prisma/client'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType } from 'slash-create'
import _ from 'lodash'
import client from '../clients/discord'
import prisma from '../clients/prisma'
import { errMessage, errStack } from '../utils'
import { run, getAssignedGuilds, handleCommand, sendFailure, sendSuccess } from '../utils/commands'

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
              type: CommandOptionType.ROLE,
              name: 'role',
              description: 'The role to assign a permission group to.',
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'group',
              description: 'The permission group to assign for the given role.',
              choices: _.keys(PermissionGroup).map(group => ({ name: group, value: group })),
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a role from a permission group.',
          options: [
            {
              type: CommandOptionType.ROLE,
              name: 'role',
              description: 'The role to remove from its permission group.',
              required: true
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
      assign: {
        [run]: this.assign.bind(this)
      },
      remove: {
        [run]: this.remove.bind(this)
      }
    })
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
      await sendFailure('I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being assigned.', ctx)
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

      const assigned = client.guilds.cache.get(guildID)?.roles.cache.get(roleID)

      logger.info(`${ctx.user.username} assigned role ${assigned?.name ?? roleID} to permission group ${group}`)
      await sendSuccess(`Assigned role **${assigned?.name ?? roleID}** to permission group **${group}**.`, ctx)
    } catch (err) {
      logger.error(`Permission group assignment for role ${guildID}:${roleID} -> ${group} failed: ${errStack(err)}`)
      await sendFailure(`Permission group assignment failed: ${errMessage(err)}`, ctx, false)
    }
  }

  private async remove (ctx: CommandContext): Promise<void> {
    const { options, guildID } = ctx
    const { role: roleID } = options.remove as { role: string }

    if (!guildID) {
      await sendFailure('I cannot determine which guild this command is being run from. It must be run in the target guild where these permissions are being removed.', ctx)
      return
    }

    if (!await prisma.permissionGroupMapping.findFirst({ where: { roleID } })) {
      await sendFailure('That role is not assigned to a permission group.', ctx)
      return
    }

    try {
      await prisma.permissionGroupMapping.delete({
        where: {
          roleID
        }
      })

      logger.info(`${ctx.user.username} removed permission group assignment for role ${roleID}`)
      await sendSuccess('Permission group assignment removed.', ctx)
    } catch (err) {
      logger.error(`Permission group assignment removal for role ${guildID}:${roleID} failed: ${errStack(err)}`)
      await sendFailure(`Failed to remove permission group assignment: ${errMessage(err)}`, ctx, false)
    }
  }
}
