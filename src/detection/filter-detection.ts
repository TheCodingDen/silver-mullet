import { AntiSpamAction, AntiSpamRule } from '@prisma/client'
import prisma from '../clients/prisma'
import { CachedMessage } from '../clients/redis'
import { DetectionAction, ResultType } from './spam-detection'

export interface FilterDetectionResult {
  type: ResultType.FILTER
  hits: FilterHit[]
  highestAppliedRule: AntiSpamRule | undefined
  action: DetectionAction
}

export interface FilterHit {
  rule: AntiSpamRule
  message: CachedMessage
}

const OrderedDetectionAction: Record<AntiSpamAction, number> = {
  BAN: 1,
  KICK: 2,
  QUEUE_BAN: 3,
  QUEUE_KICK: 4,
  NOTHING: 5
}

export async function executeFilterDetection (postedContent: CachedMessage): Promise<FilterDetectionResult> {
  const rules = await prisma.antiSpamRule.findMany({
    where: {
      type: 'FILTER'
    },
    include: {
      children: {
        include: {
          children: true
        }
      }
    }
  })

  const hits: FilterHit[] = []
  const matchedRules = new Set<string>()

  // Recursively match rules, meaning child rules get matched properly
  function matchRuleset (rules: Array<AntiSpamRule & { children?: AntiSpamRule[] }>): void {
    for (const rule of rules) {
      if (!rule.triggeringPhrase) {
        throw new Error(`rule ${rule.id} had no triggering phrase set`)
      }

      if (matchedRules.has(rule.id)) {
        continue
      }

      if (postedContent.content.includes(rule.triggeringPhrase)) {
        if (rule.parentId && !matchedRules.has(rule.parentId)) {
          // We got a match, but the parent did not match, move on
          logger.debug(`Skipping rule "${rule.description}" (${rule.action}) becuase of non matching parent ${rule.parentId}`)
          continue
        }

        hits.push({
          rule,
          message: postedContent
        })

        matchedRules.add(rule.id)

        if (rule.children) {
          matchRuleset(rule.children)
        }
      }
    }
  }

  matchRuleset(rules)

  const sortedHits = hits
    .sort((a, b) => OrderedDetectionAction[a.rule.action] - OrderedDetectionAction[b.rule.action])

  const highestRule = sortedHits[0]?.rule

  return {
    type: ResultType.FILTER,
    hits,
    highestAppliedRule: highestRule,
    action: DetectionAction[highestRule?.action] ?? DetectionAction.NOTHING
  }
}
