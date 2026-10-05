import { afterEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup, validateBackup } from '../src/services/backupService'
import { defaultSettings, userDb } from '../src/db/userDb'

afterEach(async () => { await userDb.delete(); await userDb.open() })
describe('backup', () => {
  it('exports and validates all user tables', async () => { await userDb.appSettings.put(defaultSettings); const backup = await createBackup(); expect(validateBackup(backup)).toBe(true); expect(Object.keys(backup.data)).toHaveLength(6) })
  it('rejects invalid backup without deleting existing data', async () => { await userDb.appSettings.put(defaultSettings); await expect(restoreBackup({ app: 'Wrong' })).rejects.toThrow('backup_invalid'); expect(await userDb.appSettings.count()).toBe(1) })
  it('restores after complete schema validation', async () => { await userDb.appSettings.put(defaultSettings); const backup = await createBackup(); await userDb.appSettings.clear(); await restoreBackup(backup); expect((await userDb.appSettings.get('settings'))?.desiredRetention).toBe(.9) })
})
