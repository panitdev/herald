import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SettingsDialog } from "@/components/email/settings-dialog"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { SettingsProvider } from "@/lib/settings-store"

function SettingsDialogStory() {
  const [open, setOpen] = useState(true)

  return (
    <SettingsProvider>
      <div className="flex h-[640px] items-start justify-center p-6">
        <Button onClick={() => setOpen(true)}>Open settings</Button>
        <SettingsDialog open={open} onOpenChange={setOpen} />
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </SettingsProvider>
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
