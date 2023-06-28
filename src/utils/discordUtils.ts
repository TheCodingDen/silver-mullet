import { CommandContext } from 'slash-create'
import emoji from './emoji'
import prisma from '../clients/prisma'
import { PermissionGroup } from '@prisma/client'
import { SnowflakeUtil } from 'discord.js'

export const getAssignedGuilds = (opts?: { includeMain?: boolean }): string[] => {
  const guilds = []

  if (process.env.NODE_ENV === 'production') {
    guilds.push(process.env.STAFF_GUILD_ID as string)

    if (opts?.includeMain) {
      guilds.push(process.env.MAIN_GUILD_ID as string)
    }
  }

  guilds.push(process.env.DEVELOPMENT_GUILD_ID as string)

  return guilds
}

export const assertPermissionGroupMembership = async (allowed: PermissionGroup[], ctx: CommandContext): Promise<boolean> => {
  const targetGroups = await prisma.permissionGroupMapping.findMany({
    where: {
      group: {
        in: allowed
      }
    }
  })

  const groupRoleIDs = targetGroups.map(group => group.roleID)

  if (!ctx.member) {
    await ctx.send(`${emoji.error} Sorry, I cannot figure out who you are to authenticate you.`, { ephemeral: true })

    return false
  } else if (ctx.member.roles.filter(role => groupRoleIDs.includes(role)).length === 0) {
    await ctx.send(
      `${emoji.noEntry} Sorry, you are allowed to use this command. You must belong to the following permission ${allowed.length > 1 ? 'groups' : 'group'}: ${allowed.join(', ')}`,
      { ephemeral: true }
    )

    return false
  } else {
    return true
  }
}

export const isDiscordID = (id: string): boolean => {
  try {
    SnowflakeUtil.decode(id)
    return true
  } catch (err) {
    return false
  }
}
