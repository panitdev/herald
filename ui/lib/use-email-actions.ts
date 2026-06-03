import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import type { Email, Folder } from "@/lib/types"
import { markAsRead } from "@/lib/api"
import { useLocalOverrides } from "@/lib/local-overrides-store"
import { useAppChrome } from "@/src/routes/_app"

/**
 * Email action handlers shared by the list and detail panes. Mirrors the
 * handlers from the original email-client.tsx: local-only optimistic
 * star/archive/delete/read with undo, plus best-effort markRead to the API.
 */
export function useEmailActions(mailbox: Folder, combined: Email[]) {
  const navigate = useNavigate()
  const { openCompose } = useAppChrome()
  const { toggleStar, toggleRead, setRead, moveTo, removePermanently } =
    useLocalOverrides()

  const find = useCallback(
    (id: string) => combined.find((e) => e.id === id) ?? null,
    [combined],
  )

  const backToList = useCallback(
    () => navigate({ to: "/$mailbox", params: { mailbox } }),
    [navigate, mailbox],
  )

  const handleSelect = useCallback(
    (id: string) => {
      navigate({ to: "/$mailbox/$messageId", params: { mailbox, messageId: id } })
      setRead(id, true)
      markAsRead(id)
    },
    [navigate, mailbox, setRead],
  )

  const handleToggleStar = useCallback((id: string) => toggleStar(id), [toggleStar])
  const handleToggleRead = useCallback((id: string) => toggleRead(id), [toggleRead])

  const handleArchive = useCallback(
    (id: string, selectedId?: string | null) => {
      const target = find(id)
      if (!target) return
      const prevFolder = target.folder
      moveTo(id, "archive")
      if (selectedId === id) backToList()
      toast.success("Archived", {
        description: target.subject,
        action: { label: "Undo", onClick: () => moveTo(id, prevFolder) },
      })
    },
    [find, moveTo, backToList],
  )

  const handleDelete = useCallback(
    (id: string, selectedId?: string | null) => {
      const target = find(id)
      if (!target) return
      const prevFolder = target.folder
      if (prevFolder === "trash") {
        removePermanently(id)
        if (selectedId === id) backToList()
        toast.success("Deleted permanently")
        return
      }
      moveTo(id, "trash")
      if (selectedId === id) backToList()
      toast.success("Moved to Trash", {
        description: target.subject,
        action: { label: "Undo", onClick: () => moveTo(id, prevFolder) },
      })
    },
    [find, moveTo, removePermanently, backToList],
  )

  const handleReply = useCallback(
    (target: Email | null) => {
      if (!target) return
      openCompose({
        to: target.from.email,
        subject: target.subject.startsWith("Re:")
          ? target.subject
          : `Re: ${target.subject}`,
      })
    },
    [openCompose],
  )

  return {
    handleSelect,
    handleToggleStar,
    handleToggleRead,
    handleArchive,
    handleDelete,
    handleReply,
    backToList,
  }
}
