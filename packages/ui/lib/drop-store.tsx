import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Drop, DropItem } from "@/lib/types"
import { getDrops, apiCreateDrop, apiDeleteDrop } from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  createDrop: (items: DropItem[], title?: string) => Promise<Drop>
  deleteDrop: (id: string) => void
  getDrop: (id: string) => Drop | undefined
}

const DropStoreContext = createContext<DropStoreCtx | null>(null)

export function DropStoreProvider({
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const [drops, setDrops] = useState<Drop[]>([])
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const latest = await getDrops()
      if (mountedRef.current) setDrops(latest)
    } catch {
      // Keep existing state if refresh fails (e.g. offline)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh()

    const onSyncUpdated = () => void refresh()
    window.addEventListener("herald-sync-updated", onSyncUpdated)
    return () => {
      mountedRef.current = false
      window.removeEventListener("herald-sync-updated", onSyncUpdated)
    }
  }, [refresh])

  const createDrop = useCallback(
    async (items: DropItem[], title?: string): Promise<Drop> => {
      const drop = await apiCreateDrop(items, title)
      setDrops((prev) => [drop, ...prev.filter((d) => d.id !== drop.id)])
      return drop
    },
    [],
  )

  const deleteDrop = useCallback((id: string) => {
    setDrops((prev) => prev.filter((d) => d.id !== id))
    void apiDeleteDrop(id).catch(() => {
      void refresh()
    })
  }, [refresh])

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
