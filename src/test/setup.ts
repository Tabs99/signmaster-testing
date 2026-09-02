import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

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
  mockMatchMedia()
  mockScrollIntoView()
})

afterEach(() => {
  cleanup()
  restoreScrollIntoView()
  vi.unstubAllGlobals()
})
