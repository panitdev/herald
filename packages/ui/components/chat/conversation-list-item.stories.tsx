import type { Meta, StoryObj } from "@storybook/react-vite"

import { ConversationListItem } from "@/components/chat/conversation-list-item"
import {
  ME_USER_ID,
  directConversation,
  groupConversation,
  noop,
} from "@/components/chat/story-fixtures"
import { conversationView } from "@/lib/chat"

const meta = {
  title: "Chat/ConversationListItem",
  component: ConversationListItem,
  tags: ["autodocs"],
  args: {
    conversation: conversationView(directConversation, ME_USER_ID),
    selected: false,
    onSelect: noop,
  },
  decorators: [
    (Story) => (
      <ul className="w-full max-w-md divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ConversationListItem>

export default meta

type Story = StoryObj<typeof meta>

export const Direct: Story = {
  args: {},
}

export const Selected: Story = {
  args: {
    selected: true,
  },
}

export const Group: Story = {
  args: {
    conversation: conversationView(groupConversation, ME_USER_ID),
  },
}
