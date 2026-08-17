import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { workspacesQuery } from "@/lib/queries"
import type { Workspace } from "@/lib/api"

const STORAGE_KEY = "herald.activeWorkspace"

type WorkspaceStoreCtx = {
  workspaces: Workspace[]
  active: Workspace | null
  setActive: (id: string) => void
  loading: boolean
}

const WorkspaceStoreContext = createContext<WorkspaceStoreCtx | null>(null)

function readStoredId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Which workspace the workspace pages are looking at. This is deliberately not
 * a scope on mail: mailboxes are keyed on addresses (`user_addresses`), not on
 * workspaces, so switching only re-points the workspace administration views.
 */
export function WorkspaceStoreProvider({ children }: { children: React.ReactNode }) {
  const { data: workspaces = [], isPending } = useQuery(workspacesQuery())
  const [selectedId, setSelectedId] = useState<string | null>(readStoredId)

  // A stored id that no longer resolves (workspace deleted, different account)
  // falls back to the user's personal workspace.
  const active = useMemo(() => {
    if (workspaces.length === 0) return null
    return (
      workspaces.find((workspace) => workspace.id === selectedId) ??
      workspaces.find((workspace) => workspace.kind === "personal") ??
      workspaces[0]
    )
  }, [workspaces, selectedId])

  useEffect(() => {
    if (!active || active.id === selectedId) return
    setSelectedId(active.id)
  }, [active, selectedId])

  const setActive = useCallback((id: string) => {
    setSelectedId(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Private mode / storage disabled — the selection just won't survive a reload.
    }
  }, [])

  const value = useMemo<WorkspaceStoreCtx>(
    () => ({ workspaces, active, setActive, loading: isPending }),
    [workspaces, active, setActive, isPending],
  )

  return (
    <WorkspaceStoreContext.Provider value={value}>{children}</WorkspaceStoreContext.Provider>
  )
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceStoreContext)
  if (!ctx) throw new Error("useWorkspaces must be used within _app layout")
  return ctx
}
