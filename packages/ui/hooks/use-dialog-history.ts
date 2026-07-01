import { useEffect, useRef } from "react"

import { popDialog, pushDialog } from "@/lib/dialog-history"
import type { DialogEntry } from "@/lib/dialog-history"

/**
 * Wire an ephemeral dialog/drawer into the mobile back-action history stack.
 *
 * While `open` is true on a mobile viewport, a dummy history entry backs it
 * so the browser/gesture back action closes it (via `onClose`) instead of
 * leaving the app. On desktop this is an inert no-op.
 *
 * Pass a stable intent for `onClose` — typically `() => onOpenChange(false)`.
 */
export function useDialogHistory(open: boolean, onClose: () => void): void {
  const entryRef = useRef<DialogEntry | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (open && !entryRef.current) {
      entryRef.current = pushDialog(() => onCloseRef.current())
    } else if (!open && entryRef.current) {
      popDialog(entryRef.current)
      entryRef.current = null
    }
  }, [open])

  // Clean up if the component unmounts while still open.
  useEffect(() => {
    return () => {
      if (entryRef.current) {
        popDialog(entryRef.current)
        entryRef.current = null
      }
    }
  }, [])
}
