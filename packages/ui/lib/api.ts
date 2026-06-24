import { API_URL as API_BASE } from "@/lib/env"
import {
  OFFLINE_CACHE_VERSION,
  clearUserOfflineData,
  loadPersistedMessageBody,
  loadPersistedSyncState,
  persistMessageBody,
  persistSyncState,
  type PersistedSyncState,
} from "@/lib/offline-cache"

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

export interface MeResponse {
  id: string
  username: string
  address: string
  addresses: AddressResponse[]
  display_name: string
  avatar_url: string | null
}

export interface AddressResponse {
  id: string
  address: string
  created_at: string
}

export interface SyncMailbox {
  id: ApiId
  address_id: ApiId
  name: string
  is_system: boolean
  system_role: string | null
  sort_order: number
  created_at: string
}

export interface SyncMessage {
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

export interface SyncMessageRecipient {
  id: ApiId
  message_id: ApiId
  kind: "to" | "cc" | "bcc" | string
  address: string
  display_name: string | null
}

export interface SyncMessageMailbox {
  message_id: ApiId
  mailbox_id: ApiId
  relation: string
  created_at: string
}

export interface SyncAttachment {
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

export interface SyncConversation {
  id: ApiId
  kind: "direct" | "group" | string
  title: string | null
  direct_key: string | null
  created_by_user_id: ApiId
  created_at: string
  updated_at: string
}

export interface SyncConversationParticipant {
  conversation_id: ApiId
  user_id: ApiId
  role: string
  joined_at: string
  left_at: string | null
}

export interface SyncChatMessage {
  id: ApiId
  conversation_id: ApiId
  sender_user_id: ApiId
  body: string
  client_mutation_id: string | null
  created_at: string
}

export interface ChatParticipant {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  role: string
  joinedAt: string
  leftAt: string | null
}

export interface ChatConversation {
  id: string
  kind: "direct" | "group" | string
  title: string | null
  participants: ChatParticipant[]
  lastMessage: SyncChatMessage | null
  createdAt: string
  updatedAt: string
}

export type CreateChatConversationInput =
  | { kind: "direct"; user_id: string }
  | { kind: "group"; participant_user_ids: string[]; title?: string }

export interface SendChatMessageInput {
  body: string
  clientMutationId?: string
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
    conversations: SyncConversation[]
    conversationParticipants: SyncConversationParticipant[]
    chatMessages: SyncChatMessage[]
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
  | "conversation"
  | "conversationParticipant"
  | "chatMessage"
  | string

type SyncState = {
  schemaVersion: number
  cursor: string
  mailboxes: Map<string, SyncMailbox>
  messages: Map<string, SyncMessage>
  messageRecipients: Map<string, SyncMessageRecipient>
  messageMailboxes: Map<string, SyncMessageMailbox>
  attachments: Map<string, SyncAttachment>
  conversations: Map<string, SyncConversation>
  conversationParticipants: Map<string, SyncConversationParticipant>
  chatMessages: Map<string, SyncChatMessage>
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

let activeUserId: string | null = null
let cachedSyncUserId: string | null = null
let refreshQueued = false
let unauthorizedHandler: (() => void | Promise<void>) | null = null

export function setOfflineSyncUser(userId: string | null) {
  activeUserId = userId
  syncState = null
  syncPromise = null
  cachedSyncUserId = null
}

export function setUnauthorizedHandler(handler: (() => void | Promise<void>) | null) {
  unauthorizedHandler = handler
}

export async function hydrateSyncStateFromCache(userId: string): Promise<boolean> {
  const persisted = await loadPersistedSyncState(userId)
  if (!persisted) {
    syncState = null
    cachedSyncUserId = null
    return false
  }

  syncState = syncStateFromPersisted(persisted)
  cachedSyncUserId = userId
  return true
}

export async function clearOfflineMailCache(userId: string | null) {
  syncState = null
  syncPromise = null
  cachedSyncUserId = null
  if (userId) {
    await clearUserOfflineData(userId)
  }
}

export async function refreshSyncStateNow(): Promise<void> {
  if (!activeUserId || !syncState || typeof window === "undefined" || !window.navigator.onLine) {
    return
  }

  syncState = await pullSyncState(syncState)
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
    void unauthorizedHandler?.()
    throw new APIError(401, "Session expired")
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new APIError(response.status, (error as { error?: string }).error ?? "Request failed")
  }

  return parseJsonPreservingIds<T>(await response.text())
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me")
}

export function updateMe(input: {
  display_name?: string
  avatar_url?: string | null
}): Promise<MeResponse> {
  const body: { display_name?: string; avatar_url?: string | null } = {}

  if (input.display_name !== undefined) body.display_name = input.display_name
  if (input.avatar_url !== undefined) body.avatar_url = input.avatar_url

  return apiFetch<MeResponse>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function addAddress(input: {
  address: string
}): Promise<{ address: AddressResponse; addresses: AddressResponse[] }> {
  return apiFetch<{ address: AddressResponse; addresses: AddressResponse[] }>(
    "/api/me/addresses",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

async function apiText(path: string, options: RequestInit = {}): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  })

  if (response.status === 401) {
    void unauthorizedHandler?.()
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
    void unauthorizedHandler?.()
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
  if (syncState) {
    queueBackgroundRefresh()
    return syncState
  }

  if (activeUserId && cachedSyncUserId !== activeUserId) {
    await hydrateSyncStateFromCache(activeUserId)
  }

  if (syncState) {
    queueBackgroundRefresh()
    return syncState
  }

  syncPromise ??= bootstrapSyncState()

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
    conversations: new Map(),
    conversationParticipants: new Map(),
    chatMessages: new Map(),
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
  for (const conversation of response.objects.conversations) {
    state.conversations.set(idToString(conversation.id), conversation)
  }
  for (const participant of response.objects.conversationParticipants) {
    state.conversationParticipants.set(conversationParticipantKey(participant), participant)
  }
  for (const message of response.objects.chatMessages) {
    state.chatMessages.set(idToString(message.id), message)
  }

  await persistCurrentSyncState(state)
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

  await persistCurrentSyncState(state)
  return state
}

function queueBackgroundRefresh() {
  if (
    refreshQueued ||
    !syncState ||
    typeof window === "undefined" ||
    !window.navigator.onLine
  ) {
    return
  }

  refreshQueued = true
  queueMicrotask(async () => {
    refreshQueued = false
    const previousCursor = syncState?.cursor
    try {
      await refreshSyncStateNow()
      if (previousCursor !== syncState?.cursor) {
        window.dispatchEvent(new CustomEvent("herald-sync-updated"))
      }
    } catch {
      // Keep cached state visible when background refresh fails.
    }
  })
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
      return
    }
    case "conversation": {
      const conversation = change.data as SyncConversation
      state.conversations.set(idToString(conversation.id), conversation)
      return
    }
    case "conversationParticipant": {
      const participant = change.data as SyncConversationParticipant
      state.conversationParticipants.set(conversationParticipantKey(participant), participant)
      return
    }
    case "chatMessage": {
      const message = change.data as SyncChatMessage
      state.chatMessages.set(idToString(message.id), message)
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
      return
    case "conversation":
      state.conversations.delete(objectId)
      for (const [key, participant] of state.conversationParticipants) {
        if (idToString(participant.conversation_id) === objectId) {
          state.conversationParticipants.delete(key)
        }
      }
      for (const [key, message] of state.chatMessages) {
        if (idToString(message.conversation_id) === objectId) {
          state.chatMessages.delete(key)
        }
      }
      return
    case "conversationParticipant":
      if (isSyncConversationParticipant(change.data)) {
        state.conversationParticipants.delete(conversationParticipantKey(change.data))
      }
      return
    case "chatMessage":
      state.chatMessages.delete(objectId)
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

function conversationParticipantKey(participant: SyncConversationParticipant): string {
  return `${idToString(participant.conversation_id)}:${idToString(participant.user_id)}`
}

function isSyncConversationParticipant(value: unknown): value is SyncConversationParticipant {
  return (
    typeof value === "object" &&
    value !== null &&
    "conversation_id" in value &&
    "user_id" in value
  )
}

function idToString(id: ApiId): string {
  return String(id)
}

function parseJsonPreservingIds<T>(text: string): T {
  return JSON.parse(
    text.replace(
      /("(?:(?:[A-Za-z0-9_]+_)?id|[A-Za-z0-9]+Id|cursor|from|to|objectId|messageId|size)"\s*:\s*)(-?\d{16,})(?=[,}\]])/g,
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
  mailboxName: string
): Promise<{ messages: Message[] }> {
  const state = await getSyncedState()
  const mailboxIds = new Set(
    [...state.mailboxes.values()]
      .filter((mailbox) => normalizeMailboxName(mailbox) === mailboxName)
      .map((mailbox) => idToString(mailbox.id)),
  )
  const messagesById = new Map<string, Message>()

  for (const messageMailbox of state.messageMailboxes.values()) {
    const mailboxId = idToString(messageMailbox.mailbox_id)
    if (!mailboxIds.has(mailboxId)) continue

    const messageId = idToString(messageMailbox.message_id)
    if (messagesById.has(messageId)) continue

    const message = state.messages.get(messageId)
    if (message) {
      messagesById.set(messageId, toMessage(state, message, mailboxId))
    }
  }

  const messages = [...messagesById.values()].sort(
    (a, b) =>
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  )

  return { messages }
}

export async function getMessagesForMailbox(
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

export function getChatConversations(): Promise<{ conversations: ChatConversation[] }> {
  return apiFetch<{ conversations: ChatConversation[] }>("/chat/conversations")
}

export function createChatConversation(
  input: CreateChatConversationInput,
): Promise<{ conversation: ChatConversation }> {
  return apiFetch<{ conversation: ChatConversation }>("/chat/conversations", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getChatMessages(
  conversationId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ messages: SyncChatMessage[]; hasMore: boolean }> {
  const search = new URLSearchParams()
  if (options.before) search.set("before", options.before)
  if (options.limit !== undefined) search.set("limit", String(options.limit))
  const suffix = search.size > 0 ? `?${search}` : ""
  return apiFetch<{ messages: SyncChatMessage[]; hasMore: boolean }>(
    `/chat/conversations/${conversationId}/messages${suffix}`,
  )
}

export function sendChatMessage(
  conversationId: string,
  input: SendChatMessageInput,
): Promise<{ message: SyncChatMessage }> {
  return apiFetch<{ message: SyncChatMessage }>(
    `/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export interface UserSearchResult {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface ContactUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  addedAt: string
}

export function searchUsers(q: string): Promise<{ users: UserSearchResult[] }> {
  if (!q.trim()) return Promise.resolve({ users: [] })
  return apiFetch<{ users: UserSearchResult[] }>(
    `/api/users/search?q=${encodeURIComponent(q)}`,
  )
}

export function getContacts(): Promise<{ contacts: ContactUser[] }> {
  return apiFetch<{ contacts: ContactUser[] }>("/api/contacts")
}

export function addContact(userId: string): Promise<{ contact: ContactUser }> {
  return apiFetch<{ contact: ContactUser }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
}

export function removeContact(userId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/contacts/${userId}`, {
    method: "DELETE",
  })
}

export function connectRealtimeSync(): () => void {
  if (typeof window === "undefined") return () => {}

  let closed = false
  let retryTimer: number | null = null
  let retryMs = 500
  let socket: WebSocket | null = null

  const connect = () => {
    if (closed || !window.navigator.onLine) return

    const url = `${API_BASE.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/realtime`
    socket = new WebSocket(url)

    socket.onopen = () => {
      retryMs = 500
    }

    socket.onmessage = (event) => {
      const payload = parseRealtimeEvent(event.data)
      if (payload?.type !== "sync") return

      void refreshSyncStateNow()
        .then(() => {
          window.dispatchEvent(new CustomEvent("herald-sync-updated"))
        })
        .catch(() => {
          window.dispatchEvent(new CustomEvent("herald-sync-refresh-requested"))
        })
    }

    socket.onclose = () => {
      socket = null
      if (closed) return
      retryTimer = window.setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, 10000)
    }

    socket.onerror = () => {
      socket?.close()
    }
  }

  const onOnline = () => connect()
  window.addEventListener("online", onOnline)
  connect()

  return () => {
    closed = true
    window.removeEventListener("online", onOnline)
    if (retryTimer) window.clearTimeout(retryTimer)
    socket?.close()
  }
}

export async function getMessageBody(messageId: string): Promise<MessageBody> {
  try {
    const response = await apiFetch<{
      messageId: ApiId
      html: string
      text: string
      generatedFromRawSha256: string
    }>(`/objects/messages/${messageId}/body`)

    const body = response.html.trim()
      ? { format: "html" as const, body: response.html }
      : { format: "text" as const, body: response.text }

    if (activeUserId) {
      await persistMessageBody({
        cacheVersion: OFFLINE_CACHE_VERSION,
        userId: activeUserId,
        messageId,
        ...body,
        updatedAt: new Date().toISOString(),
      })
    }

    return body
  } catch (error) {
    if (activeUserId && isNetworkError(error)) {
      const cached = await loadPersistedMessageBody(activeUserId, messageId)
      if (cached) {
        return { format: cached.format, body: cached.body }
      }

      throw new APIError(503, "Message body is unavailable offline until opened once online")
    }

    throw error
  }
}

export async function getRawEmail(messageId: string): Promise<string> {
  return apiText(`/objects/messages/${messageId}/raw`)
}

export async function getRawEmailBlob(messageId: string): Promise<Blob> {
  return apiBlob(`/objects/messages/${messageId}/raw`)
}

function syncStateFromPersisted(persisted: PersistedSyncState): SyncState {
  return {
    schemaVersion: persisted.schemaVersion,
    cursor: persisted.cursor,
    mailboxes: new Map(
      persisted.mailboxes.map((mailbox) => [idToString((mailbox as SyncMailbox).id), mailbox as SyncMailbox]),
    ),
    messages: new Map(
      persisted.messages.map((message) => [idToString((message as SyncMessage).id), message as SyncMessage]),
    ),
    messageRecipients: new Map(
      persisted.messageRecipients.map((recipient) => [
        idToString((recipient as SyncMessageRecipient).id),
        recipient as SyncMessageRecipient,
      ]),
    ),
    messageMailboxes: new Map(
      persisted.messageMailboxes.map((entry) => {
        const messageMailbox = entry as SyncMessageMailbox
        return [messageMailboxKey(messageMailbox), messageMailbox]
      }),
    ),
    attachments: new Map(
      persisted.attachments.map((attachment) => [idToString((attachment as SyncAttachment).id), attachment as SyncAttachment]),
    ),
    conversations: new Map(
      (persisted.conversations ?? []).map((conversation) => [
        idToString((conversation as SyncConversation).id),
        conversation as SyncConversation,
      ]),
    ),
    conversationParticipants: new Map(
      (persisted.conversationParticipants ?? []).map((entry) => {
        const participant = entry as SyncConversationParticipant
        return [conversationParticipantKey(participant), participant]
      }),
    ),
    chatMessages: new Map(
      (persisted.chatMessages ?? []).map((message) => [
        idToString((message as SyncChatMessage).id),
        message as SyncChatMessage,
      ]),
    ),
  }
}

async function persistCurrentSyncState(state: SyncState): Promise<void> {
  if (!activeUserId) return

  await persistSyncState({
    cacheVersion: OFFLINE_CACHE_VERSION,
    userId: activeUserId,
    schemaVersion: state.schemaVersion,
    cursor: state.cursor,
    mailboxes: [...state.mailboxes.values()],
    messages: [...state.messages.values()],
    messageRecipients: [...state.messageRecipients.values()],
    messageMailboxes: [...state.messageMailboxes.values()],
    attachments: [...state.attachments.values()],
    conversations: [...state.conversations.values()],
    conversationParticipants: [...state.conversationParticipants.values()],
    chatMessages: [...state.chatMessages.values()],
    updatedAt: new Date().toISOString(),
  })
}

function isNetworkError(error: unknown): boolean {
  return !(error instanceof APIError)
}

function parseRealtimeEvent(value: unknown): { type: string } | null {
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && "type" in parsed
      ? (parsed as { type: string })
      : null
  } catch {
    return null
  }
}
