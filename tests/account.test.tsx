import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendOtp: vi.fn(),
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
    mocks.synchronize.mockResolvedValue(undefined)
  })

  it('sends a passwordless login link restricted to the app URL', async () => {
    render(<AccountSection />)
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'learner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログインリンクを送る' }))
    await waitFor(() => expect(mocks.sendOtp).toHaveBeenCalledWith({ email: 'learner@example.com', options: { shouldCreateUser: true, emailRedirectTo: 'http://localhost:3000/' } }))
    expect(await screen.findByText(/ログインリンクを送りました/)).toBeInTheDocument()
  })

  it('requires an email before requesting an OTP', async () => {
    render(<AccountSection />)
    fireEvent.click(screen.getByRole('button', { name: 'ログインリンクを送る' }))
    expect(await screen.findByText('メールアドレスを入力してください。')).toBeInTheDocument()
    expect(mocks.sendOtp).not.toHaveBeenCalled()
  })
})
