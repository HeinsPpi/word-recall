import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearLocalLearningData,
  defaultSettings,
  userDb
} from '../src/db/userDb'

describe('local account isolation', () => {
  beforeEach(async () => {
    await Promise.all(userDb.tables.map((table) => table.clear()))
  })

  it('removes learning and sync data but restores safe default settings', async () => {
    await userDb.userWords.put({
      id: 'word-1', dictionaryWordId: null, lemma: 'private',
      normalizedLemma: 'private', addedAt: new Date().toISOString(),
      customMeaningJa: null, customDefinitionEn: null, customExample: null,
      customMemo: 'private memo', sourceStatus: 'userProvided', isActive: true
    })
    await userDb.appSettings.put({ ...defaultSettings, totalEncounteredWords: 100 })
    await userDb.syncState.put({ id: 'sync', userId: 'user-a', lastSyncedAt: null })

    await clearLocalLearningData()

    expect(await userDb.userWords.count()).toBe(0)
    expect(await userDb.syncState.count()).toBe(0)
    expect(await userDb.appSettings.toArray()).toEqual([defaultSettings])
  })
})
