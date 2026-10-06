import { useCallback, useEffect, useState } from 'react'
import {
  fetchManifest,
  installDictionary,
  type SetupProgress
} from '../services/setupService'
import type { DictionaryManifest } from '../types'

interface SetupPageProps {
  onReady: () => void
  manifest?: DictionaryManifest
  mode?: 'initial' | 'update'
  onCancel?: () => void
}

export function SetupPage({
  onReady,
  manifest,
  mode = 'initial',
  onCancel
}: SetupPageProps) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const start = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const targetManifest = manifest ?? (await fetchManifest())
      await installDictionary(targetManifest, setProgress)
      onReady()
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown'
      setError(
        code === 'production_dictionary_missing'
          ? '辞書データがまだ配置されていません。README_DATA.mdに従って実辞書を生成してください。'
          : code.startsWith('checksum_error')
            ? '辞書データの検証に失敗しました。通信を確認して再試行してください。'
            : `辞書を準備できませんでした（${code}）。以前の辞書と学習データは変更されていません。`
      )
    } finally {
      setBusy(false)
    }
  }, [manifest, onReady])
  useEffect(() => {
    void start()
  }, [start])
  const updating = mode === 'update'
  return (
    <main className="setup-page">
      <div className="setup-mark">W</div>
      <p className="eyebrow">WORDRECALL</p>
      <h1>
        {updating && '新しい'}辞書データを
        <br />
        準備しています
      </h1>
      <p className="muted">
        {updating
          ? '以前の辞書は、新しい辞書の準備が完了するまで保持されます。この画面を開いたままお待ちください。'
          : 'データはこの端末だけに保存されます。Wi‑Fiでの初回セットアップをおすすめします。'}
      </p>
      {progress && (
        <div className="progress-block">
          <progress max={progress.total} value={progress.current} />
          <strong>{progress.label}</strong>
        </div>
      )}
      {busy && !progress && <div className="spinner" aria-label="読み込み中" />}
      {error && (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={() => void start()}>もう一度試す</button>
            {updating && onCancel && (
              <button className="secondary" onClick={onCancel}>
                以前の辞書を使う
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
