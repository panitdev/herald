import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/$mailbox/$messageId")({
  ssr: false,
  component: MessageRoute,
})

function MessageRoute() {
  return null
}
