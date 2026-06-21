"use client"

import { motion } from "framer-motion"
import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { formatEmailDate } from "@/lib/email-utils"
import type { ConversationView } from "@/lib/chat"

type Props = {
  conversation: ConversationView
  selected: boolean
  onSelect: () => void
}

export function ConversationListItem({ conversation, selected, onSelect }: Props) {
  const { t } = useTranslation()
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 400, damping: 36 }}
      className={cn(
        "group relative list-none transition-colors",
        "hover:bg-accent/60",
        selected && "bg-accent/80",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect()
          }
        }}
        aria-current={selected ? "true" : undefined}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {/* Avatar */}
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-foreground/90"
          style={{ backgroundColor: conversation.color }}
          aria-hidden
        >
          {conversation.isGroup ? (
            <Users className="h-4 w-4" />
          ) : (
            conversation.initials
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {conversation.title}
            </span>
            {conversation.lastMessageAt && (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatEmailDate(conversation.lastMessageAt)}
              </span>
            )}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">
            {conversation.lastMessageBody || t("chat.list.noMessagesYet")}
          </p>
        </div>
      </div>
    </motion.li>
  )
}
