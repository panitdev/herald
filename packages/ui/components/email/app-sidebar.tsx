"use client"

import { useMemo } from "react"
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import {
  EmailSidebar,
  WORKSPACE_PAGE_ROUTES,
  type SidebarSection,
  type WorkspacePage,
} from "@/components/email/sidebar"
import { messagesQuery } from "@/lib/queries"
import { transformMessage } from "@/lib/email-transform"
import { useMergedEmails } from "@/lib/local-overrides-store"
import { useAppChrome } from "@/lib/app-chrome"
import type { Email, Folder } from "@/lib/types"

const FOLDERS: Folder[] = ["inbox", "starred", "sent", "drafts", "archive", "trash"]
const WORKSPACE_PAGES = Object.keys(WORKSPACE_PAGE_ROUTES) as WorkspacePage[]

/**
 * The sidebar wired to the router. `_app` mounts one of these for the desktop
 * rail so it survives navigation; each route also renders one inside its mobile
 * Sheet, where remounting is fine because the sheet is dismissed on navigate.
 */
export function AppSidebar() {
  const navigate = useNavigate()
  const { openCompose, openSettings } = useAppChrome()

  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const params = useParams({ strict: false }) as { mailbox?: string }

  const mailbox = FOLDERS.includes(params.mailbox as Folder)
    ? (params.mailbox as Folder)
    : null

  const active: SidebarSection = useMemo(() => {
    if (pathname.startsWith("/messages")) return "messages"
    if (pathname.startsWith("/drop")) return "drop"
    if (pathname.startsWith("/workspace")) {
      const page = WORKSPACE_PAGES.find((id) => pathname.startsWith(`/workspace/${id}`))
      return `workspace:${page ?? "general"}` as SidebarSection
    }
    return mailbox ?? "inbox"
  }, [pathname, mailbox])

  // Same query key and derivation the mailbox route uses, so react-query serves
  // both from one fetch rather than this adding a second request.
  const messagesQ = useQuery(messagesQuery(mailbox === "starred" ? null : mailbox))
  const apiEmails = useMemo<Email[]>(
    () => (messagesQ.data ?? []).map((m) => transformMessage(m, mailbox ?? "inbox")),
    [messagesQ.data, mailbox],
  )
  const { counts } = useMergedEmails(apiEmails, mailbox ?? "inbox", "")

  return (
    <EmailSidebar
      active={active}
      onSelect={(folder) => navigate({ to: "/$mailbox", params: { mailbox: folder } })}
      onOpenMessages={() => navigate({ to: "/messages" })}
      onOpenDrop={() => navigate({ to: "/drop" })}
      onOpenWorkspace={(page) => navigate({ to: WORKSPACE_PAGE_ROUTES[page] })}
      counts={counts}
      onCompose={() => openCompose()}
      onOpenSettings={openSettings}
    />
  )
}
