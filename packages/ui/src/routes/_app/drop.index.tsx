import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/drop/")({
  ssr: false,
  component: DropIndex,
})

function DropIndex() {
  return null
}
