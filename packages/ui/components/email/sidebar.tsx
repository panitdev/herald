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
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { Folder } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { HeraldLogo } from "@/components/ui/logos"
import { SidebarNav } from "@/components/ui/sidebar-nav"
import { ProfileMenu } from "./profile-menu"
import { ButtonGroup } from "../ui/button-group"

/** Either a mail folder, the realtime messenger, or the drop store. */
export type SidebarSection = Folder | "messages" | "drop"

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

type Props = {
  active: SidebarSection
  onSelect: (folder: Folder) => void
  onOpenMessages: () => void
  onOpenDrop?: () => void
  counts?: Partial<Record<Folder, number>>
  onCompose: () => void
  onOpenSettings: () => void
}

export function EmailSidebar({
  active,
  onSelect,
  onOpenMessages,
  onOpenDrop,
  counts = {},
  onCompose,
  onOpenSettings,
}: Props) {
  const { t } = useTranslation()
  return (
    <aside className="flex h-full w-full flex-col bg-sidebar/60 text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <HeraldLogo size={32} aria-hidden />
        <span className="text-[15px] font-semibold tracking-tight">Herald</span>
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
        className="flex-1 overflow-y-auto rounded-none border-none bg-transparent p-0 px-2 py-1 scrollbar-thin"
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
