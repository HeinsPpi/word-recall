import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  unsubscribe: vi.fn()
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn()
  })
}))
vi.mock('../src/services/setupService', () => ({
  dictionaryAvailable: vi.fn().mockResolvedValue(false),
  fetchManifest: mocks.fetchManifest,
  installDictionary: vi.fn()
}))
vi.mock('../src/services/supabaseClient', () => ({
  syncConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { email: 'learner@example.com' } } },
        error: null
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: mocks.unsubscribe } }
      })),
      updateUser: vi.fn(),
      signOut: vi.fn()
    }
  }
}))

import { App } from '../src/app/App'

describe('authentication callback before dictionary setup', () => {
  it('shows password setup without starting a second dictionary install', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /同期用パスワードを/ })).toBeInTheDocument()
    await waitFor(() => expect(mocks.fetchManifest).not.toHaveBeenCalled())
    expect(screen.getByText(/辞書をこのSafariへ入れ直す必要はありません/)).toBeInTheDocument()
  })
})
