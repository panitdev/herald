import { createContext, useContext, useMemo, useState } from "react"
import {
  Outlet,
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Menu, Loader2 } from "lucide-react"

import { EmailSidebar } from "@/components/email/sidebar"
import { EmailList } from "@/components/email/email-list"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { mailboxesQuery, messagesQuery } from "@/lib/queries"
import { transformMessage } from "@/lib/email-transform"
import { useMergedEmails } from "@/lib/local-overrides-store"
import { useEmailActions } from "@/lib/use-email-actions"
import { useAppChrome } from "@/lib/app-chrome"
import type { Email, Folder } from "@/lib/types"

const VALID_FOLDERS: Folder[] = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "trash",
]

export const Route = createFileRoute("/_app/$mailbox")({
  loader: async ({ context: { queryClient }, params: { mailbox } }) => {
    const mailboxes = await queryClient.ensureQueryData(mailboxesQuery())
    const id =
      mailbox === "starred" || mailbox === "drafts"
        ? null
        : (mailboxes.find((m) => m.name === mailbox)?.id ?? null)
    if (id) await queryClient.ensureQueryData(messagesQuery(id))
  },
  component: MailboxRoute,
})

type MailboxCtx = {
  mailbox: Folder
  combined: Email[]
  selectedId: string | null
  actions: ReturnType<typeof useEmailActions>
}

const MailboxContext = createContext<MailboxCtx | null>(null)

export function useMailboxCtx() {
  const ctx = useContext(MailboxContext)
  if (!ctx) throw new Error("useMailboxCtx must be used within $mailbox route")
  return ctx
}

function MailboxRoute() {
  const { mailbox: rawMailbox } = Route.useParams()
  const mailbox = (
    VALID_FOLDERS.includes(rawMailbox as Folder) ? rawMailbox : "inbox"
  ) as Folder
  const navigate = useNavigate()
  const { openCompose, openSettings } = useAppChrome()

  // selectedId comes from the optional $messageId child route.
  const childParams = useParams({ strict: false }) as { messageId?: string }
  const selectedId = childParams.messageId ?? null

  const [search, setSearch] = useState("")

  const mailboxesQ = useQuery(mailboxesQuery())
  const activeMailboxId = useMemo(() => {
    if (mailbox === "starred" || mailbox === "drafts") return null
    return mailboxesQ.data?.find((m) => m.name === mailbox)?.id ?? null
  }, [mailbox, mailboxesQ.data])

  const messagesQ = useQuery(messagesQuery(activeMailboxId))
  const apiEmails = useMemo<Email[]>(
    () => (messagesQ.data ?? []).map((m) => transformMessage(m, mailbox)),
    [messagesQ.data, mailbox],
  )

  const { combined, filtered, counts, unreadCount } = useMergedEmails(
    apiEmails,
    mailbox,
    search,
  )

  const actions = useEmailActions(mailbox, combined)
  const selected = selectedId
    ? combined.find((e) => e.id === selectedId) ?? null
    : null

  const ctx: MailboxCtx = { mailbox, combined, selectedId, actions }

  const loading =
    activeMailboxId !== null && (messagesQ.isLoading || mailboxesQ.isLoading)
  const error = messagesQ.error || mailboxesQ.error

  const sidebarNode = (
    <EmailSidebar
      active={mailbox}
      onSelect={(f) => navigate({ to: "/$mailbox", params: { mailbox: f } })}
      counts={counts}
      onCompose={() => openCompose()}
      onOpenSettings={openSettings}
    />
  )

  return (
    <MailboxContext.Provider value={ctx}>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className="hidden w-64 shrink-0 border-r border-border md:block lg:w-72">
          {sidebarNode}
        </div>

        {/* Main area */}
        <div className="relative flex min-w-0 flex-1">
          {/* Email list pane */}
          <div
            className={`flex min-w-0 flex-col border-r border-border md:w-[340px] lg:w-[380px] xl:w-[420px] ${
              selected ? "hidden md:flex" : "flex w-full"
            }`}
          >
            {/* Mobile top bar */}
            <div className="flex items-center gap-1 border-b border-border px-2 py-2 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetTitle className="sr-only">Folders</SheetTitle>
                  {sidebarNode}
                </SheetContent>
              </Sheet>
              <span className="text-sm font-medium">Mail</span>
            </div>

            <div className="min-h-0 flex-1">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <p className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Failed to load"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      mailboxesQ.refetch()
                      messagesQ.refetch()
                    }}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <EmailList
                  folder={mailbox}
                  emails={filtered}
                  selectedId={selectedId}
                  onSelect={actions.handleSelect}
                  onToggleStar={actions.handleToggleStar}
                  onToggleRead={actions.handleToggleRead}
                  onArchive={(id) => actions.handleArchive(id, selectedId)}
                  onDelete={(id) => actions.handleDelete(id, selectedId)}
                  onReply={(id) =>
                    actions.handleReply(combined.find((e) => e.id === id) ?? null)
                  }
                  search={search}
                  onSearchChange={setSearch}
                  unreadCount={unreadCount}
                />
              )}
            </div>
          </div>

          {/* Detail pane / mobile overlay — rendered by child routes */}
          <Outlet />
        </div>
      </div>
    </MailboxContext.Provider>
  )
}
