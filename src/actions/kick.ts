import { expireQueuedAction, fetchQueuedActionByMessageId } from '../cache/op'
import { ActionUpgrade } from '../clients/redis'
import { getLogChannel, makeDefaultEmbed, handleRetryResult, makeComponents, messageUser } from '../detection/utils'
import color from '../utils/color'
import { retryCallback } from '../utils/retry'
import { ActionFunction, REMOVAL_OPTIONS, ignoreFailedDeliver } from './'
import { updateQueueMessage } from './utils'

export const kick: ActionFunction = async (member, message, result) => {
  if (process.env.NODE_ENV === 'production') {
    const [kickResult, messageResult] = await Promise.all([
      retryCallback(async () => await member.kick(REMOVAL_OPTIONS.kick.opts), {
        attempts: 3,
        errorPredicate: ignoreFailedDeliver
      }),
      retryCallback(async () => await messageUser(member.user, {
        content: REMOVAL_OPTIONS.kick.message(member.guild)
      }), {
        attempts: 3,
        errorPredicate: ignoreFailedDeliver
      })
    ])

    handleRetryResult(kickResult, `When kicking user ${member.user.username}`)
    handleRetryResult(messageResult, `When messaging kicked user ${member.user.username}`)
  } else {
    const result = await retryCallback(async () => await messageUser(member.user, {
      content: `You would have been kicked from ${member.guild.name} due to spam.`
    }), {
      attempts: 1
    })

    handleRetryResult(result, `When fake kicking ${member.user.username}`)
  }

  const queuedAction = await fetchQueuedActionByMessageId(member.id)
  if (queuedAction) {
    logger.debug(`Updating embed for author ${member.id} to kick`)
    await updateQueueMessage(queuedAction, message.guild, () => ({
      embeds: [{
        ...makeDefaultEmbed(message, result),
        title: 'Automatically upgraded to kick, spam detected',
        color: color.red
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: ActionUpgrade.KICK
      })]
    }))
    // Expire it soon, but not immediately, so that any pending actions will be able to see that there's
    // a queued action waiting and abort accordingly
    await expireQueuedAction(queuedAction)
  } else {
    const logChannel = await getLogChannel(message.guild)
    await logChannel.send({
      embeds: [makeDefaultEmbed(message, result)]
    })
  }
}
