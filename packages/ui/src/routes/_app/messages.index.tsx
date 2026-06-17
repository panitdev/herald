import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/messages/")({
  ssr: false,
  component: MessagesIndex,
})

function MessagesIndex() {
  return null
}
