"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { Minus, X, Send, Paperclip, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  onSend: (data: { to: string; subject: string; body: string }) => Promise<void> | void
  initialTo?: string
  initialSubject?: string
}

export function ComposePanel({
  open,
  onClose,
  onSend,
  initialTo = "",
  initialSubject = "",
}: Props) {
  const [minimized, setMinimized] = useState(false)
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const toRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTo(initialTo)
      setSubject(initialSubject)
      setBody("")
      setMinimized(false)
      // focus the first empty field
      setTimeout(() => {
        if (!initialTo) toRef.current?.focus()
      }, 200)
    }
  }, [open, initialTo, initialSubject])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        void handleSend()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, to, subject, body])

  async function handleSend() {
    if (sending) return
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    try {
      await onSend({ to, subject, body })
    } finally {
      setSending(false)
    }
  }

  const canSend = to.trim().length > 0 && subject.trim().length > 0 && !sending

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Compose new message"
          aria-modal="false"
          initial={{ y: 32, opacity: 0, scale: 0.98 }}
          animate={{
            y: 0,
            opacity: 1,
            scale: 1,
            height: minimized ? 48 : "auto",
          }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-card shadow-2xl",
            "bottom-0 right-0 left-0 mx-auto w-full max-w-full",
            "sm:right-6 sm:left-auto sm:mx-0 sm:w-[520px] sm:rounded-xl sm:border-b",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 bg-foreground px-4 py-2 text-background">
            <span className="truncate text-sm font-medium">
              {subject.trim() || "New message"}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setMinimized((m) => !m)}
                className="rounded-md p-1.5 text-background/80 transition-colors hover:bg-background/10 hover:text-background"
                aria-label={minimized ? "Expand" : "Minimize"}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-background/80 transition-colors hover:bg-background/10 hover:text-background"
                aria-label="Close compose"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!minimized && (
              <motion.div
                key="body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors focus-within:border-primary/40">
                  <label htmlFor="compose-to" className="shrink-0 text-xs text-muted-foreground">
                    To
                  </label>
                  <input
                    id="compose-to"
                    ref={toRef}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="recipient@example.com"
                    autoComplete="email"
                    className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors focus-within:border-primary/40">
                  <label htmlFor="compose-subject" className="shrink-0 text-xs text-muted-foreground">
                    Subject
                  </label>
                  <input
                    id="compose-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What's this about?"
                    className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message…"
                  rows={8}
                  className="min-h-[180px] w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Attach file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Discard"
                      onClick={onClose}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="gap-2"
                    size="sm"
                    loading={sending}
                    loadingText="Sending"
                    animateWidth
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
