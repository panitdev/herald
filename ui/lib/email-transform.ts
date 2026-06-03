// Transforms backend API messages into the UI's Email shape.
// Salvaged from the old hooks/use-messages.ts.
import type { Message as ApiMessage } from "@/lib/api"
import type { Email, Folder } from "@/lib/types"

export function transformMessage(msg: ApiMessage, folder: Folder): Email {
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
    body: "", // Loaded separately on the detail view
    date: msg.received_at,
    read: !!msg.read_at,
    starred: false,
    folder,
    labels: [],
    hasAttachment: false,
  }
}

export function extractName(email: string): string {
  const name = email.split("@")[0]
  return name
    .split(/[._-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

export function extractInitials(email: string): string {
  return extractName(email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function pickColor(email: string): string {
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
