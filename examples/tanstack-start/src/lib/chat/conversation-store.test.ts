import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  appendConversationMessage,
  ensureCurrentConversation,
  listConversationMessages,
  resetCurrentConversation,
  setHermesSessionId,
} from './conversation-store'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      ntid TEXT PRIMARY KEY
    );

    CREATE TABLE chat_conversations (
      conversation_id TEXT PRIMARY KEY,
      ntid TEXT NOT NULL,
      hermes_session_id TEXT,
      is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX idx_chat_current_per_user
      ON chat_conversations(ntid) WHERE is_current = 1;

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  db.prepare('INSERT INTO users (ntid) VALUES (?)').run('bob')
  return db
}

describe('conversation-store', () => {
  it('reuses the same current conversation until reset is called', () => {
    const db = createTestDb()

    const first = ensureCurrentConversation(db, 'bob')
    const second = ensureCurrentConversation(db, 'bob')
    const reset = resetCurrentConversation(db, 'bob')

    expect(second.conversationId).toBe(first.conversationId)
    expect(reset.conversationId).not.toBe(first.conversationId)
  })

  it('stores the Hermes session id and ordered transcript rows', () => {
    const db = createTestDb()
    const conversation = ensureCurrentConversation(db, 'bob')

    setHermesSessionId(db, conversation.conversationId, 'hsess_123')
    appendConversationMessage(db, {
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'hello',
      createdAt: 1,
    })
    appendConversationMessage(db, {
      conversationId: conversation.conversationId,
      role: 'assistant',
      content: 'hi bob',
      createdAt: 2,
    })

    const storedConversation = ensureCurrentConversation(db, 'bob')
    const messages = listConversationMessages(db, conversation.conversationId)

    expect(storedConversation.hermesSessionId).toBe('hsess_123')
    expect(messages).toEqual([
      {
        id: 1,
        conversationId: conversation.conversationId,
        role: 'user',
        content: 'hello',
        createdAt: 1,
      },
      {
        id: 2,
        conversationId: conversation.conversationId,
        role: 'assistant',
        content: 'hi bob',
        createdAt: 2,
      },
    ])
  })
})
