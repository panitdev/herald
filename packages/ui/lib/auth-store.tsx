import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  clearOfflineMailCache,
  getMe,
  hydrateSyncStateFromCache,
  setOfflineSyncUser,
  setUnauthorizedHandler,
  updateMe,
} from "@/lib/api"
import { API_URL } from "@/lib/env"
import {
  clearOfflineSession,
  loadPersistedAuthUser,
  persistAuthUser,
} from "@/lib/offline-cache"
import { useOptionalSurgeAuth } from "@/components/ui/surge-auth"
import { initiateLogout } from "./surge"

export type AuthUser = {
  id: string
  address: string
  addresses: string[]
  username: string
  displayName: string
  avatarUrl: string | null
}

type AuthState = {
  user: AuthUser | null
  initialized: boolean
  restoringCachedMail: boolean
}

type AuthCtx = AuthState & {
  logout: () => void
  refresh: () => Promise<void>
  updateProfile: (patch: {
    displayName?: string
    avatarUrl?: string | null
  }) => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

function resolveAvatarUrl(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith("data:")) return value
  if (/^https?:\/\//.test(value)) return value
  if (value.startsWith("/")) return `${API_URL}${value}`
  return value
}

/**
 * Herald's *profile*, not its authentication. `GET /v1/whoami` decides whether
 * there is a session; this only adds the mail identity on top, so any failure
 * — 401, 404, 503 — degrades to "no profile yet" and never signs anyone out.
 */
async function fetchMe(): Promise<{ user: AuthUser | null; offline: boolean }> {
  try {
    const data = await getMe()
    return {
      user: {
        id: data.id,
        address: data.address,
        addresses: data.addresses?.map((address) => address.address) ?? [data.address],
        username: data.username,
        displayName: data.display_name,
        avatarUrl: resolveAvatarUrl(data.avatar_url),
      },
      offline: false,
    }
  } catch {
    // A 401 here means the profile route rejected a session Surge just
    // vouched for — a Herald-side fault, same as a 404 or a 503, and equally
    // not grounds for wiping the offline mail cache.
    return { user: null, offline: true }
  }
}

type AuthProviderProps = {
  children: ReactNode
  initialUser?: AuthUser | null
  autoRefresh?: boolean
}

export function AuthProvider({
  children,
  initialUser = null,
  autoRefresh = true,
}: AuthProviderProps) {
  const surgeStatus = useOptionalSurgeAuth()?.status ?? null
  const [state, setState] = useState<AuthState>({
    user: initialUser,
    initialized: !autoRefresh,
    restoringCachedMail: autoRefresh,
  })
  const currentUserIdRef = useRef<string | null>(initialUser?.id ?? null)

  const clearForUser = useCallback(async (userId: string | null) => {
    setOfflineSyncUser(null)
    await clearOfflineMailCache(null)
    await clearOfflineSession(userId)
  }, [])

  const restoreOfflineData = useCallback(async (user: AuthUser | null) => {
    currentUserIdRef.current = user?.id ?? null
    setOfflineSyncUser(user?.id ?? null)

    if (!user) {
      setState({ user: null, initialized: true, restoringCachedMail: false })
      return
    }

    setState({ user, initialized: false, restoringCachedMail: true })
    await hydrateSyncStateFromCache(user.id)
    setState({ user, initialized: true, restoringCachedMail: false })
  }, [])

  const signOutLocally = useCallback(async () => {
    await clearForUser(currentUserIdRef.current)
    currentUserIdRef.current = null
    setState({ user: null, initialized: true, restoringCachedMail: false })
  }, [clearForUser])

  const refresh = useCallback(async () => {
    const persisted = await loadPersistedAuthUser()

    if (persisted?.user) {
      await restoreOfflineData(persisted.user)
    }

    // Profile only — `SurgeAuthProvider` has already settled whether there is
    // a session. A failure here leaves the app on cached mail rather than
    // pretending the user is signed out.
    const me = await fetchMe()

    if (me.offline || !me.user) {
      await restoreOfflineData(persisted?.user ?? null)
      return
    }

    const user = me.user
    const previousUserId = currentUserIdRef.current
    if (previousUserId && user.id !== previousUserId) {
      setOfflineSyncUser(null)
    }

    currentUserIdRef.current = user.id
    setOfflineSyncUser(user.id)

    await persistAuthUser(user)
    await hydrateSyncStateFromCache(user.id)

    setState({ user, initialized: true, restoringCachedMail: false })
  }, [restoreOfflineData])

  useEffect(() => {
    setUnauthorizedHandler(signOutLocally)
    return () => setUnauthorizedHandler(null)
  }, [signOutLocally])

  // The Surge session drives everything: the profile fetch only runs once
  // `/v1/whoami` says there is one, and a `unauthed` answer is the single
  // signal that clears local state. `offline` keeps whatever was cached.
  useEffect(() => {
    if (!autoRefresh) return

    // No session layer above us (stories, isolated tests): fall back to
    // fetching the profile directly.
    if (!surgeStatus) {
      void refresh()
      return
    }

    if (surgeStatus === "loading") return
    if (surgeStatus === "unauthed") {
      void signOutLocally()
      return
    }

    void refresh()
  }, [autoRefresh, surgeStatus, refresh, signOutLocally])

  const logout = useCallback(() => {
    void clearForUser(currentUserIdRef.current)
    currentUserIdRef.current = null
    setState({ user: null, initialized: true, restoringCachedMail: false })
    void initiateLogout()
  }, [clearForUser])

  const updateProfile = useCallback(
    async (patch: { displayName?: string; avatarUrl?: string | null }) => {
      const currentUser = currentUserIdRef.current
      if (!currentUser) return

      const response = await updateMe({
        display_name: patch.displayName,
        avatar_url: patch.avatarUrl,
      })

      const nextUser: AuthUser = {
        id: response.id,
        address: response.address,
        addresses: response.addresses?.map((address) => address.address) ?? [response.address],
        username: response.username,
        displayName: response.display_name,
        avatarUrl: resolveAvatarUrl(response.avatar_url),
      }

      await persistAuthUser(nextUser)
      setState((prev) => ({
        ...prev,
        user: nextUser,
      }))
    },
    [],
  )

  return (
    <AuthContext.Provider value={{ ...state, logout, refresh, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export function useOptionalAuth() {
  return useContext(AuthContext)
}
