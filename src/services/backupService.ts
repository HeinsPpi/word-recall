import { userDb } from '../db/userDb'
import type { BackupFile } from '../types'

const arrays = ['userWords', 'userExpressions', 'studyCards', 'reviewLogs', 'appSettings', 'progressSnapshots'] as const

export function validateBackup(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const root = value as Record<string, unknown>
  if (root.app !== 'WordRecall' || root.schemaVersion !== 1 || typeof root.exportedAt !== 'string' || !root.data || typeof root.data !== 'object') return false
  const data = root.data as Record<string, unknown>
  if (!arrays.every((key) => Array.isArray(data[key]))) return false
  const records = (key: typeof arrays[number]) => data[key] as Record<string, unknown>[]
  if (arrays.some((key) => records(key).length > 100_000)) return false
  const nullableString = (item: unknown) => item === null || typeof item === 'string'
  const boundedString = (item: unknown, max: number) => typeof item === 'string' && item.length <= max
  const boundedNullableString = (item: unknown, max: number) => item === null || boundedString(item, max)
  const wordsValid = records('userWords').every((w) => boundedString(w.id, 160) && nullableString(w.dictionaryWordId) && boundedString(w.lemma, 160) && boundedString(w.normalizedLemma, 160) && typeof w.addedAt === 'string' && boundedNullableString(w.customMeaningJa, 8000) && boundedNullableString(w.customDefinitionEn, 8000) && boundedNullableString(w.customExample, 8000) && boundedNullableString(w.customMemo, 5000) && ['confirmed','supported','singleSource','userProvided'].includes(w.sourceStatus as string) && typeof w.isActive === 'boolean')
  const expressionsValid = records('userExpressions').every((e) => typeof e.id === 'string' && typeof e.expressionId === 'string' && nullableString(e.parentUserWordId) && typeof e.enabled === 'boolean' && typeof e.addedAt === 'string')
  const cardsValid = records('studyCards').every((c) => {
    const fsrs = c.fsrsCardData as Record<string, unknown> | null
    return typeof c.id === 'string' && (c.targetType === 'word' || c.targetType === 'expression') && typeof c.targetId === 'string' && typeof c.createdAt === 'string' && nullableString(c.lastReviewedAt) && typeof c.mastered === 'boolean' && typeof c.introductionSeen === 'boolean' && typeof c.promptCursor === 'number' && fsrs !== null && typeof fsrs === 'object' && typeof fsrs.due === 'string' && ['stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses','state'].every((field) => typeof fsrs[field] === 'number') && (fsrs.last_review === undefined || typeof fsrs.last_review === 'string')
  })
  const logsValid = records('reviewLogs').every((l) => typeof l.id === 'string' && typeof l.cardId === 'string' && typeof l.reviewedAt === 'string' && [1,2,3,4].includes(l.rating as number) && ['definition','exampleCloze','expressionCloze','japaneseFallback'].includes(l.promptType as string) && typeof l.userAnswer === 'string' && typeof l.expectedAnswer === 'string' && typeof l.usedHint === 'boolean' && typeof l.wasTypo === 'boolean' && typeof l.responseTimeMs === 'number')
  const settingsValid = records('appSettings').every((s) => s.id === 'settings' && (s.totalEncounteredWords === null || (typeof s.totalEncounteredWords === 'number' && Number.isFinite(s.totalEncounteredWords) && s.totalEncounteredWords >= 0)) && typeof s.desiredRetention === 'number' && s.desiredRetention >= 0.8 && s.desiredRetention <= 0.97 && typeof s.masteryStabilityDays === 'number' && s.masteryStabilityDays >= 14 && s.masteryStabilityDays <= 365 && nullableString(s.dictionaryVersion) && nullableString(s.lastBackupAt))
  const snapshotsValid = records('progressSnapshots').every((s) => typeof s.id === 'string' && typeof s.date === 'string' && ['registeredWords','masteredWords','registeredExpressions','masteredExpressions','totalReviews'].every((field) => typeof s[field] === 'number'))
  return wordsValid && expressionsValid && cardsValid && logsValid && settingsValid && snapshotsValid
}

export async function createBackup(): Promise<BackupFile> {
  const [userWords, userExpressions, studyCards, reviewLogs, appSettings, progressSnapshots] = await Promise.all([
    userDb.userWords.toArray(), userDb.userExpressions.toArray(), userDb.studyCards.toArray(), userDb.reviewLogs.toArray(), userDb.appSettings.toArray(), userDb.progressSnapshots.toArray()
  ])
  return { app: 'WordRecall', schemaVersion: 1, exportedAt: new Date().toISOString(), dictionaryVersion: appSettings[0]?.dictionaryVersion ?? null, data: { userWords, userExpressions, studyCards, reviewLogs, appSettings, progressSnapshots } }
}

export async function restoreBackup(value: unknown): Promise<void> {
  if (!validateBackup(value)) throw new Error('backup_invalid')
  await userDb.transaction('rw', userDb.tables, async () => {
    await Promise.all(userDb.tables.map((table) => table.clear()))
    await userDb.userWords.bulkPut(value.data.userWords); await userDb.userExpressions.bulkPut(value.data.userExpressions)
    await userDb.studyCards.bulkPut(value.data.studyCards); await userDb.reviewLogs.bulkPut(value.data.reviewLogs)
    await userDb.appSettings.bulkPut(value.data.appSettings); await userDb.progressSnapshots.bulkPut(value.data.progressSnapshots)
  })
}

export async function downloadBackup(): Promise<void> {
  const backup = await createBackup(); const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const file = new File([blob], `word-recall-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'WordRecall バックアップ' })
  else { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  const settings = await userDb.appSettings.get('settings'); if (settings) await userDb.appSettings.put({ ...settings, lastBackupAt: new Date().toISOString() })
}
