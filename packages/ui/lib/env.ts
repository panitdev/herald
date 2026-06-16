// Centralized public env config. Vite inlines `import.meta.env.VITE_*` at
// build time, while the server injects `window.__ENV__` at request time for
// Docker/runtime configuration.

declare global {
  interface Window {
    __ENV__?: PublicEnv
  }
}

export type PublicEnv = {
  apiUrl?: string
  mailDomain?: string
  kratosUrl?: string
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
    kratosUrl: env?.VITE_KRATOS_PUBLIC_URL ?? env?.KRATOS_PUBLIC_URL,
  }
}

const runtimeEnv = readRuntimeEnv()

export const API_URL = trimTrailingSlash(
  runtimeEnv.apiUrl ??
    import.meta.env.VITE_API_URL ??
    "https://api.herald.panit.dev"
)

export const MAIL_DOMAIN =
  runtimeEnv.mailDomain ?? import.meta.env.VITE_MAIL_DOMAIN ?? "panit.dev"

export const KRATOS_URL = (
  runtimeEnv.kratosUrl ??
  import.meta.env.VITE_KRATOS_PUBLIC_URL ??
  ""
).replace(/\/$/, "")
