"use client"

import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  Trash2,
  PenSquare,
  MessagesSquare,
  Package,
  Plus,
  Building2,
  SlidersHorizontal,
  Inbox as InboxIcon,
  SendHorizonal,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { Folder } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { SidebarNav } from "@/components/ui/sidebar-nav"
import { ProfileMenu } from "./profile-menu"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { ButtonGroup } from "../ui/button-group"

/** The workspace administration pages, each its own sidebar sub-entry. */
export type WorkspacePage = "general" | "email-receivers" | "email-senders"

/** A mail folder, the realtime messenger, the drop store, or a workspace page. */
export type SidebarSection = Folder | "messages" | "drop" | `workspace:${WorkspacePage}`

/** Route path per workspace page, so callers keep TanStack's literal typing. */
export const WORKSPACE_PAGE_ROUTES = {
  general: "/workspace/general",
  "email-receivers": "/workspace/email-receivers",
  "email-senders": "/workspace/email-senders",
} as const

type FolderDef = {
  id: Folder
  icon: React.ComponentType<{ className?: string }>
}

const FOLDERS: FolderDef[] = [
  { id: "inbox", icon: Inbox },
  { id: "starred", icon: Star },
  { id: "sent", icon: Send },
  { id: "drafts", icon: FileText },
  { id: "archive", icon: Archive },
  { id: "trash", icon: Trash2 },
]

const WORKSPACE_PAGES: { id: WorkspacePage; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", icon: SlidersHorizontal },
  { id: "email-receivers", icon: InboxIcon },
  { id: "email-senders", icon: SendHorizonal },
]

type Props = {
  active: SidebarSection
  onSelect: (folder: Folder) => void
  onOpenMessages: () => void
  onOpenDrop?: () => void
  onOpenWorkspace?: (page: WorkspacePage) => void
  counts?: Partial<Record<Folder, number>>
  onCompose: () => void
  onOpenSettings: () => void
}

export function EmailSidebar({
  active,
  onSelect,
  onOpenMessages,
  onOpenDrop,
  onOpenWorkspace,
  counts = {},
  onCompose,
  onOpenSettings,
}: Props) {
  const { t } = useTranslation()
  const workspaceLabel = t("sidebar.workspace")
  const onWorkspacePage = active.startsWith("workspace:")


  return (
    <aside className="flex h-full w-full flex-col bg-sidebar/60 text-sidebar-foreground">
      <div className="px-2 pt-3 pb-1">
        <WorkspaceSwitcher />
      </div>

      <div className="px-3 pb-3">
        <ButtonGroup className="w-full">
          <Button
            onClick={onCompose}
            size="lg"
            className="gap-2 flex-1 justify-start"
          >
            <PenSquare className="h-4 w-4" />
            {t("sidebar.compose")}
          </Button>
          <Button size="icon-lg">
            <Plus className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </div>

      <SidebarNav
        ariaLabel={t("sidebar.navAriaLabel")}
        className="flex-1 overflow-y-auto rounded-none border-none bg-transparent scrollbar-thin"
        // The nav's padding sits on the inner sliding panel, which `className`
        // cannot reach; `panelClassName` is the override that replaces it.
        panelClassName="px-2 py-1"
        sections={[
          {
            items: FOLDERS.map((folder) => {
              const isActive = active === folder.id
              const count = counts[folder.id] ?? 0
              return {
                label: t(`sidebar.folders.${folder.id}`),
                icon: folder.icon,
                active: isActive,
                onClick: () => onSelect(folder.id),
                badge:
                  count > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                        isActive && folder.id === "inbox"
                          ? "bg-primary text-primary-foreground"
                          : isActive
                            ? "bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground"
                            : folder.id === "inbox"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  ) : null,
              }
            }),
          },
          {
            separator: true,
            items: [
              {
                label: t("sidebar.messages"),
                icon: MessagesSquare,
                active: active === "messages",
                onClick: onOpenMessages,
              },
              ...(onOpenDrop
                ? [
                  {
                    label: t("sidebar.drop"),
                    icon: Package,
                    active: active === "drop",
                    onClick: onOpenDrop,
                  },
                ]
                : []),
              ...(onOpenWorkspace
                ? [
                  {
                    label: workspaceLabel,
                    icon: Building2,
                    active: onWorkspacePage,
                    // onClick runs before the panel opens and onBack before it
                    // pops, so the route and the sub-menu move together in both
                    // directions. The sidebar is mounted once in `_app`, so the
                    // panel outlives the navigation each click triggers.
                    onClick: () => onOpenWorkspace("general"),
                    submenu: {
                      backLabel: t("sidebar.back"),
                      label: workspaceLabel,
                      onBack: () => onSelect("inbox"),
                      sections: [
                        {
                          items: WORKSPACE_PAGES.map((page) => ({
                            label: t(`sidebar.workspacePages.${page.id}`),
                            icon: page.icon,
                            active: active === `workspace:${page.id}`,
                            onClick: () => onOpenWorkspace(page.id),
                          })),
                        },
                      ],
                    },
                  },
                ]
                : []),
            ],
          },
        ]}
      />

      <div className="border-t border-sidebar-border p-2">
        <ProfileMenu onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  )
}
