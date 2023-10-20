import { CachedMessage } from '../../src/clients/redis'
import Nilsimsa from '../../src/vendor/nilsimsa'

const DEFAULT_ID = '000000000000000000000'

export function newMessage (content: string): CachedMessage {
  return {
    eventId: DEFAULT_ID,
    authorId: DEFAULT_ID,
    channelId: DEFAULT_ID,
    content,
    hexHash: new Nilsimsa(content).digest('hex')
  }
}
