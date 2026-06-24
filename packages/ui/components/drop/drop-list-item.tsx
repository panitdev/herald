"use client"

import { motion } from "framer-motion"
import { File, Image, Link, Type } from "lucide-react"
import { cn } from "@/lib/utils"
import { dropTitle, dropPreview } from "@/lib/drop-store"
import type { Drop } from "@/lib/types"

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function ItemTypeIcons({ drop }: { drop: Drop }) {
  const seen = new Set<string>()
  const icons: React.ReactNode[] = []

  for (const item of drop.items) {
    if (seen.has(item.type)) continue
    seen.add(item.type)
    const key = item.type
    if (item.type === "text") icons.push(<Type key={key} className="h-3 w-3" />)
    else if (item.type === "link") icons.push(<Link key={key} className="h-3 w-3" />)
    else if (item.type === "image") icons.push(<Image key={key} className="h-3 w-3" />)
    else if (item.type === "file") icons.push(<File key={key} className="h-3 w-3" />)
  }

  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      {icons}
    </span>
  )
}

type Props = {
  drop: Drop
  selected: boolean
  onSelect: () => void
}

export function DropListItem({ drop, selected, onSelect }: Props) {
  const title = dropTitle(drop)
  const preview = dropPreview(drop)

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm font-medium", !selected && "text-foreground")}>
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTime(drop.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ItemTypeIcons drop={drop} />
          {preview && (
            <span className="truncate text-xs text-muted-foreground">{preview}</span>
          )}
        </div>
      </button>
    </motion.li>
  )
}
