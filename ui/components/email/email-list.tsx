"use client"

import { AnimatePresence, motion } from "motion/react"
import { Search, Inbox as InboxIcon } from "lucide-react"
import type { Email, Folder } from "@/lib/types"
import { EmailListItem } from "./email-list-item"
import { Input } from "@/components/ui/input"

const FOLDER_LABEL: Record<Folder, string> = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
}

type Props = {
  folder: Folder
  emails: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleStar: (id: string) => void
  onToggleRead: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onReply: (id: string) => void
  search: string
  onSearchChange: (v: string) => void
  unreadCount: number
}

export function EmailList({
  folder,
  emails,
  selectedId,
  onSelect,
  onToggleStar,
  onToggleRead,
  onArchive,
  onDelete,
  onReply,
  search,
  onSearchChange,
  unreadCount,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{FOLDER_LABEL[folder]}</h2>
          {folder === "inbox" && unreadCount > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search mail"
            className="h-9 rounded-lg border-0 bg-muted pl-9 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Search mail"
          />
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto scrollbar-thin">
        {emails.length === 0 ? (
          <EmptyState folder={folder} hasSearch={!!search} />
        ) : (
          <ul className="divide-y divide-border/60">
            <AnimatePresence initial={false} mode="popLayout">
              {emails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  selected={selectedId === email.id}
                  onSelect={() => onSelect(email.id)}
                  onToggleStar={() => onToggleStar(email.id)}
                  onToggleRead={() => onToggleRead(email.id)}
                  onArchive={() => onArchive(email.id)}
                  onDelete={() => onDelete(email.id)}
                  onReply={() => onReply(email.id)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function EmptyState({ folder, hasSearch }: { folder: Folder; hasSearch: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <InboxIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium">
          {hasSearch
            ? "No results"
            : folder === "trash"
              ? "Trash is empty"
              : folder === "drafts"
                ? "No drafts"
                : "You're all caught up"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasSearch
            ? "Try a different search term."
            : "New messages will appear here."}
        </p>
      </div>
    </motion.div>
  )
}
