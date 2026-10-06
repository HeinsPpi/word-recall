import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'

export function PasswordSetupPage({
  session,
  onContinue
}: {
  session: Session
  onContinue: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [message, setMessage] = useState('')

  async function save(): Promise<void> {
    if (!supabase) return
    if (password.length < 12) {
      setMessage('同期用パスワードは12文字以上にしてください。')
      return
    }
    if (password !== confirmation) {
      setMessage('確認用パスワードが一致しません。')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      await supabase.auth.signOut({ scope: 'local' })
      setPassword('')
      setConfirmation('')
      setComplete(true)
    } catch {
      setMessage('パスワードを設定できませんでした。新しいリンクを取得して再試行してください。')
    } finally {
      setBusy(false)
    }
  }

  if (complete)
    return (
      <main className="setup-page">
        <div className="setup-mark">W</div>
        <p className="eyebrow">ACCOUNT READY</p>
        <h1>同期用パスワードを<br />設定しました</h1>
        <p>
          このSafariタブを閉じ、元から使っていたホーム画面のWordRecallへ戻ってください。同じメールアドレスと今設定したパスワードでログインできます。
        </p>
      </main>
    )

  return (
    <main className="setup-page">
      <div className="setup-mark">W</div>
      <p className="eyebrow">ACCOUNT SETUP</p>
      <h1>同期用パスワードを<br />設定</h1>
      <p className="muted">
        {session.user.email} の初回設定です。辞書をこのSafariへ入れ直す必要はありません。
      </p>
      <label>
        同期用パスワード（12文字以上）
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        同期用パスワード（確認）
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </label>
      <button className="primary full" disabled={busy} onClick={() => void save()}>
        {busy ? '設定中…' : 'パスワードを設定'}
      </button>
      <button className="text-button" disabled={busy} onClick={onContinue}>
        このSafariにも辞書をインストールする
      </button>
      {message && <p className="form-message" role="alert">{message}</p>}
    </main>
  )
}
