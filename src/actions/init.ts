import { SlashCreator } from 'slash-create'
import { makeComponentCallback, updateQueueMessage } from './utils'
import { ActionUpgrade } from '../clients/redis'
import { retryCallback } from '../utils/retry'
import { handleRetryResult, makeComponents, messageUser } from '../detection/utils'
import color from '../utils/color'
import { removeQueuedAction } from '../cache/op'
import { sendSuccess } from '../utils/commands'
import { REMOVAL_OPTIONS, ignoreFailedDeliver } from '.'

export function initActionComponents (creator: SlashCreator): void {
  creator.registerGlobalComponent('confirm', makeComponentCallback(async (ctx, guild, moderator, author, queuedAction) => {
    const { upgradeTo } = queuedAction
    logger.debug(`Confirming ${upgradeTo} of ${author.id} by moderator ${moderator.id}`)

    if (process.env.NODE_ENV === 'production') {
      if (upgradeTo === ActionUpgrade.BAN) {
        const [banResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.ban(REMOVAL_OPTIONS.ban.opts), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: REMOVAL_OPTIONS.ban.message(guild)
          }), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          })
        ])

        handleRetryResult(banResult, `When banning user ${author.user.username}`)
        handleRetryResult(messageResult, `When messaging banned user ${author.user.username}`)
      } else if (upgradeTo === ActionUpgrade.KICK) {
        const [kickResult, messageResult] = await Promise.all([
          retryCallback(async () => await author.kick(REMOVAL_OPTIONS.kick.opts), {
            attempts: 3,
            errorPredicate: ignoreFailedDeliver
          }),
          retryCallback(async () => await messageUser(author.user, {
            content: REMOVAL_OPTIONS.kick.message(guild)
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
        content: `You would have been upgraded to ${upgradeTo} from ${author.guild.name} due to spam.`
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
