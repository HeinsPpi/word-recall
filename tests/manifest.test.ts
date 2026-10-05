import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeShardRows, fetchManifest, sha256Hex } from '../src/services/setupService'

afterEach(() => vi.unstubAllGlobals())
describe('dictionary manifest and checksum', () => {
  it('computes SHA-256 before importing a shard', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('accepts schema version 1 manifest', async () => {
    const manifest = { schemaVersion: 1, dictionaryVersion: 'v1', buildDate: '2026-01-01', wordCount: 1, expressionCount: 0, existenceIndexCount: 0, exampleCount: 0, totalBytes: 10, shards: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }))
    await expect(fetchManifest()).resolves.toEqual(manifest)
  })
  it('rejects an incompatible manifest without importing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 2, shards: [] }) }))
    await expect(fetchManifest()).rejects.toThrow('manifest_mismatch')
  })
  it('decodes compact Wiktionary existence tuples', () => {
    const shard = { path: 'wiktionaryExistence/a.json', table: 'wiktionaryExistence' as const, count: 1, bytes: 1, sha256: 'x', encoding: 'existence-tuple-v1' as const }
    expect(decodeShardRows(shard, [['meticulous', '', 'adjective']])).toEqual([
      { normalizedLemma: 'meticulous', lemma: 'meticulous', pos: 'adjective' },
    ])
  })
})
