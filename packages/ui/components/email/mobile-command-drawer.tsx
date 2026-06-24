"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Archive,
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  Palette,
  PenLine,
  Send,
  Settings,
  Star,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Drawer as DrawerPrimitive } from "vaul"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { contactsQuery, userSearchQuery } from "@/lib/queries"
import { addContact, createChatConversation, removeContact } from "@/lib/api"
import type { ContactUser, ChatConversation } from "@/lib/api"
import type { Folder } from "@/lib/types"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | { id: "root" }
  | { id: "mailboxes" }
  | { id: "contacts" }
  | { id: "add-contact" }
  | { id: "list-contacts" }
  | { id: "contact-actions"; contact: ContactUser }
  | { id: "settings" }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: (tab?: string) => void
}

// ─── Animation ────────────────────────────────────────────────────────────────

const pageVariants = {
  initial: (dir: number) => ({
    opacity: 0,
    filter: "blur(6px)",
    x: dir > 0 ? 20 : -20,
  }),
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    x: 0,
  },
  exit: (dir: number) => ({
    opacity: 0,
    filter: "blur(6px)",
    x: dir > 0 ? -20 : 20,
  }),
}

const pageTrans = { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const }

// ─── Main component ───────────────────────────────────────────────────────────

export function MobileCommandDrawer({ open, onOpenChange, onOpenSettings }: Props) {
  const [stack, setStack] = useState<Screen[]>([{ id: "root" }])
  const [direction, setDirection] = useState<1 | -1>(1)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const current = stack[stack.length - 1]!
  const canGoBack = stack.length > 1

  // Reset stack after close animation
  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setStack([{ id: "root" }])
        setDirection(1)
      }, 350)
      return () => clearTimeout(id)
    }
  }, [open])

  const push = (screen: Screen) => {
    setDirection(1)
    setStack((s) => [...s, screen])
  }

  const pop = () => {
    if (stack.length <= 1) return
    setDirection(-1)
    setStack((s) => s.slice(0, -1))
  }

  const close = () => onOpenChange(false)

  const navigateToFolder = (folder: Folder) => {
    close()
    void navigate({ to: "/$mailbox", params: { mailbox: folder } })
  }

  const handleOpenSettings = (tab?: string) => {
    close()
    setTimeout(() => onOpenSettings(tab), 200)
  }

  const screenKey =
    current.id === "contact-actions"
      ? `contact-actions-${current.contact.id}`
      : current.id

  const title = getTitle(current, t)

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        {/* Backdrop with blur */}
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />

        <DrawerPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col rounded-t-[20px] border-t border-border bg-background outline-none"
        >
          <DrawerPrimitive.Title className="sr-only">{title}</DrawerPrimitive.Title>

          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/25" />

          {/* Header */}
          <div className="flex h-11 shrink-0 items-center gap-1 px-2">
            {/* Back button slot — constant width prevents layout shift */}
            <div className="flex w-9 shrink-0 items-center justify-center">
              <AnimatePresence mode="wait">
                {canGoBack ? (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, x: -6, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.85 }}
                    transition={{ duration: 0.14 }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={pop}
                      aria-label={t("mobileCommand.back")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Animated title */}
            <div className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={screenKey + "-title"}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.14 }}
                  className="absolute inset-0 flex items-center text-sm font-semibold"
                >
                  {title}
                </motion.p>
              </AnimatePresence>
            </div>

            <DrawerPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t("mobileCommand.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </DrawerPrimitive.Close>
          </div>

          {/* Screen content with blur crossfade */}
          <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={screenKey}
                custom={direction}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTrans}
                className="w-full"
              >
                <ScreenContent
                  screen={current}
                  onPush={push}
                  onNavigateToFolder={navigateToFolder}
                  onOpenSettings={handleOpenSettings}
                  onClose={close}
                  queryClient={queryClient}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

// ─── Screen dispatcher ────────────────────────────────────────────────────────

type ScreenContentProps = {
  screen: Screen
  onPush: (s: Screen) => void
  onNavigateToFolder: (f: Folder) => void
  onOpenSettings: (tab?: string) => void
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}

function ScreenContent({ screen, onPush, onNavigateToFolder, onOpenSettings, onClose, queryClient }: ScreenContentProps) {
  switch (screen.id) {
    case "root":
      return <RootScreen onPush={onPush} />
    case "mailboxes":
      return <MailboxesScreen onNavigateTo={onNavigateToFolder} />
    case "contacts":
      return <ContactsScreen onPush={onPush} />
    case "add-contact":
      return <AddContactScreen onClose={onClose} queryClient={queryClient} />
    case "list-contacts":
      return <ListContactsScreen onPush={onPush} />
    case "contact-actions":
      return (
        <ContactActionsScreen
          contact={screen.contact}
          onClose={onClose}
          queryClient={queryClient}
        />
      )
    case "settings":
      return <SettingsScreen onOpenSettings={onOpenSettings} />
  }
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function MenuGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 my-3 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
      {children}
    </div>
  )
}

