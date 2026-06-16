import type { ReactNode } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"

import { AuthProvider, useAuth } from "@/lib/auth-store"
import { SettingsProvider } from "@/lib/settings-store"
import { LocalOverridesProvider } from "@/lib/local-overrides-store"
import { AuthScreen } from "@/components/auth/auth-screen"
import { AuthGuardDialog } from "@/components/auth/auth-guard-dialog"
import { Toaster } from "@/components/ui/sonner"
import { ErrorBoundary } from "@/components/error-boundary"
import appCss from "../globals.css?url"

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async (): Promise<{ kratosUrl: string }> => {
    const kratosUrl = import.meta.env.VITE_KRATOS_PUBLIC_URL ?? ""
    return { kratosUrl: kratosUrl.replace(/\/$/, "") }
  },
  head: ({ loaderData }) => ({
    scripts: loaderData
      ? [{ children: `window.__ENV__=${JSON.stringify({ kratosUrl: loaderData.kratosUrl })}` }]
      : [],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Herald — A focused email client" },
      {
        name: "description",
        content:
          "A minimal, fast email client with smooth animations and a distraction-free interface.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Pretendard — primary sans-serif
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      },
      // Noto Serif KR — serif headlines
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700&display=swap",
      },
      // Geist Mono — monospace
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap",
      },
      // Favicon — Herald brand from ui.registry.panit.dev
      {
        rel: "icon",
        href: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        rel: "icon",
        href: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsProvider>
            <LocalOverridesProvider>
              <ErrorBoundary>
                <AuthGate>
                  <Outlet />
                </AuthGate>
              </ErrorBoundary>
              <Toaster position="bottom-right" richColors closeButton />
              <AuthGuardDialog />
            </LocalOverridesProvider>
          </SettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

/**
 * Reproduces the old client-wrapper gate: blank while auth initializes,
 * AuthScreen (which redirects to Kratos) when signed out, app otherwise.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuth()
  if (!initialized) return <div className="h-dvh w-full bg-background" />
  if (!user) return <AuthScreen />
  return <>{children}</>
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
