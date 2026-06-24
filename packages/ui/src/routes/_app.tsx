import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Outlet, createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { CommandMenu } from "@/components/email/command-menu"
import { ComposePanel } from "@/components/email/compose-panel"
import { MobileCommandDrawer } from "@/components/email/mobile-command-drawer"
import { SettingsDialog } from "@/components/email/settings-dialog"
import { NewDropSheet } from "@/components/drop/new-drop-sheet"
import { useSettings } from "@/lib/settings-store"
import { useAuth } from "@/lib/auth-store"
import { useLocalOverrides } from "@/lib/local-overrides-store"
import { DropStoreProvider, useDropStore } from "@/lib/drop-store"
import { connectRealtimeSync, sendMail } from "@/lib/api"
import type { Email } from "@/lib/types"
import {
  AppChromeContext,
  type AppChromeCtx,
  type ComposePrefill,
  type NewDropMode,
} from "@/lib/app-chrome"
import { useOnlineStatus } from "@/lib/network-store"

export const Route = createFileRoute("/_app")({
  // The authenticated tree is client-only (cookie auth + Kratos redirects need
  // the browser); the static shell in __root still SSRs.
  ssr: false,
  component: AppLayout,
})

function AppLayout() {
  const { user } = useAuth()
  const userId = user?.id ?? "anonymous"

  return (
    <DropStoreProvider userId={userId}>
      <AppLayoutInner />
    </DropStoreProvider>
  )
}

function AppLayoutInner() {
  const { settings } = useSettings()
  const { user } = useAuth()
  const { addLocalEmail, initialized: overridesInitialized } = useLocalOverrides()
  const online = useOnlineStatus()
  const { t } = useTranslation()
  const { createDrop } = useDropStore()

  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrefill, setComposePrefill] = useState<ComposePrefill>({
    to: "",
    subject: "",
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string | undefined>()
  const [commandOpen, setCommandOpen] = useState(false)
  const [mobileCommandOpen, setMobileCommandOpen] = useState(false)
  const [newDropOpen, setNewDropOpen] = useState(false)
  const [newDropMode, setNewDropMode] = useState<NewDropMode>("text")

  const openCompose = useCallback((prefill?: ComposePrefill) => {
    setComposePrefill(prefill ?? { to: "", subject: "" })
    setComposeOpen(true)
  }, [])

  const openSettings = useCallback((tab?: string) => {
    setSettingsDefaultTab(tab)
    setSettingsOpen(true)
  }, [])

  const openMobileCommand = useCallback(() => setMobileCommandOpen(true), [])

  const openNewDrop = useCallback((mode: NewDropMode = "text") => {
    setNewDropMode(mode)
    setNewDropOpen(true)
  }, [])

  const chrome = useMemo<AppChromeCtx>(
    () => ({ openCompose, openSettings, openMobileCommand, openNewDrop }),
    [openCompose, openSettings, openMobileCommand, openNewDrop],
  )

  async function handleSend(data: { to: string; subject: string; body: string }) {
    if (!online) {
      toast.error(t("app.offlineError"), {
        description: t("app.offlineErrorDescription"),
      })
      return
    }

    let result
    try {
      result = await sendMail({ ...data, fromName: settings.displayName })
    } catch (err) {
      toast.error(t("app.messageFailedToSend"), {
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
        name: t("app.you"),
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
    toast.success(t("app.messageSent"), { description: t("app.messageSentTo", { email: data.to }) })
  }

  // Open the realtime socket for the authenticated session. It drives the
  // "herald-sync-updated" events both the mailbox and messages views react to.
  useEffect(() => {
    return connectRealtimeSync()
  }, [])

  // Keyboard shortcuts: "c" compose, ⌘/Ctrl+, settings, ⌘/Ctrl+K command
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
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
          {t("app.offline")}
        </div>
      ) : null}
      {!overridesInitialized ? (
        <div className="flex h-dvh items-center justify-center bg-background px-6 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("app.restoringCachedMail")}</p>
            <p className="text-sm text-muted-foreground">
              {t("app.restoringCachedMailBody")}
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
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsDefaultTab}
      />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <MobileCommandDrawer
        open={mobileCommandOpen}
        onOpenChange={setMobileCommandOpen}
        onOpenSettings={openSettings}
      />
      <NewDropSheet
        open={newDropOpen}
        mode={newDropMode}
        onOpenChange={setNewDropOpen}
        onSave={(items) => {
          void createDrop(items)
          toast.success(t("drop.created"))
        }}
      />
    </AppChromeContext.Provider>
  )
}
