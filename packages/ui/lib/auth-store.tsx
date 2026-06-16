import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { getWhoami, initiateLogout, type KratosSession } from "./kratos"
import { API_URL, MAIL_DOMAIN } from "./env"

export type AuthUser = {
  id: string
  address: string
  username: string
}

type AuthState = {
  user: AuthUser | null
  initialized: boolean
}

type AuthCtx = AuthState & {
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

function traitString(
  traits: Record<string, unknown> | undefined,
  key: string
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

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/me`, { credentials: "include" })
    if (!res.ok) return null
    const data = (await res.json()) as AuthUser
    return data
  } catch {
    return null
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
  })

  const refresh = useCallback(async () => {
    const { status, session } = await getWhoami()
    const user =
      status === "authed" ? (await fetchMe()) ?? userFromSession(session) : null
    setState({ user, initialized: true })
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    refresh()
  }, [autoRefresh, refresh])

  const logout = useCallback(() => {
    initiateLogout()
  }, [])

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
