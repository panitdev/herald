"use client"

import { useCallback, useState } from "react"
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

  // No SSR - can read synchronously since component only mounts on client
  const [selectedId, setSelectedIdState] = useState<string | null>(getMailIdFromUrl)
  const [mailbox, setMailboxState] = useState<Mailbox>(() => {
    const box = getMailboxFromUrl()
    return (box && ["inbox", "sent", "drafts", "starred", "archive", "trash"].includes(box))
      ? box as Mailbox
      : initialMailbox
  })

  const setMailbox = useCallback((newMailbox: Mailbox) => {
    navigateToMailbox(newMailbox)
    setMailboxState(newMailbox)
  }, [])

  const setSelectedId = useCallback((id: string | null) => {
    if (id) navigateToMail(id)
    else navigateToRoot()
    setSelectedIdState(id)
  }, [])

  return {
    selectedId,
    mailbox,
    setMailbox,
    setSelectedId,
  }
}