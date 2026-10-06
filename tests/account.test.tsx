import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
  updateUser: vi.fn(),
  synchronize: vi.fn()
}))

vi.mock('../src/services/supabaseClient', () => ({
  syncConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signUp: mocks.signUp,
      signInWithPassword: mocks.signIn,
      signOut: mocks.signOut,
      resetPasswordForEmail: mocks.reset,
      updateUser: mocks.updateUser
    }
  }
}))
vi.mock('../src/services/syncService', () => ({
  synchronize: mocks.synchronize
}))

import { AccountSection } from '../src/components/AccountSection'

describe('account and sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
    mocks.signIn.mockResolvedValue({ error: null })
    mocks.synchronize.mockResolvedValue(undefined)
  })

  it('signs in inside the PWA and starts synchronization', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.change(screen.getByLabelText('同期用パスワード'), { target: { value: 'a-secure-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして同期' }))
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({ email: 'learner@example.com', password: 'a-secure-password' }))
    expect(mocks.synchronize).toHaveBeenCalledOnce()
  })

  it('creates the allowlisted account without sending email', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.change(screen.getByLabelText('同期用パスワード'), { target: { value: 'a-secure-password' } })
    fireEvent.change(screen.getByLabelText(/初回登録コード/), { target: { value: 'invite-code' } })
    fireEvent.click(screen.getByRole('button', { name: '初回アカウントを作成' }))
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'learner@example.com', password: 'a-secure-password',
      options: { data: { enrollment_code: 'invite-code' } }
    }))
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { enrollment_code: null } })
    expect(mocks.synchronize).toHaveBeenCalledOnce()
  })
})
