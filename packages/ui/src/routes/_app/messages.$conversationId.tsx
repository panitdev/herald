import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/messages/$conversationId")({
  ssr: false,
  component: ConversationRoute,
})

function ConversationRoute() {
  return null
}
