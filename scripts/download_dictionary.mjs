#!/usr/bin/env node
/** Download licensed dictionary sources, then build and validate WordRecall.
 *
 * DiQt credentials are entered only in a headed browser controlled by the user.
 * This script never asks for, reads, persists, or logs those credentials.
 */
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { get as httpsGet } from 'node:https'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium } from '@playwright/test'

const ROOT = resolve(import.meta.dirname, '..')
const RAW = resolve(ROOT, 'data/raw')
const args = new Set(process.argv.slice(2))
const force = args.has('--force')

const PUBLIC_FILES = [
  {
    filename: 'cefrj.csv',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv',
  },
  {
    filename: 'octanove_c1c2.csv',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv',
  },
]

const DIQT_FILES = [
  { filename: 'diqt_a1.csv', url: 'https://www.diqt.net/ja/word_tags/7/download' },
  { filename: 'diqt_a2.csv', url: 'https://www.diqt.net/ja/word_tags/8/download' },
  { filename: 'diqt_b1.csv', url: 'https://www.diqt.net/ja/word_tags/9/download' },
  { filename: 'diqt_b2.csv', url: 'https://www.diqt.net/ja/word_tags/10/download' },
  { filename: 'diqt_phrase.csv', url: 'https://www.diqt.net/ja/word_tags/5/download' },
  { filename: 'diqt_phave.csv', url: 'https://www.diqt.net/ja/word_tags/6/download' },
]

const KAIKKI = {
  filename: 'kaikki.jsonl.gz',
  url: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl',
}

function usable(path) {
  return existsSync(path) && statSync(path).size > 20
}

function validateCsv(path) {
  if (!usable(path)) throw new Error(`${basename(path)} が空です。`)
  const head = readFileSync(path).subarray(0, 8192).toString('utf8').replace(/^\uFEFF/, '')
  const firstLine = head.split(/\r?\n/, 1)[0]
  if (!firstLine?.includes(',')) {
    throw new Error(`${basename(path)} はCSVとして認識できません（先頭行にカンマがありません）。`)
  }
}

