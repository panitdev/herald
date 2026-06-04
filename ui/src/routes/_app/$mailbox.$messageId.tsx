import { createFileRoute } from "@tanstack/react-router"
import { messageBodyQuery } from "@/lib/queries"

export const Route = createFileRoute("/_app/$mailbox/$messageId")({
  ssr: false,
  loader: ({ context: { queryClient }, params: { messageId } }) =>
    queryClient.ensureQueryData(messageBodyQuery(messageId)),
  component: MessageRoute,
})

function MessageRoute() {
  return null
}
