"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type AuthUser = {
  id: string
  address: string
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  initialized: boolean
}

type AuthCtx = AuthState & {
  login: (address: string, password: string) => Promise<void>
  register: (address: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""
const STORAGE_KEY = "herald_auth"

type Stored = {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Stored
  } catch {
    return null
  }
}

function saveStored(data: Stored) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function clearStored() {
  localStorage.removeItem(STORAGE_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    initialized: false,
  })

  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      setState({ user: stored.user, accessToken: stored.accessToken, initialized: true })
    } else {
      setState((s) => ({ ...s, initialized: true }))
    }
  }, [])

  const login = useCallback(async (address: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      throw new Error(data.error ?? "Login failed")
    }
    const data = (await res.json()) as {
      user: AuthUser
      accessToken: string
      refreshToken: string
    }
    saveStored({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken })
    setState({ user: data.user, accessToken: data.accessToken, initialized: true })
  }, [])

  const register = useCallback(async (address: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      throw new Error(data.error ?? "Registration failed")
    }
    const data = (await res.json()) as {
      user: AuthUser
      accessToken: string
      refreshToken: string
    }
    saveStored({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken })
    setState({ user: data.user, accessToken: data.accessToken, initialized: true })
  }, [])

  const logout = useCallback(() => {
    clearStored()
    setState((s) => ({ ...s, user: null, accessToken: null }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
