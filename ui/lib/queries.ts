import { queryOptions } from "@tanstack/react-query"
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
      // Dynamic import + explicit unwrap: Vite's production bundler wraps postal-mime
      // with __commonJS + __toESM(mod, 1).  The isNodeMode=1 flag causes __toESM to
      // set .default = the module namespace object instead of the PostalMime class,
      // so new PostalMime() throws "tf.default is not a constructor".  Importing
      // dynamically code-splits the module and makes the unwrap explicit and safe
      // whether .default is the class directly (ESM path) or the namespace (CJS path).
      const { default: PostalMimeExport } = await import("postal-mime")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PostalMime = typeof PostalMimeExport === "function"
        ? PostalMimeExport
        : (PostalMimeExport as any).default
      const parsed = await new PostalMime().parse(raw)
      const hasHtml =
        typeof parsed.html === "string" && parsed.html.trim().length > 0
      return {
        format: hasHtml ? "html" : "text",
        body: (hasHtml ? parsed.html : parsed.text) || "",
      }
    },
  })
