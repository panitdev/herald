"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { Minus, X, Send, Paperclip, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  onSend: (data: { to: string; subject: string; body: string }) => Promise<void> | void
  initialTo?: string
  initialSubject?: string
  offline?: boolean
}

export function ComposePanel({
  open,
  onClose,
  onSend,
  initialTo = "",
  initialSubject = "",
  offline = false,
}: Props) {
  const [minimized, setMinimized] = useState(false)
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const toRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

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

  const canSend = to.trim().length > 0 && subject.trim().length > 0 && !sending && !offline

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label={t("compose.ariaLabel")}
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
              {subject.trim() || t("compose.newMessage")}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setMinimized((m) => !m)}
                className="rounded-md p-1.5 text-background/80 transition-colors hover:bg-background/10 hover:text-background"
                aria-label={minimized ? t("compose.expand") : t("compose.minimize")}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-background/80 transition-colors hover:bg-background/10 hover:text-background"
                aria-label={t("compose.close")}
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
                    {t("compose.to")}
                  </label>
                  <input
                    id="compose-to"
                    ref={toRef}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder={t("compose.toPlaceholder")}
                    autoComplete="email"
                    className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors focus-within:border-primary/40">
                  <label htmlFor="compose-subject" className="shrink-0 text-xs text-muted-foreground">
                    {t("compose.subject")}
                  </label>
                  <input
                    id="compose-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t("compose.subjectPlaceholder")}
                    className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("compose.bodyPlaceholder")}
                  rows={8}
                  className="min-h-[180px] w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
                />
                {offline ? (
                  <div className="border-t border-border bg-amber-100/60 px-4 py-2 text-sm text-amber-950">
                    {t("compose.offline")}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("compose.attachFile")}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("compose.discard")}
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
                    loadingText={t("compose.sending")}
                    animateWidth
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t("compose.send")}
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
