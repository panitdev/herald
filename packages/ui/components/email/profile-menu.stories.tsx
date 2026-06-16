import type { Meta, StoryObj } from "@storybook/react-vite"

import { ProfileMenu } from "@/components/email/profile-menu"
import { AuthProvider } from "@/lib/auth-store"
import { SettingsProvider } from "@/lib/settings-store"

const meta = {
  title: "Email/ProfileMenu",
  component: ProfileMenu,
  tags: ["autodocs"],
  args: {
    onOpenSettings: () => {},
  },
  decorators: [
    (Story) => (
      <SettingsProvider>
        <AuthProvider
          autoRefresh={false}
          initialUser={{
            id: "user-story",
            address: "you@panit.dev",
            username: "you",
          }}
        >
          <div className="w-72 rounded-lg border border-sidebar-border bg-sidebar p-2">
            <Story />
          </div>
        </AuthProvider>
      </SettingsProvider>
    ),
  ],
} satisfies Meta<typeof ProfileMenu>

export default meta

type Story = StoryObj<typeof meta>

export const Closed: Story = {}
