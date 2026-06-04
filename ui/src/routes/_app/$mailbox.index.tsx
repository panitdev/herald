import { useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { EmailDetail } from "@/components/email/email-detail"
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

function MailboxIndexError({ error, reset }: ErrorComponentProps) {
  if (error.message.includes("within $mailbox route")) {
    return <ContextMissRetry reset={reset} />
  }
  return (
    <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center md:flex">
      <p className="text-sm text-destructive">{error.message}</p>
      <button className="text-sm underline" onClick={reset}>
        Try again
      </button>
    </div>
  )
}

export const Route = createFileRoute("/_app/$mailbox/")({
  ssr: false,
  component: MailboxIndex,
  errorComponent: MailboxIndexError,
})

const noop = () => {}

function MailboxIndex() {
  const { actions } = useMailboxCtx()
  // Desktop-only empty detail pane (mobile shows just the list).
  return (
    <div className="hidden min-w-0 flex-1 md:block">
      <EmailDetail
        email={null}
        emailBody=""
        emailBodyFormat="text"
        onBack={actions.backToList}
        onArchive={noop}
        onDelete={noop}
        onToggleStar={noop}
        onToggleRead={noop}
        onReply={noop}
      />
    </div>
  )
}
