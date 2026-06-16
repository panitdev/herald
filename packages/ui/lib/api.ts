import { API_URL as API_BASE } from "@/lib/env"

// ============================================
// Types
// ============================================

type ApiId = number | string

export interface Mailbox {
  id: string
  name: string
  is_system: number
  system_role: string | null
  sort_order: number
  created_at: string
}

export interface Message {
  id: string
  thread_id: string | null
  from_addr: string
  from_name: string | null
  subject: string
  preview: string
  mailbox_id: string
  received_at: string
  read_at: string | null
  has_attachments: boolean
  to: string
}

export interface SendMailInput {
  to: string
  subject: string
  body: string
  fromName?: string
}

export interface MessageBody {
  format: "html" | "text"
  body: string
}

interface SyncMailbox {
  id: ApiId
  user_id: ApiId
  name: string
  is_system: boolean
  system_role: string | null
  sort_order: number
  created_at: string
}

interface SyncMessage {
  id: ApiId
  raw_inbound_mail_id: ApiId
  message_id_header: string | null
  thread_id: string | null
  from_addr: string | null
  from_name: string | null
  subject: string | null
  preview: string | null
  received_at: string
  created_at: string
}

interface SyncMessageRecipient {
  id: ApiId
  message_id: ApiId
  kind: "to" | "cc" | "bcc" | string
  address: string
  display_name: string | null
}

interface SyncMessageMailbox {
  message_id: ApiId
  mailbox_id: ApiId
  relation: string
  created_at: string
}

interface SyncAttachment {
  id: ApiId
  message_id: ApiId
  filename: string | null
  content_type: string | null
  size: ApiId | null
  content_id: string | null
  inline: boolean
  blob_key: string | null
  created_at: string
}

interface BootstrapResponse {
  schemaVersion: number
  cursor: ApiId
  objects: {
    mailboxes: SyncMailbox[]
    messages: SyncMessage[]
    messageRecipients: SyncMessageRecipient[]
    messageMailboxes: SyncMessageMailbox[]
    attachments: SyncAttachment[]
  }
}

interface PullResponse {
  from: ApiId
  to: ApiId
  changes: PullChange[]
  hasMore: boolean
}

interface PullChange {
  id: ApiId
  op: "upsert" | "delete" | string
  objectType: SyncObjectType
  objectId: ApiId
  data: unknown
}

type SyncObjectType =
  | "mailbox"
  | "message"
  | "messageRecipient"
  | "messageMailbox"
  | "attachment"
  | string

type SyncState = {
  schemaVersion: number
  cursor: string
  mailboxes: Map<string, SyncMailbox>
  messages: Map<string, SyncMessage>
  messageRecipients: Map<string, SyncMessageRecipient>
  messageMailboxes: Map<string, SyncMessageMailbox>
  attachments: Map<string, SyncAttachment>
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

  return parseJsonPreservingIds<T>(await response.text())
}

async function apiText(path: string, options: RequestInit = {}): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  })

  if (response.status === 401) {
    throw new APIError(401, "Session expired")
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new APIError(
      response.status,
      errorText || `${response.status} ${response.statusText}`,
    )
  }

  return response.text()
}

async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  })

  if (response.status === 401) {
    throw new APIError(401, "Session expired")
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new APIError(
      response.status,
      errorText || `${response.status} ${response.statusText}`,
    )
  }

  return response.blob()
}

// ============================================
// Sync state
// ============================================

let syncState: SyncState | null = null
let syncPromise: Promise<SyncState> | null = null

async function getSyncedState(): Promise<SyncState> {
  syncPromise ??= syncState ? pullSyncState(syncState) : bootstrapSyncState()

  try {
    syncState = await syncPromise
    return syncState
  } finally {
    syncPromise = null
  }
}

