// ui/lib/api.ts
// API client for Herald backend
// Uses AuthContext from auth-store.tsx for authentication

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.herald.panit.dev"

// ============================================
// Types
// ============================================

export interface Mailbox {
  id: string
  name: string
  is_system: number
  created_at: string
}

export interface Message {
  id: string
  thread_id: string | null
  from_addr: string
  subject: string
  preview: string
  mailbox_id: string
  received_at: string
  read_at: string | null
}

// ============================================
// Custom error
// ============================================

export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "APIError"
  }
}

// ============================================
// API fetch - works both with and without auth (for SSR)
// ============================================

let authToken: string | null = null

// Hook to set auth token from auth context
export function setAuthToken(token: string | null) {
  authToken = token
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  }

  if (authToken) {
    ; (headers as Record<string, string>)["Authorization"] = `Bearer ${authToken}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  // Handle 401 - try refresh (would need refresh token)
  if (response.status === 401) {
    throw new APIError(401, "Session expired")
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new APIError(response.status, error.error || "Request failed")
  }

  return response.json()
}

// ============================================
// API methods
// ============================================

export async function getMailboxes(): Promise<{ mailboxes: Mailbox[] }> {
  return apiFetch<{ mailboxes: Mailbox[] }>("/api/mailboxes")
}

export async function getMailbox(id: string): Promise<{ mailbox: Mailbox }> {
  return apiFetch<{ mailbox: Mailbox }>(`/api/mailboxes/${id}`)
}

export async function createMailbox(
  name: string
): Promise<{ mailbox: Mailbox }> {
  return apiFetch<{ mailbox: Mailbox }>("/api/mailboxes", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function deleteMailbox(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/mailboxes/${id}`, {
    method: "DELETE",
  })
}

export async function getMessages(
  mailboxId: string
): Promise<{ messages: Message[] }> {
  return apiFetch<{ messages: Message[] }>(
    `/api/messages?mailboxId=${encodeURIComponent(mailboxId)}`
  )
}

export async function getMessage(id: string): Promise<{ message: Message }> {
  return apiFetch<{ message: Message }>(`/api/messages/${id}`)
}

export async function markAsRead(messageId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/messages/${messageId}/read`, {
    method: "POST",
  })
}

export async function getRawEmail(messageId: string): Promise<string> {
  // Don't use apiFetch - it tries to parse as JSON
  // The /raw endpoint returns message/rfc822 content
  const headers: Record<string, string> = {}
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }

  const response = await fetch(`${API_BASE}/api/messages/${messageId}/raw`, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`Failed to fetch raw email: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return response.text()
}
