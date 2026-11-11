// Storage for the offline mode, plus "who is logged in" so each account's saved data stays apart.
//
// IndexedDB is a bigger storage built into every browser. localStorage only holds about 5 MB,
// and the question bank alone is 1–2 MB, so the bank goes here. Used like a simple key → value box.

const DB_NAME = 'projectrmt-offline'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  // If opening failed (e.g. private mode), try again next time instead of keeping the failure.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

/** Reads one value. undefined = nothing saved, or the storage isn't available. Never throws. */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb()
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return undefined
  }
}

/** Saves one value. Returns false if it couldn't be saved (e.g. the device is full). */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

/** Removes one value. Returns false if it couldn't be removed. Never throws. */
export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

// ---------- Who is logged in (set by AuthProvider) ----------

let currentUserId: string | null = null

export function setOfflineUserId(id: string | null) {
  currentUserId = id
}

export function getOfflineUserId(): string | null {
  return currentUserId
}

/** True when the browser says there's a connection. (It can be wrong the other way: "online" but no real internet.) */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}
