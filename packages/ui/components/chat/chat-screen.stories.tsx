import type { Meta, StoryObj } from "@storybook/react-vite"

import { ChatScreen } from "@/components/chat/chat-screen"
import {
  ME_USER_ID,
  directConversation,
  directMessages,
  groupConversation,
  noop,
} from "@/components/chat/story-fixtures"

const meta = {
  title: "Chat/ChatScreen",
  component: ChatScreen,
  tags: ["autodocs"],
  args: {
    conversation: directConversation,
    messages: directMessages,
    myUserId: ME_USER_ID,
    loading: false,
    error: null,
    sending: false,
    offline: false,
    onBack: noop,
    onRetry: noop,
    onSend: noop,
  },
  decorators: [
    (Story) => (
      <div className="h-[640px] w-full max-w-2xl overflow-hidden rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Direct: Story = {
  args: {},
}

export const Group: Story = {
  args: {
    conversation: groupConversation,
    messages: directMessages.map((m) => ({
      ...m,
      conversation_id: groupConversation.id,
    })),
  },
}

export const Empty: Story = {
  args: {
    messages: [],
  },
}

export const NoSelection: Story = {
  args: {
    conversation: null,
    messages: [],
  },
}

export const Offline: Story = {
  args: {
    offline: true,
  },
}
