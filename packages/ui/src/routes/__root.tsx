import { useEffect, type ReactNode } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"

import { AuthProvider, useAuth } from "@/lib/auth-store"
import { SettingsProvider, THEME_STORAGE_KEY } from "@/lib/settings-store"
import { LocalOverridesProvider } from "@/lib/local-overrides-store"
import { AuthScreen } from "@/components/auth/auth-screen"
import { AuthGuardDialog } from "@/components/auth/auth-guard-dialog"
import { Toaster } from "@/components/ui/sonner"
import { ErrorBoundary } from "@/components/error-boundary"
import type { PublicEnv } from "@/lib/env"
import appCss from "../globals.css?url"

export interface RouterContext {
  queryClient: QueryClient
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function getRuntimeEnv(): Record<string, string | undefined> {
  return (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {}
}

function getPublicEnv(): PublicEnv {
  const env = getRuntimeEnv()
  return {
    apiUrl: trimTrailingSlash(
      env.VITE_API_URL ??
        env.API_URL ??
        import.meta.env.VITE_API_URL ??
        "https://herald-api.panit.dev"
    ),
    mailDomain:
      env.VITE_MAIL_DOMAIN ??
      env.MAIL_DOMAIN ??
      import.meta.env.VITE_MAIL_DOMAIN ??
      "panit.dev",
    kratosUrl: trimTrailingSlash(
      env.VITE_KRATOS_PUBLIC_URL ??
        env.KRATOS_PUBLIC_URL ??
        import.meta.env.VITE_KRATOS_PUBLIC_URL ??
        ""
    ),
  }
}

function serializePublicEnv(env: PublicEnv): string {
  return JSON.stringify(env).replace(/</g, "\\u003c")
}

function getThemeBootScript(): string {
  return `
    (() => {
      const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
      const root = document.documentElement;
      const stored = window.localStorage.getItem(storageKey);
      const theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
      const resolved = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;

      root.dataset.theme = theme;
      root.classList.toggle("dark", resolved === "dark");
      root.style.colorScheme = resolved;
    })();
  `.trim()
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async (): Promise<PublicEnv> => {
    return getPublicEnv()
  },
  head: ({ loaderData }) => ({
    scripts: loaderData
      ? [
          { children: getThemeBootScript() },
          { children: `window.__ENV__=${serializePublicEnv(loaderData)}` },
        ]
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
      { name: "theme-color", content: "#ece6dc" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Herald" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    void import("virtual:serwist").then(({ swScope, swType, swUrl }) => {
      void navigator.serviceWorker
        .register(swUrl, { scope: swScope, type: swType })
        .then((registration) => {
          window.dispatchEvent(
            new CustomEvent("herald-sw-registered", {
              detail: { registration, swUrl },
            }),
          )
        })
    })
  }, [])

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
  const { user, initialized, restoringCachedMail } = useAuth()
  if (!initialized) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background px-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {restoringCachedMail ? "Restoring cached mail" : "Loading Herald"}
          </p>
          <p className="text-sm text-muted-foreground">
            {restoringCachedMail
              ? "Reopening your last synced mailbox snapshot."
              : "Checking your session."}
          </p>
        </div>
      </div>
    )
  }
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
