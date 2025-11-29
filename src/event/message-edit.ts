import { Message, PartialMessage } from 'discord.js'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import { actionFilterHit } from '../actions'
import { executeFilterDetection } from '../detection/filter-detection'
import Nilsimsa from '../vendor/nilsimsa'

export async function onMessageEdit (
  oldMessage: Message | PartialMessage,
  newMessage: Message
): Promise<void> {
  if (newMessage.author.bot || newMessage.channel.isDMBased() || !newMessage.inGuild()) {
    return
  }

  const member = await newMessage.guild.members.fetch(newMessage.author.id)

  // Declare all conditions for the DB to check against
  // will search channels, categories, and roles.
  const conditions = [
    {
      snowflake: newMessage.channel.id
    }
  ]

  // Only search for the parent if it exists
  if (newMessage.channel.parentId) {
    conditions.push({
      snowflake: newMessage.channel.parentId
    })
  }

  // Search for each role the author has
  for (const [, role] of member.roles.cache) {
    conditions.push({
      snowflake: role.id
    })
  }

  // If there's > 0 entries in the DB, that means there's
  // an ignore entry for a part of the newMessage, so ignore it.
  const ignoreEntryCount = await prisma.ignore.count({
    where: {
      OR: conditions
    }
  })

  if (ignoreEntryCount > 0) {
    logger.debug(`Ignoring newMessage from ${newMessage.author.id} in channel ${newMessage.channel.id} (parent: ${newMessage.channel.parentId})`)
    return
  }

  const messageToCache: CachedMessage = {
    messageId: newMessage.id,
    guildId: newMessage.guild.id,
    authorId: newMessage.author.id,
    channelId: newMessage.channel.id,
    content: newMessage.content,
    hexHash: new Nilsimsa(newMessage.content).digest('hex')
  }

  // Some fields nullable due to the Partial but they will be unchanging so are taken from newMessage
  const oldContent = oldMessage.content ?? 'could not load old content'
  const oldMessageCached = {
    messageId: newMessage.id,
    guildId: newMessage.guild.id,
    authorId: newMessage.author.id,
    channelId: newMessage.channel.id,
    content: oldContent,
    hexHash: new Nilsimsa(oldContent).digest('hex')
  }

  const filterResult = await executeFilterDetection(messageToCache, oldMessageCached, member, newMessage.guild)
  if (filterResult) {
    logger.debug(`User ${newMessage.author.id} hit filter ${JSON.stringify(filterResult, undefined, 2)}`)

    const actionResult = await actionFilterHit(filterResult, member)
    if (!actionResult.success) {
      logger.error(`User ${newMessage.author.id} hit filter ${JSON.stringify(filterResult, undefined, 2)} but it errored`)
    }
  }

  // Don't run CCAS (too expensive for little gain, also requires cache prodding)
  // Don't run suspicious reactivation updates (real wonky technical stuff e.g letting users time travel by editing old messages)
}
