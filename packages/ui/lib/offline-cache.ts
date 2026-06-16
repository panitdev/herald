import type { AuthUser } from "@/lib/auth-store"
import type { Email } from "@/lib/types"

const OFFLINE_DB_NAME = "herald-offline"
const OFFLINE_DB_VERSION = 1
export const OFFLINE_CACHE_VERSION = "offline-v1"

const AUTH_STORE = "auth"
const SYNC_STORE = "sync"
const BODY_STORE = "messageBodies"
const OVERRIDES_STORE = "localOverrides"

export type PersistedSyncState = {
  cacheVersion: string
  userId: string
  schemaVersion: number
  cursor: string
  mailboxes: unknown[]
  messages: unknown[]
  messageRecipients: unknown[]
  messageMailboxes: unknown[]
  attachments: unknown[]
  updatedAt: string
}

export type PersistedMessageBody = {
  cacheVersion: string
  userId: string
  messageId: string
  format: "html" | "text"
  body: string
  updatedAt: string
}

export type PersistedAuthUser = {
  cacheVersion: string
  user: AuthUser
  cachedAt: string
}

export type PersistedLocalOverrides = {
  cacheVersion: string
  userId: string
  overrides: Record<string, { starred?: boolean; read?: boolean; folder?: Email["folder"] }>
  deletedIds: string[]
  localEmails: Email[]
  updatedAt: string
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error("Failed to open offline database"))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        db.createObjectStore(AUTH_STORE)
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE)
      }
      if (!db.objectStoreNames.contains(BODY_STORE)) {
        db.createObjectStore(BODY_STORE)
      }
      if (!db.objectStoreNames.contains(OVERRIDES_STORE)) {
        db.createObjectStore(OVERRIDES_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function runReadonly<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly")
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onerror = () => reject(request.error ?? new Error("Failed to read offline data"))
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    }).finally(() => db.close())
  })
}

function runReadwrite(
  storeName: string,
  action: (store: IDBObjectStore) => void,
): Promise<void> {
  return openDb().then((db) => {
    if (!db) return
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite")
      const store = tx.objectStore(storeName)
      action(store)
      tx.onerror = () => reject(tx.error ?? new Error("Failed to write offline data"))
      tx.oncomplete = () => resolve()
    }).finally(() => db.close())
  })
}

function syncKey(userId: string): string {
  return `${OFFLINE_CACHE_VERSION}:${userId}`
}

function bodyKey(userId: string, messageId: string): string {
  return `${OFFLINE_CACHE_VERSION}:${userId}:${messageId}`
}

function overridesKey(userId: string): string {
  return `${OFFLINE_CACHE_VERSION}:${userId}`
}

const AUTH_KEY = "last-user"

export async function loadPersistedAuthUser(): Promise<PersistedAuthUser | null> {
  const value = await runReadonly<PersistedAuthUser>(AUTH_STORE, AUTH_KEY)
  if (!value || value.cacheVersion !== OFFLINE_CACHE_VERSION) return null
  return value
}

export function persistAuthUser(user: AuthUser): Promise<void> {
  return runReadwrite(AUTH_STORE, (store) => {
    store.put(
      {
        cacheVersion: OFFLINE_CACHE_VERSION,
        user,
        cachedAt: new Date().toISOString(),
      } satisfies PersistedAuthUser,
      AUTH_KEY,
    )
  })
}

export function clearPersistedAuthUser(): Promise<void> {
  return runReadwrite(AUTH_STORE, (store) => {
    store.delete(AUTH_KEY)
  })
}

export async function loadPersistedSyncState(
  userId: string,
): Promise<PersistedSyncState | null> {
  const value = await runReadonly<PersistedSyncState>(SYNC_STORE, syncKey(userId))
  if (!value || value.cacheVersion !== OFFLINE_CACHE_VERSION || value.userId !== userId) {
    return null
  }
  return value
}

export function persistSyncState(value: PersistedSyncState): Promise<void> {
  return runReadwrite(SYNC_STORE, (store) => {
    store.put(value, syncKey(value.userId))
  })
}

export async function loadPersistedMessageBody(
  userId: string,
  messageId: string,
): Promise<PersistedMessageBody | null> {
  const value = await runReadonly<PersistedMessageBody>(BODY_STORE, bodyKey(userId, messageId))
  if (
    !value ||
    value.cacheVersion !== OFFLINE_CACHE_VERSION ||
    value.userId !== userId ||
    value.messageId !== messageId
  ) {
    return null
  }
  return value
}

export function persistMessageBody(value: PersistedMessageBody): Promise<void> {
  return runReadwrite(BODY_STORE, (store) => {
    store.put(value, bodyKey(value.userId, value.messageId))
  })
}

export async function loadPersistedLocalOverrides(
  userId: string,
): Promise<PersistedLocalOverrides | null> {
  const value = await runReadonly<PersistedLocalOverrides>(OVERRIDES_STORE, overridesKey(userId))
  if (!value || value.cacheVersion !== OFFLINE_CACHE_VERSION || value.userId !== userId) {
    return null
  }
  return value
}

export function persistLocalOverrides(value: PersistedLocalOverrides): Promise<void> {
  return runReadwrite(OVERRIDES_STORE, (store) => {
    store.put(value, overridesKey(value.userId))
  })
}

export async function clearUserOfflineData(userId: string): Promise<void> {
  await Promise.all([
    runReadwrite(SYNC_STORE, (store) => {
      store.delete(syncKey(userId))
    }),
    runReadwrite(OVERRIDES_STORE, (store) => {
      store.delete(overridesKey(userId))
    }),
  ])

  const db = await openDb()
  if (!db) return

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BODY_STORE, "readwrite")
    const store = tx.objectStore(BODY_STORE)
    const cursorRequest = store.openCursor()
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Failed to clear message bodies"))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      if (String(cursor.key).startsWith(`${OFFLINE_CACHE_VERSION}:${userId}:`)) {
        cursor.delete()
      }
      cursor.continue()
    }
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear user offline data"))
    tx.oncomplete = () => resolve()
  }).finally(() => db.close())
}

export async function clearOfflineSession(userId: string | null): Promise<void> {
  await clearPersistedAuthUser()
  if (userId) {
    await clearUserOfflineData(userId)
  }
}
