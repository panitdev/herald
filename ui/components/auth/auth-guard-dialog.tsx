"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { checkWhoami, initiateLogin } from "@/lib/kratos"
import type { AuthStatus } from "@/lib/kratos"

const POLL_INTERVAL_MS = 60_000
const COUNTDOWN_MS = 5_000
const TICK_MS = 50

export function AuthGuardDialog() {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    checkWhoami().then(setStatus)
    const id = setInterval(() => checkWhoami().then(setStatus), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (status !== "unauthed") return

    const startedAt = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const pct = Math.min((elapsed / COUNTDOWN_MS) * 100, 100)
      setProgress(pct)
      if (elapsed >= COUNTDOWN_MS) {
        clearInterval(id)
        initiateLogin()
      }
    }, TICK_MS)

    return () => clearInterval(id)
  }, [status])

  return (
    <Dialog open={status === "unauthed"}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session expired</DialogTitle>
          <DialogDescription>
            Your session has expired. Redirecting you to sign in…
          </DialogDescription>
        </DialogHeader>
        <Progress value={progress} />
      </DialogContent>
    </Dialog>
  )
}
