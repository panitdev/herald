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
