import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, syncConfigured } from '../services/supabaseClient'
import { synchronize, type SyncStatus } from '../services/syncService'
import { userDb } from '../db/userDb'

function redirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
function authMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('Invalid login credentials'))
    return 'メールアドレスまたはパスワードが違います。'
  if (text.includes('Email not confirmed'))
    return '確認メール内のリンクを開いてからログインしてください。'
  if (text.includes('Password should be'))
    return 'パスワードは8文字以上にしてください。'
  if (text.includes('rate limit'))
    return 'しばらく待ってからもう一度お試しください。'
  return `処理できませんでした：${text}`
}

export function AccountSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState(false)
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
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
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
  async function signUp(): Promise<void> {
    if (!supabase) return
    if (!email.trim() || password.length < 8) {
      setMessage('メールアドレスと8文字以上のパスワードを入力してください。')
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectUrl() }
    })
    if (error) throw error
    if (data.session) {
      setMessage('アカウントを作成し、同期を開始しました。')
      await synchronize()
    } else
      setMessage(
        '確認メールを送りました。メール内のリンクを開いてからログインしてください。'
      )
  }
  async function signIn(): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    if (error) throw error
    setPassword('')
    setMessage('ログインしました。端末間の同期を開始します。')
    await synchronize()
  }
  async function sendRecovery(): Promise<void> {
    if (!supabase || !email.trim()) {
      setMessage('メールアドレスを入力してください。')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl()
    })
    if (error) throw error
    setMessage('パスワード再設定メールを送りました。')
  }
  async function updatePassword(): Promise<void> {
    if (!supabase || password.length < 8) {
      setMessage('新しいパスワードは8文字以上にしてください。')
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setPassword('')
    setRecovery(false)
    setMessage('パスワードを更新しました。')
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
        {recovery && (
          <label>
            新しいパスワード
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {recovery && (
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void run(updatePassword)}
          >
            パスワードを更新
          </button>
        )}
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
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await supabase!.auth.signOut()
              setMessage('ログアウトしました。端末内のデータは残っています。')
            })
          }
        >
          ログアウト
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        パスワード
        <input
          type="password"
          autoComplete="current-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button
        className="primary full"
        disabled={busy || !navigator.onLine}
        onClick={() => void run(signIn)}
      >
        ログイン
      </button>
      <button
        className="secondary full"
        disabled={busy || !navigator.onLine}
        onClick={() => void run(signUp)}
      >
        新しいアカウントを作成
      </button>
      <button
        className="text-button recovery-button"
        disabled={busy || !navigator.onLine}
        onClick={() => void run(sendRecovery)}
      >
        パスワードを忘れた場合
      </button>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
