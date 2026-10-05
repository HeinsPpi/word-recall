import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run test:e2e:serve', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'chromium-iphone', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
})
