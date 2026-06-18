"use client"

import { motion } from "framer-motion"
import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  Trash2,
  PenSquare,
  MessagesSquare,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Folder } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { HeraldLogo } from "@/components/ui/logos"
import { ProfileMenu } from "./profile-menu"
import { ButtonGroup } from "../ui/button-group"

/** Either a mail folder or the realtime messenger. */
export type SidebarSection = Folder | "messages"

type FolderDef = {
  id: Folder
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const FOLDERS: FolderDef[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
]

type Props = {
  active: SidebarSection
  onSelect: (folder: Folder) => void
  onOpenMessages: () => void
  counts?: Partial<Record<Folder, number>>
  onCompose: () => void
  onOpenSettings: () => void
}

export function EmailSidebar({
  active,
  onSelect,
  onOpenMessages,
  counts = {},
  onCompose,
  onOpenSettings,
}: Props) {
  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
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
            Compose
          </Button>
          <Button size="icon-lg">
            <Plus className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 scrollbar-thin" aria-label="Folders">
        <ul className="flex flex-col gap-0.5">
          {FOLDERS.map((folder) => {
            const isActive = active === folder.id
            const count = counts[folder.id] ?? 0
            return (
              <NavItem
                key={folder.id}
                label={folder.label}
                icon={folder.icon}
                isActive={isActive}
                onClick={() => onSelect(folder.id)}
                badge={
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
                  ) : null
                }
              />
            )
          })}
        </ul>

        <div className="my-2 border-t border-sidebar-border/60" />

        <ul className="flex flex-col gap-0.5">
          <NavItem
            label="Messages"
            icon={MessagesSquare}
            isActive={active === "messages"}
            onClick={onOpenMessages}
          />
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <ProfileMenu onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  )
}

function NavItem({
  label,
  icon: Icon,
  isActive,
  onClick,
  badge,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  onClick: () => void
  badge?: React.ReactNode
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          // Distinguish hover from selected:
          // - hover: subtle neutral wash
          // - selected: accent background (set via motion layout pill below)
          !isActive &&
          "font-medium text-sidebar-foreground/75 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground",
          isActive && "font-semibold text-sidebar-accent-foreground",
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {isActive && (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-lg bg-sidebar-accent ring-1 ring-sidebar-accent-foreground/10"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        {isActive && (
          <motion.span
            layoutId="sidebar-active-bar"
            aria-hidden
            className="absolute left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <span className="relative z-10 flex flex-1 items-center gap-3">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive
                ? "text-sidebar-accent-foreground"
                : "text-muted-foreground group-hover:text-sidebar-foreground",
            )}
            aria-hidden
          />
          <span className="flex-1 text-left">{label}</span>
          {badge}
        </span>
      </button>
    </li>
  )
}
