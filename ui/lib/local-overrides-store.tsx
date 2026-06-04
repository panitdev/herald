import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Email, Folder } from "@/lib/types"

// Local-only, non-persisted UI state layered over server data (TanStack Query).
// Star / read / folder moves and locally-composed "sent" emails live here and
// reset on reload — matching the original email-client.tsx behavior.

type Override = {
  starred?: boolean
  read?: boolean
  folder?: Folder
}

type Ctx = {
  overrides: Record<string, Override>
  deletedIds: Record<string, true>
  localEmails: Email[]
  toggleStar: (id: string) => void
  toggleRead: (id: string) => void
  setRead: (id: string, read: boolean) => void
  moveTo: (id: string, folder: Folder) => void
  removePermanently: (id: string) => void
  addLocalEmail: (email: Email) => void
}

const LocalOverridesContext = createContext<Ctx | null>(null)

export function LocalOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [deletedIds, setDeletedIds] = useState<Record<string, true>>({})
  const [localEmails, setLocalEmails] = useState<Email[]>([])

  const patch = useCallback((id: string, p: Override) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }, [])

  const toggleStar = useCallback(
    (id: string) =>
      setOverrides((prev) => ({
        ...prev,
        [id]: { ...prev[id], starred: !resolveStar(prev[id], id, localEmails) },
      })),
    [localEmails],
  )

  const toggleRead = useCallback(
    (id: string) =>
      setOverrides((prev) => ({
        ...prev,
        [id]: { ...prev[id], read: !prev[id]?.read },
      })),
    [],
  )

  const setRead = useCallback(
    (id: string, read: boolean) => patch(id, { read }),
    [patch],
  )

  const moveTo = useCallback(
    (id: string, folder: Folder) => patch(id, { folder }),
    [patch],
  )

  const removePermanently = useCallback((id: string) => {
    setDeletedIds((prev) => ({ ...prev, [id]: true }))
    setLocalEmails((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const addLocalEmail = useCallback(
    (email: Email) => setLocalEmails((prev) => [email, ...prev]),
    [],
  )

  const value = useMemo<Ctx>(
    () => ({
      overrides,
      deletedIds,
      localEmails,
      toggleStar,
      toggleRead,
      setRead,
      moveTo,
      removePermanently,
      addLocalEmail,
    }),
    [
      overrides,
      deletedIds,
      localEmails,
      toggleStar,
      toggleRead,
      setRead,
      moveTo,
      removePermanently,
      addLocalEmail,
    ],
  )

  return (
    <LocalOverridesContext.Provider value={value}>
      {children}
    </LocalOverridesContext.Provider>
  )
}

function resolveStar(
  override: Override | undefined,
  id: string,
  locals: Email[],
): boolean {
  if (override?.starred !== undefined) return override.starred
  return locals.find((e) => e.id === id)?.starred ?? false
}

export function useLocalOverrides() {
  const ctx = useContext(LocalOverridesContext)
  if (!ctx)
    throw new Error(
      "useLocalOverrides must be used within LocalOverridesProvider",
    )
  return ctx
}

function applyOverrides(email: Email, override: Override | undefined): Email {
  if (!override) return email
  return {
    ...email,
    starred: override.starred ?? email.starred,
    read: override.read ?? email.read,
    folder: override.folder ?? email.folder,
  }
}

/**
 * Merge server emails (from TanStack Query) with the local overrides, then
 * filter to the active folder + search and sort newest-first. Mirrors the
 * combinedEmails/filtered/counts memos from the original email-client.tsx.
 */
export function useMergedEmails(apiEmails: Email[], activeFolder: Folder, search: string) {
  const { overrides, deletedIds, localEmails } = useLocalOverrides()

  const combined = useMemo(() => {
    const apiIds = new Set(apiEmails.map((e) => e.id))
    const localOnly = localEmails.filter((e) => !apiIds.has(e.id))
    return [...localOnly, ...apiEmails]
      .filter((e) => !deletedIds[e.id])
      .map((e) => applyOverrides(e, overrides[e.id]))
  }, [apiEmails, localEmails, overrides, deletedIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return combined
      .filter((e) => {
        if (activeFolder === "starred") return e.starred && e.folder !== "trash"
        return e.folder === activeFolder
      })
      .filter((e) => {
        if (!q) return true
        return (
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [combined, activeFolder, search])

  const counts = useMemo(() => {
    const c: Record<Folder, number> = {
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      trash: 0,
    }
    for (const e of combined) {
      if (e.folder === "inbox" && !e.read) c.inbox++
      if (e.starred && e.folder !== "trash") c.starred++
      if (e.folder === "sent") c.sent++
      if (e.folder === "drafts") c.drafts++
      if (e.folder === "archive") c.archive++
      if (e.folder === "trash") c.trash++
    }
    return c
  }, [combined])

  const unreadCount = useMemo(
    () => filtered.filter((e) => !e.read).length,
    [filtered],
  )

  return { combined, filtered, counts, unreadCount }
}
