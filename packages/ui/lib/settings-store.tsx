import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useOptionalAuth, type AuthUser } from "@/lib/auth-store"

export type ThemeMode = "light" | "dark" | "system"
export type Density = "comfortable" | "cozy" | "compact"

export const THEME_STORAGE_KEY = "herald-theme"
export const SETTINGS_STORAGE_PREFIX = "herald-settings"
export const ACTIVE_SETTINGS_STORAGE_KEY = "herald-active-settings-key"

export type Settings = {
  displayName: string
  initials: string
  avatarUrl: string | null
  theme: ThemeMode
  density: Density
  accent: string
  language: string
  notifications: {
    desktop: boolean
    sound: boolean
    mentionsOnly: boolean
    digest: boolean
  }
  signature: string
}

const DEFAULT_SETTINGS: Settings = {
  displayName: "",
  initials: "ME",
  avatarUrl: null,
  theme: "system",
  density: "cozy",
  accent: "indigo",
  language: "auto",
  notifications: {
    desktop: true,
    sound: false,
    mentionsOnly: false,
    digest: true,
  },
  signature: "Sent from Inbox - a calmer email client.",
}

type Ctx = {
  settings: Settings
  setSettings: (updater: (prev: Settings) => Settings) => void
  updateSettings: (patch: Partial<Settings>) => void
  resolvedTheme: "light" | "dark"
}

const SettingsContext = createContext<Ctx | null>(null)

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function isDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "cozy" || value === "compact"
}

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function normalizeNamePart(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function deriveDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return DEFAULT_SETTINGS.displayName
  return user.displayName || normalizeNamePart(user.username) || user.address
}

export function deriveInitials(value: string): string {
  const letters = value
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return letters || DEFAULT_SETTINGS.initials
}

function baseSettings(user: AuthUser | null | undefined, theme: ThemeMode): Settings {
  const displayName = deriveDisplayName(user)
  return {
    ...DEFAULT_SETTINGS,
    theme,
    displayName,
    initials: deriveInitials(displayName),
    avatarUrl: user?.avatarUrl ?? null,
  }
}

function settingsStorageKey(userId: string | null | undefined): string {
  return `${SETTINGS_STORAGE_PREFIX}:${userId ?? "guest"}`
}

function sanitizeSettings(
  value: unknown,
  user: AuthUser | null | undefined,
  theme: ThemeMode,
): Settings {
  const defaults = baseSettings(user, theme)
  if (!value || typeof value !== "object") return defaults

  const candidate = value as Partial<Settings>
  const notifications = candidate.notifications
  return {
    ...defaults,
    theme: isThemeMode(candidate.theme) ? candidate.theme : theme,
    density: isDensity(candidate.density) ? candidate.density : defaults.density,
    accent: typeof candidate.accent === "string" && candidate.accent.trim()
      ? candidate.accent.trim()
      : defaults.accent,
    language: typeof candidate.language === "string" && candidate.language.trim()
      ? candidate.language.trim()
      : defaults.language,
    notifications:
      notifications &&
      typeof notifications === "object" &&
      !Array.isArray(notifications)
        ? {
            desktop:
              typeof notifications.desktop === "boolean"
                ? notifications.desktop
                : defaults.notifications.desktop,
            sound:
              typeof notifications.sound === "boolean"
                ? notifications.sound
                : defaults.notifications.sound,
            mentionsOnly:
              typeof notifications.mentionsOnly === "boolean"
                ? notifications.mentionsOnly
                : defaults.notifications.mentionsOnly,
            digest:
              typeof notifications.digest === "boolean"
                ? notifications.digest
                : defaults.notifications.digest,
          }
        : defaults.notifications,
    signature:
      typeof candidate.signature === "string"
        ? candidate.signature
        : defaults.signature,
  }
}

function loadStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_SETTINGS.theme

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(storedTheme) ? storedTheme : DEFAULT_SETTINGS.theme
  } catch {
    return DEFAULT_SETTINGS.theme
  }
}

