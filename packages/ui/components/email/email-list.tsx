"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Inbox as InboxIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { Email, Folder } from "@/lib/types"
import { ListSearchHeader } from "@/components/list-search-header"
import { EmailListItem } from "./email-list-item"

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
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col bg-background">
      <ListSearchHeader
        title={t(`sidebar.folders.${folder}`)}
        annotation={
          folder === "inbox" && unreadCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("emailList.unread", { count: unreadCount })}
            </span>
          ) : null
        }
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={t("emailList.searchPlaceholder")}
        searchAriaLabel={t("emailList.searchAriaLabel")}
      />

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
  const { t } = useTranslation()
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
            ? t("emailList.empty.noResults")
            : folder === "trash"
              ? t("emailList.empty.trashEmpty")
              : folder === "drafts"
                ? t("emailList.empty.noDrafts")
                : t("emailList.empty.allCaughtUp")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasSearch
            ? t("emailList.empty.tryDifferentSearch")
            : t("emailList.empty.newMessagesHere")}
        </p>
      </div>
    </motion.div>
  )
}
