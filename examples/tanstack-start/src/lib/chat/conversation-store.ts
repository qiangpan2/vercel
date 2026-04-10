import Database from 'better-sqlite3'
import type { ChatConversationRecord, ChatRole, ChatTranscriptRow } from './chat-types'

type Db = Pick<InstanceType<typeof Database>, 'prepare'>

function createConversationId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `c_${stamp}_${suffix}`
}

function mapConversation(row: {
  conversation_id: string
  ntid: string
  hermes_session_id: string | null
  is_current: number
  created_at: string
  updated_at: string
}): ChatConversationRecord {
  return {
    conversationId: row.conversation_id,
    ntid: row.ntid,
    hermesSessionId: row.hermes_session_id,
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function ensureCurrentConversation(db: Db, ntid: string): ChatConversationRecord {
  const existing = db
    .prepare(
      `
      SELECT conversation_id, ntid, hermes_session_id, is_current, created_at, updated_at
      FROM chat_conversations
      WHERE ntid = ? AND is_current = 1
    `,
    )
    .get(ntid) as
    | {
        conversation_id: string
        ntid: string
        hermes_session_id: string | null
        is_current: number
        created_at: string
        updated_at: string
      }
    | undefined

  if (existing) {
    return mapConversation(existing)
  }

  const conversationId = createConversationId()
  try {
    db.prepare(
      `
    INSERT INTO chat_conversations (conversation_id, ntid, hermes_session_id, is_current)
    VALUES (?, ?, NULL, 1)
  `,
    ).run(conversationId, ntid)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code !== 'SQLITE_CONSTRAINT_UNIQUE') {
      throw e
    }
    const raced = db
      .prepare(
        `
      SELECT conversation_id, ntid, hermes_session_id, is_current, created_at, updated_at
      FROM chat_conversations
      WHERE ntid = ? AND is_current = 1
    `,
      )
      .get(ntid) as
      | {
          conversation_id: string
          ntid: string
          hermes_session_id: string | null
          is_current: number
          created_at: string
          updated_at: string
        }
      | undefined
    if (raced) {
      return mapConversation(raced)
    }
    throw e
  }

  const row = db
    .prepare(
      `
      SELECT conversation_id, ntid, hermes_session_id, is_current, created_at, updated_at
      FROM chat_conversations
      WHERE conversation_id = ?
    `,
    )
    .get(conversationId) as {
    conversation_id: string
    ntid: string
    hermes_session_id: string | null
    is_current: number
    created_at: string
    updated_at: string
  }

  return mapConversation(row)
}

export function resetCurrentConversation(db: Db, ntid: string): ChatConversationRecord {
  db.prepare(
    `
    UPDATE chat_conversations
    SET is_current = 0, updated_at = CURRENT_TIMESTAMP
    WHERE ntid = ? AND is_current = 1
  `,
  ).run(ntid)

  return ensureCurrentConversation(db, ntid)
}

export function setHermesSessionId(db: Db, conversationId: string, hermesSessionId: string) {
  db.prepare(
    `
    UPDATE chat_conversations
    SET hermes_session_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE conversation_id = ?
  `,
  ).run(hermesSessionId, conversationId)
}

export function appendConversationMessage(
  db: Db,
  row: { conversationId: string; role: ChatRole; content: string; createdAt?: number },
) {
  db.prepare(
    `
    INSERT INTO chat_messages (conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(row.conversationId, row.role, row.content, row.createdAt ?? Date.now())
}

export function listConversationMessages(db: Db, conversationId: string): ChatTranscriptRow[] {
  const rows = db
    .prepare(
      `
      SELECT id, conversation_id, role, content, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    )
    .all(conversationId) as Array<{
    id: number
    conversation_id: string
    role: ChatRole
    content: string
    created_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }))
}
