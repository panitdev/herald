import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { Command, Menu } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AppSidebar } from "@/components/email/app-sidebar"
import {
  WORKSPACE_PAGE_ROUTES,
  type WorkspacePage,
} from "@/components/email/sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAppChrome } from "@/lib/app-chrome"

export const Route = createFileRoute("/_app/workspace")({
  ssr: false,
  component: WorkspaceRoute,
})

const PAGES = Object.keys(WORKSPACE_PAGE_ROUTES) as WorkspacePage[]

function WorkspaceRoute() {
  const navigate = useNavigate()
  const { openCompose, openSettings, openMobileCommand } = useAppChrome()
  const { t } = useTranslation()

  // The sidebar highlight follows the URL rather than a param, so the three
  // pages stay plain child routes with no shared search state.
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const page = PAGES.find((id) => pathname.startsWith(`/workspace/${id}`)) ?? "general"


  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
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
              <AppSidebar />
            </SheetContent>
          </Sheet>
          <span className="flex-1 text-sm font-medium">{t("sidebar.workspace")}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("mobileCommand.open")}
            onClick={openMobileCommand}
          >
            <Command className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
