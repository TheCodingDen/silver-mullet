import { AntiSpamAction, Filter } from '@prisma/client'
import { Comparison } from './spam-detection'
import { Guild, GuildMember } from 'discord.js'
import { CachedMessage } from '../clients/redis'

export enum DetectionSource {
  FILTER = 'filter',
  SPAM = 'spam'
}

interface DetectionResultBase {
  action: AntiSpamAction
}

export interface SpamDetectionResult extends DetectionResultBase {
  source: 'spam'

  averageSimilarity: number
  totalPoints: number
  comparisons: Comparison[]
}

export interface DebugFilterResult {
  filter: Filter
  action: AntiSpamAction
}

export interface FilterDetectionResult extends DetectionResultBase {
  source: 'filter'

  trippedFilter: Filter
  author: GuildMember
  message: CachedMessage
  guild: Guild
  debuggedFilters: DebugFilterResult[]
}

export type DetectionResult = SpamDetectionResult | FilterDetectionResult
