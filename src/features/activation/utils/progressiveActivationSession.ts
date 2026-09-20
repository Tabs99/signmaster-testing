/**
 * UX-only flag: the user chose "Use another order" while a VALID HttpOnly
 * activation context still exists. Suppresses auto-resume to step 2 until the
 * next successful context creation clears it. Not authoritative — server
 * context remains VALID until expiry.
 */
const ACTIVATION_ENTRY_DEFERRED_KEY = 'signmaster_activation_entry_deferred'

export function deferActivationEntryResume(): void {
  sessionStorage.setItem(ACTIVATION_ENTRY_DEFERRED_KEY, '1')
}

export function clearActivationEntryDeferral(): void {
  sessionStorage.removeItem(ACTIVATION_ENTRY_DEFERRED_KEY)
}

export function isActivationEntryDeferred(): boolean {
  return sessionStorage.getItem(ACTIVATION_ENTRY_DEFERRED_KEY) === '1'
}
