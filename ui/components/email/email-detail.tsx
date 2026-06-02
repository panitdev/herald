"use client"

import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  Archive,
  Trash2,
  Star,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  MailOpen,
  Mail as MailIcon,
  Paperclip,
} from "lucide-react"
import type { Email } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatEmailDateLong } from "@/lib/email-utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SafeEmailBody } from "./safe-email-body"

type Props = {
  email: Email | null
  emailBody: string
  emailBodyFormat: "html" | "text"
  onBack: () => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onToggleStar: (id: string) => void
  onToggleRead: (id: string) => void
  onReply: () => void
}

export function EmailDetail({
  email,
  emailBody,
  emailBodyFormat,
  onBack,
  onArchive,
  onDelete,
  onToggleStar,
  onToggleRead,
  onReply,
}: Props) {
  return (
    <div className="relative h-full bg-background">
      <AnimatePresence initial={false}>
        {email ? (
          <motion.div
            key={email.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex h-full flex-col bg-background"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 md:px-5">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="md:hidden"
                  aria-label="Back to list"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <TooltipProvider delayDuration={300}>
                  <ToolbarButton
                    label="Archive"
                    onClick={() => onArchive(email.id)}
                    icon={<Archive className="h-4 w-4" />}
                  />
                  <ToolbarButton
                    label="Delete"
                    onClick={() => onDelete(email.id)}
                    icon={<Trash2 className="h-4 w-4" />}
                  />
                  <ToolbarButton
                    label={email.read ? "Mark as unread" : "Mark as read"}
                    onClick={() => onToggleRead(email.id)}
                    icon={
                      email.read ? (
                        <MailIcon className="h-4 w-4" />
                      ) : (
                        <MailOpen className="h-4 w-4" />
                      )
                    }
                  />
                  <ToolbarButton
                    label={email.starred ? "Unstar" : "Star"}
                    onClick={() => onToggleStar(email.id)}
                    icon={
                      <motion.span
                        animate={email.starred ? { scale: [1, 1.25, 1], rotate: [0, 15, 0] } : {}}
                        transition={{ duration: 0.35 }}
                        className="inline-flex"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            email.starred && "fill-amber-400 text-amber-400",
                          )}
                        />
                      </motion.span>
                    }
                  />
                </TooltipProvider>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Mute thread</DropdownMenuItem>
                  <DropdownMenuItem>Snooze</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Report spam</DropdownMenuItem>
                  <DropdownMenuItem>Block sender</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="mx-auto max-w-3xl px-5 py-6 md:px-8 md:py-8">
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="text-xl font-semibold tracking-tight text-balance md:text-2xl"
                >
                  {email.subject}
                </motion.h1>

                {email.labels && email.labels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {email.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-foreground"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="mt-6 flex items-start gap-3"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-foreground/90"
                    style={{ backgroundColor: email.from.color }}
                    aria-hidden
                  >
                    {email.from.initials}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold">{email.from.name}</span>
                        <span className="text-xs text-muted-foreground">
                          &lt;{email.from.email}&gt;
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatEmailDateLong(email.date)}
                      </span>
                    </div>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      to {email.to}
                    </span>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-6"
                >
                  <SafeEmailBody body={emailBody} format={emailBodyFormat} />
                </motion.div>

                {email.hasAttachment && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-8 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">roadmap-q3-draft.pdf</div>
                        <div className="text-xs text-muted-foreground">142 KB · PDF</div>
                      </div>
                      <Button size="sm" variant="outline">
                        Download
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Reply actions */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-8 flex flex-wrap gap-2"
                >
                  <Button variant="outline" size="sm" className="gap-2" onClick={onReply}>
                    <Reply className="h-4 w-4" /> Reply
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ReplyAll className="h-4 w-4" /> Reply all
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Forward className="h-4 w-4" /> Forward
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <MailIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-medium">No message selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Select a message from the list to read it here.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className="h-8 w-8"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
