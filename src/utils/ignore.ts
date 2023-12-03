import { GuildMember } from 'discord.js'
import prisma from '../clients/prisma'

export async function shouldIgnoreMessage (
  channelId: string,
  parentId: string | undefined | null,
  member: GuildMember
): Promise<boolean> {
  // Declare all conditions for the DB to check against
  // will search channels, categories, and roles.
  const conditions = [
    {
      snowflake: channelId
    }
  ]

  // Only search for the parent if it exists
  if (parentId) {
    conditions.push({
      snowflake: parentId
    })
  }

  // Search for each role the author has
  for (const [, role] of member.roles.cache) {
    conditions.push({
      snowflake: role.id
    })
  }

  // If there's > 0 entries in the DB, that means there's
  // an ignore entry for a part of the message, so ignore it.
  const ignoreEntryCount = await prisma.ignore.count({
    where: {
      OR: conditions
    }
  })

  return ignoreEntryCount > 0
}
