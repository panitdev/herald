import { createFileRoute } from "@tanstack/react-router"

import { WorkspaceSendersPage } from "@/components/workspace/senders-page"

export const Route = createFileRoute("/_app/workspace/email-senders")({
  ssr: false,
  component: WorkspaceSendersPage,
})
