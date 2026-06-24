"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Package } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ListSearchHeader } from "@/components/list-search-header"
import { DropListItem } from "./drop-list-item"
import type { Drop } from "@/lib/types"

// ─── Date grouping ────────────────────────────────────────────────────────────

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400_000)
  const weekAgo = new Date(today.getTime() - 7 * 86400_000)
  const dropDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (dropDay.getTime() === today.getTime()) return "Today"
  if (dropDay.getTime() === yesterday.getTime()) return "Yesterday"
  if (dropDay >= weekAgo) return "Last week"
  return date.toLocaleDateString([], { month: "long", year: "numeric" })
}

type Group = { label: string; drops: Drop[] }

function groupDrops(drops: Drop[]): Group[] {
  const groups: Group[] = []
  let current: Group | null = null

  for (const drop of drops) {
    const label = dayLabel(drop.createdAt)
    if (!current || current.label !== label) {
      current = { label, drops: [] }
      groups.push(current)
    }
    current.drops.push(drop)
  }

  return groups
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  drops: Drop[]
  selectedId: string | null
  onSelect: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

export function DropList({
  drops,
  selectedId,
  onSelect,
  search,
  onSearchChange,
}: Props) {
  const { t } = useTranslation()

  const filtered = search.trim()
    ? drops.filter((d) => {
        const q = search.toLowerCase()
        if (d.title?.toLowerCase().includes(q)) return true
        return d.items.some((item) => {
          if (item.type === "text") return item.content.toLowerCase().includes(q)
          if (item.type === "link") return item.url.toLowerCase().includes(q)
          if (item.type === "file" || item.type === "image") return item.name.toLowerCase().includes(q)
          return false
        })
      })
    : drops

  const groups = groupDrops(filtered)

  return (
    <div className="flex h-full flex-col bg-background">
      <ListSearchHeader
        title={t("drop.list.title")}
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={t("drop.list.searchPlaceholder")}
        searchAriaLabel={t("drop.list.searchAriaLabel")}
      />

      <div className="relative flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <EmptyState hasSearch={!!search} />
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 bg-background/80 px-4 py-2 backdrop-blur-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  <AnimatePresence initial={false} mode="popLayout">
                    {group.drops.map((drop) => (
                      <DropListItem
                        key={drop.id}
                        drop={drop}
                        selected={selectedId === drop.id}
                        onSelect={() => onSelect(drop.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium">
          {hasSearch ? t("drop.list.noResults") : t("drop.list.noDropsYet")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasSearch ? t("drop.list.tryDifferentSearch") : t("drop.list.dropsWillAppear")}
        </p>
      </div>
    </motion.div>
  )
}
