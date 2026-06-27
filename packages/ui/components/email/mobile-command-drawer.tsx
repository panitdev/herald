"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  Archive,
  Bell,
  ClipboardPaste,
  FileText,
  FileUp,
  Inbox,
  Mail,
  MessageSquare,
  Package,
  Palette,
  PenLine,
  Send,
  Settings,
  Star,
  Trash2,
  Type,
  User,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import {
  CommandDrawer,
  CommandDrawerContent,
  CommandDrawerGroup,
  CommandDrawerItem,
  CommandDrawerNest,
} from "@/components/ui/command-drawer"
import { Input } from "@/components/ui/input"
import { contactsQuery, userSearchQuery } from "@/lib/queries"
import { addContact, createChatConversation, removeContact } from "@/lib/api"
import { useDropStore, dropTitle } from "@/lib/drop-store"
import { useAppChrome } from "@/lib/app-chrome"
import type { ContactUser, ChatConversation } from "@/lib/api"
import type { Drop, Folder } from "@/lib/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: (tab?: string) => void
}

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

const SETTINGS_ITEMS: { id: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "account", icon: User },
  { id: "appearance", icon: Palette },
  { id: "notifications", icon: Bell },
  { id: "signature", icon: PenLine },
]

export function MobileCommandDrawer({ open, onOpenChange, onOpenSettings }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { drops, recentDrops, deleteDrop } = useDropStore()
  const { openNewDrop } = useAppChrome()

  const contactsQ = useQuery(contactsQuery())
  const contacts = contactsQ.data ?? []

  const close = () => onOpenChange(false)

  const navigateToFolder = (folder: Folder) => {
    close()
    void navigate({ to: "/$mailbox", params: { mailbox: folder } })
  }

  const handleOpenSettings = (tab?: string) => {
    close()
    setTimeout(() => onOpenSettings(tab), 200)
  }

  function openDropPage(id: string) {
    close()
    void navigate({ to: "/drop/$dropId", params: { dropId: id } })
  }

  return (
    <CommandDrawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <CommandDrawerContent title={t("mobileCommand.title")} maxHeight={560} className="max-h-[82dvh]">
        <CommandDrawerGroup>
          {/* ── Mailboxes ──────────────────────────────────────────────── */}
          <CommandDrawerNest label={t("mobileCommand.mailboxes")} icon={<Mail className="size-4" />}>
            <CommandDrawerGroup>
              {FOLDER_DEFS.map(({ id, icon: Icon, iconClass }) => (
                <CommandDrawerItem
                  key={id}
                  icon={<Icon className="size-4" />}
                  iconClassName={iconClass}
                  label={t(`sidebar.folders.${id}`)}
                  onSelect={() => navigateToFolder(id)}
                />
              ))}
            </CommandDrawerGroup>
          </CommandDrawerNest>

          {/* ── Drop ───────────────────────────────────────────────────── */}
          <CommandDrawerNest label={t("mobileCommand.drop")} icon={<Package className="size-4" />}>
            {recentDrops.length > 0 && (
              <CommandDrawerGroup>
                {recentDrops.map((drop) => (
                  <CommandDrawerItem
                    key={drop.id}
                    icon={<Package className="size-4" />}
                    label={dropTitle(drop)}
                    onSelect={() => openDropPage(drop.id)}
                  />
                ))}
              </CommandDrawerGroup>
            )}
            {drops.length > 0 && (
              <CommandDrawerGroup>
                <CommandDrawerItem
                  icon={<Package className="size-4" />}
                  label={t("mobileCommand.listAllDrops")}
                  onSelect={() => { close(); void navigate({ to: "/drop" }) }}
                />
              </CommandDrawerGroup>
            )}
            <CommandDrawerGroup>
              <CommandDrawerNest label={t("mobileCommand.newDrop")} icon={<Package className="size-4" />} iconClassName="bg-primary/10 text-primary">
                <CommandDrawerGroup>
                  <CommandDrawerItem
                    icon={<FileUp className="size-4" />}
                    label={t("mobileCommand.dropFiles")}
                    description={t("mobileCommand.dropFilesDesc")}
                    onSelect={() => { close(); setTimeout(() => openNewDrop("files"), 200) }}
                  />
                  <CommandDrawerItem
                    icon={<ClipboardPaste className="size-4" />}
                    label={t("mobileCommand.dropClipboard")}
                    description={t("mobileCommand.dropClipboardDesc")}
                    onSelect={async () => {
                      try {
                        const text = await navigator.clipboard.readText()
                        if (!text.trim()) { toast.error(t("mobileCommand.clipboardEmpty")); return }
                        close(); setTimeout(() => openNewDrop("clipboard"), 200)
                      } catch { toast.error(t("mobileCommand.clipboardFailed")) }
                    }}
                  />
                  <CommandDrawerItem
                    icon={<Type className="size-4" />}
                    label={t("mobileCommand.dropText")}
                    description={t("mobileCommand.dropTextDesc")}
                    onSelect={() => { close(); setTimeout(() => openNewDrop("text"), 200) }}
                  />
                </CommandDrawerGroup>
              </CommandDrawerNest>
            </CommandDrawerGroup>
            {drops.map((drop) => (
              <CommandDrawerNest
                key={drop.id}
                label={dropTitle(drop)}
                icon={<Package className="size-4" />}
              >
                <CommandDrawerGroup>
                  <CommandDrawerItem
                    icon={<Package className="size-4" />}
                    label={t("mobileCommand.openDrop")}
                    onSelect={() => { close(); void navigate({ to: "/drop/$dropId", params: { dropId: drop.id } }) }}
                  />
                  <CommandDrawerItem
                    icon={<Trash2 className="size-4" />}
                    iconClassName="bg-destructive/10 text-destructive"
                    label={t("mobileCommand.deleteDrop")}
                    destructive
                    onSelect={() => { deleteDrop(drop.id); toast.success(t("drop.deleted")); close() }}
                  />
                </CommandDrawerGroup>
              </CommandDrawerNest>
            ))}
          </CommandDrawerNest>

          {/* ── Contacts ───────────────────────────────────────────────── */}
          <CommandDrawerNest label={t("mobileCommand.contacts")} icon={<Users className="size-4" />}>
            <CommandDrawerGroup>
              <CommandDrawerNest label={t("mobileCommand.addContact")} icon={<UserPlus className="size-4" />}>
                <AddContactForm onClose={close} queryClient={queryClient} />
              </CommandDrawerNest>

              <CommandDrawerNest label={t("mobileCommand.listContacts")} icon={<Users className="size-4" />}>
                {contactsQ.isLoading ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">{t("mobileCommand.searching")}</p>
                ) : contacts.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">{t("mobileCommand.noContactsYet")}</p>
                ) : (
                  <CommandDrawerGroup>
                    {contacts.map((contact) => (
                      <CommandDrawerNest
                        key={contact.id}
                        label={contact.displayName}
                        icon={<User className="size-4" />}
                        description={`@${contact.username}`}
                      >
                        <ContactActions
                          contact={contact}
                          onClose={close}
                          queryClient={queryClient}
                        />
                      </CommandDrawerNest>
                    ))}
                  </CommandDrawerGroup>
                )}
              </CommandDrawerNest>
            </CommandDrawerGroup>
          </CommandDrawerNest>

          {/* ── Settings ───────────────────────────────────────────────── */}
          <CommandDrawerNest label={t("mobileCommand.settings")} icon={<Settings className="size-4" />}>
            <CommandDrawerGroup>
              {SETTINGS_ITEMS.map(({ id, icon: Icon }) => (
                <CommandDrawerItem
                  key={id}
                  icon={<Icon className="size-4" />}
                  label={t(`settings.tabs.${id}` as Parameters<typeof t>[0])}
                  description={t(`settings.tabs.${id}Description` as Parameters<typeof t>[0])}
                  onSelect={() => handleOpenSettings(id)}
                />
              ))}
            </CommandDrawerGroup>
          </CommandDrawerNest>
        </CommandDrawerGroup>
      </CommandDrawerContent>
    </CommandDrawer>
  )
}

