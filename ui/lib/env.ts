// Centralized public env config. Vite inlines `import.meta.env.VITE_*` at build time.
export const API_URL =
  import.meta.env.VITE_API_URL ?? "https://api.herald.panit.dev"

export const MAIL_DOMAIN = import.meta.env.VITE_MAIL_DOMAIN ?? "panit.dev"

export const KRATOS_URL = (import.meta.env.VITE_KRATOS_PUBLIC_URL ?? "").replace(
  /\/$/,
  "",
)
