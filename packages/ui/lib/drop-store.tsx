import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { Drop, DropItem } from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(userId: string): string {
  return `herald-drops:${userId}`
}

function loadDrops(userId: string): Drop[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as Drop[]
  } catch {
    return []
  }
}

function saveDrops(userId: string, drops: Drop[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(drops))
  } catch {
    // localStorage may be full or unavailable
  }
}

export function dropTitle(drop: Drop): string {
  if (drop.title) return drop.title
  const first = drop.items[0]
  if (!first) return "Empty drop"
  switch (first.type) {
    case "text": return first.content.slice(0, 60) || "Text"
    case "link": return first.url
    case "file":
    case "image": return first.name
  }
}

export function dropPreview(drop: Drop): string {
  if (drop.items.length === 0) return ""
  const types = drop.items.map((i) => i.type)
  const counts: Record<string, number> = {}
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1
  const parts: string[] = []
  if (counts.text) parts.push(`${counts.text} text`)
  if (counts.link) parts.push(`${counts.link} link`)
  if (counts.image) parts.push(`${counts.image} image`)
  if (counts.file) parts.push(`${counts.file} file`)
  return parts.join(" · ")
}

// ─── Context ──────────────────────────────────────────────────────────────────

type DropStoreCtx = {
  drops: Drop[]
  recentDrops: Drop[]
  createDrop: (items: DropItem[], title?: string) => Drop
  deleteDrop: (id: string) => void
  getDrop: (id: string) => Drop | undefined
}

const DropStoreContext = createContext<DropStoreCtx | null>(null)

export function DropStoreProvider({
  userId,
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const [drops, setDrops] = useState<Drop[]>(() => loadDrops(userId))

  // Sync with localStorage from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) {
        setDrops(loadDrops(userId))
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [userId])

  const persist = useCallback(
    (next: Drop[]) => {
      setDrops(next)
      saveDrops(userId, next)
    },
    [userId],
  )

  const createDrop = useCallback(
    (items: DropItem[], title?: string): Drop => {
      const now = new Date().toISOString()
      const drop: Drop = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        items,
        title,
      }
      persist([drop, ...drops])
      return drop
    },
    [drops, persist],
  )

  const deleteDrop = useCallback(
    (id: string) => {
      persist(drops.filter((d) => d.id !== id))
    },
    [drops, persist],
  )

  const getDrop = useCallback(
    (id: string) => drops.find((d) => d.id === id),
    [drops],
  )

  const recentDrops = useMemo(() => drops.slice(0, 3), [drops])

  const value = useMemo<DropStoreCtx>(
    () => ({ drops, recentDrops, createDrop, deleteDrop, getDrop }),
    [drops, recentDrops, createDrop, deleteDrop, getDrop],
  )

  return (
    <DropStoreContext.Provider value={value}>
      {children}
    </DropStoreContext.Provider>
  )
}

export function useDropStore(): DropStoreCtx {
  const ctx = useContext(DropStoreContext)
  if (!ctx) throw new Error("useDropStore must be used within DropStoreProvider")
  return ctx
}
