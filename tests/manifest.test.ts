import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  decodeShardRows,
  fetchManifest,
  sha256Hex
} from '../src/services/setupService'
import type { DictionaryManifest, DictionaryWord, Meaning } from '../src/types'

afterEach(() => vi.unstubAllGlobals())
describe('dictionary manifest and checksum', () => {
  it('computes SHA-256 before importing a shard', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
  it('accepts schema version 1 manifest', async () => {
    const manifest = {
      schemaVersion: 1,
      dictionaryVersion: 'v1',
      buildDate: '2026-01-01',
      wordCount: 1,
      expressionCount: 0,
      existenceIndexCount: 0,
      exampleCount: 0,
      totalBytes: 10,
      shards: []
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => manifest })
    )
    await expect(fetchManifest()).resolves.toEqual(manifest)
  })
  it('rejects an incompatible manifest without importing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ schemaVersion: 2, shards: [] })
      })
    )
    await expect(fetchManifest()).rejects.toThrow('manifest_mismatch')
  })
  it('decodes compact Wiktionary existence tuples', () => {
    const shard = {
      path: 'wiktionaryExistence/a.json',
      table: 'wiktionaryExistence' as const,
      count: 1,
      bytes: 1,
      sha256: 'x',
      encoding: 'existence-tuple-v1' as const
    }
    expect(decodeShardRows(shard, [['meticulous', '', 'adjective']])).toEqual([
      { normalizedLemma: 'meticulous', lemma: 'meticulous', pos: 'adjective' }
    ])
  })
  it('ships no detailed headword without a sourced Japanese meaning', () => {
    const root = resolve(process.cwd(), 'public/dictionary')
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'manifest.json'), 'utf8')
    ) as DictionaryManifest
    const readTable = <T>(table: string): T[] =>
      manifest.shards
        .filter((shard) => shard.table === table)
        .flatMap(
          (shard) =>
            JSON.parse(readFileSync(resolve(root, shard.path), 'utf8')) as T[]
        )
    const words = readTable<DictionaryWord>('words')
    const meanings = readTable<Meaning>('meanings')
    const withJapanese = new Set(
      meanings
        .filter((meaning) => meaning.language === 'ja' && meaning.text.trim())
        .map((meaning) => meaning.wordId)
    )
    expect(words.filter((word) => !withJapanese.has(word.id))).toEqual([])
    const vitality = words.find((word) => word.normalizedLemma === 'vitality')
    expect(vitality).toBeDefined()
    expect(
      meanings.some(
        (meaning) =>
          meaning.wordId === vitality?.id && meaning.language === 'ja'
      )
    ).toBe(true)
    expect(manifest.existenceIndexCount).toBeGreaterThan(1_000_000)
  })
})
