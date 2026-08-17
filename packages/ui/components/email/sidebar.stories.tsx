import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { EmailSidebar, type SidebarSection } from "@/components/email/sidebar"
import { AuthProvider } from "@/lib/auth-store"
import { SettingsProvider } from "@/lib/settings-store"
import { WorkspaceStoreProvider } from "@/lib/workspace-store"
import { folderCounts } from "@/components/email/story-fixtures"

// The workspace switcher reads its list through react-query; with no API behind
// the story it stays empty, which is the state worth seeing here anyway.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function SidebarStory() {
  const [active, setActive] = useState<SidebarSection>("inbox")

  return (
    <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <AuthProvider
        autoRefresh={false}
        initialUser={{
          id: "user-story",
          address: "you@panit.dev",
          addresses: ["you@panit.dev"],
          username: "you",
          displayName: "You",
          avatarUrl: null,
        }}
      >
        <WorkspaceStoreProvider>
          <div className="h-[640px] w-72 overflow-hidden rounded-lg border border-sidebar-border">
            <EmailSidebar
              active={active}
              onSelect={setActive}
              onOpenMessages={() => setActive("messages")}
              onOpenWorkspace={(page) => setActive(`workspace:${page}`)}
              counts={folderCounts}
              onCompose={() => {}}
              onOpenSettings={() => {}}
            />
          </div>
        </WorkspaceStoreProvider>
      </AuthProvider>
    </SettingsProvider>
    </QueryClientProvider>
  )
}

const meta = {
  title: "Email/EmailSidebar",
  component: EmailSidebar,
  tags: ["autodocs"],
  args: {
    active: "inbox",
    onSelect: () => {},
    onOpenMessages: () => {},
    counts: folderCounts,
    onCompose: () => {},
    onOpenSettings: () => {},
  },
  render: () => <SidebarStory />,
} satisfies Meta<typeof EmailSidebar>

export default meta

type Story = StoryObj<typeof meta>

export const Inbox: Story = {
  args: {},
}
