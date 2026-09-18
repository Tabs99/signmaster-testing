import type { Page } from '@playwright/test'

/** Deterministic clipboard.readText for secure-context E2E (user-gesture Paste button). */
export async function mockClipboardReadText(page: Page, text: string) {
  await page.addInitScript((value: string) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: async () => value,
      },
      configurable: true,
    })
  }, text)
}

export async function mockClipboardReadTextRejection(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: async () => {
          throw new Error('clipboard read denied')
        },
      },
      configurable: true,
    })
  })
}
