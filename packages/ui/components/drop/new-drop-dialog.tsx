"use client"

import * as React from "react"
import { ClipboardPaste, FileUp, Plus, Type, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/responsive-dialog"
import type { DropItem, FileDropItem, ImageDropItem } from "@/lib/types"
import type { NewDropMode } from "@/lib/app-chrome"

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { id: NewDropMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "files", label: "Files", icon: FileUp },
  { id: "clipboard", label: "Clipboard", icon: ClipboardPaste },
  { id: "text", label: "Text", icon: Type },
]

// ─── Files tab ────────────────────────────────────────────────────────────────

function isLinkUrl(text: string): boolean {
  try {
    const url = new URL(text.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function fileToDropItem(file: File): Promise<FileDropItem | ImageDropItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      if (file.type.startsWith("image/")) {
        resolve({ type: "image", name: file.name, mimeType: file.type, size: file.size, dataUrl })
      } else {
        resolve({ type: "file", name: file.name, mimeType: file.type, size: file.size, dataUrl })
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function FilesTab({
  items,
  onChange,
}: {
  items: (FileDropItem | ImageDropItem)[]
  onChange: (items: (FileDropItem | ImageDropItem)[]) => void
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const converted = await Promise.all(arr.map(fileToDropItem))
    onChange([...items, ...converted])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      void addFiles(e.target.files)
      e.target.value = ""
    }
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label={t("drop.new.dropZoneAriaLabel")}
      >
        <FileUp className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">{t("drop.new.dropFilesHere")}</p>
          <p className="text-xs text-muted-foreground">{t("drop.new.orClickToBrowse")}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleInputChange}
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              {item.type === "image" ? (
                <img
                  src={item.dataUrl}
                  alt={item.name}
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileUp className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.size > 1024 * 1024
                    ? `${(item.size / 1024 / 1024).toFixed(1)} MB`
                    : `${Math.round(item.size / 1024)} KB`}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(i)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Clipboard tab ────────────────────────────────────────────────────────────

function ClipboardTab({
  text,
  onChange,
}: {
  text: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [reading, setReading] = React.useState(false)

  async function readClipboard() {
    setReading(true)
    try {
      const text = await navigator.clipboard.readText()
      onChange(text)
    } catch {
      // Permission denied or not available
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("drop.new.clipboardHint")}</p>
        <Button variant="outline" size="sm" onClick={readClipboard} disabled={reading}>
          <ClipboardPaste className="h-3.5 w-3.5" />
          {reading ? t("drop.new.reading") : t("drop.new.readClipboard")}
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("drop.new.clipboardPlaceholder")}
        rows={6}
        className="w-full resize-none rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </div>
  )
}

// ─── Text tab ─────────────────────────────────────────────────────────────────

function TextTab({
  blocks,
  onChange,
}: {
  blocks: string[]
  onChange: (blocks: string[]) => void
}) {
  const { t } = useTranslation()

  function updateBlock(index: number, value: string) {
    const next = [...blocks]
    next[index] = value
    onChange(next)
  }

  function addBlock() {
    onChange([...blocks, ""])
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <div key={i} className="relative group">
          <textarea
            value={block}
            onChange={(e) => updateBlock(i, e.target.value)}
            placeholder={t("drop.new.textBlockPlaceholder")}
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/10"
            autoFocus={i === blocks.length - 1 && i > 0}
          />
          {blocks.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => removeBlock(i)}
              aria-label="Remove block"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start gap-2" onClick={addBlock}>
        <Plus className="h-3.5 w-3.5" />
        {t("drop.new.addBlock")}
      </Button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  open: boolean
  mode: NewDropMode
  onOpenChange: (open: boolean) => void
  onSave: (items: DropItem[]) => void
}

export function NewDropDialog({ open, mode: initialMode, onOpenChange, onSave }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = React.useState<NewDropMode>(initialMode)
  const [fileItems, setFileItems] = React.useState<(FileDropItem | ImageDropItem)[]>([])
  const [clipboardText, setClipboardText] = React.useState("")
  const [textBlocks, setTextBlocks] = React.useState<string[]>([""])

  React.useEffect(() => {
    if (open) {
      setTab(initialMode)
      setFileItems([])
      setClipboardText("")
      setTextBlocks([""])
    }
  }, [open, initialMode])

  React.useEffect(() => {
    if (open && tab === "clipboard" && !clipboardText) {
      navigator.clipboard.readText().then(setClipboardText).catch(() => {})
    }
  }, [open, tab, clipboardText])

  function handleSave() {
    const items: DropItem[] = []

    if (tab === "files") {
      items.push(...fileItems)
    } else if (tab === "clipboard") {
      const content = clipboardText.trim()
      if (content) {
        if (isLinkUrl(content)) {
          items.push({ type: "link", url: content })
        } else {
          items.push({ type: "text", content })
        }
      }
    } else if (tab === "text") {
      for (const block of textBlocks) {
        const content = block.trim()
        if (!content) continue
        if (isLinkUrl(content)) {
          items.push({ type: "link", url: content })
        } else {
          items.push({ type: "text", content })
        }
      }
    }

    if (items.length === 0) return
    onSave(items)
    onOpenChange(false)
  }

  const canSave =
    (tab === "files" && fileItems.length > 0) ||
    (tab === "clipboard" && clipboardText.trim().length > 0) ||
    (tab === "text" && textBlocks.some((b) => b.trim().length > 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
        drawerContentClassName="max-h-[85dvh]"
      >
        <DialogHeader>
          <DialogTitle>{t("drop.new.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("drop.new.description")}</DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border -mx-6 px-6 sm:mx-0 sm:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors",
                tab === id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto sm:max-h-[40vh]">
          {tab === "files" && (
            <FilesTab items={fileItems} onChange={setFileItems} />
          )}
          {tab === "clipboard" && (
            <ClipboardTab text={clipboardText} onChange={setClipboardText} />
          )}
          {tab === "text" && (
            <TextTab blocks={textBlocks} onChange={setTextBlocks} />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("drop.new.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("drop.new.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