async function downloadStream({ filename, url }, { showProgress = false } = {}) {
  const target = resolve(RAW, filename)
  if (!force && usable(target)) {
    console.log(`✓ ${filename} は取得済みです`)
    return
  }
  const partial = `${target}.part`
  await rm(partial, { force: true })
  console.log(`↓ ${filename}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`${filename} の取得に失敗しました: HTTP ${response.status}`)
  }
  const expected = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastShown = 0
  const body = Readable.fromWeb(response.body).map((chunk) => {
    received += chunk.length
    if (showProgress && received - lastShown >= 25 * 1024 * 1024) {
      lastShown = received
      const progress = expected ? ` / ${(expected / 1024 / 1024).toFixed(0)} MB` : ''
      stdout.write(`\r  ${(received / 1024 / 1024).toFixed(0)} MB${progress}`)
    }
    return chunk
  })
  try {
    await pipeline(body, createWriteStream(partial, { flags: 'wx' }))
    if (showProgress) stdout.write('\n')
    await rename(partial, target)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

function requestCompressed(url, { range, redirectsLeft = 5 } = {}) {
  return new Promise((resolveResponse, reject) => {
    const headers = { 'Accept-Encoding': 'gzip', 'User-Agent': 'WordRecall-dictionary-builder/1.0' }
    if (range) headers.Range = range
    const request = httpsGet(
      url,
      { headers },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume()
          if (redirectsLeft === 0) {
            reject(new Error('Kaikkiのredirect回数が上限を超えました。'))
            return
          }
          resolveResponse(
            requestCompressed(new URL(response.headers.location, url).href, { range, redirectsLeft: redirectsLeft - 1 }),
          )
          return
        }
        const expectedStatus = range ? 206 : 200
        if (response.statusCode !== expectedStatus) {
          response.resume()
          reject(new Error(`Kaikkiの取得に失敗しました: HTTP ${response.statusCode}（期待値 ${expectedStatus}）`))
          return
        }
        if (response.headers['content-encoding'] !== 'gzip') {
          response.resume()
          reject(new Error('Kaikkiサーバーがgzip形式を返しませんでした。展開版の保存を避けるため中止します。'))
          return
        }
        resolveResponse(response)
      },
    )
    request.on('error', reject)
  })
}

async function downloadCompressedKaikki() {
  const target = resolve(RAW, KAIKKI.filename)
  if (!force && usable(target)) {
    console.log(`✓ ${KAIKKI.filename} は取得済みです`)
    return
  }
  const partial = `${target}.part`
  await rm(partial, { force: true })
  await rm(resolve(RAW, 'kaikki.jsonl.part'), { force: true })
  console.log(`↓ ${KAIKKI.filename}（gzipのまま保存）`)
  const probe = await requestCompressed(KAIKKI.url, { range: 'bytes=0-0' })
  const contentRange = probe.headers['content-range'] || ''
  const expected = Number(contentRange.match(/\/(\d+)$/)?.[1] || 0)
  probe.resume()
  if (!expected) throw new Error('Kaikkiの圧縮サイズを取得できませんでした。')
  const file = await open(partial, 'w')
  await file.truncate(expected)
  await file.close()
  let received = 0
  let lastShown = 0
  async function* progress(source, expectedSegmentBytes) {
    let segmentBytes = 0
    for await (const chunk of source) {
      received += chunk.length
      segmentBytes += chunk.length
      if (received - lastShown >= 10 * 1024 * 1024) {
        lastShown = received
        stdout.write(`\r  ${(received / 1024 / 1024).toFixed(0)} / ${(expected / 1024 / 1024).toFixed(0)} MB`)
      }
      yield chunk
    }
    if (segmentBytes !== expectedSegmentBytes) {
      throw new Error(`Kaikkiの分割サイズが一致しません: ${segmentBytes} / ${expectedSegmentBytes} bytes`)
    }
  }
  try {
    const concurrency = 4
    const segmentSize = Math.ceil(expected / concurrency)
    await Promise.all(
      Array.from({ length: concurrency }, async (_, index) => {
        const start = index * segmentSize
        const end = Math.min(expected - 1, start + segmentSize - 1)
        const response = await requestCompressed(KAIKKI.url, { range: `bytes=${start}-${end}` })
        await pipeline(
          Readable.from(progress(response, end - start + 1)),
          createWriteStream(partial, { flags: 'r+', start }),
        )
      }),
    )
    stdout.write('\n')
    if (expected && received !== expected) throw new Error(`Kaikkiのサイズが一致しません: ${received} / ${expected} bytes`)
    await rename(partial, target)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

async function downloadDiqt() {
  const pending = DIQT_FILES.filter(({ filename }) => force || !usable(resolve(RAW, filename)))
  if (!pending.length) {
    console.log('✓ DiQt CSVはすべて取得済みです')
    return
  }

  let browser
  try {
    browser = await chromium.launch({ headless: false })
  } catch (error) {
    throw new Error('DiQtログイン用Chromiumを起動できません。先に「npx playwright install chromium」を実行してください。', {
      cause: error,
    })
  }
  const context = await browser.newContext({ acceptDownloads: true, locale: 'ja-JP' })
  const page = await context.newPage()
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    await page.goto('https://www.diqt.net/ja/login', { waitUntil: 'domcontentloaded' })
    console.log('\nDiQtのログイン画面を開きました。')
    console.log('ブラウザ上でご自身でログインしてください。認証情報をこの端末入力へ貼り付けないでください。')
    await prompt.question('ログインできたら、このターミナルで Enter を押してください: ')

    for (const source of pending) {
      console.log(`↓ ${source.filename}`)
      await page.goto(source.url, { waitUntil: 'domcontentloaded' })
      const target = page.getByText('ダウンロードする', { exact: true }).first()
      try {
        await target.waitFor({ state: 'visible', timeout: 30_000 })
      } catch (error) {
        throw new Error(
          `${source.filename}: ダウンロード操作が30秒以内に表示されません。DiQtへログイン済みか確認してください。`,
          { cause: error },
        )
      }
      const firstDownload = page.waitForEvent('download', { timeout: 3_000 }).catch(() => null)
      await target.click()
      let download = await firstDownload
      if (!download) {
        const modalAction = page
          .locator(
            'a:visible:has-text("ダウンロード"), button:visible:has-text("ダウンロード"), input[type="submit"][value*="ダウンロード"]:visible, input[type="button"][value*="ダウンロード"]:visible',
          )
          .last()
        try {
          await modalAction.waitFor({ state: 'visible', timeout: 10_000 })
        } catch (error) {
          throw new Error(`${source.filename}: モーダル内のCSV取得ボタンが表示されません。`, { cause: error })
        }
        const modalDownload = page.waitForEvent('download', { timeout: 60_000 })
        await modalAction.click()
        download = await modalDownload
      }
      const failure = await download.failure()
      if (failure) throw new Error(`${source.filename}: ${failure}`)
      const targetPath = resolve(RAW, source.filename)
      const partialPath = `${targetPath}.part`
      await rm(partialPath, { force: true })
      await download.saveAs(partialPath)
      validateCsv(partialPath)
      await rename(partialPath, targetPath)
      console.log(`✓ ${source.filename}`)
    }
  } finally {
    prompt.close()
    await context.close()
    await browser.close()
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} が終了コード ${result.status} で失敗しました。`)
}

async function main() {
  await mkdir(RAW, { recursive: true })
  if (!args.has('--skip-public')) {
    for (const source of PUBLIC_FILES) {
      await downloadStream(source)
      validateCsv(resolve(RAW, source.filename))
    }
  }
  if (!args.has('--skip-diqt')) await downloadDiqt()

  if (!args.has('--skip-kaikki') && (force || !usable(resolve(RAW, KAIKKI.filename)))) {
    let approved = args.has('--yes-kaikki')
    if (!approved) {
      const prompt = createInterface({ input: stdin, output: stdout })
      const answer = await prompt.question('\nKaikki English JSONL（約3.1GB）を取得しますか？ [y/N]: ')
      prompt.close()
      approved = /^y(es)?$/i.test(answer.trim())
    }
    if (!approved) {
      throw new Error('Kaikkiが未取得です。再実行して y を選ぶか、--yes-kaikki を指定してください。')
    }
    await downloadCompressedKaikki()
  }

  if (args.has('--download-only')) return
  console.log('\n辞書を構築して検証します…')
  run('python3', ['scripts/build_dictionary.py'])
  run('python3', ['scripts/validate_dictionary.py'])
  console.log('\n✓ 辞書の取得・構築・検証が完了しました。')
}

main().catch((error) => {
  console.error(`\nエラー: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
