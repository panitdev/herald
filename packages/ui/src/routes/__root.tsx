import { useEffect, type ReactNode } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"

import { AuthProvider, useAuth } from "@/lib/auth-store"
import {
  ACTIVE_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_PREFIX,
  SettingsProvider,
  THEME_STORAGE_KEY,
} from "@/lib/settings-store"
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
      const activeSettingsKey = ${JSON.stringify(ACTIVE_SETTINGS_STORAGE_KEY)};
      const settingsPrefix = ${JSON.stringify(`${SETTINGS_STORAGE_PREFIX}:`)};
      const root = document.documentElement;
      const isTheme = (value) => value === "light" || value === "dark" || value === "system";
      const readStoredTheme = (key) => {
        if (!key) return null;
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return isTheme(parsed?.theme) ? parsed.theme : null;
        } catch {
          return null;
        }
      };

      let theme = null;

      const preferredSettingsKey = window.localStorage.getItem(activeSettingsKey);
      theme = readStoredTheme(preferredSettingsKey);

      if (!theme) {
        const stored = window.localStorage.getItem(storageKey);
        theme = isTheme(stored) ? stored : null;
      }

      if (!theme) {
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key || !key.startsWith(settingsPrefix)) continue;
          theme = readStoredTheme(key);
          if (theme) break;
        }
      }

      theme = theme ?? "system";
      const resolved = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
      const palette = resolved === "dark"
        ? { background: "oklch(0.16 0.06 264)", foreground: "oklch(0.96 0.01 85)" }
        : { background: "oklch(0.985 0.012 85)", foreground: "oklch(0.18 0.06 264)" };

      root.dataset.theme = theme;
      root.classList.toggle("dark", resolved === "dark");
      root.style.colorScheme = resolved;
      root.style.backgroundColor = palette.background;
      root.style.color = palette.foreground;
      root.style.setProperty("--boot-bg", palette.background);
      root.style.setProperty("--boot-fg", palette.foreground);
    })();
  `.trim()
}

function getCriticalBootStyles(): string {
  return `
    html {
      background: var(--boot-bg, oklch(0.985 0.012 85));
      color: var(--boot-fg, oklch(0.18 0.06 264));
    }

    body {
      margin: 0;
      min-height: 100dvh;
      background: inherit;
      color: inherit;
      font-family: "Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    [data-auth-splash] {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      box-sizing: border-box;
      text-align: center;
      background: inherit;
      color: inherit;
    }

    [data-auth-splash-copy] {
      display: grid;
      gap: 0.5rem;
    }

    [data-auth-splash-title],
    [data-auth-splash-body] {
      margin: 0;
    }

    [data-auth-splash-title] {
      font-size: 0.875rem;
      font-weight: 500;
    }

    [data-auth-splash-body] {
      font-size: 0.875rem;
      color: color-mix(in oklab, currentColor 65%, transparent);
    }
  `.trim()
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async (): Promise<PublicEnv> => {
    return getPublicEnv()
  },
  head: ({ loaderData }) => ({
    scripts: loaderData
      ? [
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
      <div
        data-auth-splash
        className="flex h-dvh w-full items-center justify-center bg-background px-6 text-center"
      >
        <div data-auth-splash-copy className="space-y-2">
          <p data-auth-splash-title className="text-sm font-medium text-foreground">
            {restoringCachedMail ? "Restoring cached mail" : "Loading Herald"}
          </p>
          <p data-auth-splash-body className="text-sm text-muted-foreground">
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
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeBootScript() }} />
        <style dangerouslySetInnerHTML={{ __html: getCriticalBootStyles() }} />
        <HeadContent />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
