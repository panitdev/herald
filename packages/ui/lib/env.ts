// Centralized public env config. Vite inlines `import.meta.env.VITE_*` at build time.
// KRATOS_URL is additionally read from `window.__ENV__` injected by the UI Worker at
// request time, so CI builds without VITE_KRATOS_PUBLIC_URL still redirect correctly.

declare global {
  interface Window {
    __ENV__?: { kratosUrl?: string }
  }
}

export const API_URL =
  import.meta.env.VITE_API_URL ?? "https://api.herald.panit.dev"

export const MAIL_DOMAIN = import.meta.env.VITE_MAIL_DOMAIN ?? "panit.dev"

export const KRATOS_URL = (
  (typeof window !== "undefined" ? window.__ENV__?.kratosUrl : undefined) ??
  import.meta.env.VITE_KRATOS_PUBLIC_URL ??
  ""
).replace(/\/$/, "")
