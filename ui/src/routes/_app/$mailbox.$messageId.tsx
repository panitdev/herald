import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"

import { EmailDetail } from "@/components/email/email-detail"
import { messageBodyQuery } from "@/lib/queries"
import { useMailboxCtx } from "./$mailbox"

export const Route = createFileRoute("/_app/$mailbox/$messageId")({
  loader: ({ context: { queryClient }, params: { messageId } }) =>
    queryClient.ensureQueryData(messageBodyQuery(messageId)),
  component: MessageDetail,
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
