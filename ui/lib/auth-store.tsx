"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { initiateLogout } from "./kratos"
import { API_URL } from "./env"

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


async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/me`, { credentials: "include" })
    if (!res.ok) return null
    const data = (await res.json()) as { id: string; address: string; username: string }
    return { id: data.id, address: data.address, username: data.username }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, initialized: false })

  const refresh = useCallback(async () => {
    const user = await fetchMe()
    setState({ user, initialized: true })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

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
