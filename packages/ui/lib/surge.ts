import { SurgeClient } from "@panit/surge-client"
import { API_URL } from "./env"

/**
 * Herald's binding to the generic auth stack: one client pointed at the `/v1`
 * perimeter Herald's API mounts (Surge's `browser_router`, embedded or
 * proxied). Everything else — session state, the dialog, the gate — lives in
 * `components/ui/surge-auth` (the `@panit/surge-auth` registry item) and knows
 * nothing about Herald.
 */
let surgeClientSingleton: SurgeClient | null = null

export function getSurgeClient(): SurgeClient {
  if (!surgeClientSingleton) {
    surgeClientSingleton = new SurgeClient({ baseUrl: API_URL })
  }
  return surgeClientSingleton
}
