// Derivations for the realtime messenger UI: turning the API's conversation
// and participant shapes into the small view models the components render.
import type { ChatConversation, ChatParticipant } from "@/lib/api"
import { pickColor } from "@/lib/email-transform"
import { deriveInitials } from "@/lib/settings-store"

export type ConversationView = {
  id: string
  title: string
  isGroup: boolean
  initials: string
  color: string
  lastMessageBody: string
  lastMessageAt: string | null
}

/** Participants other than the signed-in user (the people you're talking to). */
export function otherParticipants(
  conversation: ChatConversation,
  myUserId: string,
): ChatParticipant[] {
  return conversation.participants.filter((p) => p.userId !== myUserId)
}

/** Human label for a conversation: the other person, the group title, or the
 *  comma-joined member names as a fallback. */
export function conversationTitle(
  conversation: ChatConversation,
  myUserId: string,
): string {
  if (conversation.kind === "group") {
    if (conversation.title?.trim()) return conversation.title.trim()
    const names = otherParticipants(conversation, myUserId).map((p) => p.displayName)
    return names.length > 0 ? names.join(", ") : "Group conversation"
  }
  return otherParticipants(conversation, myUserId)[0]?.displayName ?? "Conversation"
}

/** Stable key used to pick the avatar color so a conversation keeps its hue. */
function avatarColorKey(conversation: ChatConversation, myUserId: string): string {
  if (conversation.kind === "group") return `group:${conversation.id}`
  return otherParticipants(conversation, myUserId)[0]?.userId ?? conversation.id
}

export function conversationView(
  conversation: ChatConversation,
  myUserId: string,
): ConversationView {
  const title = conversationTitle(conversation, myUserId)
  return {
    id: conversation.id,
    title,
    isGroup: conversation.kind === "group",
    initials: deriveInitials(title),
    color: pickColor(avatarColorKey(conversation, myUserId)),
    lastMessageBody: conversation.lastMessage?.body ?? "",
    lastMessageAt: conversation.lastMessage?.created_at ?? null,
  }
}

/** Filter conversations by title, latest message, or any participant name. */
export function filterConversations(
  conversations: ChatConversation[],
  myUserId: string,
  search: string,
): ChatConversation[] {
  const q = search.trim().toLowerCase()
  if (!q) return conversations
  return conversations.filter((conversation) => {
    const haystack = [
      conversationTitle(conversation, myUserId),
      conversation.lastMessage?.body ?? "",
      ...conversation.participants.map((p) => p.displayName),
      ...conversation.participants.map((p) => p.username),
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

/** Avatar initials + color for a single participant (used in group threads). */
export function participantAvatar(participant: ChatParticipant): {
  initials: string
  color: string
} {
  return {
    initials: deriveInitials(participant.displayName || participant.username),
    color: pickColor(participant.userId),
  }
}
