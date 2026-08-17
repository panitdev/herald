"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  createEmailSender,
  deleteEmailSender,
  type EmailSenderProvider,
} from "@/lib/api"
import { emailSendersQuery } from "@/lib/queries"
import { useWorkspaces } from "@/lib/workspace-store"

const PROVIDERS: EmailSenderProvider[] = ["resend", "ses"]

export function WorkspaceSendersPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaces()
  const queryClient = useQueryClient()

  const { data: senders = [], isPending } = useQuery(emailSendersQuery())
  const [createOpen, setCreateOpen] = useState(false)

  const scoped = senders.filter((sender) => sender.workspaceId === active?.id)
  const canManage = active?.access === "admin"

  const remove = useMutation({
    mutationFn: (id: string) => deleteEmailSender(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emailSenders"] })
      toast.success(t("workspace.senders.deleted"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <WorkspacePage
      title={t("workspace.senders.title")}
      description={t("workspace.senders.description")}
      action={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("workspace.senders.register")}
          </Button>
        ) : null
      }
    >
      <WorkspaceSection>
        {isPending ? (
          <WorkspaceEmpty>{t("workspace.common.loading")}</WorkspaceEmpty>
        ) : scoped.length === 0 ? (
          <WorkspaceEmpty>{t("workspace.senders.empty")}</WorkspaceEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {scoped.map((sender) => (
              <li key={sender.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{sender.displayName}</span>
                    <Badge variant="secondary">{sender.provider}</Badge>
                    {sender.isSystem ? (
                      <Badge variant="secondary">{t("workspace.common.system")}</Badge>
                    ) : null}
                    {!sender.isActive ? (
                      <Badge variant="outline">{t("workspace.common.inactive")}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {sender.fromAddress ??
                      sender.mailDomain ??
                      t("workspace.senders.noDomain")}
                  </div>
                </div>

                {canManage && sender.access === "admin" ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("workspace.senders.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("workspace.senders.deleteConfirmTitle", {
                            name: sender.displayName,
                          })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("workspace.senders.deleteConfirmDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("workspace.common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(sender.id)}>
                          {t("workspace.senders.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      {!canManage && active ? (
        <p className="text-xs text-muted-foreground">{t("workspace.common.needsAdmin")}</p>
      ) : null}

      <CreateSenderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={active?.id ?? null}
      />
    </WorkspacePage>
  )
}

function CreateSenderDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [provider, setProvider] = useState<EmailSenderProvider>("resend")
  const [displayName, setDisplayName] = useState("")
  const [mailDomain, setMailDomain] = useState("")
  const [fromAddress, setFromAddress] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [region, setRegion] = useState("")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [saving, setSaving] = useState(false)

  // Each provider's adapter validates its own credential shape server-side, so
  // the form mirrors those field names exactly.
  const secretReady =
    provider === "resend"
      ? apiKey.trim().length > 0
      : region.trim().length > 0 &&
        accessKeyId.trim().length > 0 &&
        secretAccessKey.trim().length > 0

  async function handleSubmit() {
    if (!displayName.trim() || !workspaceId || !secretReady) return

    setSaving(true)
    try {
      await createEmailSender({
        workspaceId,
        provider,
        displayName: displayName.trim(),
        mailDomain: mailDomain.trim() || undefined,
        fromAddress: fromAddress.trim() || undefined,
        config: provider === "ses" ? { region: region.trim() } : {},
        secret:
          provider === "resend"
            ? { api_key: apiKey.trim() }
            : {
              access_key_id: accessKeyId.trim(),
              secret_access_key: secretAccessKey.trim(),
            },
      })
      await queryClient.invalidateQueries({ queryKey: ["emailSenders"] })
      onOpenChange(false)
      setDisplayName("")
      setMailDomain("")
      setFromAddress("")
      setApiKey("")
      setRegion("")
      setAccessKeyId("")
      setSecretAccessKey("")
      toast.success(t("workspace.senders.created"))
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
          <DialogTitle>{t("workspace.senders.registerTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.senders.registerDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sender-provider">{t("workspace.senders.provider")}</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as EmailSenderProvider)}
            >
              <SelectTrigger id="sender-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`workspace.senders.providers.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <WorkspaceField
            id="sender-name"
            label={t("workspace.senders.name")}
            value={displayName}
            onChange={setDisplayName}
            placeholder={t("workspace.senders.namePlaceholder")}
          />
          <WorkspaceField
            id="sender-domain"
            label={t("workspace.senders.domain")}
            hint={t("workspace.senders.domainHint")}
            value={mailDomain}
            onChange={setMailDomain}
            placeholder="example.com"
          />
          <WorkspaceField
            id="sender-from"
            label={t("workspace.senders.fromAddress")}
            value={fromAddress}
            onChange={setFromAddress}
            placeholder="noreply@example.com"
          />

          {provider === "resend" ? (
            <WorkspaceField
              id="sender-api-key"
              label={t("workspace.senders.apiKey")}
              value={apiKey}
              onChange={setApiKey}
              type="password"
              placeholder="re_..."
            />
          ) : (
            <>
              <WorkspaceField
                id="sender-region"
                label={t("workspace.senders.region")}
                value={region}
                onChange={setRegion}
                placeholder="us-east-1"
              />
              <WorkspaceField
                id="sender-access-key"
                label={t("workspace.senders.accessKeyId")}
                value={accessKeyId}
                onChange={setAccessKeyId}
                placeholder="AKIA..."
              />
              <WorkspaceField
                id="sender-secret-key"
                label={t("workspace.senders.secretAccessKey")}
                value={secretAccessKey}
                onChange={setSecretAccessKey}
                type="password"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("workspace.common.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!displayName.trim() || !workspaceId || !secretReady || saving}
          >
            {t("workspace.senders.register")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
