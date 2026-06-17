"use client"

import { AnimatePresence, motion } from "framer-motion"
import { MessagesSquare } from "lucide-react"
import { ListSearchHeader } from "@/components/list-search-header"
import type { ConversationView } from "@/lib/chat"
import { ConversationListItem } from "./conversation-list-item"

type Props = {
  conversations: ConversationView[]
  selectedId: string | null
  onSelect: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-background">
      <ListSearchHeader
        title="Messages"
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search messages"
        searchAriaLabel="Search messages"
      />

      <div className="relative flex-1 overflow-y-auto scrollbar-thin">
        {conversations.length === 0 ? (
          <EmptyState hasSearch={!!search} />
        ) : (
          <ul className="divide-y divide-border/60">
            <AnimatePresence initial={false} mode="popLayout">
              {conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={selectedId === conversation.id}
                  onSelect={() => onSelect(conversation.id)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessagesSquare className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium">
          {hasSearch ? "No results" : "No conversations yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasSearch
            ? "Try a different search term."
            : "Conversations you join will appear here."}
        </p>
      </div>
    </motion.div>
  )
}
