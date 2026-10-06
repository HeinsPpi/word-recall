import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), signOut: vi.fn() }))
vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    auth: { updateUser: mocks.updateUser, signOut: mocks.signOut }
  }
}))

import { PasswordSetupPage } from '../src/pages/PasswordSetupPage'

describe('Safari password bridge', () => {
  it('sets a password and tells the user to return to the installed PWA', async () => {
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    const session = { user: { email: 'learner@example.com' } } as Session
    render(<PasswordSetupPage session={session} onContinue={vi.fn()} />)
    const inputs = screen.getAllByLabelText(/同期用パスワード/)
    fireEvent.change(inputs[0], { target: { value: 'a-secure-password' } })
    fireEvent.change(inputs[1], { target: { value: 'a-secure-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを設定' }))
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'a-secure-password' }))
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await screen.findByText(/元から使っていたホーム画面/)).toBeInTheDocument()
  })
})
