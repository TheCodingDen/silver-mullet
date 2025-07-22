import { AntiSpamAction, Filter, LastSeen } from '@prisma/client'
import { Comparison } from './spam-detection'
import { Guild, GuildMember } from 'discord.js'
import { CachedMessage } from '../clients/redis'
import { BadLink } from './url-scan'

export enum DetectionSource {
  FILTER = 'filter',
  SPAM = 'spam',
  URL = 'url',
  REACTIVATION = 'reactivation'
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

export interface FilterDetectionResult extends DetectionResultBase {
  source: 'filter'

  trippedFilter: Filter
  author: GuildMember
  message: CachedMessage
  guild: Guild
}

export interface URLDetectionResult extends DetectionResultBase {
  source: 'url'

  message: CachedMessage
  guild: Guild
  trippedURLs: BadLink[]
}

export interface ReactivationDetectionResult extends DetectionResultBase {
  source: 'reactivation'

  lastSeen: LastSeen | null
  message: CachedMessage
  member: GuildMember
  guild: Guild
}

export type DetectionResult = SpamDetectionResult | FilterDetectionResult | URLDetectionResult | ReactivationDetectionResult
