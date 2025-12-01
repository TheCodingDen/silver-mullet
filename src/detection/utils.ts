import { ActionRowBuilder, APIEmbed, ButtonBuilder, ButtonStyle, Guild, Message, MessageCreateOptions, TextBasedChannel, User } from 'discord.js'
import _ from 'lodash'
import { addQueuedAction, fetchQueuedActionByAuthorId } from '../cache/op'
import { ActionUpgrade } from '../clients/redis'
import { errStack } from '../utils'
import color from '../utils/color'
import { channelLink, embedBase } from '../utils/discordUtils'
import { RetryResult } from '../utils/retry'
import { ActionFunction, TriggeringMessage } from '../actions'
import { Comparison } from './spam-detection'
import { DetectionResult, DetectionSource, FilterDetectionResult, SpamDetectionResult, ReactivationDetectionResult } from './types'

async function getChannel (guild: Guild, name: string, id: string | undefined): Promise<TextBasedChannel> {
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
    if (queuedAction) {
      const actionCreatedDelta = Date.now() - queuedAction.createdAt

      // Not a new post, update the existing one
      if (actionCreatedDelta < newActionPostThresholdMillis) {
        logger.debug(`Updating queued message for ${message.author.id}`)
        const queueChannel = await getQueueChannel(message.guild)
        const queueMessage = await queueChannel.messages.fetch(queuedAction.queueMessageId)
        await queueMessage.edit({
          embeds: [{
            ...makeDefaultEmbed(message, result),
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
        ...makeDefaultEmbed(message, result),
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
      upgradeTo: action,
      createdAt: Date.now()
    })
  }
}

function makeSpamDefaultEmbed (message: TriggeringMessage, result: SpamDetectionResult): APIEmbed {
  const { action, comparisons, totalPoints } = result

  // Use the (up to) 10 most similar matches, with most similar ranked first
  const cacheHitsToUse = comparisons.sort((a, b) => b.similarityToPostedContent - a.similarityToPostedContent).slice(0, 10)
  const averageSimilarityOfUsed = _.mean(cacheHitsToUse.map((val) => val.similarityToPostedContent))

  const formatCacheHit = (c: Comparison): string => {
    const link = channelLink(c.comparedContent.channelId)
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
      name: `@${message.author.user.username} (${message.author.id})`,
      icon_url: message.author.displayAvatarURL()
    },
    description: `
          **Triggered in** (${channelLink(message.channel.id)}):
          \`\`\`
${message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\` 
          **Action taken**:
          \`${action}\`
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

function makeReactivationDefaultEmbed (message: TriggeringMessage, result: ReactivationDetectionResult): APIEmbed {
  const { lastSeen, action, trippedFilter } = result

  return {
    ...embedBase(),
    title: 'Suspicious reactivation detected',
    color: color.red,
    author: {
      name: `@${message.author.user.username} (${message.author.id})`,
      icon_url: message.author.displayAvatarURL()
    },
    description: `
          **Joined**: ${message.author.joinedAt?.toLocaleString()}
          **Last seen**: ${lastSeen?.lastMessageDate.toLocaleString() ?? 'none'}
          **Inactivity threshold**: ${trippedFilter.dayThreshold} days
    
          **Triggered in** (${channelLink(message.channel.id)}):
          \`\`\`
${message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\`
          **Action taken**:
          \`${action}\`

          **Filter**:
          \`/${trippedFilter.regex}/${trippedFilter.flags}\`
        `
  }
}

function makeFilterDefaultEmbed (message: TriggeringMessage, result: FilterDetectionResult): APIEmbed {
  const { action, trippedFilter } = result
  const previousContent = result.oldMessage !== undefined
    ? (`
          **Previous content**:
          \`\`\`
${result.oldMessage.content.trimStart().trimEnd() ?? '<unchanged>'}
          \`\`\`
`)
    : ''

  return {
    ...embedBase(),
    title: 'Filter triggered',
    color: color.red,
    author: {
      name: `@${message.author.user.username} (${message.author.id})`,
      icon_url: message.author.displayAvatarURL()
    },
    description: `
          **Triggered in** (${channelLink(message.channel.id)}):
          \`\`\`
${message.content.trimStart().trimEnd() || '<no-content>'}
          \`\`\`
          ${previousContent}
          **Action taken**:
          \`${action}\`

          **Filter**:
          \`/${trippedFilter.regex}/${trippedFilter.flags}\`
        `
  }
}

function checkExhaustive (_arg: never): never {
  throw new Error('this case should never happen; please implement the missing conditional branch')
}

export function makeDefaultEmbed (message: TriggeringMessage, result: DetectionResult): APIEmbed {
  if (result.source === DetectionSource.SPAM) {
    return makeSpamDefaultEmbed(message, result)
  } else if (result.source === DetectionSource.FILTER) {
    return makeFilterDefaultEmbed(message, result)
  } else if (result.source === DetectionSource.REACTIVATION) {
    return makeReactivationDefaultEmbed(message, result)
  } else {
    checkExhaustive(result)
  }
}

export async function messageUser (user: User, message: MessageCreateOptions): Promise<Message> {
  const channel = await user.createDM()
  return await channel.send(message)
}

export function handleRetryResult (result: RetryResult<unknown>, context: string): void {
  // Abort if there is no captured errors (filtered out), but we still were not successful
  if (result.success || !result.errors.length) {
    return
  }

  logger.error(`Failed to execute promise through retry (context: ${context}), encountered ${result.errors.length} error(s):\n${result.errors.map(errStack).join('\n\n')}`)
}
