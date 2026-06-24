import { useState } from "react"
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { AnimatePresence, motion } from "framer-motion"
import { Command, Menu } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { EmailSidebar } from "@/components/email/sidebar"
import { DropList } from "@/components/drop/drop-list"
import { DropDetail } from "@/components/drop/drop-detail"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useDropStore } from "@/lib/drop-store"
import { useAppChrome } from "@/lib/app-chrome"
import type { Drop } from "@/lib/types"

export const Route = createFileRoute("/_app/drop")({
  ssr: false,
  component: DropRoute,
})

function DropRoute() {
  const navigate = useNavigate()
  const { openCompose, openSettings, openMobileCommand, openNewDrop } = useAppChrome()
  const { drops, deleteDrop } = useDropStore()
  const { t } = useTranslation()

  const childParams = useParams({ strict: false }) as { dropId?: string }
  const selectedId = childParams.dropId ?? null

  const [search, setSearch] = useState("")

  const selected = selectedId ? drops.find((d) => d.id === selectedId) ?? null : null

  function handleDelete(id: string) {
    deleteDrop(id)
    if (selectedId === id) {
      void navigate({ to: "/drop" })
    }
    toast.success(t("drop.deleted"))
  }

  const sidebarNode = (
    <EmailSidebar
      active="drop"
      onSelect={(f) => navigate({ to: "/$mailbox", params: { mailbox: f } })}
      onOpenMessages={() => navigate({ to: "/messages" })}
      onOpenDrop={() => navigate({ to: "/drop" })}
      onCompose={() => openCompose()}
      onOpenSettings={openSettings}
    />
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 border-r border-border md:block lg:w-72">
        {sidebarNode}
      </div>

      {/* Main area */}
      <div className="relative flex min-w-0 flex-1">
        {/* Drop list pane */}
        <div
          className={`flex min-w-0 flex-col border-r border-border md:w-[340px] lg:w-[380px] xl:w-[420px] ${
            selectedId ? "hidden md:flex" : "flex w-full"
          }`}
        >
          {/* Mobile top bar */}
          <div className="flex items-center gap-1 border-b border-border px-2 py-2 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("app.openMenu")}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">{t("app.folders")}</SheetTitle>
                {sidebarNode}
              </SheetContent>
            </Sheet>
            <span className="flex-1 text-sm font-medium">{t("drop.list.title")}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("mobileCommand.open")}
              onClick={openMobileCommand}
            >
              <Command className="h-5 w-5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            <DropList
              drops={drops}
              selectedId={selectedId}
              onSelect={(id) =>
                navigate({ to: "/drop/$dropId", params: { dropId: id } })
              }
              search={search}
              onSearchChange={setSearch}
            />
          </div>

          {/* New drop button */}
          <div className="border-t border-border p-3">
            <Button className="w-full" onClick={() => openNewDrop("text")}>
              {t("drop.new.button")}
            </Button>
          </div>
        </div>

        {/* Detail pane */}
        {selectedId ? (
          <DropDetailPane
            drop={selected}
            onBack={() => navigate({ to: "/drop" })}
            onDelete={handleDelete}
          />
        ) : (
          <EmptyDropPane />
        )}
      </div>
    </div>
  )
}

function EmptyDropPane() {
  return (
    <div className="hidden min-w-0 flex-1 md:block">
      <DropDetail drop={null} onBack={() => {}} onDelete={() => {}} />
    </div>
  )
}

function DropDetailPane({
  drop,
  onBack,
  onDelete,
}: {
  drop: Drop | null
  onBack: () => void
  onDelete: (id: string) => void
}) {
  const detail = (
    <DropDetail drop={drop} onBack={onBack} onDelete={onDelete} />
  )

  return (
    <>
      <div className="hidden min-w-0 flex-1 md:block">{detail}</div>

      <AnimatePresence>
        <motion.div
          key="mobile-drop-detail"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="absolute inset-0 z-30 bg-background md:hidden"
        >
          {detail}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
