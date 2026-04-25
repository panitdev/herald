"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import { Menu, Loader2 } from "lucide-react"

import { INITIAL_EMAILS, type Email, type Folder } from "@/lib/mock-emails"
import { EmailSidebar } from "./sidebar"
import { EmailList } from "./email-list"
import { EmailDetail } from "./email-detail"
import { ComposePanel } from "./compose-panel"
import { SettingsDialog } from "./settings-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { SettingsProvider } from "@/lib/settings-store"
import { useMailNavigation, type Mailbox } from "@/hooks/use-mail-navigation"
import { useMailboxes } from "@/hooks/use-mailboxes"
import { useMessages } from "@/hooks/use-messages"
import { setAuthToken } from "@/lib/api"
import { useAuth } from "@/lib/auth-store"

export function EmailClient() {
  const [emails, setEmails] = useState<Email[]>([])
  const { mailbox: activeFolder, setMailbox, selectedId, setSelectedId } = useMailNavigation({
    initialMailbox: "inbox",
  })
  const [search, setSearch] = useState("")
  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrefill, setComposePrefill] = useState<{ to: string; subject: string }>({
    to: "",
    subject: "",
  })
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Auth - set token for API calls
  const { accessToken, user } = useAuth()
  useEffect(() => {
    setAuthToken(accessToken)
  }, [accessToken])

  // API data
  const { mailboxes, loading: mailboxesLoading, error: mailboxesError } = useMailboxes()
  const activeMailboxId = mailboxes[0]?.id ?? null
  const {
    emails: apiEmails,
    loading: messagesLoading,
    error: messagesError,
    markRead,
  } = useMessages(activeMailboxId)

  const isAuthenticated = !!user

  // Combine: API emails + local actions (starred, folder changes)
  const combinedEmails = useMemo(() => {
    // If authenticated and have API emails, use them
    if (isAuthenticated && apiEmails.length > 0) {
      // Merge with local state (actions like star/archive stored locally)
      return apiEmails.map((apiEmail) => {
        const local = emails.find((e) => e.id === apiEmail.id)
        return local ? { ...apiEmail, starred: local.starred, folder: local.folder } : apiEmail
      })
    }
    // Otherwise use mock data
    return emails.length > 0 ? emails : INITIAL_EMAILS
  }, [apiEmails, emails, isAuthenticated])

  // Derived: emails in folder with search

  // Derived: emails in folder with search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return combinedEmails
      .filter((e) => {
        if (activeFolder === "starred") return e.starred && e.folder !== "trash"
        return e.folder === activeFolder
      })
      .filter((e) => {
        if (!q) return true
        return (
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [combinedEmails, activeFolder, search])

  const counts = useMemo(() => {
    const c: Record<Folder, number> = {
      inbox: 0,
      starred: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      trash: 0,
    }
    for (const e of combinedEmails) {
      if (e.folder === "inbox" && !e.read) c.inbox++
      if (e.starred && e.folder !== "trash") c.starred++
      if (e.folder === "sent") c.sent++
      if (e.folder === "drafts") c.drafts++
      if (e.folder === "archive") c.archive++
      if (e.folder === "trash") c.trash++
    }
    return c
  }, [combinedEmails])

  const unreadCount = useMemo(
    () => filtered.filter((e) => !e.read).length,
    [filtered],
  )

  const selected = useMemo(
    () => combinedEmails.find((e) => e.id === selectedId) ?? null,
    [combinedEmails, selectedId],
  )

  // Mark as read when opened
  function handleSelect(id: string) {
    setSelectedId(id)
    // Update local state
    setEmails((prev) =>
      prev.map((e) => (e.id === id && !e.read ? { ...e, read: true } : e))
    )
    // Also call API if authenticated
    if (isAuthenticated) {
      markRead(id)
    }
  }

  function handleToggleStar(id: string) {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e))
    )
  }

  function handleToggleRead(id: string) {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, read: !e.read } : e))
    )
  }

  function handleArchive(id: string) {
    const target = combinedEmails.find((e) => e.id === id)
    if (!target) return
    const prevFolder = target.folder
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, folder: "archive" } : e))
    )
    if (selectedId === id) setSelectedId(null)
    toast.success("Archived", {
      description: target.subject,
      action: {
        label: "Undo",
        onClick: () => {
          setEmails((prev) =>
            prev.map((e) => (e.id === id ? { ...e, folder: prevFolder } : e))
          )
        },
      },
    })
  }

  function handleDelete(id: string) {
    const target = combinedEmails.find((e) => e.id === id)
    if (!target) return
    const prevFolder = target.folder
    // If already in trash, permanently delete
    if (prevFolder === "trash") {
      setEmails((prev) => prev.filter((e) => e.id !== id))
      if (selectedId === id) setSelectedId(null)
      toast.success("Deleted permanently")
      return
    }
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, folder: "trash" } : e))
    )
    if (selectedId === id) setSelectedId(null)
    toast.success("Moved to Trash", {
      description: target.subject,
      action: {
        label: "Undo",
        onClick: () => {
          setEmails((prev) =>
            prev.map((e) => (e.id === id ? { ...e, folder: prevFolder } : e))
          )
        },
      },
    })
  }

  function handleCompose() {
    setComposePrefill({ to: "", subject: "" })
    setComposeOpen(true)
  }

  function handleReply(id?: string) {
    const target = id
      ? combinedEmails.find((e) => e.id === id) ?? null
      : selected
    if (!target) return
    setComposePrefill({
      to: target.from.email,
      subject: target.subject.startsWith("Re:")
        ? target.subject
        : `Re: ${target.subject}`,
    })
    setComposeOpen(true)
  }

  async function handleSend(data: { to: string; subject: string; body: string }) {
    // Simulate send delay
    await new Promise((r) => setTimeout(r, 700))
    const newEmail: Email = {
      id: `e-${Date.now()}`,
      from: {
        name: "You",
        email: "you@inbox.co",
        initials: "YO",
        color: "oklch(0.7 0.16 258)",
      },
      to: data.to,
      subject: data.subject,
      preview: data.body.slice(0, 120),
      body: data.body,
      date: new Date().toISOString(),
      read: true,
      starred: false,
      folder: "sent",
    }
    setEmails((prev) => [newEmail, ...prev])
    setComposeOpen(false)
    toast.success("Message sent", { description: `to ${data.to}` })
  }

  // Keyboard shortcuts: "c" compose, ⌘/Ctrl+, settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘, or Ctrl+, — works even when editable element is focused
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
        (target && (target as HTMLElement).isContentEditable)
      if (isEditable) return
      if (e.key === "c") {
        e.preventDefault()
        handleCompose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const sidebarNode = (
    <EmailSidebar
      active={activeFolder}
      onSelect={(f) => {
        setMailbox(f as Mailbox)
        setMobileSidebarOpen(false)
      }}
      counts={counts}
      onCompose={() => {
        setMobileSidebarOpen(false)
        handleCompose()
      }}
      onOpenSettings={() => {
        setMobileSidebarOpen(false)
        setSettingsOpen(true)
      }}
    />
  )

  return (
    <SettingsProvider>
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
          {/* Mobile top bar for list view */}
          <div className="flex items-center gap-1 border-b border-border px-2 py-2 md:hidden">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
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
            {/* Loading state when fetching from API */}
            {(messagesLoading || mailboxesLoading) && isAuthenticated ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messagesError || mailboxesError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">
                  {messagesError || mailboxesError}
                </p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : (
              <EmailList
                folder={activeFolder}
                emails={filtered}
                selectedId={selectedId}
                onSelect={handleSelect}
                onToggleStar={handleToggleStar}
                onToggleRead={handleToggleRead}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onReply={(id) => handleReply(id)}
                search={search}
                onSearchChange={setSearch}
                unreadCount={unreadCount}
              />
            )}
          </div>
        </div>

        {/* Detail pane (desktop) */}
        <div className="hidden min-w-0 flex-1 md:block">
          <EmailDetail
            email={selected}
            onBack={() => setSelectedId(null)}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onToggleStar={handleToggleStar}
            onToggleRead={handleToggleRead}
            onReply={() => handleReply()}
          />
        </div>

        {/* Detail pane (mobile overlay) */}
        <AnimatePresence>
          {selected && (
            <motion.div
              key="mobile-detail"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="absolute inset-0 z-30 bg-background md:hidden"
            >
              <EmailDetail
                email={selected}
                onBack={() => setSelectedId(null)}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onToggleStar={handleToggleStar}
                onToggleRead={handleToggleRead}
                onReply={() => handleReply()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ComposePanel
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleSend}
        initialTo={composePrefill.to}
        initialSubject={composePrefill.subject}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
    </SettingsProvider>
  )
}