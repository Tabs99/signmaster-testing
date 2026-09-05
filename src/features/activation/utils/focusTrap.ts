const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex !== -1 && !element.hasAttribute('disabled'),
  )
}

export function handleFocusTrapKeyDown(
  event: KeyboardEvent,
  container: HTMLElement,
): void {
  if (event.key !== 'Tab') {
    return
  }

  const focusableElements = getFocusableElements(container)
  if (focusableElements.length === 0) {
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (event.shiftKey) {
    if (activeElement === firstElement || !container.contains(activeElement)) {
      event.preventDefault()
      lastElement.focus()
    }
    return
  }

  if (activeElement === lastElement || !container.contains(activeElement)) {
    event.preventDefault()
    firstElement.focus()
  }
}
