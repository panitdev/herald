import type { ChatConversation, ChatParticipant, SyncChatMessage } from "@/lib/api"

export const ME_USER_ID = "1001"

const me: ChatParticipant = {
  userId: ME_USER_ID,
  username: "you",
  displayName: "You",
  avatarUrl: null,
  role: "member",
  joinedAt: "2026-06-10T09:00:00.000Z",
  leftAt: null,
}

const mina: ChatParticipant = {
  userId: "1002",
  username: "mina",
  displayName: "Mina Park",
  avatarUrl: null,
  role: "member",
  joinedAt: "2026-06-10T09:00:00.000Z",
  leftAt: null,
}

const noah: ChatParticipant = {
  userId: "1003",
  username: "noah",
  displayName: "Noah Chen",
  avatarUrl: null,
  role: "member",
  joinedAt: "2026-06-10T09:00:00.000Z",
  leftAt: null,
}

export const directConversation: ChatConversation = {
  id: "conv-001",
  kind: "direct",
  title: null,
  participants: [me, mina],
  lastMessage: {
    id: "m-005",
    conversation_id: "conv-001",
    sender_user_id: "1002",
    body: "Sounds good — shipping the checklist now.",
    client_mutation_id: null,
    created_at: "2026-06-18T08:42:00.000Z",
  },
  createdAt: "2026-06-10T09:00:00.000Z",
  updatedAt: "2026-06-18T08:42:00.000Z",
}

export const groupConversation: ChatConversation = {
  id: "conv-002",
  kind: "group",
  title: "Launch crew",
  participants: [me, mina, noah],
  lastMessage: {
    id: "m-010",
    conversation_id: "conv-002",
    sender_user_id: "1003",
    body: "I'll grab the release notes.",
    client_mutation_id: null,
    created_at: "2026-06-17T19:10:00.000Z",
  },
  createdAt: "2026-06-09T12:00:00.000Z",
  updatedAt: "2026-06-17T19:10:00.000Z",
}

export const conversations: ChatConversation[] = [
  directConversation,
  groupConversation,
]

export const directMessages: SyncChatMessage[] = [
  {
    id: "m-001",
    conversation_id: "conv-001",
    sender_user_id: "1002",
    body: "Morning! Did the API review notes land yet?",
    client_mutation_id: null,
    created_at: "2026-06-18T08:30:00.000Z",
  },
  {
    id: "m-002",
    conversation_id: "conv-001",
    sender_user_id: ME_USER_ID,
    body: "Just folded them into the checklist.",
    client_mutation_id: null,
    created_at: "2026-06-18T08:35:00.000Z",
  },
  {
    id: "m-003",
    conversation_id: "conv-001",
    sender_user_id: ME_USER_ID,
    body: "Two owner decisions are still open though.",
    client_mutation_id: null,
    created_at: "2026-06-18T08:36:00.000Z",
  },
  {
    id: "m-004",
    conversation_id: "conv-001",
    sender_user_id: "1002",
    body: "Perfect, I'll take those.",
    client_mutation_id: null,
    created_at: "2026-06-18T08:41:00.000Z",
  },
  {
    id: "m-005",
    conversation_id: "conv-001",
    sender_user_id: "1002",
    body: "Sounds good — shipping the checklist now.",
    client_mutation_id: null,
    created_at: "2026-06-18T08:42:00.000Z",
  },
]

export const noop = () => {}
