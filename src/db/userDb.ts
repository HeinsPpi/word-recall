import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, ProgressSnapshot, ReviewLog, StudyCard, SyncMeta, SyncState, UserExpression, UserWord } from '../types'

export class UserDatabase extends Dexie {
  userWords!: EntityTable<UserWord, 'id'>
  userExpressions!: EntityTable<UserExpression, 'id'>
  studyCards!: EntityTable<StudyCard, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  appSettings!: EntityTable<AppSettings, 'id'>
  progressSnapshots!: EntityTable<ProgressSnapshot, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'id'>
  syncState!: EntityTable<SyncState, 'id'>
  constructor(name = 'WordRecallUserDB') {
    super(name)
    this.version(1).stores({
      userWords: '&id, &normalizedLemma, addedAt, isActive', userExpressions: '&id, expressionId, parentUserWordId, enabled',
      studyCards: '&id, [targetType+targetId], targetType, targetId, lastReviewedAt, mastered, introductionSeen, fsrsCardData.due',
      reviewLogs: '&id, cardId, reviewedAt, [cardId+reviewedAt]', appSettings: '&id', progressSnapshots: '&id, date'
    })
    this.version(2).stores({
      userWords: '&id, &normalizedLemma, addedAt, isActive', userExpressions: '&id, expressionId, parentUserWordId, enabled',
      studyCards: '&id, [targetType+targetId], targetType, targetId, lastReviewedAt, mastered, introductionSeen, fsrsCardData.due',
      reviewLogs: '&id, cardId, reviewedAt, [cardId+reviewedAt]', appSettings: '&id', progressSnapshots: '&id, date',
      syncMeta: '&id, userId, [userId+tableName+recordId]', syncState: '&id'
    })
  }
}
export const userDb = new UserDatabase()

export const defaultSettings: AppSettings = {
  id: 'settings', totalEncounteredWords: null, desiredRetention: 0.9, masteryStabilityDays: 30,
  dictionaryVersion: null, lastBackupAt: null
}

export async function ensureSettings(): Promise<AppSettings> {
  const current = await userDb.appSettings.get('settings')
  if (current) return current
  await userDb.appSettings.put(defaultSettings)
  return defaultSettings
}
