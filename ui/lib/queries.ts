import { queryOptions } from "@tanstack/react-query"
import PostalMime from "postal-mime"
import * as api from "@/lib/api"

export const mailboxesQuery = () =>
  queryOptions({
    queryKey: ["mailboxes"] as const,
    queryFn: () => api.getMailboxes().then((r) => r.mailboxes),
  })

export const messagesQuery = (mailboxId: string | null) =>
  queryOptions({
    queryKey: ["messages", mailboxId] as const,
    queryFn: () =>
      mailboxId
        ? api.getMessages(mailboxId).then((r) => r.messages)
        : Promise.resolve([]),
  })

export type MessageBody = { format: "html" | "text"; body: string }

export const messageBodyQuery = (messageId: string) =>
  queryOptions({
    queryKey: ["messageBody", messageId] as const,
    queryFn: async (): Promise<MessageBody> => {
      const raw = await api.getRawEmail(messageId)
      if (!raw) return { format: "text", body: "" }
      const parsed = await new PostalMime().parse(raw)
      const hasHtml =
        typeof parsed.html === "string" && parsed.html.trim().length > 0
      return {
        format: hasHtml ? "html" : "text",
        body: (hasHtml ? parsed.html : parsed.text) || "",
      }
    },
  })
