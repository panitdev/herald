import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SettingsDialog } from "@/components/email/settings-dialog"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth-store"
import { SettingsProvider } from "@/lib/settings-store"

function SettingsDialogStory() {
  const [open, setOpen] = useState(true)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        autoRefresh={false}
        initialUser={{
          id: "user-story",
          address: "you@panit.dev",
          addresses: ["you@panit.dev", "alias@panit.dev"],
          username: "you",
          displayName: "You",
          avatarUrl: null,
        }}
      >
        <SettingsProvider>
          <div className="flex h-[640px] items-start justify-center p-6">
            <Button onClick={() => setOpen(true)}>Open settings</Button>
            <SettingsDialog open={open} onOpenChange={setOpen} />
          </div>
          <Toaster position="bottom-right" richColors closeButton />
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

const meta = {
  title: "Email/SettingsDialog",
  component: SettingsDialog,
  tags: ["autodocs"],
  args: {
    open: true,
    onOpenChange: () => {},
  },
  render: () => <SettingsDialogStory />,
} satisfies Meta<typeof SettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

export const Open: Story = {
  args: {},
}