function loadStoredSettings(
  user: AuthUser | null | undefined,
  theme: ThemeMode,
): Settings {
  if (typeof window === "undefined") return baseSettings(user, theme)

  try {
    const stored = window.localStorage.getItem(settingsStorageKey(user?.id))
    if (!stored) return baseSettings(user, theme)
    return sanitizeSettings(JSON.parse(stored), user, theme)
  } catch {
    return baseSettings(user, theme)
  }
}

function applyResolvedTheme(theme: "light" | "dark") {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth()
  const user = auth?.user
  const updateProfile = auth?.updateProfile

  const [settings, setSettingsState] = useState<Settings>(() => {
    const theme = loadStoredTheme()
    return baseSettings(null, theme)
  })
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(resolveSystemTheme)
  const [loadedUserKey, setLoadedUserKey] = useState<string | null>(null)

  useEffect(() => {
    setSystemTheme(resolveSystemTheme())
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light")
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    const theme = loadStoredTheme()
    const key = settingsStorageKey(user?.id)
    setSettingsState(loadStoredSettings(user, theme))
    setLoadedUserKey(key)

    try {
      window.localStorage.setItem(ACTIVE_SETTINGS_STORAGE_KEY, key)
    } catch {
      // Ignore persistence failures in restricted browsing contexts.
    }
  }, [user?.id, user?.username, user?.address, user?.displayName, user?.avatarUrl])

  const resolvedTheme: "light" | "dark" =
    settings.theme === "system" ? systemTheme : settings.theme

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, settings.theme)
    } catch {
      // Ignore persistence failures in restricted browsing contexts.
    }
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    document.documentElement.dataset.density = settings.density
  }, [settings.density])

  useEffect(() => {
    const accent = ACCENTS.find((a) => a.id === settings.accent)
    const root = document.documentElement
    root.dataset.accent = settings.accent
    if (accent) {
      root.style.setProperty("--primary", accent.color)
      root.style.setProperty("--ring", accent.color)
      root.style.setProperty("--sidebar-primary", accent.color)
      root.style.setProperty("--sidebar-ring", accent.color)
    }
  }, [settings.accent])

  useEffect(() => {
    if (typeof window === "undefined") return

    const key = settingsStorageKey(user?.id)
    if (loadedUserKey !== key) return

    try {
      window.localStorage.setItem(key, JSON.stringify(settings))
    } catch {
      // Ignore persistence failures in restricted browsing contexts.
    }
  }, [loadedUserKey, settings, user?.id])

  useEffect(() => {
    if (!user || !updateProfile) return
    if (
      settings.displayName === user.displayName &&
      settings.avatarUrl === user.avatarUrl
    ) {
      return
    }

    const handle = window.setTimeout(() => {
      void updateProfile({
        displayName: settings.displayName,
        avatarUrl: settings.avatarUrl,
      }).catch(() => {
        // Keep local edits visible; refresh will reconcile from the API later.
      })
    }, 400)

    return () => window.clearTimeout(handle)
  }, [
    settings.avatarUrl,
    settings.displayName,
    updateProfile,
    user,
  ])

  const setSettings = useCallback(
    (updater: (prev: Settings) => Settings) =>
      setSettingsState((prev) => {
        const next = updater(prev)
        const displayName = next.displayName.trim() || deriveDisplayName(user)
        return {
          ...next,
          displayName,
          initials: deriveInitials(displayName),
        }
      }),
    [user],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      setSettingsState((prev) => {
        const next = { ...prev, ...patch }
        const displayName = next.displayName.trim() || deriveDisplayName(user)
        return {
          ...next,
          displayName,
          initials: deriveInitials(displayName),
        }
      }),
    [user],
  )

  const value = useMemo<Ctx>(
    () => ({ settings, setSettings, updateSettings, resolvedTheme }),
    [settings, setSettings, updateSettings, resolvedTheme],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}

export const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: "indigo", label: "Indigo", color: "oklch(0.55 0.18 258)" },
  { id: "emerald", label: "Emerald", color: "oklch(0.62 0.15 160)" },
  { id: "rose", label: "Rose", color: "oklch(0.62 0.2 18)" },
  { id: "amber", label: "Amber", color: "oklch(0.75 0.15 75)" },
  { id: "slate", label: "Slate", color: "oklch(0.45 0.03 255)" },
]
