// ui/lib/types.ts
// Shared types for the UI

export type Folder = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash"

export type Email = {
  id: string
  from: {
    name: string
    email: string
    initials: string
    color: string
  }
  to: string
  subject: string
  preview: string
  body: string
  date: string // ISO
  read: boolean
  starred: boolean
  folder: Folder
  labels?: string[]
  hasAttachment?: boolean
}