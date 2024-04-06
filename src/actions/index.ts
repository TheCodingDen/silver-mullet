import { BanOptions, DiscordAPIError, Guild, GuildMember, GuildTextBasedChannel } from 'discord.js'
import { Comparison } from '../detection/spam-detection'
import { SlashCreator } from 'slash-create'
import { makeComponentCallback, updateQueueMessage } from './utils'
import { ActionUpgrade, CachedMessage } from '../clients/redis'
import { retryCallback } from '../utils/retry'
import { handleRetryResult, makeComponents, messageUser } from '../detection/utils'
import color from '../utils/color'
import { removeQueuedAction } from '../cache/op'
import { sendSuccess } from '../utils/commands'
import { AntiSpamAction, Filter } from '@prisma/client'
import { ban } from './ban'
import { kick } from './kick'
import { queueBan, queueKick } from './queue'

export const actions: Record<AntiSpamAction, ActionFunction> = {
  BAN: ban,
  KICK: kick,
  QUEUE_BAN: queueBan,
  QUEUE_KICK: queueKick
}

export { actionFilterHit } from './filter'

export const ignoreFailedDeliver = (err: unknown): boolean => (err instanceof DiscordAPIError) && err.code === 5007 // Cannot send messages to this user
export type ActionFunction = (member: GuildMember, message: TriggeringMessage, result: DetectionResult) => Promise<unknown>

export enum DetectionSource {
  FILTER = 'filter',
  SPAM = 'spam'
}

interface DetectionResultBase {
  action: AntiSpamAction
}

export interface SpamDetectionResult extends DetectionResultBase {
  source: 'spam'

  averageSimilarity: number
  totalPoints: number
  comparisons: Comparison[]
}

export interface FilterDetectionResult extends DetectionResultBase {
  source: 'filter'

  trippedFilter: Filter
  author: GuildMember
  message: CachedMessage
  guild: Guild
}

export type DetectionResult = SpamDetectionResult | FilterDetectionResult

// A message which triggered an automod action within the bot. Abstracts over AutoMod messages & Discord messages
export interface TriggeringMessage {
  author: GuildMember
  guild: Guild
  content: string
  channel: GuildTextBasedChannel
}

export const BAN_OPTS: BanOptions = {
  deleteMessageSeconds: 604800, // 7 days
  reason: 'Spam detected.'
}

export function initActionComponents (creator: SlashCreator): void {
  creator.registerGlobalComponent('confirm', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    const { upgradeTo } = queuedAction
    logger.debug(`Confirming ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    if (process.env.NODE_ENV === 'production') {
      if (upgradeTo === ActionUpgrade.BAN) {
        const [banResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.ban({
            reason: 'Spam detected.'
          }), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: `You have been banned from ${author.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
          }), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          })
        ])

        handleRetryResult(banResult, `When banning user ${author.user.username}`)
        handleRetryResult(messageResult, `When messaging banned user ${author.user.username}`)
      } else if (upgradeTo === ActionUpgrade.KICK) {
        const [kickResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.kick('Spam detected.'), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: `You have been kicked from ${author.guild.name} due to spam. You can appeal at <https://tcd.one/appeal>.`
          }), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          })
        ])

        handleRetryResult(kickResult, `When kicking user ${author.user.username}`)
        handleRetryResult(messageResult, `When messaging kicked user ${author.user.username}`)
      } else {
        throw new Error(`Unactionable action ${upgradeTo}`)
      }
    } else {
      const result = await retryCallback(async () => await messageUser(author.user, {
        content: `Moderator confirmed ${upgradeTo} from ${author.guild.name} due to spam.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake kicking ${author.user.username}`)
    }

    await updateQueueMessage(queuedAction, guild, queueMessage => ({
      embeds: [{
        ...queueMessage.embeds[0].data,
        title: `Moderator approved ${upgradeTo}`,
        color: color.red,
        footer: {
          text: `Actioned by @${moderator.user.username}`,
          icon_url: moderator.user.displayAvatarURL()
        }
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: upgradeTo
      })]
    }))

    await removeQueuedAction(queuedAction)

    await sendSuccess('Confirmed the action.', ctx, true)
  }))

  creator.registerGlobalComponent('cancel', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    await removeQueuedAction(queuedAction)

    const { upgradeTo } = queuedAction
    logger.debug(`Cancelling ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    if (process.env.NODE_ENV !== 'production') {
      const result = await retryCallback(async () => await messageUser(author.user, {
        content: `Moderator canceled ${upgradeTo} from ${author.guild.name}.`
      }), {
        attempts: 1
      })

      handleRetryResult(result, `When fake kicking ${author.user.username}`)
    }

    await updateQueueMessage(queuedAction, guild, queueMessage => ({
      embeds: [{
        ...queueMessage.embeds[0].data,
        title: `Moderator cancelled ${upgradeTo}`,
        color: color.grey,
        footer: {
          text: `Cancelled by @${moderator.user.username}`,
          icon_url: moderator.user.displayAvatarURL()
        }
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: upgradeTo
      })]
    }))

    await sendSuccess('Cancelled the action.', ctx, true)
  }))
}
