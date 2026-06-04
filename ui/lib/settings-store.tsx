import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type ThemeMode = "light" | "dark" | "system"
export type Density = "comfortable" | "cozy" | "compact"

export type Settings = {
  displayName: string
  email: string
  initials: string
  theme: ThemeMode
  density: Density
  accent: string // hue label
  notifications: {
    desktop: boolean
    sound: boolean
    mentionsOnly: boolean
    digest: boolean
  }
  signature: string
}

const DEFAULT_SETTINGS: Settings = {
  displayName: "Your Name",
  email: "you@inbox.co",
  initials: "YO",
  theme: "system",
  density: "cozy",
  accent: "indigo",
  notifications: {
    desktop: true,
    sound: false,
    mentionsOnly: false,
    digest: true,
  },
  signature: "Sent from Inbox — a calmer email client.",
}

type Ctx = {
  settings: Settings
  setSettings: (updater: (prev: Settings) => Settings) => void
  updateSettings: (patch: Partial<Settings>) => void
  resolvedTheme: "light" | "dark"
}

const SettingsContext = createContext<Ctx | null>(null)

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light")

  // Track system theme
  useEffect(() => {
    setSystemTheme(resolveSystemTheme())
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light")
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const resolvedTheme: "light" | "dark" =
    settings.theme === "system" ? systemTheme : settings.theme

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolvedTheme === "dark")
  }, [resolvedTheme])

  // Apply density attribute to document root (used by CSS if desired)
  useEffect(() => {
    document.documentElement.dataset.density = settings.density
  }, [settings.density])

  // Apply accent as a CSS custom property override and data attribute.
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

  const setSettings = useCallback(
    (updater: (prev: Settings) => Settings) => setSettingsState(updater),
    [],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      setSettingsState((prev) => ({ ...prev, ...patch })),
    [],
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
