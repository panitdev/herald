import { createFileRoute } from "@tanstack/react-router"

import { WorkspaceReceiversPage } from "@/components/workspace/receivers-page"

export const Route = createFileRoute("/_app/workspace/email-receivers")({
  ssr: false,
  component: WorkspaceReceiversPage,
})
