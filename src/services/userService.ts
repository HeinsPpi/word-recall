import { dictionaryDb } from '../db/dictionaryDb'
import { userDb } from '../db/userDb'
import type { DictionaryExpression, DictionaryWord, ProgressSnapshot, UserExpression, UserWord } from '../types'
import { newFsrsCard } from './fsrsService'
import { normalizeLookup } from '../utils/normalize'
import { requestSync } from './syncService'

function id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}` }

export async function registerWord(word: DictionaryWord | null, custom: { lemma: string; meaning?: string; definition?: string; example?: string }, expressions: DictionaryExpression[] = []): Promise<UserWord> {
  const normalizedLemma = normalizeLookup(word?.lemma ?? custom.lemma)
  const existing = await userDb.userWords.where('normalizedLemma').equals(normalizedLemma).first()
  if (existing) return existing
  const now = new Date().toISOString()
  const userWord: UserWord = { id: id('uw'), dictionaryWordId: word?.id ?? null, lemma: word?.lemma ?? custom.lemma.trim(), normalizedLemma, addedAt: now,
    customMeaningJa: custom.meaning?.trim() || null, customDefinitionEn: custom.definition?.trim() || null, customExample: custom.example?.trim() || null, customMemo: null,
    sourceStatus: word?.sourceStatus ?? 'userProvided', isActive: true }
  await userDb.transaction('rw', [userDb.userWords, userDb.studyCards, userDb.userExpressions], async () => {
    await userDb.userWords.add(userWord)
    await userDb.studyCards.add({ id: id('card'), targetType: 'word', targetId: userWord.id, fsrsCardData: newFsrsCard(), createdAt: now, lastReviewedAt: null, mastered: false, introductionSeen: false, promptCursor: 0 })
    for (const expression of expressions) {
      const relation: UserExpression = { id: id('ue'), expressionId: expression.id, parentUserWordId: userWord.id, enabled: true, addedAt: now }
      await userDb.userExpressions.add(relation)
      await userDb.studyCards.add({ id: id('card'), targetType: 'expression', targetId: relation.id, fsrsCardData: newFsrsCard(), createdAt: now, lastReviewedAt: null, mastered: false, introductionSeen: false, promptCursor: 0 })
    }
  })
  await updateDailySnapshot()
  requestSync()
  return userWord
}

export async function registerStandaloneExpression(expression: DictionaryExpression): Promise<UserExpression> {
  const existing = await userDb.userExpressions.where('expressionId').equals(expression.id).first()
  if (existing) return existing
  const now = new Date().toISOString()
  const relation: UserExpression = { id: id('ue'), expressionId: expression.id, parentUserWordId: null, enabled: true, addedAt: now }
  await userDb.transaction('rw', [userDb.userExpressions, userDb.studyCards], async () => {
    await userDb.userExpressions.add(relation)
    await userDb.studyCards.add({ id: id('card'), targetType: 'expression', targetId: relation.id, fsrsCardData: newFsrsCard(), createdAt: now, lastReviewedAt: null, mastered: false, introductionSeen: false, promptCursor: 0 })
  })
  await updateDailySnapshot()
  requestSync()
  return relation
}

export async function updateDailySnapshot(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  const [registeredWords, masteredWords, registeredExpressions, masteredExpressions, totalReviews] = await Promise.all([
    userDb.userWords.filter((w) => w.isActive).count(), userDb.studyCards.filter((c) => c.targetType === 'word' && c.mastered).count(),
    userDb.userExpressions.filter((e) => e.enabled).count(), userDb.studyCards.filter((c) => c.targetType === 'expression' && c.mastered).count(), userDb.reviewLogs.count()
  ])
  const snapshot: ProgressSnapshot = { id: date, date, registeredWords, masteredWords, registeredExpressions, masteredExpressions, totalReviews }
  await userDb.progressSnapshots.put(snapshot)
}

export async function resolveUserWord(userWord: UserWord): Promise<DictionaryWord | null> {
  return userWord.dictionaryWordId ? (await dictionaryDb.words.get(userWord.dictionaryWordId) ?? null) : null
}
