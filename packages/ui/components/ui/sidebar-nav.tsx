import { useId, useState, type ComponentType, type ReactNode } from "react"
import { ArrowLeft, ChevronRight, Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.32, 0.72, 0, 1],
} as const

const PANEL_VARIANTS = {
  enter: (direction: 1 | -1) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: 0 },
  exit: (direction: 1 | -1) => ({ x: direction > 0 ? "-100%" : "100%" }),
} as const

type NavSubmenu = {
  /** Heading shown above the sub-menu's own sections. */
  label?: string
  /** Label of the back button. Defaults to `"Back"`. */
  backLabel?: string
  /** Rendered between the back button and the sections, for context cards. */
  header?: ReactNode
  /**
   * Called when the back button is pressed, before the panel pops. Lets a
   * consumer whose panels correspond to routes navigate out in step with the
   * panel, instead of the nav returning to root while the page stays put.
   */
  onBack?: () => void
  sections: NavSection[]
}

type NavItem = {
  label: string
  icon: ComponentType<{ className?: string }>
  active?: boolean
  badge?: ReactNode
  /** Called on click, including when the item also opens a sub-menu. */
  onClick?: () => void
  /** Slides a nested panel in from the right when the item is clicked. Nests to any depth. */
  submenu?: NavSubmenu
}

type NavSection = {
  label?: string
  /** Renders a divider above the section, for grouping unlabeled sections. */
  separator?: boolean
  items: NavItem[]
}

export function SidebarNav({
  sections,
  newLabel,
  onNewClick,
  ariaLabel,
  className,
  panelClassName,
}: {
  sections: NavSection[]
  newLabel?: string
  onNewClick?: () => void
  ariaLabel?: string
  className?: string
  /**
   * Classes for the sliding panel, which carries the nav's padding.
   * `className` is applied to the outer nav and cannot reach the panel.
   */
  panelClassName?: string
}) {
  const uid = useId()
  const prefersReducedMotion = useReducedMotion()
  const [{ path, direction }, setPanel] = useState<{ path: string[]; direction: 1 | -1 }>({
    path: [],
    direction: 1,
  })

  // The open panel is a path of item labels resolved against the live `sections`
  // prop on every render, so prop updates reach panels that are already open. A
  // path that no longer resolves falls back to its nearest valid ancestor.
  const trail: { label: string; submenu: NavSubmenu }[] = []
  let panelSections = sections

  for (const label of path) {
    const item = panelSections.flatMap((section) => section.items).find((it) => it.label === label)

    if (!item?.submenu) break

    trail.push({ label, submenu: item.submenu })
    panelSections = item.submenu.sections
  }

  const current = trail.at(-1)
  const panelKey = ["root", ...trail.map((entry) => entry.label)].join("/")

  function openSubmenu(label: string) {
    setPanel({ path: [...trail.map((entry) => entry.label), label], direction: 1 })
  }

  function goBack() {
    current?.submenu.onBack?.()
    setPanel({ path: trail.slice(0, -1).map((entry) => entry.label), direction: -1 })
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex h-full flex-col rounded-xl border border-sidebar-border bg-sidebar",
        className
      )}
    >
      {/* `overflow-clip`, not `overflow-hidden`: focusing a button on the outgoing
          panel would otherwise scroll it sideways and leave the panel offset. */}
      <div className="relative min-h-0 flex-1 overflow-clip">
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <motion.div
            key={panelKey}
            custom={direction}
            variants={prefersReducedMotion ? undefined : PANEL_VARIANTS}
            initial={prefersReducedMotion ? false : "enter"}
            animate={prefersReducedMotion ? undefined : "center"}
            exit={prefersReducedMotion ? undefined : "exit"}
            transition={PANEL_TRANSITION}
            className={cn(
              "absolute inset-0 flex flex-col gap-2 overflow-y-auto p-3",
              panelClassName
            )}
          >
            {current ? (
              <>
                <button
                  type="button"
                  onClick={goBack}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  <span>{current.submenu.backLabel ?? "Back"}</span>
                </button>
                {current.submenu.header}
                {current.submenu.label ? (
                  <div className="px-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    {current.submenu.label}
                  </div>
                ) : null}
              </>
            ) : null}
            <NavSections
              layoutIdPrefix={`${uid}-${panelKey}`}
              onOpenSubmenu={openSubmenu}
              sections={panelSections}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {newLabel ? (
        <button
          type="button"
          onClick={onNewClick}
          className="m-3 mt-0 flex items-center gap-2 rounded-lg border border-dashed border-sidebar-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          <span>{newLabel}</span>
        </button>
      ) : null}
    </nav>
  )
}

function NavSections({
  layoutIdPrefix,
  onOpenSubmenu,
  sections,
}: {
  layoutIdPrefix: string
  onOpenSubmenu: (label: string) => void
  sections: NavSection[]
}) {
  return (
    <>
      {sections.map((section, index) => (
        <div
          key={section.label ?? section.items.map((item) => item.label).join("-")}
          className={cn(
            section.separator && index > 0 && "mt-2 border-t border-sidebar-border/60 pt-2"
          )}
        >
          {section.label ? (
            <div className="px-2 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {section.label}
            </div>
          ) : null}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    item.onClick?.()
                    if (item.submenu) {
                      onOpenSubmenu(item.label)
                    }
                  }}
                  aria-current={item.active ? "page" : undefined}
                  aria-haspopup={item.submenu ? "menu" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors",
                    item.active
                      ? "bg-sidebar-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                >
                  {item.active ? (
                    <motion.span
                      layoutId={`${layoutIdPrefix}-active`}
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                  <Icon className={cn("h-4 w-4 shrink-0", item.active && "text-primary")} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge}
                  {item.submenu ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
