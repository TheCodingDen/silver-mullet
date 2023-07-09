import { ActionRowBuilder, APIEmbed, ButtonBuilder, ButtonStyle, Guild, Message, TextBasedChannel } from 'discord.js'
import _ from 'lodash'
import { addQueuedAction, fetchQueuedActionByAuthorId } from '../cache/op'
import { ActionUpgrade } from '../clients/redis'
import color from '../utils/color'
import { embedBase, messageLink } from '../utils/discordUtils'
import { ActionFunction } from './actions'
import { FilterDetectionResult, FilterHit } from './filter-detection'
import { Comparison, ResultType, SpamDetectionResult } from './spam-detection'

export async function getChannel (guild: Guild, name: string, id: string | undefined): Promise<TextBasedChannel> {
  if (!id) {
    throw new Error(`${name} channel ID was not set`)
  }

  const channel = await guild.channels.fetch(id)
  if (!channel) {
    throw new Error(`${name} channel (${id}) cannot be found`)
  }
  if (!channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`${name} channel ${id} is not text based or is a DM`)
  }

  return channel
}

export async function getLogChannel (guild: Guild): Promise<TextBasedChannel> {
  return await getChannel(guild, 'log', process.env.DISCORD_LOG_CHANNEL)
}

export async function getQueueChannel (guild: Guild): Promise<TextBasedChannel> {
  return await getChannel(guild, 'queue', process.env.DISCORD_QUEUE_CHANNEL)
}

interface MakeComponentOpts {
  disabled: boolean
  confirmAction: ActionUpgrade
}
export function makeComponents ({ disabled, confirmAction }: MakeComponentOpts): ActionRowBuilder<ButtonBuilder> {
  const confirm = new ButtonBuilder()
    .setCustomId('confirm')
    .setLabel(`Confirm ${confirmAction}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled)

  const cancel = new ButtonBuilder()
    .setCustomId('cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(cancel, confirm)
  return row
}

// Allow new posts to be queued to the action queue by the same user after one hour
const newActionPostThresholdMillis = 1000 * 60 * 60

export function makeQueueCallback (action: ActionUpgrade): ActionFunction {
  return async (member, message, result) => {
    const queuedAction = await fetchQueuedActionByAuthorId(message.author.id)
    const embed = result.type === ResultType.SPAM ? makeSpamEmbed(message, result) : makeFilterEmbed(message, result)
    if (queuedAction) {
      const actionCreatedDelta = Date.now() - queuedAction.createdAt

      // Not a new post, update the existing one
      if (actionCreatedDelta < newActionPostThresholdMillis) {
        logger.debug(`Updating queued message for ${message.author.id}`)
        const queueChannel = await getQueueChannel(message.guild)
        const queueMessage = await queueChannel.messages.fetch(queuedAction.queueMessageId)
        await queueMessage.edit({
          embeds: [{
            ...embed,
            title: 'Suspicious activity detected',
            color: color.yellow
          }],
          components: [makeComponents({
            disabled: false,
            confirmAction: action
          })]
        })

        return
      }

      // Otherwise, proceed into making a new action in the queue
    }

    const queueChannel = await getQueueChannel(message.guild)

    const queueMessage = await queueChannel.send({
      embeds: [{
        ...embed,
        title: 'Suspicious activity detected',
        color: color.yellow
      }],
      components: [makeComponents({
        disabled: false,
        confirmAction: action
      })]
    })

    logger.debug(`Queueing ${action} for ${message.author.id}`)

    await addQueuedAction({
      authorId: member.id,
      queueMessageId: queueMessage.id,
      originalMessageId: message.id,
      originalChannelId: message.channel.id,
      upgradeTo: action,
      createdAt: Date.now()
    })
  }
}

export function makeFilterEmbed (message: Message<true>, result: FilterDetectionResult): APIEmbed {
  const { action, highestAppliedRule, hits } = result
  if (!highestAppliedRule) {
    // Rules can be undefined in the matching and action stage if there was no matches
    // but if we are here, making an embed, there must have been a match
    throw new Error('cannot create a filter embed without a rule to work with')
  }

  const formatHit = (hit: FilterHit): string => {
    return `"${hit.rule.description}" (${hit.rule.action})
      triggering phrase: "${hit.rule.triggeringPhrase}"`
  }

  return {
    ...embedBase(),
    title: 'Filter triggered',
    color: color.red,
    author: {
      name: `@${message.author.username}`,
      icon_url: message.author.displayAvatarURL()
    },
    description: `
          **Triggered by** (${messageLink({ guildId: message.guild.id, messageId: message.id, channelId: message.channel.id })}):
          \`\`\`
${message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\` 
          **Rule with highest action**:
          "${highestAppliedRule.description}" (${action})
          triggering phrase: "${highestAppliedRule.triggeringPhrase}"

          **All triggered rules**:
          ${hits.length ? hits.map(formatHit).join('\n\n') : 'No other hits'}
        `
  }
}

export function makeSpamEmbed (message: Message<true>, result: SpamDetectionResult): APIEmbed {
  const { action, comparisons, totalPoints } = result

  // Use the (up to) 10 most similar matches, with most similar ranked first
  const cacheHitsToUse = comparisons.sort((a, b) => b.similarityToPostedContent - a.similarityToPostedContent).slice(0, 10)
  const averageSimilarityOfUsed = _.mean(cacheHitsToUse.map((val) => val.similarityToPostedContent))

  const formatCacheHit = (c: Comparison): string => {
    const link = messageLink({ ...c.comparedContent, guildId: message.guild.id })
    const content = _.truncate(c.comparedContent.content, { length: 30 }) || '<no-content>'
    const { pointsFromMatches: matches, pointsFromSimilarity: similarity } = c

    let pointString

    if (matches) {
      pointString = `^ scored **${matches.highestRankingMatch}** points from matches, with highest matching word "**${matches.highestRankingString}**"`
      if (similarity) {
        pointString += `\nsimilarity of **${c.similarityToPostedContent}** to triggering message surpassed the threshold of **${similarity.thresholdBroken}**
        no points because of keyword matching`
      } else {
        pointString += `\nsimilarity of **${c.similarityToPostedContent}** to triggering message, which did not pass any similarity thresholds.`
      }
      pointString += `\nall matches were ${matches.matches.map(m => `**${m}**`).join() || '[none]'}`
    } else {
      pointString = '^ no points from matches '
      if (similarity) {
        pointString += `\nsimilarity of **${c.similarityToPostedContent}** to triggering message, which did pass the threshold of **${similarity.thresholdBroken}**
          and scored **${similarity.pointsGained}** points`
      } else {
        pointString += `\nsimilarity of **${c.similarityToPostedContent}** to triggering message, which did not pass any similarity thresholds.`
      }
    }

    return `\`${content}\` (${link}):\n${pointString}`
  }

  return {
    ...embedBase(),
    title: 'Spam detected',
    color: color.red,
    author: {
      name: `@${message.author.username}`,
      icon_url: message.author.displayAvatarURL()
    },
    description: `
          **Triggered by** (${messageLink({ guildId: message.guild.id, messageId: message.id, channelId: message.channel.id })}):
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
        `
  }
}
