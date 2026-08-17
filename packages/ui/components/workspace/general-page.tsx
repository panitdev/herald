"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2, UserPlus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspaceSection,
} from "@/components/workspace/page-shell"
import {
  addWorkspaceMember,
  deleteWorkspace,
  removeWorkspaceMember,
  searchUsers,
} from "@/lib/api"
import { workspaceMembersQuery } from "@/lib/queries"
import { useWorkspaces } from "@/lib/workspace-store"

export function WorkspaceGeneralPage() {
  const { t } = useTranslation()
  const { active, workspaces, setActive } = useWorkspaces()
  const queryClient = useQueryClient()

  const { data: members = [], isPending } = useQuery(workspaceMembersQuery(active?.id ?? null))

  const isAdmin = active?.access === "admin"
  const canDelete = isAdmin && active?.kind === "team"

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(active!.id, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", active?.id] }),
    onError: (err: Error) => toast.error(err.message),
  })

  async function handleDeleteWorkspace() {
    if (!active) return
    try {
      await deleteWorkspace(active.id)
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      await queryClient.invalidateQueries({ queryKey: ["emailReceivers"] })
      await queryClient.invalidateQueries({ queryKey: ["emailSenders"] })
      const fallback = workspaces.find((w) => w.id !== active.id && w.kind === "personal")
      if (fallback) setActive(fallback.id)
      toast.success(t("workspace.general.deleted"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.common.failed"))
    }
  }

  if (!active) {
    return (
      <WorkspacePage title={t("workspace.general.title")}>
        <WorkspaceEmpty>{t("workspace.switcher.empty")}</WorkspaceEmpty>
      </WorkspacePage>
    )
  }

  return (
    <WorkspacePage
      title={t("workspace.general.title")}
      description={t("workspace.general.description")}
    >
      <WorkspaceSection title={t("workspace.general.detailsTitle")}>
        <dl className="divide-y divide-border">
          <Row label={t("workspace.general.name")}>{active.name}</Row>
          <Row label={t("workspace.general.kind")}>
            <Badge variant="secondary">{t(`workspace.kinds.${active.kind}`)}</Badge>
          </Row>
          <Row label={t("workspace.general.yourAccess")}>
            <Badge variant={active.access === "admin" ? "default" : "outline"}>
              {t(`workspace.access.${active.access}`)}
            </Badge>
          </Row>
          <Row label={t("workspace.general.created")}>
            {new Date(active.createdAt).toLocaleDateString()}
          </Row>
        </dl>
      </WorkspaceSection>

      <WorkspaceSection
        title={t("workspace.general.membersTitle")}
        description={t("workspace.general.membersDescription")}
      >
        {isAdmin ? <AddMemberForm workspaceId={active.id} /> : null}

        {isPending ? (
          <WorkspaceEmpty>{t("workspace.common.loading")}</WorkspaceEmpty>
        ) : members.length === 0 ? (
          <WorkspaceEmpty>{t("workspace.general.noMembers")}</WorkspaceEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{member.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    @{member.username}
                  </div>
                </div>
                <Badge variant={member.role === "admin" ? "default" : "outline"}>
                  {t(`workspace.access.${member.role}`)}
                </Badge>
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("workspace.general.removeMember")}
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(member.userId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      {canDelete ? (
        <WorkspaceSection
          title={t("workspace.general.dangerTitle")}
          description={t("workspace.general.dangerDescription")}
          className="border-destructive/40"
        >
          <div className="px-4 py-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  {t("workspace.general.delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("workspace.general.deleteConfirmTitle", { name: active.name })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("workspace.general.deleteConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("workspace.common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDeleteWorkspace()}>
                    {t("workspace.general.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </WorkspaceSection>
      ) : null}
    </WorkspacePage>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <dt className="w-40 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  )
}

function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    const username = query.trim().replace(/^@/, "")
    if (!username) return

    setAdding(true)
    try {
      // The API takes a user id, not a username, so resolve it first — an exact
      // match only, since adding the wrong person to a workspace is a real grant.
      const { users } = await searchUsers(username)
      const match = users.find((user) => user.username === username)
      if (!match) {
        toast.error(t("workspace.general.userNotFound", { username }))
        return
      }

      await addWorkspaceMember(workspaceId, { userId: match.id, role })
      await queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] })
      setQuery("")
      toast.success(t("workspace.general.memberAdded", { username }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.common.failed"))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <Input
        className="min-w-40 flex-1"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("workspace.general.addMemberPlaceholder")}
        onKeyDown={(event) => {
          if (event.key === "Enter") void handleAdd()
        }}
      />
      <Select value={role} onValueChange={(value) => setRole(value as "admin" | "member")}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">{t("workspace.access.member")}</SelectItem>
          <SelectItem value="admin">{t("workspace.access.admin")}</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={() => void handleAdd()} disabled={!query.trim() || adding}>
        <UserPlus className="h-4 w-4" />
        {t("workspace.general.addMember")}
      </Button>
    </div>
  )
}
