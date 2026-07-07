import { API_URL, SURGE_AUTH_URL } from "./env"
import { APIError, getMe } from "./api"

export type AuthStatus = "loading" | "authed" | "unauthed" | "offline"

export type WhoamiResult = {
  status: AuthStatus
}

/// The `surge_session` cookie is HttpOnly, so the browser can't read it (or
/// the identity payload) directly. Herald's own `/api/me` — backed by the
/// `AuthUser` extractor, which introspects the cookie against Surge — is the
/// whoami equivalent for this app.
export async function getWhoami(): Promise<WhoamiResult> {
  try {
    await getMe()
    return { status: "authed" }
  } catch (error) {
    if (error instanceof APIError) {
      return { status: "unauthed" }
    }
    return { status: "offline" }
  }
}

export async function checkWhoami(): Promise<AuthStatus> {
  const { status } = await getWhoami()
  return status
}

export function initiateLogin(): void {
  if (!SURGE_AUTH_URL) return
  const returnTo = encodeURIComponent(window.location.href)
  window.location.href = `${SURGE_AUTH_URL}/v1/login?return_to=${returnTo}`
}

export async function initiateLogout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
  } catch {
    // fall through to login redirect regardless of network state
  }
  initiateLogin()
}
