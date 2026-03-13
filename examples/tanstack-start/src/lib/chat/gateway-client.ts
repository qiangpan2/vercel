/**
 * OpenClaw Gateway WebSocket client.
 *
 * Implements the same connect/RPC/event protocol used by the OpenClaw Control
 * UI (openclaw/ui/src/ui/gateway.ts — GatewayBrowserClient).
 *
 * Wire format:
 *   request  { type: "req", id: "<uuid>", method: "...", params: {...} }
 *   response { type: "res", id: "<uuid>", ok: true/false, payload: {...} }
 *   event    { type: "event", event: "...", payload: {...}, seq: N }
 *
 * Connection sequence:
 *   1. WebSocket open
 *   2. Gateway sends  event "connect.challenge" { nonce }
 *   3. Client sends   req   "connect" (with auth token)
 *   4. Gateway sends  res   "hello-ok" (or error → close)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayMessage {
  role: 'user' | 'assistant' | 'system'
  content: Array<{ type: 'text'; text: string }>
}

export interface ChatEventPayload {
  state: 'delta' | 'final' | 'aborted' | 'error'
  runId?: string
  sessionKey: string
  message?: GatewayMessage
  errorMessage?: string
}

export type GatewayEventListener = (event: string, payload: unknown) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

// ---------------------------------------------------------------------------
// Reconnect backoff helpers
// ---------------------------------------------------------------------------
const BACKOFF_INITIAL_MS = 800
const BACKOFF_FACTOR = 1.7
const BACKOFF_MAX_MS = 15_000

function nextBackoff(current: number): number {
  return Math.min(current * BACKOFF_FACTOR, BACKOFF_MAX_MS)
}

// Non-recoverable close codes that should NOT trigger a reconnect
const FATAL_CODES = new Set([4008, 4004]) // AUTH_TOKEN_MISMATCH, RATE_LIMITED

// ---------------------------------------------------------------------------
// GatewayClient
// ---------------------------------------------------------------------------

export class GatewayClient {
  private url: string
  private token: string
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private listeners: GatewayEventListener[] = []
  private backoffMs = BACKOFF_INITIAL_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  /** Monotonically-increasing sequence used for request IDs. */
  private seq = 0

  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  /**
   * Send an RPC request and await the response payload.
   * Rejects if the response has ok=false or if the socket is not open.
   */
  request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'))
        return
      }

      const id = `${++this.seq}`
      const frame = JSON.stringify({ type: 'req', id, method, params })

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      })

      this.ws.send(frame)
    })
  }

  /** Register a listener for server-push events. */
  on(listener: GatewayEventListener) {
    this.listeners.push(listener)
  }

  off(listener: GatewayEventListener) {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private connect() {
    if (this.stopped) return

    console.log('[GatewayClient] Connecting to', this.url)
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onmessage = (ev) => {
      try {
        this.handleFrame(JSON.parse(ev.data as string))
      } catch (e) {
        console.warn('[GatewayClient] Failed to parse frame:', e)
      }
    }

    ws.onclose = (ev) => {
      console.log('[GatewayClient] WebSocket closed', ev.code, ev.reason)
      this.ws = null

      // Reject all pending requests
      for (const [, req] of this.pending) {
        req.reject(new Error('WebSocket closed'))
      }
      this.pending.clear()

      this.emit('disconnected', { code: ev.code })

      // Do not reconnect on fatal auth errors
      if (FATAL_CODES.has(ev.code) || this.stopped) return

      this.scheduleReconnect()
    }

    ws.onerror = (ev) => {
      console.error('[GatewayClient] WebSocket error', ev)
    }
  }

  private handleFrame(frame: {
    type: 'event' | 'res'
    id?: string
    ok?: boolean
    payload?: unknown
    event?: string
    seq?: number
  }) {
    if (frame.type === 'event') {
      const event = frame.event ?? ''
      const payload = frame.payload

      if (event === 'connect.challenge') {
        this.sendConnect()
      } else {
        this.emit(event, payload)
      }
    } else if (frame.type === 'res') {
      const id = frame.id
      if (!id) return
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)

      if (frame.ok) {
        pending.resolve(frame.payload)
      } else {
        pending.reject(new Error(String((frame.payload as { message?: string })?.message ?? 'RPC error')))
      }
    }
  }

  private sendConnect() {
    this.request('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'control-ui',
        version: 'chatwidget-v1',
        platform: 'web',
        mode: 'webchat',
        instanceId: this.instanceId(),
      },
      role: 'operator',
      scopes: ['operator.admin'],
      caps: ['tool-events'],
      auth: { token: this.token },
    })
      .then(() => {
        console.log('[GatewayClient] Connected (hello-ok)')
        this.backoffMs = BACKOFF_INITIAL_MS
        this.emit('connected', {})
      })
      .catch((err) => {
        console.error('[GatewayClient] Connect rejected:', err)
      })
  }

  private scheduleReconnect() {
    if (this.stopped) return
    const delay = this.backoffMs
    this.backoffMs = nextBackoff(this.backoffMs)
    console.log(`[GatewayClient] Reconnecting in ${Math.round(delay)}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private emit(event: string, payload: unknown) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload)
      } catch (e) {
        console.error('[GatewayClient] Listener error:', e)
      }
    }
  }

  private _instanceId: string | null = null
  private instanceId(): string {
    if (!this._instanceId) {
      this._instanceId = crypto.randomUUID()
    }
    return this._instanceId
  }
}
