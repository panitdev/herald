import type { Meta, StoryObj } from "@storybook/react-vite"

import { EmailListItem } from "@/components/email/email-list-item"
import { inboxEmail, readEmail, noop } from "@/components/email/story-fixtures"

const meta = {
  title: "Email/EmailListItem",
  component: EmailListItem,
  tags: ["autodocs"],
  args: {
    email: inboxEmail,
    selected: true,
    onSelect: noop,
    onToggleStar: noop,
    onToggleRead: noop,
    onArchive: noop,
    onDelete: noop,
    onReply: noop,
  },
  decorators: [
    (Story) => (
      <ul className="w-full max-w-md divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof EmailListItem>

export default meta

type Story = StoryObj<typeof meta>

export const UnreadSelected: Story = {}

export const Read: Story = {
  args: {
    email: readEmail,
    selected: false,
  },
}
