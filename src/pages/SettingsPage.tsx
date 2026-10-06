import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccountSection } from '../components/AccountSection'
import { ensureSettings, userDb } from '../db/userDb'
import { downloadBackup, restoreBackup } from '../services/backupService'
import { requestSync } from '../services/syncService'

export function SettingsPage() {
  const settings = useLiveQuery(() => ensureSettings(), [])
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [storage, setStorage] = useState<string>('取得できません')
  useEffect(() => {
    if (navigator.storage?.estimate)
      void navigator.storage
        .estimate()
        .then((result) =>
          setStorage(
            `${formatBytes(result.usage ?? 0)} / ${formatBytes(result.quota ?? 0)}`
          )
        )
  }, [])
  if (!settings)
    return (
      <main className="page">
        <div className="skeleton tall" />
      </main>
    )

  async function patchSettings(
    changes: Partial<typeof settings>
  ): Promise<void> {
    await userDb.appSettings.put({ ...settings!, ...changes })
    requestSync()
  }
  async function restore(file: File): Promise<void> {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('backup_too_large')
      const parsed: unknown = JSON.parse(await file.text())
      await restoreBackup(parsed)
      requestSync(0)
      setMessage('バックアップを復元しました')
    } catch {
      setMessage('バックアップが不正です。既存データは変更されていません。')
    }
  }

  return (
    <main className="page settings-page">
      <header>
        <p className="eyebrow">PREFERENCES</p>
        <h1>設定</h1>
      </header>
      <AccountSection />
      <section className="settings-section">
        <h2>学習</h2>
        <label>
          単語帳でここまで見た単語数
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={settings.totalEncounteredWords ?? ''}
            onChange={(event) =>
              void patchSettings({
                totalEncounteredWords:
                  event.target.value === ''
                    ? null
                    : Math.max(0, Number(event.target.value))
              })
            }
          />
        </label>
        <label>
          目標記憶率{' '}
          <strong>{Math.round(settings.desiredRetention * 100)}%</strong>
          <input
            type="range"
            min="0.8"
            max="0.97"
            step="0.01"
            value={settings.desiredRetention}
            onChange={(event) =>
              void patchSettings({
                desiredRetention: Number(event.target.value)
              })
            }
          />
        </label>
        <label>
          定着判定のStability <strong>{settings.masteryStabilityDays}日</strong>
          <input
            type="range"
            min="14"
            max="90"
            step="1"
            value={settings.masteryStabilityDays}
            onChange={(event) =>
              void patchSettings({
                masteryStabilityDays: Number(event.target.value)
              })
            }
          />
        </label>
      </section>
      <section className="settings-section">
        <h2>バックアップ</h2>
        <p className="muted">
          最終バックアップ：
          {settings.lastBackupAt
            ? new Intl.DateTimeFormat('ja-JP').format(
                new Date(settings.lastBackupAt)
              )
            : 'まだありません'}
        </p>
        <button
          className="secondary full"
          onClick={() =>
            void downloadBackup()
              .then(() => {
                requestSync()
                setMessage('バックアップを作成しました')
              })
              .catch(() => setMessage('バックアップを保存できませんでした'))
          }
        >
          学習データをバックアップ
        </button>
        <button
          className="secondary full"
          onClick={() => input.current?.click()}
        >
          バックアップを復元
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void restore(file)
            event.target.value = ''
          }}
        />
      </section>
      <section className="settings-section">
        <h2>ストレージ</h2>
        <dl>
          <div>
            <dt>アプリ使用容量 / 上限</dt>
            <dd>{storage}</dd>
          </div>
          <div>
            <dt>辞書バージョン</dt>
            <dd>{settings.dictionaryVersion ?? '未設定'}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-section">
        <h2>プライバシー</h2>
        <p>
          未ログイン時の学習データはこの端末内だけに保存されます。ログイン時は同じアカウントの端末間同期のためSupabaseへ保存されます。分析・広告トラッキングは行いません。
        </p>
      </section>
      <section className="settings-section">
        <h2>データソースとライセンス</h2>
        <p>
          CEFR-J、Octanove、DiQt、EJDict、Japanese
          WordNet、FreeDict、JMdict、PHRASE、PHaVE、English / Japanese
          Wiktionary・Kaikki / Wiktextract、ts-fsrs。詳細は同梱の LICENSES.md と
          THIRD_PARTY_NOTICES.md を参照してください。
        </p>
      </section>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </main>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
