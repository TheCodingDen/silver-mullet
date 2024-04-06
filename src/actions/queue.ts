import { ActionFunction } from '.'
import { ActionUpgrade } from '../clients/redis'
import { makeQueueCallback } from '../detection/utils'

export const queueBan: ActionFunction = makeQueueCallback(ActionUpgrade.BAN)
export const queueKick: ActionFunction = makeQueueCallback(ActionUpgrade.KICK)
