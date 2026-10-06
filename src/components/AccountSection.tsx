import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, syncConfigured } from '../services/supabaseClient'
import { synchronize, type SyncStatus } from '../services/syncService'
import { clearLocalLearningData, userDb } from '../db/userDb'

function redirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function authMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('Token has expired') || text.includes('invalid'))
    return 'コードが無効か期限切れです。新しいコードを取得してください。'
  if (text.includes('rate limit'))
    return 'しばらく待ってからもう一度お試しください。'
  return '処理できませんでした。通信状態を確認してもう一度お試しください。'
}

export function AccountSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSyncedAt: null
  })

  useEffect(() => {
    if (!supabase) return
    void Promise.all([
      supabase.auth.getSession(),
      userDb.syncState.get('sync')
    ]).then(([result, state]) => {
      setSession(result.data.session)
      setStatus({ state: 'idle', lastSyncedAt: state?.lastSyncedAt ?? null })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    const onSync = (event: Event) =>
      setStatus((event as CustomEvent<SyncStatus>).detail)
    window.addEventListener('wordrecall-sync', onSync)
    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('wordrecall-sync', onSync)
    }
  }, [])

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(authMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function sendOtp(): Promise<void> {
    if (!supabase) return
    if (!email.trim()) {
      setMessage('メールアドレスを入力してください。')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() }
    })
    if (error) throw error
    setMessage('ログインリンクを送りました。メール内のリンクを開いてください。')
  }

  if (!syncConfigured)
    return (
      <section className="settings-section">
        <h2>アカウントと同期</h2>
        <p className="muted">
          このビルドでは同期先が設定されていません。端末内だけで引き続き利用できます。
        </p>
      </section>
    )
  if (session)
    return (
      <section className="settings-section account-section">
        <h2>アカウントと同期</h2>
        <p>
          <strong>{session.user.email}</strong>
        </p>
        <p className="muted">
          PCとiPhoneの学習データを同じアカウントで同期します。辞書本体は各端末に保存されます。
        </p>
        <dl>
          <div>
            <dt>同期状態</dt>
            <dd>
              {status.state === 'syncing'
                ? '同期中…'
                : status.state === 'error'
                  ? '同期エラー'
                  : '準備完了'}
            </dd>
          </div>
          <div>
            <dt>最終同期</dt>
            <dd>
              {status.lastSyncedAt
                ? new Intl.DateTimeFormat('ja-JP', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  }).format(new Date(status.lastSyncedAt))
                : 'まだありません'}
            </dd>
          </div>
        </dl>
        {status.message && (
          <p className="notice" role="alert">
            {status.message}
          </p>
        )}
        <button
          className="primary full"
          disabled={busy || status.state === 'syncing' || !navigator.onLine}
          onClick={() => void run(synchronize)}
        >
          今すぐ同期
        </button>
        <button
          className="secondary full"
          disabled={busy || status.state === 'syncing' || !navigator.onLine}
          onClick={() =>
            void run(async () => {
              await synchronize()
              await clearLocalLearningData()
              await supabase!.auth.signOut()
              setMessage('同期してログアウトし、この端末の学習データを消去しました。')
            })
          }
        >
          同期してログアウト
        </button>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </section>
    )
  return (
    <section className="settings-section account-section">
      <h2>アカウントと同期</h2>
      <p className="muted">
        同じアカウントでログインすると、PCで追加した単語をiPhoneでも利用できます。アカウントなしでも端末内だけで使えます。
      </p>
      <label>
        メールアドレス
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button
        className="primary full"
        disabled={busy || !navigator.onLine}
        onClick={() => void run(sendOtp)}
      >
        ログインリンクを送る
      </button>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
