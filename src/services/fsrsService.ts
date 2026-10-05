import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'
import type { FsrsCardRecord, ReviewLog, StudyCard } from '../types'
import { isMastered } from '../utils/progress'

export function serializeCard(card: Card): FsrsCardRecord {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() }
}
export function deserializeCard(card: FsrsCardRecord): Card {
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined }
}
export function newFsrsCard(now = new Date()): FsrsCardRecord { return serializeCard(createEmptyCard(now)) }

export function scheduleReview(card: StudyCard, rating: 1 | 2 | 3 | 4, desiredRetention: number, logs: ReviewLog[], masteryDays: number, now = new Date()): StudyCard {
  const engine = fsrs({ request_retention: desiredRetention, enable_fuzz: false })
  const result = engine.repeat(deserializeCard(card.fsrsCardData), now)[rating as Grade]
  const updated = { ...card, fsrsCardData: serializeCard(result.card), lastReviewedAt: now.toISOString() }
  return { ...updated, mastered: isMastered(updated, logs, masteryDays) }
}

export function retrievability(card: StudyCard, now = new Date()): number | null {
  if (!card.fsrsCardData.last_review || card.fsrsCardData.stability <= 0) return null
  const days = Math.max(0, (now.getTime() - new Date(card.fsrsCardData.last_review).getTime()) / 86_400_000)
  return Math.pow(1 + (19 / 81) * (days / card.fsrsCardData.stability), -0.5)
}