type MenuItemProps = {
  label: string
  icon: React.ReactNode
  iconClassName?: string
  onClick: () => void
  chevron?: boolean
  description?: string
  destructive?: boolean
}

function MenuItem({ label, icon, iconClassName, onClick, chevron = false, description, destructive = false }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/70",
        destructive && "text-destructive",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted/60",
          destructive && "bg-destructive/10",
          iconClassName,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-tight">{label}</div>
        {description ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {chevron ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
    </button>
  )
}

// ─── Root screen ──────────────────────────────────────────────────────────────

function RootScreen({ onPush }: { onPush: (s: Screen) => void }) {
  const { t } = useTranslation()
  return (
    <div className="pb-6">
      <MenuGroup>
        <MenuItem
          icon={<Mail className="h-4 w-4" />}
          label={t("mobileCommand.mailboxes")}
          onClick={() => onPush({ id: "mailboxes" })}
          chevron
        />
        <MenuItem
          icon={<Users className="h-4 w-4" />}
          label={t("mobileCommand.contacts")}
          onClick={() => onPush({ id: "contacts" })}
          chevron
        />
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label={t("mobileCommand.settings")}
          onClick={() => onPush({ id: "settings" })}
          chevron
        />
      </MenuGroup>
    </div>
  )
}

// ─── Mailboxes screen ─────────────────────────────────────────────────────────

const FOLDER_DEFS: {
  id: Folder
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
}[] = [
  { id: "inbox", icon: Inbox, iconClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "starred", icon: Star, iconClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  { id: "sent", icon: Send, iconClass: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { id: "drafts", icon: FileText, iconClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { id: "archive", icon: Archive, iconClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  { id: "trash", icon: Trash2, iconClass: "bg-red-500/10 text-red-600 dark:text-red-400" },
]

function MailboxesScreen({ onNavigateTo }: { onNavigateTo: (f: Folder) => void }) {
  const { t } = useTranslation()
  return (
    <div className="pb-6">
      <MenuGroup>
        {FOLDER_DEFS.map(({ id, icon: Icon, iconClass }) => (
          <MenuItem
            key={id}
            icon={<Icon className="h-4 w-4" />}
            iconClassName={iconClass}
            label={t(`sidebar.folders.${id}`)}
            onClick={() => onNavigateTo(id)}
          />
        ))}
      </MenuGroup>
    </div>
  )
}

// ─── Contacts screen ──────────────────────────────────────────────────────────

function ContactsScreen({ onPush }: { onPush: (s: Screen) => void }) {
  const { t } = useTranslation()
  return (
    <div className="pb-6">
      <MenuGroup>
        <MenuItem
          icon={<UserPlus className="h-4 w-4" />}
          label={t("mobileCommand.addContact")}
          onClick={() => onPush({ id: "add-contact" })}
          chevron
        />
        <MenuItem
          icon={<Users className="h-4 w-4" />}
          label={t("mobileCommand.listContacts")}
          onClick={() => onPush({ id: "list-contacts" })}
          chevron
        />
      </MenuGroup>
    </div>
  )
}

// ─── Add contact screen ───────────────────────────────────────────────────────

function AddContactScreen({
  onClose,
  queryClient,
}: {
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  const { t } = useTranslation()

  const searchQ = useQuery(userSearchQuery(debouncedSearch))
  const users = debouncedSearch.trim() ? (searchQ.data ?? []) : []

  const addMutation = useMutation({
    mutationFn: (userId: string) => addContact(userId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success(t("mobileCommand.contactAdded", { name: data.contact.displayName }))
      onClose()
    },
    onError: (err) => {
      toast.error(t("mobileCommand.contactAddFailed"), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  return (
    <div className="pb-6">
      <div className="px-3 pb-1 pt-1">
        <Input
          placeholder={t("mobileCommand.searchPeople")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="h-10"
        />
      </div>
      {debouncedSearch.trim() ? (
        searchQ.isLoading ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("mobileCommand.searching")}</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("mobileCommand.noUsersFound")}</p>
        ) : (
          <MenuGroup>
            {users.map((user) => (
              <MenuItem
                key={user.id}
                icon={<UserPlus className="h-4 w-4" />}
                label={user.displayName}
                description={`@${user.username}`}
                onClick={() => addMutation.mutate(user.id)}
              />
            ))}
          </MenuGroup>
        )
      ) : null}
    </div>
  )
}

// ─── List contacts screen ─────────────────────────────────────────────────────

function ListContactsScreen({ onPush }: { onPush: (s: Screen) => void }) {
  const { t } = useTranslation()
  const contactsQ = useQuery(contactsQuery())
  const contacts = contactsQ.data ?? []

  if (contactsQ.isLoading) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">{t("mobileCommand.searching")}</p>
    )
  }

  if (contacts.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">{t("mobileCommand.noContactsYet")}</p>
    )
  }

  return (
    <div className="pb-6">
      <MenuGroup>
        {contacts.map((contact) => (
          <MenuItem
            key={contact.id}
            icon={<User className="h-4 w-4" />}
            label={contact.displayName}
            description={`@${contact.username}`}
            onClick={() => onPush({ id: "contact-actions", contact })}
            chevron
          />
        ))}
      </MenuGroup>
    </div>
  )
}

// ─── Contact actions screen ───────────────────────────────────────────────────

function ContactActionsScreen({
  contact,
  onClose,
  queryClient,
}: {
  contact: ContactUser
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const openChatMutation = useMutation({
    mutationFn: async () => {
      const conversations = queryClient.getQueryData<ChatConversation[]>(["chatConversations"])
      const existing = conversations?.find(
        (c) =>
          c.kind === "direct" &&
          c.participants.some((p) => p.userId === contact.id),
      )
      if (existing) return existing
      const result = await createChatConversation({ kind: "direct", user_id: contact.id })
      await queryClient.invalidateQueries({ queryKey: ["chatConversations"] })
      return result.conversation
    },
    onSuccess: (conversation) => {
      onClose()
      void navigate({ to: "/messages/$conversationId", params: { conversationId: conversation.id } })
    },
    onError: (err) => {
      toast.error(t("mobileCommand.openChatFailed"), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => removeContact(contact.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success(t("mobileCommand.contactRemoved", { name: contact.displayName }))
      onClose()
    },
    onError: (err) => {
      toast.error(t("mobileCommand.contactRemoveFailed"), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  return (
    <div className="pb-6">
      <MenuGroup>
        <MenuItem
          icon={<MessageSquare className="h-4 w-4" />}
          label={t("mobileCommand.openChat")}
          onClick={() => openChatMutation.mutate()}
        />
        <MenuItem
          icon={<User className="h-4 w-4" />}
          label={t("mobileCommand.seeProfile")}
          onClick={() => {/* profile view not yet implemented */}}
        />
        <MenuItem
          icon={<UserMinus className="h-4 w-4" />}
          iconClassName="bg-destructive/10 text-destructive"
          label={t("mobileCommand.removeContact")}
          onClick={() => removeMutation.mutate()}
          destructive
        />
      </MenuGroup>
    </div>
  )
}

// ─── Settings screen ──────────────────────────────────────────────────────────

const SETTINGS_TABS: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  labelKey: string
  descKey: string
}[] = [
  { id: "account", icon: User, labelKey: "settings.tabs.account", descKey: "settings.tabs.accountDescription" },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance", descKey: "settings.tabs.appearanceDescription" },
  { id: "notifications", icon: Bell, labelKey: "settings.tabs.notifications", descKey: "settings.tabs.notificationsDescription" },
  { id: "signature", icon: PenLine, labelKey: "settings.tabs.signature", descKey: "settings.tabs.signatureDescription" },
]

function SettingsScreen({ onOpenSettings }: { onOpenSettings: (tab?: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="pb-6">
      <MenuGroup>
        {SETTINGS_TABS.map(({ id, icon: Icon, labelKey, descKey }) => (
          <MenuItem
            key={id}
            icon={<Icon className="h-4 w-4" />}
            label={t(labelKey)}
            description={t(descKey)}
            onClick={() => onOpenSettings(id)}
          />
        ))}
      </MenuGroup>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTitle(screen: Screen, t: (key: string) => string): string {
  switch (screen.id) {
    case "root": return t("mobileCommand.title")
    case "mailboxes": return t("mobileCommand.mailboxes")
    case "contacts": return t("mobileCommand.contacts")
    case "add-contact": return t("mobileCommand.addContact")
    case "list-contacts": return t("mobileCommand.listContacts")
    case "contact-actions": return screen.contact.displayName
    case "settings": return t("mobileCommand.settings")
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
