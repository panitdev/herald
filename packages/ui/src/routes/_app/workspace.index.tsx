import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/workspace/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/workspace/general" })
  },
})
