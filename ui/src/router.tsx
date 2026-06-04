import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "An unexpected error occurred"}
      </p>
      <button
        className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  )
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: DefaultErrorComponent,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
