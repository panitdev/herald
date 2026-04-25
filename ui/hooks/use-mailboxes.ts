"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getMailboxes as apiGetMailboxes,
  createMailbox as apiCreateMailbox,
  deleteMailbox as apiDeleteMailbox,
  type Mailbox,
  APIError,
} from "@/lib/api"

export interface UseMailboxesReturn {
  mailboxes: Mailbox[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  create: (address: string) => Promise<Mailbox>
  remove: (id: string) => Promise<void>
}

export function useMailboxes(): UseMailboxesReturn {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetMailboxes()
      setMailboxes(data.mailboxes)
    } catch (err) {
      if (err instanceof APIError) {
        // 401 "Not authenticated" is fine - user isn't logged in
        // Don't show error, just use mock data
        if (err.status === 401 && err.message === "Not authenticated") {
          setMailboxes([])
          return
        }
        setError(err.message)
      } else {
        setError("Failed to fetch mailboxes")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (address: string): Promise<Mailbox> => {
    const mailbox = await apiCreateMailbox(address)
    setMailboxes((prev) => [mailbox.mailbox, ...prev])
    return mailbox.mailbox
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    await apiDeleteMailbox(id)
    setMailboxes((prev) => prev.filter((m) => m.id !== id))
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    fetch()
  }, [fetch])

  return {
    mailboxes,
    loading,
    error,
    fetch,
    create,
    remove,
  }
}