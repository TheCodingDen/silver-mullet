import { CrossChannelAntiSpamSettings } from '@prisma/client'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import Nilsimsa from '../vendor/nilsimsa'
import { SpamDetectionResult } from './types'

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

export interface SimilarityMatchResult {
  pointsGained: number
  thresholdBroken: number
}

/**
 * A single comparison done with the posted content against a
 * single cached message from the same user
 */
export interface Comparison {
  similarityToPostedContent: number
  comparedContent: CachedMessage
  originalContent: CachedMessage
  pointsFromSimilarity: SimilarityMatchResult | undefined
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
 * @param guildID - The guild from which this detection run was started from
 * @param cachedMessages - The authors post history
 * @returns The result of the detection
 */
export async function executeAntiSpamDetection (
  postedContent: CachedMessage,
  guildID: string,
  cachedMessages: CachedMessage[]
): Promise<SpamDetectionResult | undefined> {
  const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
    where: {
      guildID
    },
    orderBy: {
      version: 'desc'
    },
    include: {
      pointOverrides: true,
      actionMappings: true
    }
  })

  // NOTE: Even if we're going across guilds, there should be a CCAS config setup.
  //       If there isn't, that means our test guild setup is wrong.
  if (settings === null) {
    throw new Error('cannot compute anti spam results without settings present in the database')
  }

  const { pointOverrides, actionMappings, maxSizeDiffPercentage, minMessageLength } = settings

  if (postedContent.content.length < minMessageLength) {
    return undefined
  }

  const weights = pointOverrides.reduce<MatchWeights>((acc, val) => {
    acc[val.word] = val.points
    return acc
  }, { })

  const comparisons: Comparison[] = []
  for (const message of cachedMessages) {
    // Require messages to be longer than the minimum
    // If they are not, do not consider them at all
    if (postedContent.content.length < minMessageLength) {
      continue
    }

    const similarity = computeSimilarityToPostedContent(postedContent, message)

    comparisons.push({
      comparedContent: message,
      originalContent: postedContent,
      similarityToPostedContent: similarity,
      pointsFromMatches: computePointMatches(message.content, weights),
      pointsFromSimilarity: computeSimilarityPoints(message, similarity, settings)
    })
  }

  const filteredComparisons = comparisons
    .filter((c) => {
      const originalContentLength = c.originalContent.content.length
      const comparedContentLength = c.comparedContent.content.length
      const sizeDiff = Math.abs(comparedContentLength - originalContentLength)
      const sizeDiffPercentage = 100 * sizeDiff * 2 / (comparedContentLength + originalContentLength)

      // Require messages be within maxSizeDiffPercentage of each other in size
      if (sizeDiffPercentage > maxSizeDiffPercentage) {
        return false
      }

      return c.pointsFromSimilarity !== undefined
    })

  // Based on the filtered comparisons, compute the resulting point score for the user
  const pointResults = filteredComparisons
    .map(
      // Get the highest matching score, or the points gained from a similarity hit, or 0 if there's no points for the message
      (c) =>
        c.pointsFromMatches?.highestRankingMatch ?? c.pointsFromSimilarity?.pointsGained ?? 0
    )

  const points = pointResults.reduce((acc, val) => acc + val, 0)
  const actions = actionMappings.filter(a => points >= a.points).sort((a, b) => b.points - a.points)
  const chosenAction = actions[0]?.action

  if (chosenAction === undefined) {
    return undefined
  }

  return {
    source: 'spam',
    action: chosenAction,
    averageSimilarity: computeAverageSimilarity(comparisons),
    totalPoints: points,
    comparisons: filteredComparisons
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

function computeSimilarityPoints (
  comparedContent: CachedMessage,
  similarity: number,
  settings: CrossChannelAntiSpamSettings
): SimilarityMatchResult | undefined {
  const { shortMessageLength, shortMessageSimilarityThreshold, similarityThreshold, pointsOnMatch } = settings

  const relevantThreshold = comparedContent.content.length <= shortMessageLength ? shortMessageSimilarityThreshold : similarityThreshold
  const surpassesThreshold = similarity >= relevantThreshold

  if (!surpassesThreshold) {
    return undefined
  }

  return {
    pointsGained: pointsOnMatch,
    thresholdBroken: relevantThreshold
  }
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
