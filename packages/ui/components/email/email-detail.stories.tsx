import type { Meta, StoryObj } from "@storybook/react-vite"

import { EmailDetail } from "@/components/email/email-detail"
import { inboxEmail, noop } from "@/components/email/story-fixtures"

const meta = {
  title: "Email/EmailDetail",
  component: EmailDetail,
  tags: ["autodocs"],
  args: {
    email: inboxEmail,
    messageId: inboxEmail.id,
    emailBody: inboxEmail.body,
    emailBodyFormat: "text",
    onBack: noop,
    onArchive: noop,
    onDelete: noop,
    onToggleStar: noop,
    onToggleRead: noop,
    onReply: noop,
    onDownloadSource: async () => {},
  },
  decorators: [
    (Story) => (
      <div className="h-[680px] overflow-hidden rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmailDetail>

export default meta

type Story = StoryObj<typeof meta>

export const Message: Story = {}

export const Empty: Story = {
  args: {
    email: null,
    messageId: null,
    emailBody: "",
  },
}
