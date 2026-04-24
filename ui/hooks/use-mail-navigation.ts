"use client"

import { useEffect, useCallback, useState } from "react"
import {
  navigateToMail,
  navigateToMailbox,
  navigateToRoot,
  getMailIdFromUrl,
  getMailboxFromUrl,
} from "@/lib/mail-navigation"

export type Mailbox = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash"

export interface UseMailNavigationOptions {
  initialMailbox?: Mailbox
}

export interface UseMailNavigationReturn {
  selectedId: string | null
  mailbox: Mailbox
  setMailbox: (mailbox: Mailbox) => void
  setSelectedId: (id: string | null) => void
}

export function useMailNavigation(
  options: UseMailNavigationOptions = {},
): UseMailNavigationReturn {
  const { initialMailbox = "inbox" } = options

  const [selectedId, setSelectedIdState] = useState<string | null>(null)
  const [mailbox, setMailboxState] = useState<Mailbox>(initialMailbox)

  // Initialize from URL on mount (client-only)
  useEffect(() => {
    const id = getMailIdFromUrl()
    const box = getMailboxFromUrl() as Mailbox | null
    if (id) setSelectedIdState(id)
    if (box) setMailboxState(box)
  }, [])

  const setMailbox = useCallback((newMailbox: Mailbox) => {
    navigateToMailbox(newMailbox)
    setMailboxState(newMailbox)
  }, [])

  const setSelectedId = useCallback((id: string | null) => {
    if (id) {
      navigateToMail(id)
    } else {
      navigateToRoot()
    }
    setSelectedIdState(id)
  }, [])

  // Sync from browser back/forward
  useEffect(() => {
    const handlePopstate = () => {
      const id = getMailIdFromUrl()
      const box = getMailboxFromUrl() as Mailbox | null
      if (id) setSelectedIdState(id)
      if (box) setMailboxState(box)
    }

    window.addEventListener("popstate", handlePopstate)
    return () => window.removeEventListener("popstate", handlePopstate)
  }, [])

  return {
    selectedId,
    mailbox,
    setMailbox,
    setSelectedId,
  }
}