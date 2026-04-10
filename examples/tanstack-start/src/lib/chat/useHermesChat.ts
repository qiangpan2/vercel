/**
 * useHermesChat — app-backed Hermes chat (session cookie + /api/chat/*).
 *
 * Loads transcript from GET /api/chat/history, sends via POST /api/chat/send (SSE),
 * soft-resets with POST /api/chat/reset.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from './chat-types'

export interface UseHermesChatOptions {
  /** Called when the server rejects the session (401) so the UI can align with server auth. */
  onUnauthorized?: () => void
}

function parseSseBlock(block: string): unknown | null {
  const lines = block.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6)) as unknown
    }
  }
  return null
}

function processSseBuffer(
  buffer: string,
  onDelta: (chunk: string) => void,
): { terminal: { ok: true } | { ok: false; message: string } | null; rest: string } {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const block of parts) {
    if (!block.trim()) continue
    let parsed: unknown
    try {
      parsed = parseSseBlock(block)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const o = parsed as { type?: string; delta?: unknown; message?: unknown }
    if (o.type === 'delta' && typeof o.delta === 'string') {
      onDelta(o.delta)
    } else if (o.type === 'done') {
      return { terminal: { ok: true }, rest }
    } else if (o.type === 'error' && typeof o.message === 'string') {
      return { terminal: { ok: false, message: o.message }, rest }
    }
  }
  return { terminal: null, rest }
}

/** User-visible message when the SSE connection closes without a terminal `done` or `error` event. */
export const CHAT_SSE_INCOMPLETE_MESSAGE = 'Chat stream ended before the assistant finished'

/** Drop trailing user bubble if it matches the text we optimistically appended (send not persisted + history resync failed). */
export function popMatchingTrailingUserMessage(
  messages: ChatMessage[],
  sentText: string,
): ChatMessage[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]!
  if (last.role !== 'user') return messages
  const joined = last.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
  if (joined !== sentText) return messages
  return messages.slice(0, -1)
}

async function consumeChatSse(
  response: Response,
  onDelta: (chunk: string) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done })
    }
    if (done) {
      buffer += decoder.decode()
      const { terminal, rest } = processSseBuffer(buffer, onDelta)
      if (terminal) {
        return terminal
      }
      if (rest.trim()) {
        return { ok: false, message: CHAT_SSE_INCOMPLETE_MESSAGE }
      }
      return { ok: false, message: CHAT_SSE_INCOMPLETE_MESSAGE }
    }
    const { terminal, rest } = processSseBuffer(buffer, onDelta)
    if (terminal) {
      // Terminal arrived while the body is still open — stop reading so the connection is released.
      await reader.cancel().catch(() => {})
      return terminal
    }
    buffer = rest
  }
}

export interface UseHermesChatReturn {
  connected: boolean
  messages: ChatMessage[]
  stream: string | null
  sendMessage: (text: string) => Promise<string>
  abortMessage: (runId: string) => Promise<void>
  error: string | null
  resetChat: () => Promise<void>
}

export function useHermesChat(options?: UseHermesChatOptions): UseHermesChatReturn {
  const onUnauthorizedRef = useRef(options?.onUnauthorized)
  onUnauthorizedRef.current = options?.onUnauthorized
  /** Suppress duplicate onUnauthorized when send/reset and a follow-up history refresh all see 401. */
  const unauthorizedNotifiedRef = useRef(false)

  const markAuthorized = useCallback(() => {
    unauthorizedNotifiedRef.current = false
  }, [])

  const notifyUnauthorizedOnce = useCallback(() => {
    if (unauthorizedNotifiedRef.current) return
    unauthorizedNotifiedRef.current = true
    onUnauthorizedRef.current?.()
  }, [])

  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stream, setStream] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sendingRef = useRef(false)

  const refreshHistory = useCallback(async () => {
    const res = await fetch('/api/chat/history', { credentials: 'include' })
    if (!res.ok) {
      if (res.status === 401) {
        notifyUnauthorizedOnce()
      }
      throw new Error(
        res.status === 401 ? 'Not signed in' : `Failed to load history (${res.status})`,
      )
    }
    const data = (await res.json()) as { messages?: ChatMessage[] }
    markAuthorized()
    const msgs = data.messages ?? []
    setMessages(msgs)
    return msgs
  }, [markAuthorized, notifyUnauthorizedOnce])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        setError(null)
        await refreshHistory()
        if (!cancelled) setConnected(true)
      } catch (e) {
        if (!cancelled) {
          setConnected(false)
          setError((e as Error).message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshHistory])

  const sendMessage = useCallback(
    async (text: string): Promise<string> => {
      const runId = crypto.randomUUID()
      if (sendingRef.current) {
        throw new Error('Already sending a message')
      }
      sendingRef.current = true
      setError(null)
      setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text }] }])
      setStream('')
      /** Set true only after POST succeeds with a body; server persists the user message before streaming. */
      let serverPersistedUserMessage = false

      try {
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        })
        if (!res.ok) {
          if (res.status === 401) {
            notifyUnauthorizedOnce()
          }
          const errBody = (await res.json().catch(() => ({}))) as { error?: unknown }
          const msg =
            typeof errBody.error === 'string' ? errBody.error : `Send failed (${res.status})`
          throw new Error(msg)
        }
        markAuthorized()
        if (!res.body) throw new Error('No response body')
        serverPersistedUserMessage = true

        let accumulated = ''
        const result = await consumeChatSse(res, (delta) => {
          accumulated += delta
          setStream(accumulated)
        })
        setStream(null)
        if (!result.ok) {
          setError(result.message)
          throw new Error(result.message)
        }
        await refreshHistory()
      } catch (e) {
        setStream(null)
        let refreshRecovered = false
        try {
          await refreshHistory()
          refreshRecovered = true
        } catch {
          /* keep refreshRecovered false */
        }
        if (!serverPersistedUserMessage && !refreshRecovered) {
          setMessages((prev) => popMatchingTrailingUserMessage(prev, text))
        }
        throw e
      } finally {
        sendingRef.current = false
      }
      return runId
    },
    [markAuthorized, notifyUnauthorizedOnce, refreshHistory],
  )

  const abortMessage = useCallback(async (_runId: string) => {
    // Phase 1: server-streamed Hermes; client abort not wired.
  }, [])

  const resetChat = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/chat/reset', { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      if (res.status === 401) {
        notifyUnauthorizedOnce()
      }
      const errBody = (await res.json().catch(() => ({}))) as { error?: unknown }
      const msg =
        typeof errBody.error === 'string' ? errBody.error : `Reset failed (${res.status})`
      throw new Error(msg)
    }
    markAuthorized()
    setStream(null)
    await refreshHistory()
  }, [markAuthorized, notifyUnauthorizedOnce, refreshHistory])

  return { connected, messages, stream, sendMessage, abortMessage, error, resetChat }
}
