"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getMessages as apiGetMessages,
  markAsRead as apiMarkAsRead,
  type Message as ApiMessage,
  APIError,
} from "@/lib/api"
import type { Email, Folder } from "@/lib/types"

// Transform API message to Email type
function transformMessage(msg: ApiMessage, folder: Folder): Email {
  return {
    id: msg.id,
    from: {
      name: extractName(msg.from_addr),
      email: msg.from_addr,
      initials: extractInitials(msg.from_addr),
      color: pickColor(msg.from_addr),
    },
    to: "",
    subject: msg.subject || "(No subject)",
    preview: msg.preview || "",
    body: "", // Loaded separately on detail view
    date: msg.received_at,
    read: !!msg.read_at,
    starred: false,
    folder,
    labels: [],
    hasAttachment: false,
  }
}

function extractName(email: string): string {
  const name = email.split("@")[0]
  return name
    .split(/[._-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

function extractInitials(email: string): string {
  return extractName(email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function pickColor(email: string): string {
  const colors = [
    "oklch(0.75 0.12 30)",
    "oklch(0.72 0.14 200)",
    "oklch(0.78 0.13 90)",
    "oklch(0.74 0.15 330)",
    "oklch(0.7 0.16 258)",
    "oklch(0.76 0.12 150)",
    "oklch(0.73 0.14 60)",
  ]
  let h = 0
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) >>> 0
  }
  return colors[h % colors.length]
}

export interface UseMessagesReturn {
  emails: Email[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  markRead: (messageId: string) => Promise<void>
}

export function useMessages(mailboxId: string | null): UseMessagesReturn {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!mailboxId) {
      setEmails([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await apiGetMessages(mailboxId)
      // All messages from API go to inbox initially
      // Starred etc handled locally
      const transformed = data.messages.map((m) => transformMessage(m, "inbox"))
      transformed.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      setEmails(transformed)
    } catch (err) {
      if (err instanceof APIError) {
        // 401 "Not authenticated" is fine - user isn't logged in
        if (err.status === 401 && err.message === "Not authenticated") {
          setEmails([])
          return
        }
        setError(err.message)
      } else {
        setError("Failed to fetch messages")
      }
    } finally {
      setLoading(false)
    }
  }, [mailboxId])

  const markRead = useCallback(async (messageId: string) => {
    try {
      await apiMarkAsRead(messageId)
      setEmails((prev) =>
        prev.map((e) => (e.id === messageId ? { ...e, read: true } : e))
      )
    } catch (err) {
      // Silently fail - local state still works
      console.error("Failed to mark as read:", err)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return {
    emails,
    loading,
    error,
    fetch,
    markRead,
  }
}