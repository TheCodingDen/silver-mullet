import { CachedMessage } from '../../src/cache/schema'
import { DetectionResult, executeAntiSpamDetection, MatchWeights } from '../../src/detection/spam-detection'
import Nilsimsa from '../../src/vendor/nilsimsa'

const DEFAULT_ID = '000000000000000000000'

export function newMessage (content: string): CachedMessage {
  return {
    messageId: DEFAULT_ID,
    authorId: DEFAULT_ID,
    channelId: DEFAULT_ID,
    content,
    hexHash: (new Nilsimsa(content).digest('hex'))
  }
}

export function runDetection (content: CachedMessage, messages: CachedMessage[], weights: MatchWeights = {}): DetectionResult {
  return executeAntiSpamDetection(content, messages, weights)
}
