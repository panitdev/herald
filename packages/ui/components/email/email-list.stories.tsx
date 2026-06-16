import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { EmailList } from "@/components/email/email-list"
import { emails, noop } from "@/components/email/story-fixtures"
import type { Folder } from "@/lib/types"

const meta = {
  title: "Email/EmailList",
  component: EmailList,
  tags: ["autodocs"],
  args: {
    folder: "inbox",
    emails,
    selectedId: emails[0]?.id ?? null,
    unreadCount: 1,
    onSelect: noop,
    onToggleStar: noop,
    onToggleRead: noop,
    onArchive: noop,
    onDelete: noop,
    onReply: noop,
    search: "",
    onSearchChange: noop,
  },
  decorators: [
    (Story) => (
      <div className="h-[640px] w-full max-w-md overflow-hidden rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
  render: (args) => {
    const [search, setSearch] = useState("")

    return (
      <EmailList
        {...args}
        search={search}
        onSearchChange={setSearch}
      />
    )
  },
} satisfies Meta<typeof EmailList>

export default meta

type Story = StoryObj<typeof meta>

export const Inbox: Story = {
  args: {},
}

export const EmptySearch: Story = {
  args: {
    emails: [],
    selectedId: null,
    folder: "trash" as Folder,
    search: "invoice",
    onSearchChange: noop,
  },
  render: (args) => (
    <EmailList
      {...args}
      search="invoice"
      onSearchChange={noop}
    />
  ),
}
