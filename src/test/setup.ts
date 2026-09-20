import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { ensureWebStorageForTests, resetWebStorageForTests } from './webStoragePolyfill'

ensureWebStorageForTests()

function mockMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

let originalScrollIntoView: Element['scrollIntoView'] | undefined

function mockScrollIntoView() {
  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
}

function restoreScrollIntoView() {
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView
  } else {
    delete (Element.prototype as { scrollIntoView?: Element['scrollIntoView'] })
      .scrollIntoView
  }
}

beforeEach(() => {
  resetWebStorageForTests()
  mockMatchMedia()
  mockScrollIntoView()
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
})

afterEach(() => {
  cleanup()
  restoreScrollIntoView()
  vi.unstubAllGlobals()
})
