import type { Meta, StoryObj } from "@storybook/react-vite"

import { SafeEmailBody } from "@/components/email/safe-email-body"
import { inboxEmail } from "@/components/email/story-fixtures"

const meta = {
  title: "Email/SafeEmailBody",
  component: SafeEmailBody,
  tags: ["autodocs"],
  args: {
    body: inboxEmail.body,
    format: "text",
    messageId: inboxEmail.id,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-lg border border-border bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SafeEmailBody>

export default meta

type Story = StoryObj<typeof meta>

export const Text: Story = {}

export const HtmlFrame: Story = {
  args: {
    body: "<p>Email content is served through the render endpoint.</p>",
    format: "html",
  },
}
