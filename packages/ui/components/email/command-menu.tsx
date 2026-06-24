"use client"

import * as React from "react"
import { MessageSquare, User, UserMinus, UserPlus, Users } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandNest,
  useCommandSearch,
} from "@/components/ui/command"
import { contactsQuery, userSearchQuery } from "@/lib/queries"
import { addContact, createChatConversation, removeContact } from "@/lib/api"
import type { ContactUser } from "@/lib/api"
import type { ChatConversation } from "@/lib/api"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandMenu({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const close = () => onOpenChange(false)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Contacts">
            <CommandNest
              label="Add contact"
              icon={<UserPlus />}
              placeholder="Search users..."
            >
              <CommandGroup heading="Users">
                <AddContactContent
                  onAdded={() => {
                    void queryClient.invalidateQueries({ queryKey: ["contacts"] })
                    close()
                  }}
                />
              </CommandGroup>
            </CommandNest>

            <CommandNest
              label="Show contacts"
              icon={<Users />}
              placeholder="Filter contacts..."
            >
              <ShowContactsContent
                onClose={close}
                queryClient={queryClient}
              />
            </CommandNest>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

// ─── Add Contact ──────────────────────────────────────────────────────────────

function AddContactContent({ onAdded }: { onAdded: () => void }) {
  const search = useCommandSearch()
  const debouncedSearch = useDebounce(search, 250)

  const searchQ = useQuery(userSearchQuery(debouncedSearch))
  const users = debouncedSearch.trim() ? (searchQ.data ?? []) : []

  const addMutation = useMutation({
    mutationFn: (userId: string) => addContact(userId),
    onSuccess: (data) => {
      toast.success(`Added ${data.contact.displayName} to contacts`)
      onAdded()
    },
    onError: (err) => {
      toast.error("Failed to add contact", {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  if (!debouncedSearch.trim()) return null

  if (searchQ.isLoading) {
    return (
      <CommandItem disabled>
        <span className="text-muted-foreground">Searching...</span>
      </CommandItem>
    )
  }

  if (users.length === 0) {
    return (
      <CommandItem disabled>
        <span className="text-muted-foreground">No users found</span>
      </CommandItem>
    )
  }

  return (
    <>
      {users.map((user) => (
        <CommandItem
          key={user.id}
          value={user.username}
          keywords={[user.displayName]}
          onSelect={() => addMutation.mutate(user.id)}
        >
          <UserPlus />
          <span>{user.displayName}</span>
          <span className="ml-auto text-sm text-muted-foreground">
            @{user.username}
          </span>
        </CommandItem>
      ))}
    </>
  )
}

// ─── Show Contacts ────────────────────────────────────────────────────────────

function ShowContactsContent({
  onClose,
  queryClient,
}: {
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const navigate = useNavigate()
  const contactsQ = useQuery(contactsQuery())
  const contacts = contactsQ.data ?? []

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeContact(userId),
    onSuccess: (_data, userId) => {
      const contact = contacts.find((c) => c.id === userId)
      toast.success(`Removed ${contact?.displayName ?? "contact"} from contacts`)
      void queryClient.invalidateQueries({ queryKey: ["contacts"] })
      onClose()
    },
    onError: (err) => {
      toast.error("Failed to remove contact", {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const openChatMutation = useMutation({
    mutationFn: async (contact: ContactUser) => {
      const conversations = queryClient.getQueryData<ChatConversation[]>([
        "chatConversations",
      ])
      const existing = conversations?.find(
        (c) =>
          c.kind === "direct" &&
          c.participants.some((p) => p.userId === contact.id),
      )
      if (existing) return existing
      const result = await createChatConversation({
        kind: "direct",
        user_id: contact.id,
      })
      await queryClient.invalidateQueries({ queryKey: ["chatConversations"] })
      return result.conversation
    },
    onSuccess: (conversation) => {
      onClose()
      void navigate({
        to: "/messages/$conversationId",
        params: { conversationId: conversation.id },
      })
    },
    onError: (err) => {
      toast.error("Failed to open chat", {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  if (contacts.length === 0 && !contactsQ.isLoading) {
    return (
      <CommandGroup>
        <CommandItem disabled>
          <span className="text-muted-foreground">No contacts yet</span>
        </CommandItem>
      </CommandGroup>
    )
  }

  return (
    <CommandGroup heading="Your contacts">
      {contacts.map((contact) => (
        <CommandNest
          key={contact.id}
          label={contact.displayName}
          icon={<User />}
          placeholder="Choose action..."
          keywords={[contact.username]}
        >
          <CommandGroup heading={contact.displayName}>
            <CommandItem
              onSelect={() => openChatMutation.mutate(contact)}
            >
              <MessageSquare />
              <span>Open chat</span>
            </CommandItem>
            <CommandItem onSelect={() => {/* no-op */}}>
              <User />
              <span>See profile</span>
            </CommandItem>
            <CommandItem
              onSelect={() => removeMutation.mutate(contact.id)}
            >
              <UserMinus />
              <span>Remove from contacts</span>
            </CommandItem>
          </CommandGroup>
        </CommandNest>
      ))}
    </CommandGroup>
  )
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
