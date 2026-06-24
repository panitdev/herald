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

// ─── Drop types ───────────────────────────────────────────────────────────────

export type TextDropItem = {
  type: "text"
  content: string
}

export type LinkDropItem = {
  type: "link"
  url: string
}

export type FileDropItem = {
  type: "file"
  name: string
  mimeType: string
  size: number
  dataUrl: string
}

export type ImageDropItem = {
  type: "image"
  name: string
  mimeType: string
  size: number
  dataUrl: string
}

export type DropItem = TextDropItem | LinkDropItem | FileDropItem | ImageDropItem

export type Drop = {
  id: string
  createdAt: string // ISO
  updatedAt: string // ISO
  title?: string
  items: DropItem[]
}