// ─── Add contact form ────────────────────────────────────────────────────────

function AddContactForm({
  onClose,
  queryClient,
}: {
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [search, setSearch] = React.useState("")
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
          <CommandDrawerGroup>
            {users.map((user) => (
              <CommandDrawerItem
                key={user.id}
                icon={<UserPlus className="size-4" />}
                label={user.displayName}
                description={`@${user.username}`}
                onSelect={() => addMutation.mutate(user.id)}
              />
            ))}
          </CommandDrawerGroup>
        )
      ) : null}
    </div>
  )
}

// ─── Contact actions ────────────────────────────────────────────────────────

function ContactActions({
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
        (c) => c.kind === "direct" && c.participants.some((p) => p.userId === contact.id),
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
    <CommandDrawerGroup>
      <CommandDrawerItem
        icon={<MessageSquare className="size-4" />}
        label={t("mobileCommand.openChat")}
        onSelect={() => openChatMutation.mutate()}
      />
      <CommandDrawerItem
        icon={<User className="size-4" />}
        label={t("mobileCommand.seeProfile")}
        onSelect={() => { }}
      />
      <CommandDrawerItem
        icon={<UserMinus className="size-4" />}
        iconClassName="bg-destructive/10 text-destructive"
        label={t("mobileCommand.removeContact")}
        destructive
        onSelect={() => removeMutation.mutate()}
      />
    </CommandDrawerGroup>
  )
}

// ─── Debounce helper ────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
