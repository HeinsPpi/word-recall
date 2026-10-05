import { useCallback, useEffect, useState } from 'react'
import { fetchManifest, installDictionary, type SetupProgress } from '../services/setupService'

export function SetupPage({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const start = useCallback(async () => {
    setBusy(true); setError(null)
    try { const manifest = await fetchManifest(); await installDictionary(manifest, setProgress); onReady() }
    catch (e) { const code = e instanceof Error ? e.message : 'unknown'; setError(code === 'production_dictionary_missing' ? '辞書データがまだ配置されていません。README_DATA.mdに従って実辞書を生成してください。' : code.startsWith('checksum_error') ? '辞書データの検証に失敗しました。通信を確認して再試行してください。' : `辞書を準備できませんでした（${code}）。以前の辞書と学習データは変更されていません。`) }
    finally { setBusy(false) }
  }, [onReady])
  useEffect(() => { void start() }, [start])
  return <main className="setup-page"><div className="setup-mark">W</div><p className="eyebrow">WORDRECALL</p><h1>辞書データを<br/>準備しています</h1><p className="muted">データはこの端末だけに保存されます。Wi‑Fiでの初回セットアップをおすすめします。</p>{progress && <div className="progress-block"><progress max={progress.total} value={progress.current}/><strong>{progress.label}</strong></div>}{busy && !progress && <div className="spinner" aria-label="読み込み中"/>}{error && <div className="error-panel" role="alert"><p>{error}</p><button onClick={() => void start()}>もう一度試す</button></div>}</main>
}
