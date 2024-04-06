import { expireQueuedAction, fetchQueuedActionByAuthorId } from '../cache/op'
import { ActionUpgrade } from '../clients/redis'
import { getLogChannel, makeDefaultEmbed, handleRetryResult, makeComponents, messageUser } from '../detection/utils'
import color from '../utils/color'
import { retryCallback } from '../utils/retry'
import { ActionFunction, EJECTIONS, ignoreFailedDeliver } from './'
import { updateQueueMessage } from './utils'

export const ban: ActionFunction = async (member, message, result) => {
  if (process.env.NODE_ENV === 'production') {
    const [banResult, messageResult] = await Promise.all([
      retryCallback(async () => await member.ban(EJECTIONS.ban.opts), {
        attempts: 3,
        errorPredicate: ignoreFailedDeliver
      }),
      retryCallback(
        async () =>
          await messageUser(member.user, {
            content: EJECTIONS.ban.message(message.guild)
          }),
        {
          attempts: 3,
          errorPredicate: ignoreFailedDeliver
        }
      )
    ])

    handleRetryResult(banResult, `When banning user ${member.user.username}`)
    handleRetryResult(
      messageResult,
      `When messaging banned user ${member.user.username}`
    )
  } else {
    const result = await retryCallback(
      async () =>
        await messageUser(member.user, {
          content: `You would have been banned from ${member.guild.name} due to spam.`
        }),
      {
        attempts: 1
      }
    )

    handleRetryResult(result, `When fake banning ${member.user.username}`)
  }

  const queuedAction = await fetchQueuedActionByAuthorId(member.id)
  if (queuedAction) {
    logger.debug(`Updating embed for author ${member.id} to ban`)
    await updateQueueMessage(queuedAction, message.guild, () => ({
      embeds: [
        {
          ...makeDefaultEmbed(message, result),
          title: 'Automatically upgraded to ban, spam detected',
          color: color.red
        }
      ],
      components: [
        makeComponents({
          disabled: true,
          confirmAction: ActionUpgrade.BAN
        })
      ]
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
