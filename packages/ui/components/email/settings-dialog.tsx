"use client"

import { useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  User,
  Palette,
  Bell,
  PenLine,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnimatedField } from "@/components/ui/animated-field"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  ACCENTS,
  deriveInitials,
  useSettings,
  type Density,
  type ThemeMode,
} from "@/lib/settings-store"
import { useAuth } from "@/lib/auth-store"
import { addAddress, refreshSyncStateNow } from "@/lib/api"
import { toast } from "sonner"

type TabId = "account" | "appearance" | "notifications" | "signature"

const TAB_DEFS: { id: TabId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "account", icon: User },
  { id: "appearance", icon: Palette },
  { id: "notifications", icon: Bell },
  { id: "signature", icon: PenLine },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [active, setActive] = useState<TabId>("account")
  const [transitionCount, setTransitionCount] = useState(0)
  const { t } = useTranslation()

  function handleTabChange(tabId: TabId) {
    if (tabId === active) return
    setTransitionCount((count) => count + 1)
    setActive(tabId)
  }

  const tabLabels: Record<TabId, string> = {
    account: t("settings.tabs.account"),
    appearance: t("settings.tabs.appearance"),
    notifications: t("settings.tabs.notifications"),
    signature: t("settings.tabs.signature"),
  }
  const tabDescriptions: Record<TabId, string> = {
    account: t("settings.tabs.accountDescription"),
    appearance: t("settings.tabs.appearanceDescription"),
    notifications: t("settings.tabs.notificationsDescription"),
    signature: t("settings.tabs.signatureDescription"),
  }
  const activeLabel = tabLabels[active]
  const activeDescription = tabDescriptions[active]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!max-w-3xl gap-0 overflow-hidden p-0 sm:!max-w-3xl"
      >
        <div className="flex h-[560px] max-h-[85vh] flex-col md:flex-row">
          {/* Left nav */}
          <aside className="flex shrink-0 flex-col border-b border-border bg-sidebar px-3 py-4 md:w-56 md:border-b-0 md:border-r md:py-5">
            <div className="px-2 pb-3">
              <DialogTitle className="text-base font-semibold tracking-tight">
                {t("settings.title")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("settings.subtitle")}
              </DialogDescription>
            </div>
            <nav
              className="flex gap-1 overflow-x-auto scrollbar-thin md:flex-col md:gap-0.5 md:overflow-visible"
              aria-label={t("settings.navAriaLabel")}
            >
              {TAB_DEFS.map((tab) => {
                const Icon = tab.icon
                const isActive = active === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "group relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                      !isActive &&
                        "font-medium text-sidebar-foreground/75 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground",
                      isActive && "font-semibold text-sidebar-accent-foreground",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="settings-active"
                        className="absolute inset-0 rounded-lg bg-sidebar-accent ring-1 ring-sidebar-accent-foreground/10"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon
                      className={cn(
                        "relative z-10 h-4 w-4 shrink-0 transition-colors",
                        isActive
                          ? "text-sidebar-accent-foreground"
                          : "text-muted-foreground group-hover:text-sidebar-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="relative z-10">{tabLabels[tab.id]}</span>
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* Right content */}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-border px-6 py-4">
              <div className="relative h-5 overflow-hidden">
                <AnimatePresence initial={false}>
                  <motion.h3
                    key={`${active}-${transitionCount}`}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "-100%" }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-x-0 top-0 text-base font-semibold tracking-tight"
                  >
                    {activeLabel}
                  </motion.h3>
                </AnimatePresence>
              </div>
              <div className="relative h-4">
                <AnimatePresence initial={false}>
                  <motion.p
                    key={`${active}-desc-${transitionCount}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="absolute inset-x-0 top-0 text-xs text-muted-foreground"
                  >
                    {activeDescription}
                  </motion.p>
                </AnimatePresence>
              </div>
            </header>

            <div className="relative flex-1 overflow-hidden bg-background">
              <AnimatePresence initial={false}>
                <motion.div
                  key={`${active}-${transitionCount}`}
                  initial={{ opacity: 0, y: "100%", filter: "blur(1px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: "-100%", filter: "blur(1px)" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 overflow-y-auto bg-background px-6 py-5 scrollbar-thin"
                >
                  {active === "account" && <AccountPanel />}
                  {active === "appearance" && <AppearancePanel />}
                  {active === "notifications" && <NotificationsPanel />}
                  {active === "signature" && <SignaturePanel />}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
              <p className="text-[11px] text-muted-foreground">
                {t("settings.changesSaveAutomatically")}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                {t("settings.done")}
              </Button>
            </footer>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ PANELS ------------------------------ */

function Row({
  label,
  description,
  control,
}: {
  label: string
  description?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function AccountPanel() {
  const { settings, updateSettings } = useSettings()
  const { user, refresh } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [addressInput, setAddressInput] = useState("")
  const [addingAddress, setAddingAddress] = useState(false)
  const addresses = user?.addresses?.length ? user.addresses : user?.address ? [user.address] : []
  const { t } = useTranslation()

  async function fileToDataUrl(file: File): Promise<string> {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result)
        else reject(new Error("Unsupported image data"))
      }
      reader.readAsDataURL(file)
    })

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onerror = () => reject(new Error("Failed to decode image"))
      img.onload = () => resolve(img)
      img.src = source
    })

    const canvas = document.createElement("canvas")
    const size = 256
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas is unavailable")

    const scale = Math.max(size / image.width, size / image.height)
    const width = image.width * scale
    const height = image.height * scale
    const x = (size - width) / 2
    const y = (size - height) / 2

    ctx.drawImage(image, x, y, width, height)
    return canvas.toDataURL("image/webp", 0.9)
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.account.unsupportedFile"), { description: t("settings.account.chooseImageFile") })
      event.target.value = ""
      return
    }

    try {
      const avatarUrl = await fileToDataUrl(file)
      updateSettings({ avatarUrl })
      toast.success(t("settings.account.profilePhotoUpdated"))
    } catch (error) {
      toast.error(t("settings.account.couldNotUpdatePhoto"), {
        description:
          error instanceof Error ? error.message : "Try a different image file.",
      })
    } finally {
      event.target.value = ""
    }
  }

  async function handleAddAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextAddress = addressInput.trim()
    if (!nextAddress || addingAddress) return

    setAddingAddress(true)
    try {
      await addAddress({ address: nextAddress })
      setAddressInput("")
      await refresh()
      await refreshSyncStateNow()
      void queryClient.invalidateQueries({ queryKey: ["mailboxes"] })
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      toast.success(t("settings.account.addressAdded"))
    } catch (error) {
      toast.error(t("settings.account.couldNotAddAddress"), {
        description: error instanceof Error ? error.message : "Try a different address.",
      })
    } finally {
      setAddingAddress(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={settings.avatarUrl ?? undefined} alt={settings.displayName} />
          <AvatarFallback
            className="text-base font-semibold"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
          >
            {settings.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{settings.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {user?.address ?? ""}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          {t("settings.account.uploadPhoto")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!settings.avatarUrl}
          onClick={() => updateSettings({ avatarUrl: null })}
        >
          {t("settings.account.remove")}
        </Button>
      </div>

      <Separator />

      <div className="grid gap-4">
        <AnimatedField
          id="display-name"
          label={t("settings.account.displayName")}
          value={settings.displayName}
          onChange={(v) => {
            updateSettings({ displayName: v, initials: deriveInitials(v) })
          }}
          placeholder={t("settings.account.displayNamePlaceholder")}
          autoComplete="name"
        />
        <AnimatedField
          id="email"
          label={t("settings.account.emailAddress")}
          type="email"
          value={user?.address ?? ""}
          onChange={() => {}}
          placeholder={t("settings.account.emailPlaceholder")}
          autoComplete="email"
          disabled
        />
      </div>

      <Separator />

      <div className="grid gap-3">
        <div>
          <Label className="text-sm font-medium">{t("settings.account.availableAddresses")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.account.availableAddressesHint")}
          </p>
        </div>
        <div className="grid gap-2">
          {addresses.map((address) => (
            <div
              key={address}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="truncate">{address}</span>
              {address === user?.address && (
                <span className="ml-3 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t("settings.account.default")}
                </span>
              )}
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={handleAddAddress}>
          <Input
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            placeholder={t("settings.account.addressPlaceholder")}
            autoComplete="off"
            disabled={addingAddress}
          />
          <Button type="submit" disabled={!addressInput.trim() || addingAddress}>
            {t("settings.account.add")}
          </Button>
        </form>
      </div>
    </div>
  )
}

const SUPPORTED_LANGUAGES = [
  { code: "auto", nameKey: "settings.appearance.languageAuto" },
  { code: "en", nameKey: "settings.appearance.languageEnglish" },
  { code: "ko", nameKey: "settings.appearance.languageKorean" },
] as const

function AppearancePanel() {
  const { settings, updateSettings } = useSettings()
  const { t } = useTranslation()

  const themes: { id: ThemeMode; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "light", icon: Sun },
    { id: "dark", icon: Moon },
    { id: "system", icon: Monitor },
  ]

  const themeLabels: Record<ThemeMode, string> = {
    light: t("settings.appearance.themeLight"),
    dark: t("settings.appearance.themeDark"),
    system: t("settings.appearance.themeSystem"),
  }

  const densities: { id: Density }[] = [
    { id: "comfortable" },
    { id: "cozy" },
    { id: "compact" },
  ]

  const densityLabels: Record<Density, string> = {
    comfortable: t("settings.appearance.densityComfortable"),
    cozy: t("settings.appearance.densityCozy"),
    compact: t("settings.appearance.densityCompact"),
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          {t("settings.appearance.theme")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((theme) => {
            const Icon = theme.icon
            const isActive = settings.theme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => updateSettings({ theme: theme.id })}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border hover:bg-accent/50",
                )}
                aria-pressed={isActive}
              >
                <motion.span
                  whileTap={{ scale: 0.94 }}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </motion.span>
                {themeLabels[theme.id]}
                {isActive && (
                  <motion.span
                    layoutId="theme-check"
                    className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Check className="h-3 w-3" aria-hidden />
                  </motion.span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          {t("settings.appearance.accent")}
        </Label>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => {
            const isActive = settings.accent === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => updateSettings({ accent: a.id })}
                className={cn(
                  "group relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-foreground/20 bg-foreground/5"
                    : "border-border hover:bg-accent/50",
                )}
                aria-pressed={isActive}
              >
                <span
                  className="h-3 w-3 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                {a.label}
                {isActive && (
                  <motion.span
                    layoutId="accent-check"
                    className="ml-0.5"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Check className="h-3 w-3" aria-hidden />
                  </motion.span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("settings.appearance.accentHint")}
        </p>
      </div>

      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          {t("settings.appearance.density")}
        </Label>
        <div className="flex rounded-lg bg-muted p-1">
          {densities.map((d) => {
            const isActive = settings.density === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => updateSettings({ density: d.id })}
                className={cn(
                  "relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={isActive}
              >
                {isActive && (
                  <motion.span
                    layoutId="density-active"
                    className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{densityLabels[d.id]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          {t("settings.appearance.language")}
        </Label>
        <div className="flex rounded-lg bg-muted p-1">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = settings.language === lang.code
            const label = t(lang.nameKey)
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => updateSettings({ language: lang.code })}
                className={cn(
                  "relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={isActive}
              >
                {isActive && (
                  <motion.span
                    layoutId="language-active"
                    className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("settings.appearance.languageHint")}
        </p>
      </div>
    </div>
  )
}

function NotificationsPanel() {
  const { settings, setSettings } = useSettings()
  const n = settings.notifications
  const { t } = useTranslation()

  function set<K extends keyof typeof n>(key: K, v: boolean) {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: v },
    }))
  }

  return (
    <div className="flex flex-col">
      <Row
        label={t("settings.notifications.desktop")}
        description={t("settings.notifications.desktopDescription")}
        control={
          <Switch
            checked={n.desktop}
            onCheckedChange={(v) => set("desktop", v)}
            aria-label={t("settings.notifications.desktop")}
          />
        }
      />
      <Separator />
      <Row
        label={t("settings.notifications.sound")}
        description={t("settings.notifications.soundDescription")}
        control={
          <Switch
            checked={n.sound}
            onCheckedChange={(v) => set("sound", v)}
            aria-label={t("settings.notifications.sound")}
          />
        }
      />
      <Separator />
      <Row
        label={t("settings.notifications.mentionsOnly")}
        description={t("settings.notifications.mentionsOnlyDescription")}
        control={
          <Switch
            checked={n.mentionsOnly}
            onCheckedChange={(v) => set("mentionsOnly", v)}
            aria-label={t("settings.notifications.mentionsOnly")}
          />
        }
      />
      <Separator />
      <Row
        label={t("settings.notifications.digest")}
        description={t("settings.notifications.digestDescription")}
        control={
          <Switch
            checked={n.digest}
            onCheckedChange={(v) => set("digest", v)}
            aria-label={t("settings.notifications.digest")}
          />
        }
      />
    </div>
  )
}

function SignaturePanel() {
  const { settings, updateSettings } = useSettings()
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="signature">{t("settings.signature.label")}</Label>
        <Textarea
          id="signature"
          rows={5}
          value={settings.signature}
          onChange={(e) => updateSettings({ signature: e.target.value })}
          placeholder={`Kind regards,\n${settings.displayName || "Me"}`}
          className="resize-none"
        />
        <p className="text-[11px] text-muted-foreground">
          {t("settings.signature.hint")}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("settings.signature.preview")}
        </div>
        <AnimatePresence mode="wait">
          <motion.pre
            key={settings.signature}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="whitespace-pre-wrap font-sans text-sm text-foreground/80"
          >
            {settings.signature || <span className="text-muted-foreground">{t("settings.signature.noSignatureSet")}</span>}
          </motion.pre>
        </AnimatePresence>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            updateSettings({
              signature: "Sent from Inbox — a calmer email client.",
            })
            toast.success(t("settings.signature.resetSuccess"))
          }}
        >
          {t("settings.signature.resetToDefault")}
        </Button>
      </div>
    </div>
  )
}
