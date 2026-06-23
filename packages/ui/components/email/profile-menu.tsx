"use client"

import { motion } from "framer-motion"
import {
  ChevronsUpDown,
  Settings,
  Sun,
  Moon,
  Monitor,
  LogOut,
  UserCircle2,
  HelpCircle,
  Check,
  Globe,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSettings } from "@/lib/settings-store"
import { useAuth } from "@/lib/auth-store"
import { toast } from "sonner"

const LANGUAGE_OPTIONS = [
  { code: "auto", nameKey: "settings.appearance.languageAuto" },
  { code: "en", nameKey: "settings.appearance.languageEnglish" },
  { code: "ko", nameKey: "settings.appearance.languageKorean" },
] as const

type Props = {
  onOpenSettings: () => void
}

export function ProfileMenu({ onOpenSettings }: Props) {
  const { settings, updateSettings, resolvedTheme } = useSettings()
  const { logout, user } = useAuth()
  const { t } = useTranslation()

  const ThemeIcon =
    settings.theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("profileMenu.openProfileMenu")}
        >
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={settings.avatarUrl ?? undefined} alt={settings.displayName} />
            <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
              {settings.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {settings.displayName}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {user?.address ?? ""}
            </div>
          </div>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </motion.button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-64"
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-10 w-10">
            <AvatarImage src={settings.avatarUrl ?? undefined} alt={settings.displayName} />
            <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
              {settings.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {settings.displayName}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {user?.address ?? ""}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onOpenSettings()
          }}
        >
          <UserCircle2 className="h-4 w-4" />
          {t("profileMenu.account")}
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings className="h-4 w-4" />
          {t("profileMenu.settings")}
          <span className="ml-auto text-[10px] text-muted-foreground">⌘,</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon className="h-4 w-4" />
            {t("profileMenu.theme")}
            <span className="ml-auto text-xs capitalize text-muted-foreground">
              {settings.theme}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent sideOffset={6} className="w-44">
              <DropdownMenuRadioGroup
                value={settings.theme}
                onValueChange={(v) => updateSettings({ theme: v as typeof settings.theme })}
              >
                <DropdownMenuRadioItem value="light">
                  <Sun className="h-4 w-4" />
                  {t("profileMenu.themeLight")}
                  {settings.theme === "light" && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon className="h-4 w-4" />
                  {t("profileMenu.themeDark")}
                  {settings.theme === "dark" && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor className="h-4 w-4" />
                  {t("profileMenu.themeSystem")}
                  {settings.theme === "system" && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="h-4 w-4" />
            {t("profileMenu.language")}
            <span className="ml-auto text-xs text-muted-foreground">
              {t(
                LANGUAGE_OPTIONS.find((l) => l.code === settings.language)?.nameKey ??
                  "settings.appearance.languageAuto",
              )}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent sideOffset={6} className="w-44">
              <DropdownMenuRadioGroup
                value={settings.language}
                onValueChange={(v) => updateSettings({ language: v })}
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <DropdownMenuRadioItem key={lang.code} value={lang.code}>
                    {t(lang.nameKey)}
                    {settings.language === lang.code && (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    )}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => toast.info(t("profileMenu.keyboardShortcutsTitle"), { description: t("profileMenu.keyboardShortcutsDescription") })}>
          <HelpCircle className="h-4 w-4" />
          {t("profileMenu.helpAndShortcuts")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {user && (
          <div className="px-2 py-1.5">
            <p className="truncate text-[11px] text-muted-foreground">{user.address}</p>
          </div>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          {t("profileMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
