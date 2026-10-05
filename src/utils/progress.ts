import type { ReviewLog, StudyCard } from '../types'

export interface ProgressTotals { initiallyKnown: number; learning: number; mastered: number; knownTotal: number; knownRate: number | null; needsEncounteredUpdate: boolean }
export function calculateProgress(totalEncountered: number | null, registered: number, mastered: number): ProgressTotals {
  const needsEncounteredUpdate = totalEncountered !== null && totalEncountered < registered
  if (totalEncountered === null || needsEncounteredUpdate) return { initiallyKnown: Math.max(0, (totalEncountered ?? 0) - registered), learning: registered - mastered, mastered, knownTotal: mastered, knownRate: null, needsEncounteredUpdate }
  const initiallyKnown = Math.max(0, totalEncountered - registered)
  const knownTotal = initiallyKnown + mastered
  return { initiallyKnown, learning: registered - mastered, mastered, knownTotal, knownRate: totalEncountered === 0 ? null : knownTotal / totalEncountered, needsEncounteredUpdate }
}

export function isMastered(card: StudyCard, logs: ReviewLog[], stabilityDays: number): boolean {
  if (card.fsrsCardData.stability < stabilityDays) return false
  const goodDays = new Set(logs.filter((l) => l.cardId === card.id && l.rating >= 3).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).map((l) => l.reviewedAt.slice(0, 10)))
  return goodDays.size >= 2
}
