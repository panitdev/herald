import type { Meta, StoryObj } from "@storybook/react-vite"

import { AuthScreen } from "@/components/auth/auth-screen"

const meta = {
  title: "Auth/AuthScreen",
  component: AuthScreen,
  tags: ["autodocs"],
  args: {
    login: () => {},
  },
} satisfies Meta<typeof AuthScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Redirecting: Story = {}
