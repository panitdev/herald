// Centralized public env config. Vite inlines `import.meta.env.VITE_*` at
// build time, while the server injects `window.__ENV__` at request time for
// Docker/runtime configuration.

declare global {
  interface Window {
    __ENV__?: PublicEnv
  }
}

export type AuthMode = "inline" | "redirect"

export type PublicEnv = {
  apiUrl?: string
  mailDomain?: string
  authMode?: AuthMode
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function readRuntimeEnv(): PublicEnv {
  if (typeof window !== "undefined") {
    return window.__ENV__ ?? {}
  }

  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env

  return {
    apiUrl: env?.VITE_API_URL ?? env?.API_URL,
    mailDomain: env?.VITE_MAIL_DOMAIN ?? env?.MAIL_DOMAIN,
    authMode: (env?.VITE_AUTH_MODE ?? env?.AUTH_MODE) as AuthMode | undefined,
  }
}

const runtimeEnv = readRuntimeEnv()

export const API_URL = trimTrailingSlash(
  runtimeEnv.apiUrl ??
    import.meta.env.VITE_API_URL ??
    "https://herald-api.panit.dev"
)

export const MAIL_DOMAIN =
  runtimeEnv.mailDomain ?? import.meta.env.VITE_MAIL_DOMAIN ?? "panit.dev"

export const AUTH_MODE: AuthMode =
  runtimeEnv.authMode ??
  (import.meta.env.VITE_AUTH_MODE as AuthMode | undefined) ??
  "inline"
