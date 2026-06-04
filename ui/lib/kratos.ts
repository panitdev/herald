import { KRATOS_URL } from "./env"

export type AuthStatus = "loading" | "authed" | "unauthed"

export type KratosSession = {
  id?: string
  identity?: {
    id?: string
    traits?: Record<string, unknown>
  }
}

export type WhoamiResult = {
  status: AuthStatus
  session: KratosSession | null
}

export async function getWhoami(): Promise<WhoamiResult> {
  if (!KRATOS_URL) return { status: "authed", session: null }
  try {
    const res = await fetch(`${KRATOS_URL}/sessions/whoami`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return { status: "unauthed", session: null }
    return {
      status: "authed",
      session: (await res.json()) as KratosSession,
    }
  } catch {
    return { status: "authed", session: null }
  }
}

export async function checkWhoami(): Promise<AuthStatus> {
  const { status } = await getWhoami()
  return status
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
