import { AntiSpamAction } from '@prisma/client'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import Nilsimsa from '../vendor/nilsimsa'

export type DetectionAction = AntiSpamAction | 'NOTHING'
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
  totalPoints: number
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
 * Then, it will score the comparisons on a point scale based on the configured keyword weighting
 * scoring no matches (only a similarity match) with the configured default
 *
 * The returned action is based on the points scored by the user against the point threshold
 * @param postedContent - The posted content to check against
 * @param cachedMessages - The authors post history
 * @returns The result of the detection
 */
export async function executeAntiSpamDetection (
  postedContent: CachedMessage,
  cachedMessages: CachedMessage[]
): Promise<DetectionResult> {
  const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
    orderBy: {
      version: 'desc'
    },
    include: {
      pointOverrides: true,
      actionMappings: true
    }
  })

  if (settings === null) {
    throw new Error('cannot compute anti spam results without settings present in the database')
  }

  const { pointOverrides, actionMappings, pointsOnMatch, shortMessageLength, shortMessageSimilarityThreshold, similarityThreshold, maxSizeDiffPercentage, minMessageLength } = settings

  if (postedContent.content.length < minMessageLength) {
    return {
      action: 'NOTHING',
      averageSimilarity: 0,
      totalPoints: 0,
      comparisons: []
    }
  }

  const weights = pointOverrides.reduce<MatchWeights>((acc, val) => {
    acc[val.word] = val.points
    return acc
  }, { })

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
      const relevantThreshold = c.comparedContent.content.length <= shortMessageLength ? shortMessageSimilarityThreshold : similarityThreshold
      const surpassesThreshold = c.similarityToPostedContent >= relevantThreshold

      const originalContentLength = c.originalContent.content.length
      const comparedContentLength = c.comparedContent.content.length
      const sizeDiff = Math.abs(comparedContentLength - originalContentLength)
      const sizeDiffPercentage = 100 * sizeDiff * 2 / (comparedContentLength + originalContentLength)

      if (sizeDiffPercentage > maxSizeDiffPercentage) {
        return false
      }

      return surpassesThreshold
    })
    .map(
      // Get the highest matching score, or the default for a pure similiarity hit
      (c) =>
        c.pointsFromMatches?.highestRankingMatch ?? pointsOnMatch
    )

  const points = pointResults.reduce((acc, val) => acc + val, 0)
  const actions = actionMappings.filter(a => points >= a.points).sort((a, b) => b.points - a.points)
  const chosenAction = actions[0]?.action ?? 'NOTHING'

  return {
    action: chosenAction,
    averageSimilarity: computeAverageSimilarity(comparisons),
    totalPoints: points,
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
