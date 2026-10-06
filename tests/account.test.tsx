import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendOtp: vi.fn(),
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
      signInWithOtp: mocks.sendOtp,
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
    mocks.sendOtp.mockResolvedValue({ error: null })
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

  it('sends an existing-user password setup link without signup', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '初回パスワード設定リンクを送る' }))
    await waitFor(() => expect(mocks.sendOtp).toHaveBeenCalledWith({ email: 'learner@example.com', options: { shouldCreateUser: false, emailRedirectTo: 'http://localhost:3000/' } }))
    expect(await screen.findByText(/パスワード設定リンクを送りました/)).toBeInTheDocument()
  })
})