async function bootstrapSyncState(): Promise<SyncState> {
  const response = await apiFetch<BootstrapResponse>("/sync/bootstrap", {
    method: "POST",
  })

  const state: SyncState = {
    schemaVersion: response.schemaVersion,
    cursor: idToString(response.cursor),
    mailboxes: new Map(),
    messages: new Map(),
    messageRecipients: new Map(),
    messageMailboxes: new Map(),
    attachments: new Map(),
  }

  for (const mailbox of response.objects.mailboxes) {
    state.mailboxes.set(idToString(mailbox.id), mailbox)
  }
  for (const message of response.objects.messages) {
    state.messages.set(idToString(message.id), message)
  }
  for (const recipient of response.objects.messageRecipients) {
    state.messageRecipients.set(idToString(recipient.id), recipient)
  }
  for (const messageMailbox of response.objects.messageMailboxes) {
    state.messageMailboxes.set(messageMailboxKey(messageMailbox), messageMailbox)
  }
  for (const attachment of response.objects.attachments) {
    state.attachments.set(idToString(attachment.id), attachment)
  }

  return state
}

async function pullSyncState(state: SyncState): Promise<SyncState> {
  let hasMore = true

  while (hasMore) {
    const response = await apiFetch<PullResponse>(
      `/sync/pull?cursor=${encodeURIComponent(state.cursor)}`,
    )

    for (const change of response.changes) {
      applySyncChange(state, change)
    }

    state.cursor = idToString(response.to)
    hasMore = response.hasMore
  }

  return state
}

function applySyncChange(state: SyncState, change: PullChange) {
  if (change.op === "delete") {
    deleteSyncObject(state, change)
    return
  }

  if (change.op !== "upsert" || change.data == null) return

  switch (change.objectType) {
    case "mailbox": {
      const mailbox = change.data as SyncMailbox
      state.mailboxes.set(idToString(mailbox.id), mailbox)
      return
    }
    case "message": {
      const message = change.data as SyncMessage
      state.messages.set(idToString(message.id), message)
      return
    }
    case "messageRecipient": {
      const recipient = change.data as SyncMessageRecipient
      state.messageRecipients.set(idToString(recipient.id), recipient)
      return
    }
    case "messageMailbox": {
      const messageMailbox = change.data as SyncMessageMailbox
      state.messageMailboxes.set(messageMailboxKey(messageMailbox), messageMailbox)
      return
    }
    case "attachment": {
      const attachment = change.data as SyncAttachment
      state.attachments.set(idToString(attachment.id), attachment)
    }
  }
}

function deleteSyncObject(state: SyncState, change: PullChange) {
  const objectId = idToString(change.objectId)

  switch (change.objectType) {
    case "mailbox":
      state.mailboxes.delete(objectId)
      return
    case "message":
      state.messages.delete(objectId)
      for (const [key, recipient] of state.messageRecipients) {
        if (idToString(recipient.message_id) === objectId) {
          state.messageRecipients.delete(key)
        }
      }
      for (const [key, messageMailbox] of state.messageMailboxes) {
        if (idToString(messageMailbox.message_id) === objectId) {
          state.messageMailboxes.delete(key)
        }
      }
      for (const [key, attachment] of state.attachments) {
        if (idToString(attachment.message_id) === objectId) {
          state.attachments.delete(key)
        }
      }
      return
    case "messageRecipient":
      state.messageRecipients.delete(objectId)
      return
    case "messageMailbox":
      if (isSyncMessageMailbox(change.data)) {
        state.messageMailboxes.delete(messageMailboxKey(change.data))
        return
      }
      for (const [key, messageMailbox] of state.messageMailboxes) {
        if (idToString(messageMailbox.message_id) === objectId) {
          state.messageMailboxes.delete(key)
        }
      }
      return
    case "attachment":
      state.attachments.delete(objectId)
  }
}

function isSyncMessageMailbox(value: unknown): value is SyncMessageMailbox {
  return (
    typeof value === "object" &&
    value !== null &&
    "message_id" in value &&
    "mailbox_id" in value
  )
}

function messageMailboxKey(messageMailbox: SyncMessageMailbox): string {
  return `${idToString(messageMailbox.message_id)}:${idToString(messageMailbox.mailbox_id)}`
}

function idToString(id: ApiId): string {
  return String(id)
}

function parseJsonPreservingIds<T>(text: string): T {
  return JSON.parse(
    text.replace(
      /("(?:(?:raw_inbound_mail_|message_|mailbox_|user_)?id|cursor|from|to|objectId|messageId|size)"\s*:\s*)(-?\d{16,})(?=[,}\]])/g,
      '$1"$2"',
    ),
  ) as T
}

function normalizeMailboxName(mailbox: SyncMailbox): string {
  return mailbox.system_role ?? mailbox.name.toLowerCase()
}

