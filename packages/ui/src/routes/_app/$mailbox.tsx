import { useEffect, useMemo, useState } from "react"
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Menu, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { EmailSidebar } from "@/components/email/sidebar"
import { EmailList } from "@/components/email/email-list"
import { EmailDetail } from "@/components/email/email-detail"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { mailboxesQuery, messageBodyQuery, messagesQuery } from "@/lib/queries"
import { getRawEmailBlob, refreshSyncStateNow } from "@/lib/api"
import { transformMessage } from "@/lib/email-transform"
import { useMergedEmails } from "@/lib/local-overrides-store"
import { useEmailActions } from "@/lib/use-email-actions"
import { useAppChrome } from "@/lib/app-chrome"
import type { Email, Folder } from "@/lib/types"
import { useOnlineStatus } from "@/lib/network-store"

const VALID_FOLDERS: Folder[] = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "trash",
]

export const Route = createFileRoute("/_app/$mailbox")({
  // ssr: false because this route uses useAppChrome() (provided by _app's
  // AppLayout) which is itself ssr: false.
  ssr: false,
  component: MailboxRoute,
})

const noop = () => {}

function MailboxRoute() {
  const { t } = useTranslation()
  const { mailbox: rawMailbox } = Route.useParams()
  const mailbox = (
    VALID_FOLDERS.includes(rawMailbox as Folder) ? rawMailbox : "inbox"
  ) as Folder
  const navigate = useNavigate()
  const { openCompose, openSettings } = useAppChrome()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()

  // selectedId comes from the optional $messageId child route.
  const childParams = useParams({ strict: false }) as { messageId?: string }
  const selectedId = childParams.messageId ?? null

  const [search, setSearch] = useState("")

  const mailboxesQ = useQuery(mailboxesQuery())
  const messagesQ = useQuery(messagesQuery(mailbox === "starred" ? null : mailbox))
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

  const loading =
    mailbox !== "starred" && (messagesQ.isLoading || mailboxesQ.isLoading)
  const error = messagesQ.error || mailboxesQ.error

  const sidebarNode = (
    <EmailSidebar
      active={mailbox}
      onSelect={(f) => navigate({ to: "/$mailbox", params: { mailbox: f } })}
      onOpenMessages={() => navigate({ to: "/messages" })}
      counts={counts}
      onCompose={() => openCompose()}
      onOpenSettings={openSettings}
    />
  )

  useEffect(() => {
    const onSyncUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["mailboxes"] })
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      void queryClient.invalidateQueries({ queryKey: ["messageBody"] })
    }

    window.addEventListener("herald-sync-updated", onSyncUpdated)
    return () => window.removeEventListener("herald-sync-updated", onSyncUpdated)
  }, [queryClient])

  useEffect(() => {
    if (!online) return
    void refreshSyncStateNow()
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["mailboxes"] })
        void queryClient.invalidateQueries({ queryKey: ["messages"] })
      })
      .catch(() => {
        // Cached data stays visible if reconnect refresh fails.
      })
  }, [online, queryClient])

  return (
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
                <Button variant="ghost" size="icon" aria-label={t("app.openMenu")}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">{t("app.folders")}</SheetTitle>
                {sidebarNode}
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium">{t("app.mail")}</span>
          </div>

          <div className="min-h-0 flex-1">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">
                  {error instanceof Error ? error.message : t("app.failedToLoad")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    mailboxesQ.refetch()
                    messagesQ.refetch()
                  }}
                >
                  {t("app.retry")}
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

        {selectedId ? (
          <MessageDetailPane
            actions={actions}
            email={selected}
            messageId={selectedId}
          />
        ) : (
          <EmptyDetailPane />
        )}
      </div>
    </div>
  )
}

function EmptyDetailPane() {
  return (
    <div className="hidden min-w-0 flex-1 md:block">
      <EmailDetail
        email={null}
        messageId={null}
        emailBody=""
        emailBodyFormat="text"
        onBack={noop}
        onArchive={noop}
        onDelete={noop}
        onToggleStar={noop}
        onToggleRead={noop}
        onReply={noop}
        onDownloadSource={noop}
      />
    </div>
  )
}

function MessageDetailPane({
  actions,
  email,
  messageId,
}: {
  actions: ReturnType<typeof useEmailActions>
  email: Email | null
  messageId: string
}) {
  const { t } = useTranslation()
  const bodyQ = useQuery(messageBodyQuery(messageId))
  const emailBody = bodyQ.isSuccess
    ? bodyQ.data.body || "(No content available)"
    : bodyQ.isError && bodyQ.error instanceof Error
      ? bodyQ.error.message
      : email?.preview || "Loading message..."
  const emailBodyFormat = bodyQ.isSuccess ? bodyQ.data.format : "text"
  const handleDownloadSource = async (id: string) => {
    try {
      const blob = await getRawEmailBlob(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = sourceFilename(email?.subject, id)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      toast.error(t("app.downloadFailed"), {
        description: error instanceof Error ? error.message : "Could not download source",
      })
    }
  }

  const detail = (
    <EmailDetail
      email={email}
      messageId={messageId}
      emailBody={emailBody}
      emailBodyFormat={emailBodyFormat}
      onBack={actions.backToList}
      onArchive={(id) => actions.handleArchive(id, messageId)}
      onDelete={(id) => actions.handleDelete(id, messageId)}
      onToggleStar={actions.handleToggleStar}
      onToggleRead={actions.handleToggleRead}
      onReply={() => actions.handleReply(email)}
      onDownloadSource={handleDownloadSource}
    />
  )

  return (
    <>
      <div className="hidden min-w-0 flex-1 md:block">{detail}</div>

      <AnimatePresence>
        <motion.div
          key="mobile-detail"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="absolute inset-0 z-30 bg-background md:hidden"
        >
          {detail}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function sourceFilename(subject: string | null | undefined, fallback: string) {
  const base = (subject || fallback)
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/:*?<>|]+/g, "-")
    .trim()
    .slice(0, 80)

  return `${base || fallback}.eml`
}
