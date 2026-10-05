import { DictionaryDatabase, dictionaryDb } from '../db/dictionaryDb'
import { ensureSettings, userDb } from '../db/userDb'
import type { DictionaryManifest, DictionaryTable, ManifestShard, WiktionaryExistence } from '../types'

export type SetupProgress = { current: number; total: number; label: string }
const tableMap: Record<DictionaryTable, keyof typeof dictionaryDb> = {
  words: 'words', meanings: 'meanings', definitions: 'definitions', pronunciations: 'pronunciations', wordForms: 'wordForms', examples: 'examples',
  expressions: 'expressions', expressionWords: 'expressionWords', expressionMeanings: 'expressionMeanings', expressionExamples: 'expressionExamples', wiktionaryExistence: 'wiktionaryExistence'
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fetchManifest(): Promise<DictionaryManifest> {
  const root = import.meta.env.VITE_DICTIONARY_ROOT || 'dictionary'
  const response = await fetch(`${import.meta.env.BASE_URL}${root}/manifest.json`, { cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 404 ? 'production_dictionary_missing' : `manifest_http_${response.status}`)
  const manifest = await response.json() as DictionaryManifest
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.shards)) throw new Error('manifest_mismatch')
  return manifest
}

export function decodeShardRows(shard: ManifestShard, value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`shard_invalid:${shard.path}`)
  if (shard.encoding !== 'existence-tuple-v1') return value
  if (shard.table !== 'wiktionaryExistence') throw new Error(`shard_encoding_mismatch:${shard.path}`)
  return value.map((row): WiktionaryExistence => {
    if (!Array.isArray(row) || row.length !== 3 || row.some((field) => typeof field !== 'string')) {
      throw new Error(`shard_tuple_invalid:${shard.path}`)
    }
    return { normalizedLemma: row[0], lemma: row[1] || row[0], pos: row[2] }
  })
}

export async function installDictionary(manifest: DictionaryManifest, onProgress: (progress: SetupProgress) => void): Promise<void> {
  const tempName = `WordRecallDictionaryDB-${manifest.dictionaryVersion}`
  const previousName = dictionaryDb.name
  const target = new DictionaryDatabase(tempName)
  try {
    for (let i = 0; i < manifest.shards.length; i += 1) {
      const shard = manifest.shards[i]
      onProgress({ current: i, total: manifest.shards.length, label: `${i + 1} / ${manifest.shards.length}` })
      const root = import.meta.env.VITE_DICTIONARY_ROOT || 'dictionary'
      const response = await fetch(`${import.meta.env.BASE_URL}${root}/${shard.path}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`shard_http_${response.status}`)
      const buffer = await response.arrayBuffer()
      if (await sha256Hex(buffer) !== shard.sha256) throw new Error(`checksum_error:${shard.path}`)
      const rows = decodeShardRows(shard, JSON.parse(new TextDecoder().decode(buffer)) as unknown)
      if (!Array.isArray(rows) || rows.length !== shard.count) throw new Error(`shard_count_mismatch:${shard.path}`)
      const table = target.table(tableMap[shard.table] as string)
      const batchSize = 5_000
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        await table.bulkPut(rows.slice(offset, offset + batchSize))
        if (rows.length > batchSize) {
          const completed = Math.min(rows.length, offset + batchSize)
          onProgress({
            current: i + completed / rows.length,
            total: manifest.shards.length,
            label: `${i + 1} / ${manifest.shards.length} · ${completed.toLocaleString()} / ${rows.length.toLocaleString()}`,
          })
        }
      }
    }
    const wordCount = await target.words.count(); const expressionCount = await target.expressions.count()
    if (wordCount !== manifest.wordCount || expressionCount !== manifest.expressionCount) throw new Error('dictionary_count_mismatch')
    target.close()
    dictionaryDb.close()
    const settings = await ensureSettings(); await userDb.appSettings.put({ ...settings, dictionaryVersion: manifest.dictionaryVersion })
    await DexieSwitch.setActive(tempName)
    if (previousName !== tempName && previousName !== 'WordRecallDictionaryDB') await indexedDB.deleteDatabase(previousName)
    onProgress({ current: manifest.shards.length, total: manifest.shards.length, label: '完了' })
  } catch (error) { target.close(); await indexedDB.deleteDatabase(tempName); throw error }
}

export const DexieSwitch = {
  key: 'wordRecallActiveDictionary',
  getActive(): string { return localStorage.getItem(this.key) ?? 'WordRecallDictionaryDB' },
  async setActive(name: string): Promise<void> { localStorage.setItem(this.key, name); window.location.reload() }
}

export async function dictionaryAvailable(): Promise<boolean> {
  const settings = await ensureSettings()
  if (!settings.dictionaryVersion) return false
  try { return (await dictionaryDb.words.count()) > 0 } catch { return false }
}
