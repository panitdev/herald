import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { EmailSidebar } from "@/components/email/sidebar"
import { AuthProvider } from "@/lib/auth-store"
import { SettingsProvider } from "@/lib/settings-store"
import type { Folder } from "@/lib/types"
import { folderCounts } from "@/components/email/story-fixtures"

function SidebarStory() {
  const [active, setActive] = useState<Folder>("inbox")

  return (
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
        <div className="h-[640px] w-72 overflow-hidden rounded-lg border border-sidebar-border">
          <EmailSidebar
            active={active}
            onSelect={setActive}
            counts={folderCounts}
            onCompose={() => {}}
            onOpenSettings={() => {}}
          />
        </div>
      </AuthProvider>
    </SettingsProvider>
  )
}

const meta = {
  title: "Email/EmailSidebar",
  component: EmailSidebar,
  tags: ["autodocs"],
  args: {
    active: "inbox",
    onSelect: () => {},
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
