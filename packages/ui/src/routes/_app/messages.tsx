import { useEffect, useMemo, useState } from "react"
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Command, Menu } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { EmailSidebar } from "@/components/email/sidebar"
import { ConversationList } from "@/components/chat/conversation-list"
import { ChatScreen } from "@/components/chat/chat-screen"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { chatConversationsQuery, chatMessagesQuery } from "@/lib/queries"
import { sendChatMessage, type ChatConversation, type SyncChatMessage } from "@/lib/api"
import { conversationView, filterConversations } from "@/lib/chat"
import { useAppChrome } from "@/lib/app-chrome"
import { useAuth } from "@/lib/auth-store"
import { useOnlineStatus } from "@/lib/network-store"

export const Route = createFileRoute("/_app/messages")({
  // ssr: false to match the rest of the authenticated tree (uses useAppChrome).
  ssr: false,
  component: MessagesRoute,
})

function MessagesRoute() {
  const navigate = useNavigate()
  const { openCompose, openSettings, openMobileCommand } = useAppChrome()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const { user } = useAuth()
  const myUserId = user?.id ?? ""
  const { t } = useTranslation()

  // selectedId comes from the optional $conversationId child route.
  const childParams = useParams({ strict: false }) as { conversationId?: string }
  const selectedId = childParams.conversationId ?? null

  const [search, setSearch] = useState("")

  const conversationsQ = useQuery(chatConversationsQuery())
  const conversations = useMemo(
    () => conversationsQ.data ?? [],
    [conversationsQ.data],
  )

  const views = useMemo(
    () =>
      filterConversations(conversations, myUserId, search).map((c) =>
        conversationView(c, myUserId),
      ),
    [conversations, myUserId, search],
  )

  const selected = selectedId
    ? conversations.find((c) => c.id === selectedId) ?? null
    : null

  const sidebarNode = (
    <EmailSidebar
      active="messages"
      onSelect={(f) => navigate({ to: "/$mailbox", params: { mailbox: f } })}
      onOpenMessages={() => navigate({ to: "/messages" })}
      onCompose={() => openCompose()}
      onOpenSettings={openSettings}
    />
  )

  // Realtime: the socket in the app layout refreshes sync state and emits these
  // events; refetch chat data so new messages and conversations show up live.
  useEffect(() => {
    const onSyncUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["chatConversations"] })
      void queryClient.invalidateQueries({ queryKey: ["chatMessages"] })
    }
    window.addEventListener("herald-sync-updated", onSyncUpdated)
    window.addEventListener("herald-sync-refresh-requested", onSyncUpdated)
    return () => {
      window.removeEventListener("herald-sync-updated", onSyncUpdated)
      window.removeEventListener("herald-sync-refresh-requested", onSyncUpdated)
    }
  }, [queryClient])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 border-r border-border md:block lg:w-72">
        {sidebarNode}
      </div>

      {/* Main area */}
      <div className="relative flex min-w-0 flex-1">
        {/* Conversation list pane */}
        <div
          className={`flex min-w-0 flex-col border-r border-border md:w-[340px] lg:w-[380px] xl:w-[420px] ${
            selectedId ? "hidden md:flex" : "flex w-full"
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
            <span className="flex-1 text-sm font-medium">{t("chat.list.title")}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("mobileCommand.open")}
              onClick={openMobileCommand}
            >
              <Command className="h-5 w-5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            {conversationsQ.isLoading ? (
              <ConversationListFallback />
            ) : conversationsQ.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">
                  {conversationsQ.error instanceof Error
                    ? conversationsQ.error.message
                    : t("app.messages.failedToLoad")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => conversationsQ.refetch()}
                >
                  {t("app.retry")}
                </Button>
              </div>
            ) : (
              <ConversationList
                conversations={views}
                selectedId={selectedId}
                onSelect={(id) =>
                  navigate({
                    to: "/messages/$conversationId",
                    params: { conversationId: id },
                  })
                }
                search={search}
                onSearchChange={setSearch}
              />
            )}
          </div>
        </div>

        {selectedId ? (
          <ChatPane
            conversationId={selectedId}
            conversation={selected}
            myUserId={myUserId}
            online={online}
            onBack={() => navigate({ to: "/messages" })}
          />
        ) : (
          <EmptyChatPane myUserId={myUserId} />
        )}
      </div>
    </div>
  )
}

function ConversationListFallback() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-4 pt-4 pb-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("chat.list.title")}</h2>
        <div className="mt-3 h-9 rounded-lg bg-muted" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyChatPane({ myUserId }: { myUserId: string }) {
  const noop = () => {}
  return (
    <div className="hidden min-w-0 flex-1 md:block">
      <ChatScreen
        conversation={null}
        messages={[]}
        myUserId={myUserId}
        loading={false}
        sending={false}
        offline={false}
        onBack={noop}
        onRetry={noop}
        onSend={noop}
      />
    </div>
  )
}

function ChatPane({
  conversationId,
  conversation,
  myUserId,
  online,
  onBack,
}: {
  conversationId: string
  conversation: ChatConversation | null
  myUserId: string
  online: boolean
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const messagesQ = useQuery(chatMessagesQuery(conversationId))
  const messages = messagesQ.data ?? []
  const { t } = useTranslation()

  const sendMutation = useMutation({
    mutationFn: (vars: { body: string; clientMutationId: string }) =>
      sendChatMessage(conversationId, {
        body: vars.body,
        clientMutationId: vars.clientMutationId,
      }),
    onMutate: async (vars) => {
      const key = chatMessagesQuery(conversationId).queryKey
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SyncChatMessage[]>(key)
      const optimistic: SyncChatMessage = {
        id: `optimistic-${vars.clientMutationId}`,
        conversation_id: conversationId,
        sender_user_id: myUserId,
        body: vars.body,
        client_mutation_id: vars.clientMutationId,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<SyncChatMessage[]>(key, (old = []) => [
        ...old,
        optimistic,
      ])
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous)
      toast.error(t("app.messages.failedToSend"), {
        description: t("app.messages.failedToSendDescription"),
      })
    },
    onSuccess: (res, vars) => {
      const key = chatMessagesQuery(conversationId).queryKey
      queryClient.setQueryData<SyncChatMessage[]>(key, (old = []) =>
        old.map((m) =>
          m.client_mutation_id === vars.clientMutationId ||
          m.id === `optimistic-${vars.clientMutationId}`
            ? res.message
            : m,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: ["chatConversations"] })
    },
  })

  const handleSend = (body: string) => {
    if (!online) {
      toast.error(t("app.messages.offlineError"), {
        description: t("app.messages.offlineErrorDescription"),
      })
      return
    }
    sendMutation.mutate({ body, clientMutationId: crypto.randomUUID() })
  }

  const screen = (
    <ChatScreen
      conversation={conversation}
      messages={messages}
      myUserId={myUserId}
      loading={messagesQ.isLoading}
      error={
        messagesQ.error
          ? messagesQ.error instanceof Error
            ? messagesQ.error.message
            : t("app.messages.failedToLoadMessages")
          : null
      }
      sending={sendMutation.isPending}
      offline={!online}
      onBack={onBack}
      onRetry={() => messagesQ.refetch()}
      onSend={handleSend}
    />
  )

  return (
    <>
      <div className="hidden min-w-0 flex-1 md:block">{screen}</div>

      <AnimatePresence>
        <motion.div
          key="mobile-chat"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="absolute inset-0 z-30 bg-background md:hidden"
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
