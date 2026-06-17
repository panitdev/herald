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

function formatDisplayName(username: string): string {
  return username
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function resolveAvatarUrl(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith("data:")) return value
  if (/^https?:\/\//.test(value)) return value
  if (value.startsWith("/")) return `${API_URL}${value}`
  return value
}

function userFromSession(session: KratosSession | null): AuthUser | null {
  const identity = session?.identity
  const username = usernameFromSession(session)
  if (!username) return null

  return {
    id: identity?.id ?? session?.id ?? `${username}@${MAIL_DOMAIN}`,
    address: `${username}@${MAIL_DOMAIN}`,
    username,
    displayName: formatDisplayName(username) || `${username}@${MAIL_DOMAIN}`,
    avatarUrl: null,
  }
}

async function fetchMe(): Promise<{ user: AuthUser | null; offline: boolean }> {
  try {
    const data = await getMe()
    return {
      user: {
        id: data.id,
        address: data.address,
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

    const { status, session } = await getWhoami()

    if (status === "unauthed") {
      await clearForUser(currentUserIdRef.current)
      setState({ user: null, initialized: true, restoringCachedMail: false })
      return
    }

    if (status === "offline") {
      await restoreOfflineData(persisted?.user ?? null)
      return
    }

    const sessionUser = userFromSession(session)
    const me = await fetchMe()
    if (me.offline) {
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
