import { useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"

import { EmailDetail } from "@/components/email/email-detail"
import { messageBodyQuery } from "@/lib/queries"
import { useMailboxCtx } from "./$mailbox"

function ContextMissRetry({ reset }: { reset: () => void }) {
  const retried = useRef(false)
  useEffect(() => {
    if (!retried.current) {
      retried.current = true
      reset()
    }
  }, [reset])
  return null
}

function MessageDetailError({ error, reset }: ErrorComponentProps) {
  if (error.message.includes("within $mailbox route")) {
    return <ContextMissRetry reset={reset} />
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-destructive">{error.message}</p>
      <button className="text-sm underline" onClick={reset}>
        Try again
      </button>
    </div>
  )
}

export const Route = createFileRoute("/_app/$mailbox/$messageId")({
  ssr: false,
  loader: ({ context: { queryClient }, params: { messageId } }) =>
    queryClient.ensureQueryData(messageBodyQuery(messageId)),
  component: MessageDetail,
  errorComponent: MessageDetailError,
})

function MessageDetail() {
  const { messageId } = Route.useParams()
  const { combined, actions } = useMailboxCtx()
  const email = combined.find((e) => e.id === messageId) ?? null

  const bodyQ = useQuery(messageBodyQuery(messageId))
  const emailBody = bodyQ.isSuccess
    ? bodyQ.data.body || "(No content available)"
    : email?.preview || "Loading message..."
  const emailBodyFormat = bodyQ.isSuccess ? bodyQ.data.format : "text"

  const detail = (
    <EmailDetail
      email={email}
      emailBody={emailBody}
      emailBodyFormat={emailBodyFormat}
      onBack={actions.backToList}
      onArchive={(id) => actions.handleArchive(id, messageId)}
      onDelete={(id) => actions.handleDelete(id, messageId)}
      onToggleStar={actions.handleToggleStar}
      onToggleRead={actions.handleToggleRead}
      onReply={() => actions.handleReply(email)}
    />
  )

  return (
    <>
      {/* Desktop detail pane */}
      <div className="hidden min-w-0 flex-1 md:block">{detail}</div>

      {/* Mobile overlay */}
      <AnimatePresence>
        <motion.div
          key="mobile-detail"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="absolute inset-0 z-30 bg-background md:hidden"
        >
          {detail}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
