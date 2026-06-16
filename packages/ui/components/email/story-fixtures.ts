import type { Email, Folder } from "@/lib/types"

export const inboxEmail: Email = {
  id: "msg-001",
  from: {
    name: "Mina Park",
    email: "mina@atlas.example",
    initials: "MP",
    color: "oklch(0.82 0.08 182)",
  },
  to: "you@panit.dev",
  subject: "Updated launch checklist",
  preview: "I folded in the API review notes and marked the remaining owner decisions.",
  body: [
    "Hi,",
    "",
    "I folded in the API review notes and marked the remaining owner decisions.",
    "The deployment checklist is ready for a final pass before Friday.",
    "",
    "Mina",
  ].join("\n"),
  date: "2026-06-16T09:24:00.000Z",
  read: false,
  starred: true,
  folder: "inbox",
  labels: ["work", "launch"],
  hasAttachment: true,
}

export const readEmail: Email = {
  id: "msg-002",
  from: {
    name: "Noah Chen",
    email: "noah@northwind.example",
    initials: "NC",
    color: "oklch(0.88 0.07 78)",
  },
  to: "you@panit.dev",
  subject: "Receipts for June billing",
  preview: "Attached the invoices and receipts for the account reconciliation.",
  body: [
    "Attached the invoices and receipts for the account reconciliation.",
    "",
    "Let me know if finance needs the export in another format.",
  ].join("\n"),
  date: "2026-06-15T17:02:00.000Z",
  read: true,
  starred: false,
  folder: "inbox",
  labels: ["finance"],
  hasAttachment: true,
}

export const draftEmail: Email = {
  id: "msg-003",
  from: {
    name: "Ada Stone",
    email: "ada@field.example",
    initials: "AS",
    color: "oklch(0.84 0.08 315)",
  },
  to: "you@panit.dev",
  subject: "Field report follow-up",
  preview: "The second pass is much clearer. I left two comments on the notes.",
  body: "The second pass is much clearer. I left two comments on the notes.",
  date: "2026-06-14T11:40:00.000Z",
  read: true,
  starred: true,
  folder: "drafts",
}

export const emails: Email[] = [inboxEmail, readEmail, draftEmail]

export const folderCounts: Record<Folder, number> = {
  inbox: 8,
  starred: 3,
  sent: 12,
  drafts: 2,
  archive: 41,
  trash: 1,
}

export const noop = () => {}
