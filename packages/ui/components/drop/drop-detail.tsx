"use client"

import { ArrowLeft, Download, ExternalLink, File, Image, Link, Package, Trash2, Type } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { dropTitle } from "@/lib/drop-store"
import type { Drop, DropItem, FileDropItem, ImageDropItem } from "@/lib/types"

// ─── Item renderers ───────────────────────────────────────────────────────────

function TextItem({ content }: { content: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
        <Type className="h-3.5 w-3.5" />
        <span>Text</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{content}</p>
    </div>
  )
}

function LinkItem({ url }: { url: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
        <Link className="h-3.5 w-3.5" />
        <span>Link</span>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <span className="break-all">{url}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </div>
  )
}

function ImageItem({ item }: { item: ImageDropItem }) {
  const sizeLabel = item.size > 1024 * 1024
    ? `${(item.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(item.size / 1024)} KB`

  function handleDownload() {
    const a = document.createElement("a")
    a.href = item.dataUrl
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Image className="h-3.5 w-3.5" />
          <span className="truncate">{item.name}</span>
          <span>·</span>
          <span>{sizeLabel}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} aria-label="Download">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="border-t border-border bg-muted/30 p-2">
        <img
          src={item.dataUrl}
          alt={item.name}
          className="max-h-64 w-full rounded object-contain"
        />
      </div>
    </div>
  )
}

function FileItem({ item }: { item: FileDropItem }) {
  const sizeLabel = item.size > 1024 * 1024
    ? `${(item.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(item.size / 1024)} KB`

  function handleDownload() {
    const a = document.createElement("a")
    a.href = item.dataUrl
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <File className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{sizeLabel}</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDownload} aria-label="Download">
        <Download className="h-4 w-4" />
      </Button>
    </div>
  )
}

function DropItemRenderer({ item }: { item: DropItem }) {
  if (item.type === "text") return <TextItem content={item.content} />
  if (item.type === "link") return <LinkItem url={item.url} />
  if (item.type === "image") return <ImageItem item={item} />
  if (item.type === "file") return <FileItem item={item} />
  return null
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDetail() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <Package className="h-10 w-10" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{t("drop.detail.noDropSelected")}</p>
        <p className="mt-1 text-xs">{t("drop.detail.noDropSelectedHint")}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  drop: Drop | null
  onBack: () => void
  onDelete: (id: string) => void
}

export function DropDetail({ drop, onBack, onDelete }: Props) {
  const { t } = useTranslation()

  if (!drop) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <EmptyDetail />
      </div>
    )
  }

  const title = dropTitle(drop)
  const formattedDate = new Date(drop.createdAt).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label={t("drop.detail.backToList")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">{formattedDate}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(drop.id)}
          aria-label={t("drop.detail.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <div className="flex flex-col gap-3">
          {drop.items.map((item, i) => (
            <DropItemRenderer key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  )
}
