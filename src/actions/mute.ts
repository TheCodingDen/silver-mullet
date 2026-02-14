import { expireQueuedAction, fetchQueuedActionByMessageId } from '../cache/op'
import { ActionUpgrade } from '../clients/redis'
import { getLogChannel, makeDefaultEmbed, handleRetryResult, makeComponents, messageUser } from '../detection/utils'
import color from '../utils/color'
import { retryCallback } from '../utils/retry'
import { ActionFunction, REMOVAL_OPTIONS, ignoreFailedDeliver } from './'
import { updateQueueMessage } from './utils'

export const mute: ActionFunction = async (member, message, result) => {
  const messageResult = await retryCallback(
    async () =>
      await messageUser(member.user, {
        content: REMOVAL_OPTIONS.mute.message(message.guild)
      }),
    {
      attempts: 3,
      errorPredicate: ignoreFailedDeliver
    }
  )
  const muteResult = await retryCallback(async () =>
    await member.timeout(REMOVAL_OPTIONS.mute.opts.duration, REMOVAL_OPTIONS.mute.opts.reason),
  {
    attempts: 3,
    errorPredicate: ignoreFailedDeliver
  }
  )

  handleRetryResult(muteResult, `When muting user ${member.user.username}`)
  handleRetryResult(messageResult, `When messaging muted user ${member.user.username}`)

  const queuedAction = await fetchQueuedActionByMessageId(member.id)
  if (queuedAction) {
    logger.debug(`Updating embed for author ${member.id} to kick`)
    await updateQueueMessage(queuedAction, message.guild, () => ({
      embeds: [{
        ...makeDefaultEmbed(message, result),
        title: 'Automatically upgraded to mute, spam detected',
        color: color.red
      }],
      components: [makeComponents({
        disabled: true,
        confirmAction: ActionUpgrade.MUTE
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
