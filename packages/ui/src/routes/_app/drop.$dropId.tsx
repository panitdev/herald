import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/drop/$dropId")({
  ssr: false,
  component: DropDetailRoute,
})

function DropDetailRoute() {
  return null
}
