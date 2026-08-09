import { SurgeClient } from "@panit/surge-client"
import { API_URL } from "./env"
import { APIError, probeMe } from "./api"

export type AuthStatus = "loading" | "authed" | "unauthed" | "offline"

export type WhoamiResult = {
  status: AuthStatus
}

let surgeClientSingleton: SurgeClient | null = null

export function getSurgeClient(): SurgeClient {
  if (!surgeClientSingleton) {
    surgeClientSingleton = new SurgeClient({ baseUrl: API_URL })
  }
  return surgeClientSingleton
}

export async function getWhoami(): Promise<WhoamiResult> {
  try {
    await probeMe()
    return { status: "authed" }
  } catch (error) {
    // Only a 401 proves the session is gone. Herald answers 503 when it can't
    // reach Surge itself, and any other status is a Herald-side fault — none of
    // those are evidence of being signed out, so they degrade to "offline"
    // rather than tearing the session down.
    if (error instanceof APIError && error.status === 401) {
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
  const returnTo = encodeURIComponent(window.location.href)
  window.location.href = `${API_URL}/v1/login?return_to=${returnTo}`
}

export async function initiateLogout(): Promise<void> {
  try {
    await getSurgeClient().logout()
  } catch {
    // fall through
  }
  window.location.reload()
}
