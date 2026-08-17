"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Plus, Power, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  WorkspaceField,
  WorkspacePage,
  WorkspaceSection,
} from "@/components/workspace/page-shell"
import {
  createEmailReceiver,
  deleteEmailReceiver,
  rotateEmailReceiverToken,
  updateEmailReceiver,
  type EmailReceiver,
} from "@/lib/api"
import { emailReceiversQuery } from "@/lib/queries"
import { useWorkspaces } from "@/lib/workspace-store"
import { OneTimeSecretDialog } from "./one-time-secret"

export function WorkspaceReceiversPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaces()
  const queryClient = useQueryClient()

  const { data: receivers = [], isPending } = useQuery(emailReceiversQuery())
  const [createOpen, setCreateOpen] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)

  // The list route returns every reachable receiver; this page is scoped to the
  // workspace the switcher points at.
  const scoped = receivers.filter((receiver) => receiver.workspaceId === active?.id)
  const canManage = active?.access === "admin"

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["emailReceivers"] })

  const remove = useMutation({
    mutationFn: (id: string) => deleteEmailReceiver(id),
    onSuccess: () => {
      void invalidate()
      toast.success(t("workspace.receivers.deleted"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const setActiveState = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateEmailReceiver(id, { isActive }),
    onSuccess: (receiver) => {
      void invalidate()
      toast.success(
        receiver.isActive
          ? t("workspace.receivers.enabled")
          : t("workspace.receivers.disabled"),
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const rotate = useMutation({
    mutationFn: (id: string) => rotateEmailReceiverToken(id),
    onSuccess: (result) => {
      void invalidate()
      setRevealed(result.inboundToken)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <WorkspacePage
      title={t("workspace.receivers.title")}
      description={t("workspace.receivers.description")}
      action={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("workspace.receivers.register")}
          </Button>
        ) : null
      }
    >
      <WorkspaceSection>
        {isPending ? (
          <WorkspaceEmpty>{t("workspace.common.loading")}</WorkspaceEmpty>
        ) : scoped.length === 0 ? (
          <WorkspaceEmpty>{t("workspace.receivers.empty")}</WorkspaceEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {scoped.map((receiver) => (
              <ReceiverRow
                key={receiver.id}
                receiver={receiver}
                canManage={canManage && receiver.access === "admin"}
                onToggleActive={() =>
                  setActiveState.mutate({ id: receiver.id, isActive: !receiver.isActive })
                }
                onRotate={() => rotate.mutate(receiver.id)}
                onDelete={() => remove.mutate(receiver.id)}
              />
            ))}
          </ul>
        )}
      </WorkspaceSection>

      {!canManage && active ? (
        <p className="text-xs text-muted-foreground">
          {t("workspace.common.needsAdmin")}
        </p>
      ) : null}

      <CreateReceiverDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={active?.id ?? null}
        onCreated={(token) => {
          void invalidate()
          setRevealed(token)
        }}
      />

      <OneTimeSecretDialog
        secret={revealed}
        onClose={() => setRevealed(null)}
        title={t("workspace.receivers.tokenTitle")}
        description={t("workspace.receivers.tokenDescription")}
      />
    </WorkspacePage>
  )
}

function ReceiverRow({
  receiver,
  canManage,
  onToggleActive,
  onRotate,
  onDelete,
}: {
  receiver: EmailReceiver
  canManage: boolean
  onToggleActive: () => void
  onRotate: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{receiver.displayName}</span>
          {receiver.isSystem ? (
            <Badge variant="secondary">{t("workspace.common.system")}</Badge>
          ) : null}
          {!receiver.isActive ? (
            <Badge variant="outline">{t("workspace.common.inactive")}</Badge>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {receiver.mailDomain ?? t("workspace.receivers.noDomain")}
          {" · "}
          <span className="font-mono">…{receiver.tokenHint}</span>
        </div>
      </div>

      {canManage ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleActive}
            aria-label={
              receiver.isActive
                ? t("workspace.receivers.disable")
                : t("workspace.receivers.enable")
            }
          >
            <Power className="h-4 w-4" />
            {receiver.isActive
              ? t("workspace.receivers.disable")
              : t("workspace.receivers.enable")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRotate}
            aria-label={t("workspace.receivers.rotate")}
          >
            <KeyRound className="h-4 w-4" />
            {t("workspace.receivers.rotate")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("workspace.receivers.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("workspace.receivers.deleteConfirmTitle", {
                    name: receiver.displayName,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("workspace.receivers.deleteConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("workspace.common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>
                  {t("workspace.receivers.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </li>
  )
}

function CreateReceiverDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | null
  onCreated: (inboundToken: string) => void
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState("")
  const [mailDomain, setMailDomain] = useState("")
  const [workerUrl, setWorkerUrl] = useState("")
  const [workerToken, setWorkerToken] = useState("")
  const [saving, setSaving] = useState(false)

  function reset() {
    setDisplayName("")
    setMailDomain("")
    setWorkerUrl("")
    setWorkerToken("")
  }

  async function handleSubmit() {
    if (!displayName.trim() || !workspaceId) return

    // The API rejects one half of the staging pair without the other, so catch
    // it here rather than round-tripping for a 400.
    if (Boolean(workerUrl.trim()) !== Boolean(workerToken.trim())) {
      toast.error(t("workspace.receivers.stagingPairRequired"))
      return
    }

    setSaving(true)
    try {
      const created = await createEmailReceiver({
        workspaceId,
        displayName: displayName.trim(),
        mailDomain: mailDomain.trim() || undefined,
        workerUrl: workerUrl.trim() || undefined,
        workerToken: workerToken.trim() || undefined,
      })
      onOpenChange(false)
      reset()
      onCreated(created.inboundToken)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspace.common.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("workspace.receivers.registerTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.receivers.registerDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <WorkspaceField
            id="receiver-name"
            label={t("workspace.receivers.name")}
            value={displayName}
            onChange={setDisplayName}
            placeholder={t("workspace.receivers.namePlaceholder")}
          />
          <WorkspaceField
            id="receiver-domain"
            label={t("workspace.receivers.domain")}
            hint={t("workspace.receivers.domainHint")}
            value={mailDomain}
            onChange={setMailDomain}
            placeholder="example.com"
          />
          <WorkspaceField
            id="receiver-worker-url"
            label={t("workspace.receivers.workerUrl")}
            hint={t("workspace.receivers.workerUrlHint")}
            value={workerUrl}
            onChange={setWorkerUrl}
            placeholder="https://receiver.example.workers.dev"
          />
          <WorkspaceField
            id="receiver-worker-token"
            label={t("workspace.receivers.workerToken")}
            value={workerToken}
            onChange={setWorkerToken}
            type="password"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("workspace.common.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!displayName.trim() || !workspaceId || saving}
          >
            {t("workspace.receivers.register")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
