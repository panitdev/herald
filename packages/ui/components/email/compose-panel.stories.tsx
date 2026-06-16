import type { Meta, StoryObj } from "@storybook/react-vite"

import { ComposePanel } from "@/components/email/compose-panel"

const meta = {
  title: "Email/ComposePanel",
  component: ComposePanel,
  tags: ["autodocs"],
  args: {
    open: true,
    initialTo: "mina@atlas.example",
    initialSubject: "Re: Updated launch checklist",
    onClose: () => {},
    onSend: async () => {},
  },
  decorators: [
    (Story) => (
      <div className="relative h-[520px] overflow-hidden rounded-lg border border-border bg-muted/40">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComposePanel>

export default meta

type Story = StoryObj<typeof meta>

export const Open: Story = {}

export const Blank: Story = {
  args: {
    initialTo: "",
    initialSubject: "",
  },
}
