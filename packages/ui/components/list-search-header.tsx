"use client"

import type { ReactNode } from "react"
import { Search } from "lucide-react"

type Props = {
  title: string
  /** Optional right-aligned annotation shown next to the title (e.g. unread count). */
  annotation?: ReactNode
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  searchAriaLabel: string
}

/**
 * Shared header + search chrome for list panes (mail and messages).
 * Both panes render an identical title row and search field; only the list
 * contents below differ.
 */
export function ListSearchHeader({
  title,
  annotation,
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
}: Props) {
  return (
    <div className="border-b border-border px-4 pt-4 pb-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {annotation}
      </div>
      <div className="relative mt-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-muted px-3 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          aria-label={searchAriaLabel}
        />
      </div>
    </div>
  )
}
