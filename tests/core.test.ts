import { describe, expect, it } from 'vitest'
import { normalizeAnswer, normalizeLookup } from '../src/utils/normalize'
import { isSafeTypo, levenshtein } from '../src/utils/typo'
import { calculateProgress, isMastered } from '../src/utils/progress'
import { isEligibleExpression, rankExpressions } from '../src/utils/expressions'
import { newFsrsCard, scheduleReview } from '../src/services/fsrsService'
import type { DictionaryExpression, ReviewLog, StudyCard } from '../src/types'

const expression = (overrides: Partial<DictionaryExpression> = {}): DictionaryExpression => ({ id: 'x', text: 'account for', normalizedText: 'account for', cefrLevel: null, inPhraseList: false, inPhaveList: false, sourceCount: 1, sourceStatus: 'singleSource', sources: ['Wiktionary'], ...overrides })

describe('normalization', () => {
  it('normalizes unicode, apostrophes, dashes and spaces', () => expect(normalizeLookup('  Don’T —  Stop  ')).toBe("don't - stop"))
  it('normalizes answer punctuation spacing', () => expect(normalizeAnswer("don ' t")).toBe("don't"))
})
describe('typo detection', () => {
  it('computes edit distance', () => expect(levenshtein('environment', 'enviroment')).toBe(1))
  it('rescues only safe long non-word typos', () => { expect(isSafeTypo('enviroment', 'environment', false)).toBe(true); expect(isSafeTypo('cat', 'cut', false)).toBe(false); expect(isSafeTypo('enviroment', 'environment', true)).toBe(false); expect(isSafeTypo('account of', 'account for', false, true)).toBe(false) })
})
describe('expression eligibility and order', () => {
  it('allows B2 and below, PHRASE, or PHaVE', () => { expect(isEligibleExpression(expression({ cefrLevel: 'B2' }))).toBe(true); expect(isEligibleExpression(expression({ cefrLevel: 'C1' }))).toBe(false); expect(isEligibleExpression(expression({ inPhraseList: true }))).toBe(true); expect(isEligibleExpression(expression({ inPhaveList: true }))).toBe(true) })
  it('excludes Wiktionary-only and ranks combined evidence first', () => { const best = expression({ id: 'best', cefrLevel: 'B1', inPhaveList: true, sourceCount: 3 }); const onlyWiki = expression({ id: 'wiki' }); expect(rankExpressions([onlyWiki, best]).map((x) => x.id)).toEqual(['best']) })
})
describe('progress and mastery', () => {
  it('calculates the donut without expressions', () => expect(calculateProgress(1000, 100, 40)).toMatchObject({ initiallyKnown: 900, learning: 60, mastered: 40, knownTotal: 940, knownRate: .94 }))
  it('requests an update for impossible encountered count', () => expect(calculateProgress(5, 10, 1)).toMatchObject({ knownRate: null, needsEncounteredUpdate: true }))
  it('requires stability and two distinct good days', () => { const card = cardFixture(); card.fsrsCardData.stability = 31; const logs = [log('2026-01-01', 3), log('2026-01-02', 3)]; expect(isMastered(card, logs, 30)).toBe(true); expect(isMastered(card, [log('2026-01-01T01:00', 3), log('2026-01-01T02:00', 4)], 30)).toBe(false) })
})
describe('FSRS', () => {
  it('uses ts-fsrs to schedule Good and Again', () => { const card = cardFixture(); const good = scheduleReview(card, 3, .9, [], 30, new Date('2026-01-01T00:00:00Z')); const again = scheduleReview(card, 1, .9, [], 30, new Date('2026-01-01T00:00:00Z')); expect(good.fsrsCardData.reps).toBe(1); expect(new Date(good.fsrsCardData.due).getTime()).toBeGreaterThan(new Date(again.fsrsCardData.due).getTime()) })
})
function cardFixture(): StudyCard { return { id: 'c', targetType: 'word', targetId: 'w', fsrsCardData: newFsrsCard(new Date('2025-12-31T00:00:00Z')), createdAt: '', lastReviewedAt: null, mastered: false, introductionSeen: true, promptCursor: 0 } }
function log(date: string, rating: 1|2|3|4): ReviewLog { return { id: date, cardId: 'c', reviewedAt: new Date(date).toISOString(), rating, promptType: 'definition', userAnswer: '', expectedAnswer: '', usedHint: false, wasTypo: false, responseTimeMs: 0 } }
