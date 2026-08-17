"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { Building2, Check, ChevronsUpDown, Plus, User2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HeraldLogo } from "@/components/ui/logos"
import { createWorkspace, type WorkspaceKind } from "@/lib/api"
import { useWorkspaces } from "@/lib/workspace-store"

const KIND_ICON: Record<WorkspaceKind, React.ComponentType<{ className?: string }>> = {
  system: Building2,
  personal: User2,
  team: Building2,
}

/**
 * The sidebar's brand block, doubling as the workspace picker. Switching only
 * re-points the workspace administration pages — mail is scoped by address.
 */
export function WorkspaceSwitcher() {
  const { workspaces, active, setActive } = useWorkspaces()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    try {
      const workspace = await createWorkspace(trimmed)
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      setActive(workspace.id)
      setCreateOpen(false)
      setName("")
      toast.success(t("workspace.switcher.created", { name: workspace.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.switcher.createFailed"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            type="button"
            whileTap={{ scale: 0.985 }}
            className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("workspace.switcher.open")}
          >
            <HeraldLogo size={32} aria-hidden />
            {/* Tight leading keeps the two-line stack at roughly the logo's own
                height, so adding the workspace name doesn't grow the header. */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight tracking-tight">
                Herald
              </div>
              <div className="truncate text-xs leading-tight text-muted-foreground">
                {active?.name ?? t("workspace.switcher.noWorkspace")}
              </div>
            </div>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </motion.button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="w-64">
          <DropdownMenuLabel className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {t("workspace.switcher.label")}
          </DropdownMenuLabel>

          {workspaces.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("workspace.switcher.empty")}
            </div>
          ) : (
            workspaces.map((workspace) => {
              const Icon = KIND_ICON[workspace.kind]
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  onSelect={() => setActive(workspace.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`workspace.kinds.${workspace.kind}`)}
                  </span>
                  {workspace.id === active?.id ? <Check className="h-3.5 w-3.5" /> : null}
                </DropdownMenuItem>
              )
            })
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              setCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            {t("workspace.switcher.create")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workspace.switcher.createTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.switcher.createDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t("workspace.switcher.nameLabel")}</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("workspace.switcher.namePlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreate()
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("workspace.common.cancel")}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!name.trim() || creating}>
              {t("workspace.switcher.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
