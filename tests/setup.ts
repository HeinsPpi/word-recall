/// <reference types="node" />
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { vi } from 'vitest'
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
HTMLCanvasElement.prototype.getContext = vi.fn() as unknown as typeof HTMLCanvasElement.prototype.getContext
