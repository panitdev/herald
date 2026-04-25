"use client"

import { motion } from "motion/react"
import {
  Paperclip,
  Star,
  MailOpen,
  Mail as MailIcon,
  Archive,
  Trash2,
  Reply,
  CopyCheck,
  FolderInput,
  Forward,
} from "lucide-react"
import type { Email } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatEmailDate } from "@/lib/email-utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type Props = {
  email: Email
  selected: boolean
  onSelect: () => void
  onToggleStar: () => void
  onToggleRead: () => void
  onArchive: () => void
  onDelete: () => void
  onReply: () => void
}

export function EmailListItem({
  email,
  selected,
  onSelect,
  onToggleStar,
  onToggleRead,
  onArchive,
  onDelete,
  onReply,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.li
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className={cn(
            "group relative list-none transition-colors",
            "hover:bg-accent/60 data-[state=open]:bg-accent/80",
            selected && "bg-accent/80",
          )}
        >
          {/* Unread indicator bar */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full transition-all",
              email.read
                ? "bg-transparent"
                : selected
                  ? "bg-primary"
                  : "bg-primary/70",
            )}
          />

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
              style={{ backgroundColor: email.from.color }}
              aria-hidden
            >
              {email.from.initials}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1 pr-6">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    email.read
                      ? "font-normal text-foreground/80"
                      : "font-semibold text-foreground",
                  )}
                >
                  {email.from.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatEmailDate(email.date)}
                </span>
              </div>
              <div
                className={cn(
                  "truncate text-[13px]",
                  email.read
                    ? "text-muted-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {email.subject}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs text-muted-foreground">
                  {email.preview}
                </p>
              </div>
              {(email.hasAttachment || (email.labels && email.labels.length > 0)) && (
                <div className="mt-1 flex items-center gap-2">
                  {email.hasAttachment && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Paperclip className="h-3 w-3" aria-hidden />
                      attachment
                    </span>
                  )}
                  {email.labels?.map((l) => (
                    <span
                      key={l}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Star button (sibling, not nested) */}
          <button
            type="button"
            onClick={onToggleStar}
            aria-label={email.starred ? "Unstar email" : "Star email"}
            aria-pressed={email.starred}
            className={cn(
              "absolute right-3 top-3 rounded-md p-1 transition-opacity",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              email.starred && "opacity-100",
            )}
          >
            <motion.span
              animate={email.starred ? { scale: [1, 1.3, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="block"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  email.starred
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-hidden
              />
            </motion.span>
          </button>
        </motion.li>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <ContextMenuItem onSelect={onSelect}>
          <MailOpen className="h-4 w-4" />
          Open
          <ContextMenuShortcut>↵</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onReply}>
          <Reply className="h-4 w-4" />
          Reply
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            navigator.clipboard?.writeText(email.from.email).catch(() => {})
          }
        >
          <Forward className="h-4 w-4" />
          Copy sender
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onToggleRead}>
          {email.read ? (
            <>
              <MailIcon className="h-4 w-4" />
              Mark as unread
            </>
          ) : (
            <>
              <CopyCheck className="h-4 w-4" />
              Mark as read
            </>
          )}
          <ContextMenuShortcut>U</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggleStar}>
          <Star
            className={cn(
              "h-4 w-4",
              email.starred && "fill-amber-400 text-amber-400",
            )}
          />
          {email.starred ? "Remove star" : "Add star"}
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="h-4 w-4" />
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onSelect={onArchive}>
              <Archive className="h-4 w-4" />
              Archive
            </ContextMenuItem>
            <ContextMenuItem onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              Trash
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
