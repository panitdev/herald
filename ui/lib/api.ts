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

export interface SendMailInput {
  to: string
  subject: string
  body: string
  fromName?: string
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
// API fetch — session cookie is sent automatically via credentials: 'include'
// ============================================

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (response.status === 401) {
    throw new APIError(401, "Session expired")
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new APIError(response.status, (error as { error?: string }).error ?? "Request failed")
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

export async function sendMail(
  input: SendMailInput
): Promise<{ message: Message; delivery: { provider: string; providerMessageId: string | null } }> {
  return apiFetch<{ message: Message; delivery: { provider: string; providerMessageId: string | null } }>(
    "/api/messages/send",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
}

export async function getRawEmail(messageId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/messages/${messageId}/raw`, {
    credentials: "include",
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`Failed to fetch raw email: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return response.text()
}
