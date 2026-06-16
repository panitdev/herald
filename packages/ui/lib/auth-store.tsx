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
  hydrateSyncStateFromCache,
  setOfflineSyncUser,
  setUnauthorizedHandler,
} from "@/lib/api"
import { API_URL, MAIL_DOMAIN } from "@/lib/env"
import {
  clearOfflineSession,
  loadPersistedAuthUser,
  persistAuthUser,
} from "@/lib/offline-cache"
import { getWhoami, initiateLogout, type KratosSession } from "./kratos"

export type AuthUser = {
  id: string
  address: string
  username: string
}

type AuthState = {
  user: AuthUser | null
  initialized: boolean
  restoringCachedMail: boolean
}

type AuthCtx = AuthState & {
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

function traitString(
  traits: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = traits?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function usernameFromSession(session: KratosSession | null): string | null {
  const username = traitString(session?.identity?.traits, "username")?.toLowerCase()
  if (!username || !/^[a-z0-9._-]{1,64}$/.test(username)) return null
  return username
}

function userFromSession(session: KratosSession | null): AuthUser | null {
  const identity = session?.identity
  const username = usernameFromSession(session)
  if (!username) return null

  return {
    id: identity?.id ?? session?.id ?? `${username}@${MAIL_DOMAIN}`,
    address: `${username}@${MAIL_DOMAIN}`,
    username,
  }
}

async function fetchMe(): Promise<{ user: AuthUser | null; offline: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/me`, { credentials: "include" })
    if (!res.ok) return { user: null, offline: false }
    const data = (await res.json()) as AuthUser
    return { user: data, offline: false }
  } catch {
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
    const { status, session } = await getWhoami()

    if (status === "unauthed") {
      await clearForUser(currentUserIdRef.current)
      setState({ user: null, initialized: true, restoringCachedMail: false })
      return
    }

    if (status === "offline") {
      const persisted = await loadPersistedAuthUser()
      await restoreOfflineData(persisted?.user ?? null)
      return
    }

    const sessionUser = userFromSession(session)
    const me = await fetchMe()
    if (me.offline) {
      const persisted = await loadPersistedAuthUser()
      await restoreOfflineData(persisted?.user ?? sessionUser ?? null)
      return
    }

    const user = me.user ?? sessionUser
    const previousUserId = currentUserIdRef.current
    if (previousUserId && user?.id !== previousUserId) {
      setOfflineSyncUser(null)
    }

    currentUserIdRef.current = user?.id ?? null
    setOfflineSyncUser(user?.id ?? null)

    if (user) {
      await persistAuthUser(user)
      await hydrateSyncStateFromCache(user.id)
    }

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

  return (
    <AuthContext.Provider value={{ ...state, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
