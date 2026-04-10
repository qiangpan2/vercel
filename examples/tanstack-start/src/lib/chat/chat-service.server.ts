import db from '../db/booking'
import { toChatMessages } from './chat-types'
import {
  appendConversationMessage,
  ensureCurrentConversation,
  listConversationMessages,
  resetCurrentConversation,
  setHermesSessionId,
} from './conversation-store'
import {
  getHermesClientConfig,
  openHermesChatStream,
  relayHermesChatStream,
} from './hermes-client.server'

function ensureUserForChat(ntid: string) {
  db.prepare(
    `INSERT OR IGNORE INTO users (ntid, display_name, user_level) VALUES (?, ?, 'developer')`,
  ).run(ntid, ntid)
}

export async function getChatHistory(ntid: string) {
  ensureUserForChat(ntid)
  const conversation = ensureCurrentConversation(db, ntid)
  return toChatMessages(listConversationMessages(db, conversation.conversationId))
}

export async function resetChat(ntid: string) {
  ensureUserForChat(ntid)
  const conversation = resetCurrentConversation(db, ntid)
  return { conversationId: conversation.conversationId }
}

function jsonErrorResponse(message: string, status: number, code: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function buildChatSendResponse(ntid: string, message: string) {
  ensureUserForChat(ntid)
  const conversation = ensureCurrentConversation(db, ntid)

  let stream: ReadableStream<Uint8Array>
  let hermesSessionId: string | null
  try {
    const config = getHermesClientConfig()
    const opened = await openHermesChatStream(config, {
      message,
      hermesSessionId: conversation.hermesSessionId,
    })
    hermesSessionId = opened.hermesSessionId
    stream = opened.stream
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Hermes unavailable'
    const isConfig =
      msg.includes('HERMES_API_BASE_URL') ||
      msg.includes('HERMES_API_KEY') ||
      msg.includes('must be set')
    return jsonErrorResponse(
      msg,
      isConfig ? 503 : 502,
      isConfig ? 'hermes_config' : 'hermes_upstream',
    )
  }

  if (hermesSessionId && hermesSessionId !== conversation.hermesSessionId) {
    setHermesSessionId(db, conversation.conversationId, hermesSessionId)
  }

  appendConversationMessage(db, {
    conversationId: conversation.conversationId,
    role: 'user',
    content: message,
    createdAt: Date.now(),
  })

  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const finalText = await relayHermesChatStream(stream, {
            onDelta(delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta })}\n\n`),
              )
            },
          })

          if (finalText.trim()) {
            appendConversationMessage(db, {
              conversationId: conversation.conversationId,
              role: 'assistant',
              content: finalText,
              createdAt: Date.now(),
            })
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Hermes stream failed',
              })}\n\n`,
            ),
          )
        } finally {
          controller.close()
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    },
  )
}
