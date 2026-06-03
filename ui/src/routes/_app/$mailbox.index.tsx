import { createFileRoute } from "@tanstack/react-router"
import { EmailDetail } from "@/components/email/email-detail"
import { useMailboxCtx } from "./$mailbox"

export const Route = createFileRoute("/_app/$mailbox/")({
  component: MailboxIndex,
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
