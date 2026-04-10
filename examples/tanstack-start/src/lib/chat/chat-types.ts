export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: Array<{ type: 'text'; text: string }>
}

export interface ChatConversationRecord {
  conversationId: string
  ntid: string
  hermesSessionId: string | null
  isCurrent: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatTranscriptRow {
  id: number
  conversationId: string
  role: ChatRole
  content: string
  createdAt: number
}

export function toChatMessages(rows: ChatTranscriptRow[]): ChatMessage[] {
  return rows.map((row) => ({
    role: row.role,
    content: [{ type: 'text', text: row.content }],
  }))
}
