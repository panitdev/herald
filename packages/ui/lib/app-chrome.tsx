import { createContext, useContext } from "react"

export type ComposePrefill = { to: string; subject: string }

export type NewDropMode = "files" | "clipboard" | "text"

export type AppChromeCtx = {
  openCompose: (prefill?: ComposePrefill) => void
  openSettings: (tab?: string) => void
  openMobileCommand: () => void
  openNewDrop: (mode?: NewDropMode) => void
}

export const AppChromeContext = createContext<AppChromeCtx | null>(null)

export function useAppChrome() {
  const ctx = useContext(AppChromeContext)
  if (!ctx) throw new Error("useAppChrome must be used within _app layout")
  return ctx
}
