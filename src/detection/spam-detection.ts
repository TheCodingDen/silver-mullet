import { CachedMessage } from '../cache/schema'
import Nilsimsa from '../vendor/nilsimsa'

// FIXME: Move to config
const SIMILARITY_THRESHOLD = 128
const MIN_MESSAGE_LENGTH = 10
const SHORT_MESSAGE_LENGTH = 15
const SHORT_MESSAGE_SIMILARITY_THRESHOLD = 85
const POINT_THRESHOLD = 5
const DEFAULT_POINTS_FOR_JUST_SIMILARITY_MATCHING = 1

export type DetectionAction = 'ban' | 'nothing' | 'empty'
export type MatchWeights = Record<string, number>

/**
 * The point result of a match search. This weights the spam detection against specific keywords (matched only as contiguous substrings)
 * provides the highest match, along with any additional matches (without weights)
 */
export interface PointMatchResult {
  matches: string[]
  highestRankingString: string
  highestRankingMatch: number
}

/**
 * The result of a spam cache search for a users messages, advises
 * what action to take based on the the comparisons done
 */
export interface DetectionResult {
  action: DetectionAction
  averageSimilarity: number
  comparisons: Comparison[]
}

/**
 * A single comparison done with the posted content against a
 * single cached message from the same user
 */
export interface Comparison {
  similarityToPostedContent: number
  comparedContent: CachedMessage
  originalContent: CachedMessage
  pointsFromMatches: PointMatchResult | undefined
}

/**
 * Execute anti spam detection. This will check the similarity of the posted message against the previous messages (within the configured threshold)
 * with shorter messages checked against their own threshold (typically lower, as shorter messages are typically spam)
 *
 * Then, it will score the comparisons on a point scale based on the passed MatchWeights
 * scoring no matches (only a similarity match) with the configured default
 *
 * The returned action is based on the points scored by the user against the point threshold
 * @param postedContent - The posted content to check against
 * @param cachedMessages - The authors post history
 * @param weights - The match weights to use in keyword checking
 * @returns The result of the detection
 */
export function executeAntiSpamDetection (
  postedContent: CachedMessage,
  cachedMessages: CachedMessage[],
  weights: MatchWeights
): DetectionResult {
  if (postedContent.content.length < MIN_MESSAGE_LENGTH) {
    return {
      action: 'empty',
      averageSimilarity: 0,
      comparisons: []
    }
  }

  const comparisons: Comparison[] = []
  for (const message of cachedMessages) {
    const similarity = computeSimilarityToPostedContent(postedContent, message)
    comparisons.push({
      similarityToPostedContent: similarity,
      comparedContent: message,
      originalContent: postedContent,
      pointsFromMatches: computePointMatches(message.content, weights)
    })
  }

  const pointResults = comparisons
    .filter((c) => {
      const relevantThreshold = c.comparedContent.content.length <= SHORT_MESSAGE_LENGTH ? SHORT_MESSAGE_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD
      const surpassesThreshold = c.similarityToPostedContent >= relevantThreshold

      return surpassesThreshold
    })
    .map(
      // Get the highest matching score, or the default for a pure similiarity hit
      (c) =>
        c.pointsFromMatches?.highestRankingMatch ??
        DEFAULT_POINTS_FOR_JUST_SIMILARITY_MATCHING
    )

  const points = pointResults.reduce((acc, val) => acc + val, 0)

  let action: DetectionAction = 'nothing'
  if (points >= POINT_THRESHOLD) {
    action = 'ban'
  }

  return {
    action,
    averageSimilarity: computeAverageSimilarity(comparisons),
    comparisons
  }
}

function computeSimilarityToPostedContent (
  postedContent: CachedMessage,
  singleCachedMessage: CachedMessage
): number {
  return Nilsimsa.compareFromString(
    postedContent.hexHash,
    singleCachedMessage.hexHash,
    'hex'
  )
}

function computePointMatches (
  message: string,
  weights: MatchWeights
): PointMatchResult | undefined {
  let maxResult = 0
  let maxString = ''
  const matches = []
  message = message.toLowerCase()

  for (const [match, weight] of Object.entries(weights)) {
    if (message.includes(match)) {
      if (maxResult <= weight) {
        maxResult = weight
        maxString = match
      }
      matches.push(match)
    }
  }

  if (matches.length > 0) {
    return {
      highestRankingMatch: maxResult,
      highestRankingString: maxString,
      matches
    }
  }

  return undefined
}

function computeAverageSimilarity (comparisons: Comparison[]): number {
  if (comparisons.length === 0) {
    return 0
  }

  return (
    comparisons
      .map((c) => c.similarityToPostedContent)
      .reduce((acc, val) => acc + val, 0) / comparisons.length
  )
}
