"use client"

import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Shows a credential the API returns exactly once. Refetching the unit will not
 * bring it back, so the dialog is the user's only chance to copy it.
 */
export function OneTimeSecretDialog({
  secret,
  onClose,
  title,
  description,
}: {
  secret: string | null
  onClose: () => void
  title: string
  description: string
}) {
  const { t } = useTranslation()

  async function copy() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      toast.success(t("workspace.common.copied"))
    } catch {
      toast.error(t("workspace.common.copyFailed"))
    }
  }

  return (
    <Dialog open={secret != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{secret}</code>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void copy()}
            aria-label={t("workspace.common.copy")}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("workspace.common.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
