import { queryOptions } from "@tanstack/react-query"
import * as api from "@/lib/api"
import type { MessageBody } from "@/lib/api"

export const mailboxesQuery = () =>
  queryOptions({
    queryKey: ["mailboxes"] as const,
    queryFn: () => api.getMailboxes().then((r) => r.mailboxes),
  })

export const messagesQuery = (mailbox: string | null) =>
  queryOptions({
    queryKey: ["messages", mailbox] as const,
    queryFn: () =>
      mailbox
        ? api.getMessages(mailbox).then((r) => r.messages)
        : Promise.resolve([]),
  })

export const messageBodyQuery = (messageId: string) =>
  queryOptions({
    queryKey: ["messageBody", messageId] as const,
    queryFn: (): Promise<MessageBody> => api.getMessageBody(messageId),
  })

export const chatConversationsQuery = () =>
  queryOptions({
    queryKey: ["chatConversations"] as const,
    queryFn: () => api.getChatConversations().then((r) => r.conversations),
  })

export const chatMessagesQuery = (conversationId: string | null) =>
  queryOptions({
    queryKey: ["chatMessages", conversationId] as const,
    // The API returns newest-first; the thread renders oldest-first (newest at
    // the bottom), and optimistic sends append to the end.
    queryFn: () =>
      conversationId
        ? api.getChatMessages(conversationId).then((r) => [...r.messages].reverse())
        : Promise.resolve([]),
    enabled: conversationId != null,
  })
