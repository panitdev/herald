import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

import { ErrorBoundary } from "@/components/error-boundary"

function BrokenPanel(): ReactNode {
  throw new Error("Unable to render this message.")
}

function HealthyPanel() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-border bg-background p-6 text-sm">
      Content rendered successfully.
    </div>
  )
}

const meta = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-[280px] max-w-lg rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ErrorBoundary>

export default meta

type Story = StoryObj<typeof meta>

export const CaughtError: Story = {
  args: {
    children: <BrokenPanel />,
  },
}

export const CustomFallback: Story = {
  args: {
    children: <BrokenPanel />,
    fallback: (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Custom fallback content
      </div>
    ),
  },
}

export const Healthy: Story = {
  args: {
    children: <HealthyPanel />,
  },
}
