/**
 * useGateway — React hook for OpenClaw Gateway WebSocket chat.
 *
 * Usage:
 *   const { connected, messages, stream, sendMessage, abortMessage } = useGateway()
 *
 * The hook:
 *   - Opens/closes the WebSocket on mount/unmount.
 *   - Loads chat history on first connection.
 *   - Handles chat delta / final / error events.
 *   - Derives the per-user sessionKey from getCurrentUser() so each LDAP user
 *     talks to their own agent (format: "agent:<ntid>:main").
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { getCurrentUser } from '../../utils/auth'
import {
  GatewayClient,
  type ChatEventPayload,
  type GatewayMessage,
} from './gateway-client'

// ---------------------------------------------------------------------------
// Env vars (injected by Vite at build time)
// ---------------------------------------------------------------------------
const GATEWAY_URL: string =
  (import.meta.env['VITE_OPENCLAW_GATEWAY_URL'] as string | undefined) ??
  'ws://localhost:18789'

const GATEWAY_TOKEN: string =
  (import.meta.env['VITE_OPENCLAW_GATEWAY_TOKEN'] as string | undefined) ?? ''

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseGatewayReturn {
  /** True when the WebSocket is open and authenticated. */
  connected: boolean
  /** Committed chat messages (user + final assistant). */
  messages: GatewayMessage[]
  /** In-progress streaming text (assistant delta), null when idle. */
  stream: string | null
  /** Send a user message. Returns the runId. */
  sendMessage: (text: string) => Promise<string>
  /** Abort the currently-running generation. */
  abortMessage: (runId: string) => Promise<void>
  /** Human-readable connection error (e.g. "Disconnected", "No token"). */
  error: string | null
  /** The session key used for this user, e.g. "agent:john:main". */
  sessionKey: string
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function extractText(msg: GatewayMessage | undefined): string {
  if (!msg) return ''
  return msg.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGateway(): UseGatewayReturn {
  const user = getCurrentUser()
  // If no user is logged in, fall back to a generic session. In practice the
  // ChatWidget should not render if the user is not logged in.
  const sessionKey = user ? `agent:${user.ntid}:main` : 'main'

  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<GatewayMessage[]>([])
  const [stream, setStream] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep a stable ref to the client so callbacks don't close over stale state
  const clientRef = useRef<GatewayClient | null>(null)
  // Track the session key in a ref for use inside event callbacks
  const sessionKeyRef = useRef(sessionKey)
  sessionKeyRef.current = sessionKey

  // -------------------------------------------------------------------------
  // Event handler (stable reference via ref trick)
  // -------------------------------------------------------------------------
  const handleEvent = useCallback(
    (event: string, payload: unknown) => {
      if (event === 'connected') {
        setConnected(true)
        setError(null)
        loadHistory()
        return
      }

      if (event === 'disconnected') {
        setConnected(false)
        setError('Disconnected – reconnecting…')
        return
      }

      if (event === 'chat') {
        const p = payload as ChatEventPayload
        // Filter events for this user's session only
        if (p.sessionKey !== sessionKeyRef.current) return

        if (p.state === 'delta') {
          setStream(extractText(p.message))
        } else if (p.state === 'final') {
          if (p.message) {
            setMessages((prev) => [...prev, p.message!])
          }
          setStream(null)
        } else if (p.state === 'aborted') {
          // Keep partial text as a committed message if present
          if (p.message) {
            setMessages((prev) => [...prev, p.message!])
          }
          setStream(null)
        } else if (p.state === 'error') {
          setStream(null)
          setError(p.errorMessage ?? 'Unknown agent error')
        }
      }
    },
    // loadHistory is defined below and mutates nothing via closure – safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // -------------------------------------------------------------------------
  // Load history
  // -------------------------------------------------------------------------
  async function loadHistory() {
    const client = clientRef.current
    if (!client) return
    try {
      const res = (await client.request<{ messages?: GatewayMessage[] }>('chat.history', {
        sessionKey: sessionKeyRef.current,
        limit: 200,
      }))
      setMessages(res.messages ?? [])
    } catch (e) {
      console.error('[useGateway] Failed to load history:', e)
    }
  }

  // -------------------------------------------------------------------------
  // Mount / unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!GATEWAY_TOKEN) {
      setError('VITE_OPENCLAW_GATEWAY_TOKEN is not set')
      return
    }

    const client = new GatewayClient(GATEWAY_URL, GATEWAY_TOKEN)
    clientRef.current = client
    client.on(handleEvent)
    client.start()

    return () => {
      client.off(handleEvent)
      client.stop()
      clientRef.current = null
    }
  }, [handleEvent])

  // -------------------------------------------------------------------------
  // Public actions
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(
    async (text: string): Promise<string> => {
      const client = clientRef.current
      if (!client || !client.connected) {
        throw new Error('Not connected to gateway')
      }

      const runId = crypto.randomUUID()

      // Optimistically add user message to history
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: [{ type: 'text', text }] },
      ])
      setStream('')

      await client.request('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: text,
        deliver: false,
        idempotencyKey: runId,
      })

      return runId
    },
    [],
  )

  const abortMessage = useCallback(async (runId: string): Promise<void> => {
    const client = clientRef.current
    if (!client || !client.connected) return
    await client.request('chat.abort', {
      sessionKey: sessionKeyRef.current,
      runId,
    })
  }, [])

  return { connected, messages, stream, sendMessage, abortMessage, error, sessionKey }
}
