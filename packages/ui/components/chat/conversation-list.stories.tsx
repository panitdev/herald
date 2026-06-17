import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ConversationList } from "@/components/chat/conversation-list"
import {
  ME_USER_ID,
  conversations,
  noop,
} from "@/components/chat/story-fixtures"
import { conversationView } from "@/lib/chat"

const views = conversations.map((c) => conversationView(c, ME_USER_ID))

const meta = {
  title: "Chat/ConversationList",
  component: ConversationList,
  tags: ["autodocs"],
  args: {
    conversations: views,
    selectedId: views[0]?.id ?? null,
    onSelect: noop,
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
    return <ConversationList {...args} search={search} onSearchChange={setSearch} />
  },
} satisfies Meta<typeof ConversationList>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const Empty: Story = {
  args: {
    conversations: [],
    selectedId: null,
  },
  render: (args) => <ConversationList {...args} search="" onSearchChange={noop} />,
}