function formatRecipient(recipient: SyncMessageRecipient): string {
  return recipient.display_name
    ? `${recipient.display_name} <${recipient.address}>`
    : recipient.address
}

function toMailbox(mailbox: SyncMailbox): Mailbox {
  return {
    id: idToString(mailbox.id),
    name: normalizeMailboxName(mailbox),
    is_system: mailbox.is_system ? 1 : 0,
    system_role: mailbox.system_role,
    sort_order: mailbox.sort_order,
    created_at: mailbox.created_at,
  }
}

function toMessage(state: SyncState, message: SyncMessage, mailboxId: string): Message {
  const messageId = idToString(message.id)
  const recipients = [...state.messageRecipients.values()].filter(
    (recipient) => idToString(recipient.message_id) === messageId,
  )
  const to = recipients
    .filter((recipient) => recipient.kind === "to")
    .map(formatRecipient)
    .join(", ")
  const hasAttachments = [...state.attachments.values()].some(
    (attachment) => idToString(attachment.message_id) === messageId,
  )

  return {
    id: messageId,
    thread_id: message.thread_id,
    from_addr: message.from_addr ?? "",
    from_name: message.from_name,
    subject: message.subject ?? "",
    preview: message.preview ?? "",
    mailbox_id: mailboxId,
    received_at: message.received_at,
    read_at: null,
    has_attachments: hasAttachments,
    to,
  }
}

// ============================================
// API methods
// ============================================

export async function getMailboxes(): Promise<{ mailboxes: Mailbox[] }> {
  const state = await getSyncedState()
  const mailboxes = [...state.mailboxes.values()]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map(toMailbox)

  return { mailboxes }
}

export async function getMailbox(id: string): Promise<{ mailbox: Mailbox }> {
  const state = await getSyncedState()
  const mailbox = state.mailboxes.get(id)
  if (!mailbox) throw new APIError(404, "Mailbox not found")
  return { mailbox: toMailbox(mailbox) }
}

export async function createMailbox(
  name: string
): Promise<{ mailbox: Mailbox }> {
  void name
  throw new APIError(501, "Creating mailboxes is not supported by this API yet")
}

export async function deleteMailbox(id: string): Promise<{ ok: boolean }> {
  void id
  throw new APIError(501, "Deleting mailboxes is not supported by this API yet")
}

export async function getMessages(
  mailboxId: string
): Promise<{ messages: Message[] }> {
  const state = await getSyncedState()
  const messages = [...state.messageMailboxes.values()]
    .filter((messageMailbox) => idToString(messageMailbox.mailbox_id) === mailboxId)
    .map((messageMailbox) => {
      const messageId = idToString(messageMailbox.message_id)
      const message = state.messages.get(messageId)
      return message ? toMessage(state, message, mailboxId) : null
    })
    .filter((message): message is Message => message !== null)
    .sort(
      (a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
    )

  return { messages }
}

export async function getMessage(id: string): Promise<{ message: Message }> {
  const state = await getSyncedState()
  const message = state.messages.get(id)
  if (!message) throw new APIError(404, "Message not found")

  const messageMailbox = [...state.messageMailboxes.values()].find(
    (entry) => idToString(entry.message_id) === id,
  )

  return {
    message: toMessage(state, message, messageMailbox ? idToString(messageMailbox.mailbox_id) : ""),
  }
}

export async function markAsRead(messageId: string): Promise<{ ok: boolean }> {
  void messageId
  return { ok: true }
}

export async function sendMail(
  input: SendMailInput
): Promise<{ message: Message; delivery: { provider: string; providerMessageId: string | null } }> {
  void input
  throw new APIError(501, "Sending mail is not supported by this API yet")
}

export async function getMessageBody(messageId: string): Promise<MessageBody> {
  const response = await apiFetch<{
    messageId: ApiId
    html: string
    text: string
    generatedFromRawSha256: string
  }>(`/objects/messages/${messageId}/body`)

  if (response.html.trim()) {
    return { format: "html", body: response.html }
  }

  return { format: "text", body: response.text }
}

export async function getRawEmail(messageId: string): Promise<string> {
  return apiText(`/objects/messages/${messageId}/raw`)
}

export async function getRawEmailBlob(messageId: string): Promise<Blob> {
  return apiBlob(`/objects/messages/${messageId}/raw`)
}
