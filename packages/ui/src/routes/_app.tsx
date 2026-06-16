import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Outlet, createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { ComposePanel } from "@/components/email/compose-panel"
import { SettingsDialog } from "@/components/email/settings-dialog"
import { useSettings } from "@/lib/settings-store"
import { useAuth } from "@/lib/auth-store"
import { useLocalOverrides } from "@/lib/local-overrides-store"
import { sendMail } from "@/lib/api"
import type { Email } from "@/lib/types"
import {
  AppChromeContext,
  type AppChromeCtx,
  type ComposePrefill,
} from "@/lib/app-chrome"
import { useOnlineStatus } from "@/lib/network-store"

export const Route = createFileRoute("/_app")({
  // The authenticated tree is client-only (cookie auth + Kratos redirects need
  // the browser); the static shell in __root still SSRs.
  ssr: false,
  component: AppLayout,
})

function AppLayout() {
  const { settings } = useSettings()
  const { user } = useAuth()
  const { addLocalEmail, initialized: overridesInitialized } = useLocalOverrides()
  const online = useOnlineStatus()

  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrefill, setComposePrefill] = useState<ComposePrefill>({
    to: "",
    subject: "",
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openCompose = useCallback((prefill?: ComposePrefill) => {
    setComposePrefill(prefill ?? { to: "", subject: "" })
    setComposeOpen(true)
  }, [])

  const openSettings = useCallback(() => setSettingsOpen(true), [])

  const chrome = useMemo<AppChromeCtx>(
    () => ({ openCompose, openSettings }),
    [openCompose, openSettings],
  )

  async function handleSend(data: { to: string; subject: string; body: string }) {
    if (!online) {
      toast.error("You're offline", {
        description: "Compose is available, but sending requires a network connection.",
      })
      return
    }

    let result
    try {
      result = await sendMail({ ...data, fromName: settings.displayName })
    } catch (err) {
      toast.error("Message failed to send", {
        description:
          err instanceof Error
            ? err.message
            : "Mail provider rejected the request",
      })
      return
    }

    const newEmail: Email = {
      id: result.message.id,
      from: {
        name: "You",
        email: user?.address ?? result.message.from_addr,
        initials: settings.initials,
        color: "oklch(0.7 0.16 258)",
      },
      to: data.to,
      subject: data.subject,
      preview: result.message.preview || data.body.slice(0, 120),
      body: data.body,
      date: result.message.received_at,
      read: true,
      starred: false,
      folder: "sent",
    }
    addLocalEmail(newEmail)
    setComposeOpen(false)
    toast.success("Message sent", { description: `to ${data.to}` })
  }

  // Keyboard shortcuts: "c" compose, ⌘/Ctrl+, settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target && target.isContentEditable)
      if (isEditable) return
      if (e.key === "c") {
        e.preventDefault()
        openCompose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openCompose])

  return (
    <AppChromeContext.Provider value={chrome}>
      {!online ? (
        <div className="border-b border-border bg-amber-100/70 px-4 py-2 text-sm text-amber-950">
          Offline. Cached mail is available, but sending and refresh require a connection.
        </div>
      ) : null}
      {!overridesInitialized ? (
        <div className="flex h-dvh items-center justify-center bg-background px-6 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Restoring cached mail</p>
            <p className="text-sm text-muted-foreground">
              Reloading your local mailbox state before background refresh.
            </p>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
      <ComposePanel
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleSend}
        initialTo={composePrefill.to}
        initialSubject={composePrefill.subject}
        offline={!online}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </AppChromeContext.Provider>
  )
}
