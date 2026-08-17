import { createFileRoute } from "@tanstack/react-router"

import { WorkspaceGeneralPage } from "@/components/workspace/general-page"

export const Route = createFileRoute("/_app/workspace/general")({
  ssr: false,
  component: WorkspaceGeneralPage,
})
