"use client"

import { useEffect } from "react"
import { AuthDialog } from "@/components/ui/auth-dialog"
import { HeraldLogo } from "@/components/ui/logos"
import { AUTH_MODE } from "@/lib/env"
import { getSurgeClient, initiateLogin } from "@/lib/surge"
import { useAuth } from "@/lib/auth-store"
import type { FlowResult } from "@panit/surge-client"

type Props = {
  open: boolean
  /** Fired after a successful sign-in, once the auth store has been refreshed. */
  onAuthenticated?: () => void
}

/**
 * The single sign-in surface, for both "never signed in" and "session expired".
 * Whether the app stays mounted behind the overlay is the caller's call — see
 * `AuthGate`.
 *
 * Stays mounted across `open` changes rather than being conditionally rendered:
 * the dialog's close animation (`data-[state=closed]:animate-out`) only plays
 * if the element survives long enough to run it. Unmounting on success makes it
 * vanish on the frame the flow completes.
 *
 * In redirect mode it renders nothing and sends the browser to Surge instead.
 */
export function Reauth({ open, onAuthenticated }: Props) {
  const { refresh } = useAuth()

  // Gated on `open` precisely because this component is always mounted — a
  // bare mount effect here would redirect on every page load.
  useEffect(() => {
    if (open && AUTH_MODE === "redirect") initiateLogin()
  }, [open])

  if (AUTH_MODE === "redirect") return null

  const handleAuthenticated = (_result: FlowResult) => {
    void refresh()
    onAuthenticated?.()
  }

  return (
    <AuthDialog
      surgeClient={getSurgeClient()}
      open={open}
      onAuthenticated={handleAuthenticated}
      mark={<HeraldLogo size={28} />}
    />
  )
}
