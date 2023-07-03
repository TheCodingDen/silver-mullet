import { Message } from 'discord.js'
import Nilsimsa from '../vendor/nilsimsa'
import { addMessage, fetchMessagesByAuthor } from '../cache/op'
import { Comparison, executeAntiSpamDetection } from '../detection/spam-detection'
import actions from '../detection/actions'
import assert from 'assert'
import color from '../utils/color'
import { messageLink } from '../utils/discordUtils'
import _ from 'lodash'

export async function onGuildMessage (message: Message): Promise<void> {
  if (message.author.bot || !message.guild) {
    return
  }

  const member = await message.guild.members.fetch(message.author.id)
  const { guild } = message

  // TODO: Ignore functionality goes here

  // Fetch author messages from Redis cache
  logger.debug(`Fetching messages from author "${message.author.id}"`)
  const authorMessages = await fetchMessagesByAuthor(message.author.id)
  logger.debug(`Got ${authorMessages.length} messages from ${message.author.id}`)

  const messageToCache = {
    messageId: message.id,
    authorId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    hexHash: new Nilsimsa(message.content).digest('hex')
  }

  await addMessage(messageToCache)

  logger.debug('Entering anti spam detection')

  const { action, averageSimilarity, totalPoints, comparisons } = await executeAntiSpamDetection(messageToCache, authorMessages)

  logger.debug(
    `action: ${action}, average similarity: ${averageSimilarity}, original-content: ${message.content.substring(0, 10)}`
  )
  for (const comparison of comparisons) {
    logger.debug(
      `similarity: ${comparison.similarityToPostedContent}, matches: ${
        JSON.stringify(comparison.pointsFromMatches ?? {}, undefined, 2)
      }, content-preview: ${comparison.comparedContent.content.substring(0, 10)}`
    )
  }

  if (action !== 'NOTHING') {
    const actionFn = actions[action]

    let actionComplete = false
    let tries = 3

    while (!actionComplete && tries !== 0) {
      try {
        if (process.env.NODE_ENV !== 'production') {
          await message.reply({
            content: `Action taken: ${action}`
          })
        } else {
          await actionFn(member)
        }
        actionComplete = true
      } catch (err) {
        logger.warn(`Failed to ${action} member (${tries} tries left):\n${err}`)
      }

      tries--
    }

    const { DISCORD_LOG_CHANNEL: logChannelId } = process.env
    assert(logChannelId !== undefined, 'log channel was not set in the environment')

    const logChannel = await message.guild.channels.fetch(logChannelId)
    if (!logChannel) {
      logger.error(`Log channel (${logChannelId}) cannot be found, does it exist in guild ${message.guild.id} (${message.guild.name})?`)
      return
    }
    if (!logChannel.isTextBased() || logChannel.isDMBased()) {
      logger.error(`Log channel ${logChannelId} is not text based or is a DM`)
      return
    }

    // Use the (up to) 10 most similar matches, with most similar ranked first
    const cacheHitsToUse = comparisons.sort((a, b) => b.similarityToPostedContent - a.similarityToPostedContent).slice(0, 10)
    const averageSimilarityOfUsed = _.mean(cacheHitsToUse.map((val) => val.similarityToPostedContent))

    const formatCacheHit = (c: Comparison): string => {
      const link = messageLink({ ...c.comparedContent, guildId: guild.id })
      const content = _.truncate(c.comparedContent.content, { length: 20 }) || '<no-content>'
      const matches = c.pointsFromMatches
      const pointString = matches
        ? `^ scored **${matches.highestRankingMatch}** points from matches, with highest matching word "**${matches.highestRankingString}**" 
        similarity of **${c.similarityToPostedContent}** to triggering message
        all matches were ${matches.matches.map(m => `**${m}**`).join() || '[none]'}`
        : `no points from matches, similarity of **${c.similarityToPostedContent}** to triggering message `

      return `"${content}" (${link}):\n${pointString}`
    }

    await logChannel.send({
      embeds: [{
        title: `Spam detected (@${message.author.username})`,
        description: `
          **Triggered by** (${messageLink({ guildId: guild.id, messageId: message.id, channelId: message.channel.id })}):
          \`\`\`
${message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\` 
          **Action taken**:
          ${action}
          ${cacheHitsToUse.length
            ? (`
              **Other messages (${cacheHitsToUse.length})**:
              Average similarity: __${averageSimilarityOfUsed.toPrecision(3)}__ 
              Total point count: __${totalPoints}__

              ${cacheHitsToUse.map(formatCacheHit).join('\n\n')}
            `)
            : ''
          }
        `,
        color: color.blurple
      }]
    })
  }
  logger.debug('Anti spam finished')
}
