import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS === 'true' && repository ? `/${repository}/` : '/'

export default defineConfig(({ mode }) => ({
  base,
  publicDir: mode === 'e2e' ? 'tests/e2e-public' : 'public',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: mode === 'e2e' ? ['favicon.svg'] : ['apple-touch-icon-180x180.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json}'],
        globIgnores: ['dictionary/**/*'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    css: true
  }
}))
