import { KRATOS_URL } from "./env"

export type AuthStatus = "loading" | "authed" | "unauthed"

export async function checkWhoami(): Promise<AuthStatus> {
  if (!KRATOS_URL) return "authed"
  try {
    const res = await fetch(`${KRATOS_URL}/sessions/whoami`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
    return res.ok ? "authed" : "unauthed"
  } catch {
    return "authed"
  }
}

export function initiateLogin(): void {
  if (!KRATOS_URL) return
  const returnTo = encodeURIComponent(window.location.href)
  window.location.href = `${KRATOS_URL}/self-service/login/browser?return_to=${returnTo}`
}

export async function initiateLogout(): Promise<void> {
  if (!KRATOS_URL) {
    return
  }
  try {
    const res = await fetch(`${KRATOS_URL}/self-service/logout/browser`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
    if (res.ok) {
      const data = (await res.json()) as { logout_url: string }
      window.location.href = data.logout_url
      return
    }
  } catch {
    // fall through to login redirect
  }
  initiateLogin()
}
