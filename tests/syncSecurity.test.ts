import { describe, expect, it } from 'vitest'
import { toRemotePayload } from '../src/services/syncService'
import type { AppSettings, ReviewLog } from '../src/types'

describe('sync data minimization', () => {
  it('does not upload typed answers or response timing', () => {
    const log: ReviewLog = {
      id: 'log-1', cardId: 'card-1', reviewedAt: '2026-10-06T00:00:00Z',
      rating: 3, promptType: 'definition', userAnswer: 'private answer',
      expectedAnswer: 'answer', usedHint: false, wasTypo: false, responseTimeMs: 1200
    }
    const remote = toRemotePayload('reviewLogs', log)
    expect(remote).not.toHaveProperty('userAnswer')
    expect(remote).not.toHaveProperty('expectedAnswer')
    expect(remote).not.toHaveProperty('responseTimeMs')
  })

  it('keeps dictionary and backup metadata local', () => {
    const settings: AppSettings = {
      id: 'settings', totalEncounteredWords: 100, desiredRetention: 0.9,
      masteryStabilityDays: 30, dictionaryVersion: 'local-only',
      lastBackupAt: '2026-10-06T00:00:00Z'
    }
    const remote = toRemotePayload('appSettings', settings)
    expect(remote).not.toHaveProperty('dictionaryVersion')
    expect(remote).not.toHaveProperty('lastBackupAt')
  })
})
