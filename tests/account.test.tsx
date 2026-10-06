import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
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
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
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
    mocks.signIn.mockResolvedValue({ error: null })
    mocks.synchronize.mockResolvedValue(undefined)
  })

  it('signs in and starts synchronization', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'safe-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({ email: 'learner@example.com', password: 'safe-password' }))
    expect(mocks.synchronize).toHaveBeenCalledOnce()
  })

  it('rejects a short password before account creation', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: '新しいアカウントを作成' }))
    expect(await screen.findByText(/8文字以上/)).toBeInTheDocument()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
})
