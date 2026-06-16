import type { Meta, StoryObj } from "@storybook/react-vite"

import { AuthGuardDialog } from "@/components/auth/auth-guard-dialog"
import type { AuthStatus } from "@/lib/kratos"

const meta = {
  title: "Auth/AuthGuardDialog",
  component: AuthGuardDialog,
  tags: ["autodocs"],
  args: {
    checkSession: async (): Promise<AuthStatus> => "unauthed",
    initialStatus: "unauthed",
    login: () => {},
  },
  decorators: [
    (Story) => (
      <div className="h-[320px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AuthGuardDialog>

export default meta

type Story = StoryObj<typeof meta>

export const SessionExpired: Story = {}

export const Authenticated: Story = {
  args: {
    checkSession: async (): Promise<AuthStatus> => "authed",
    initialStatus: "authed",
  },
}
