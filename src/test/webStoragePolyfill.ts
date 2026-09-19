/**
 * Node 22+ exposes an experimental Web Storage API on `globalThis` that is
 * incomplete unless `--localstorage-file` is set. Vitest jsdom tests expect
 * working `localStorage` / `sessionStorage` (e.g. activation specs call
 * `.clear()` in beforeEach). Provide in-memory Storage when the runtime's is
 * missing or non-functional.
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
  }
}

function storageIsUsable(storage: Storage | undefined): storage is Storage {
  return typeof storage?.clear === 'function' && typeof storage.getItem === 'function'
}

function bindStorageToWindow(name: 'localStorage' | 'sessionStorage', storage: Storage) {
  globalThis[name] = storage
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, name, {
        value: storage,
        configurable: true,
        writable: true,
      })
    } catch {
      // jsdom may already define read-only accessors; globalThis remains authoritative.
    }
  }
}

export function ensureWebStorageForTests() {
  if (!storageIsUsable(globalThis.localStorage)) {
    bindStorageToWindow('localStorage', createMemoryStorage())
  }
  if (!storageIsUsable(globalThis.sessionStorage)) {
    bindStorageToWindow('sessionStorage', createMemoryStorage())
  }
}

export function resetWebStorageForTests() {
  ensureWebStorageForTests()
  globalThis.localStorage.clear()
  globalThis.sessionStorage.clear()
}
