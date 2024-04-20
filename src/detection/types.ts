import { AntiSpamAction, Filter, Preset } from '@prisma/client'
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

export interface FilterDetectionResult extends DetectionResultBase {
  source: 'filter'

  trippedFilter: Filter & { presets: Preset[] }
  author: GuildMember
  message: CachedMessage
  guild: Guild
}

export type DetectionResult = SpamDetectionResult | FilterDetectionResult
