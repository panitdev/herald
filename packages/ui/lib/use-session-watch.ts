"use client"

import { useCallback, useEffect, useState } from "react"
import { checkWhoami } from "@/lib/surge"

/**
 * Detects a session that expired while the app sat open.
 *
 * Active use needs no watcher: any API call that 401s already trips the global
 * unauthorized handler in `lib/api`. The gap this closes is the idle tab — left
 * open for hours with nothing in flight — so it checks on focus and visibility
 * rather than on a timer. That catches the realistic case sooner than a poll
 * would, and costs nothing while the tab sits idle.
 *
 * There is no check on mount: the auth store already called `/api/me` to
 * produce `userId`, and repeating it here would double every page load.
 */
export function useSessionWatch(userId: string | null) {
  const [expired, setExpired] = useState(false)

  const markResolved = useCallback(() => setExpired(false), [])

  useEffect(() => {
    if (!userId) {
      setExpired(false)
      return
    }

    let cancelled = false

    const check = () => {
      if (document.visibilityState !== "visible") return

      void checkWhoami().then((status) => {
        if (cancelled) return
        // `offline` is not evidence of being signed out — Herald answers 503
        // when it cannot reach Surge, and the session may still be valid.
        if (status === "unauthed") setExpired(true)
        else if (status === "authed") setExpired(false)
      })
    }

    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)

    return () => {
      cancelled = true
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [userId])

  return { expired, markResolved }
}
