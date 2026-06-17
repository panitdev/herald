"use client"

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Loader2, MessagesSquare, SendHorizontal, Users } from "lucide-react"
import type { ChatConversation, SyncChatMessage } from "@/lib/api"
import {
  conversationTitle,
  otherParticipants,
  participantAvatar,
} from "@/lib/chat"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Props = {
  conversation: ChatConversation | null
  messages: SyncChatMessage[]
  myUserId: string
  loading: boolean
  error?: string | null
  sending: boolean
  offline: boolean
  onBack: () => void
  onRetry: () => void
  onSend: (body: string) => void
}

export function ChatScreen({
  conversation,
  messages,
  myUserId,
  loading,
  error,
  sending,
  offline,
  onBack,
  onRetry,
  onSend,
}: Props) {
  if (!conversation) {
    return <EmptyChat />
  }

  const isGroup = conversation.kind === "group"
  const title = conversationTitle(conversation, myUserId)
  const others = otherParticipants(conversation, myUserId)
  const subtitle = isGroup
    ? `${conversation.participants.length} members`
    : (others[0]?.username ? `@${others[0].username}` : "Direct message")

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 md:px-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-foreground/90"
          style={{ backgroundColor: conversationHeaderColor(conversation, myUserId) }}
          aria-hidden
        >
          {isGroup ? <Users className="h-4 w-4" /> : initialsFor(title)}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <MessageThread
          messages={messages}
          myUserId={myUserId}
          isGroup={isGroup}
          conversation={conversation}
        />
      )}

      <Composer offline={offline} sending={sending} onSend={onSend} />
    </div>
  )
}

function MessageThread({
  messages,
  myUserId,
  isGroup,
  conversation,
}: {
  messages: SyncChatMessage[]
  myUserId: string
  isGroup: boolean
  conversation: ChatConversation
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const participantsById = useMemo(() => {
    const map = new Map<string, ChatConversation["participants"][number]>()
    for (const participant of conversation.participants) {
      map.set(participant.userId, participant)
    }
    return map
  }, [conversation.participants])

  // Pin to the newest message on open and whenever a message arrives.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length, conversation.id])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs text-muted-foreground">
          Send a message to start the conversation.
        </p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-6 md:px-6">
        {messages.map((message, index) => {
          const mine = String(message.sender_user_id) === myUserId
          const prev = messages[index - 1]
          const next = messages[index + 1]
          const startsRun = !prev || prev.sender_user_id !== message.sender_user_id
          const endsRun = !next || next.sender_user_id !== message.sender_user_id
          const sender = participantsById.get(String(message.sender_user_id))
          const senderName = sender?.displayName ?? "Unknown"

          return (
            <ChatBubble
              key={String(message.id)}
              body={message.body}
              createdAt={message.created_at}
              mine={mine}
              pending={isPending(message)}
              startsRun={startsRun}
              endsRun={endsRun}
              showName={isGroup && !mine && startsRun}
              senderName={senderName}
              avatar={
                isGroup && !mine && endsRun && sender
                  ? participantAvatar(sender)
                  : null
              }
              showAvatarSpacer={isGroup && !mine}
            />
          )
        })}
      </div>
    </div>
  )
}

function ChatBubble({
  body,
  createdAt,
  mine,
  pending,
  startsRun,
  endsRun,
  showName,
  senderName,
  avatar,
  showAvatarSpacer,
}: {
  body: string
  createdAt: string
  mine: boolean
  pending: boolean
  startsRun: boolean
  endsRun: boolean
  showName: boolean
  senderName: string
  avatar: { initials: string; color: string } | null
  showAvatarSpacer: boolean
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className={cn(
        "flex w-full items-end gap-2",
        mine ? "justify-end" : "justify-start",
        startsRun ? "mt-2" : "mt-0.5",
      )}
    >
      {showAvatarSpacer &&
        (avatar ? (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-foreground/90"
            style={{ backgroundColor: avatar.color }}
            aria-hidden
          >
            {avatar.initials}
          </div>
        ) : (
          <div className="h-7 w-7 shrink-0" aria-hidden />
        ))}

      <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        {showName && (
          <span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
            {senderName}
          </span>
        )}
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed",
            mine
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
            pending && "opacity-60",
            // Rounded corners with a subtle "tail" on the run's edge.
            "rounded-2xl",
            mine
              ? endsRun
                ? "rounded-br-md"
                : "rounded-br-2xl"
              : endsRun
                ? "rounded-bl-md"
                : "rounded-bl-2xl",
          )}
        >
          {body}
        </div>
        {endsRun && (
          <span className="mt-0.5 px-1 text-[10px] tabular-nums text-muted-foreground">
            {pending ? "Sending…" : formatTime(createdAt)}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function Composer({
  offline,
  sending,
  onSend,
}: {
  offline: boolean
  sending: boolean
  onSend: (body: string) => void
}) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow the textarea with its content, up to a few lines.
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`
  }, [value])

  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !offline && !sending

  const submit = () => {
    if (!canSend) return
    onSend(trimmed)
    setValue("")
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <div className="border-t border-border px-3 py-3 md:px-5">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex flex-1 items-end rounded-2xl border border-border bg-muted px-3 py-2 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={offline ? "You're offline" : "Write a message"}
            disabled={offline}
            aria-label="Write a message"
            className="max-h-[140px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <MessagesSquare className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-medium">No conversation selected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a conversation from the list to start chatting.
        </p>
      </div>
    </div>
  )
}

// Optimistic messages are inserted with a synthetic id before the server
// confirms them; see the messages route's send mutation.
function isPending(message: SyncChatMessage): boolean {
  return String(message.id).startsWith("optimistic-")
}

function initialsFor(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}

function conversationHeaderColor(
  conversation: ChatConversation,
  myUserId: string,
): string {
  const other = otherParticipants(conversation, myUserId)[0]
  return participantAvatar(
    other ?? {
      userId: conversation.id,
      username: "",
      displayName: conversation.title ?? "",
      avatarUrl: null,
      role: "member",
      joinedAt: conversation.createdAt,
      leftAt: null,
    },
  ).color
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
