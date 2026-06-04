import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/$mailbox/")({
  ssr: false,
  component: MailboxIndex,
})

function MailboxIndex() {
  return null
}
