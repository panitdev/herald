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
  APIError,
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
  } catch (error) {
    if (error instanceof APIError) {
      return { user: null, offline: false }
    }
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

  const refresh = useCallback(async () => {
    const persisted = await loadPersistedAuthUser()

    if (persisted?.user) {
      await restoreOfflineData(persisted.user)
    }

    // `/api/me` is Herald's own whoami: the `surge_session` cookie is HttpOnly, so
    // there's nothing for the browser to introspect directly — Herald validates it
    // against Surge on our behalf and this is the single source of truth.
    const me = await fetchMe()

    if (me.offline) {
      await restoreOfflineData(persisted?.user ?? null)
      return
    }

    const user = me.user

    if (!user) {
      await clearForUser(currentUserIdRef.current)
      currentUserIdRef.current = null
      setState({ user: null, initialized: true, restoringCachedMail: false })
      return
    }

    const previousUserId = currentUserIdRef.current
    if (previousUserId && user.id !== previousUserId) {
      setOfflineSyncUser(null)
    }

    currentUserIdRef.current = user.id
    setOfflineSyncUser(user.id)

    await persistAuthUser(user)
    await hydrateSyncStateFromCache(user.id)

    setState({ user, initialized: true, restoringCachedMail: false })
  }, [clearForUser, restoreOfflineData])

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      const userId = currentUserIdRef.current
      await clearForUser(userId)
      currentUserIdRef.current = null
      setState({ user: null, initialized: true, restoringCachedMail: false })
    })

    return () => setUnauthorizedHandler(null)
  }, [clearForUser])

  useEffect(() => {
    if (!autoRefresh) return
    void refresh()
  }, [autoRefresh, refresh])

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
