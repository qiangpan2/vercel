/** @vitest-environment jsdom */

import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_SSE_INCOMPLETE_MESSAGE,
  popMatchingTrailingUserMessage,
  useHermesChat,
} from './useHermesChat'

describe('popMatchingTrailingUserMessage', () => {
  it('removes trailing user message when text matches', () => {
    const prev = [
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'oops' }] },
    ]
    expect(popMatchingTrailingUserMessage(prev, 'oops')).toHaveLength(1)
  })

  it('does not remove when trailing user text differs', () => {
    const prev = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'a' }] },
    ]
    expect(popMatchingTrailingUserMessage(prev, 'b')).toEqual(prev)
  })
})

describe('useHermesChat', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('rolls back optimistic user message when send fails before persist and history resync fails', async () => {
    let historyCalls = 0
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        historyCalls += 1
        if (historyCalls >= 2) {
          return new Response(JSON.stringify({ error: 'down' }), { status: 500 })
        }
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (u.endsWith('/api/chat/send') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'Hermes unavailable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat())

    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(result.current.messages).toHaveLength(0)

    await act(async () => {
      try {
        await result.current.sendMessage('ghost')
      } catch {
        /* expected */
      }
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('calls onUnauthorized only once when send 401 is followed by history 401', async () => {
    const onUnauthorized = vi.fn()
    let historyUnauthorized = false
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        const status = historyUnauthorized ? 401 : 200
        const body =
          status === 401
            ? JSON.stringify({ error: 'Unauthorized' })
            : JSON.stringify({ messages: [] })
        return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.endsWith('/api/chat/send') && init?.method === 'POST') {
        historyUnauthorized = true
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat({ onUnauthorized }))

    await waitFor(() => expect(result.current.connected).toBe(true))

    await act(async () => {
      try {
        await result.current.sendMessage('x')
      } catch {
        /* expected */
      }
    })

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('calls onUnauthorized when history returns 401', async () => {
    const onUnauthorized = vi.fn()
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat({ onUnauthorized }))

    await waitFor(() => {
      expect(result.current.connected).toBe(false)
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('Not signed in')
  })

  it('loads history on mount and sets connected', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        return new Response(JSON.stringify({ messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Hi' }] }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat())

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('sendMessage streams deltas then refreshes history', async () => {
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta: 'Hello' })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        controller.close()
      },
    })

    let historyCalls = 0
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        historyCalls += 1
        const messages =
          historyCalls === 1
            ? []
            : [
                { role: 'user', content: [{ type: 'text', text: 'Q' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
              ]
        return new Response(JSON.stringify({ messages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (u.endsWith('/api/chat/send') && init?.method === 'POST') {
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat())

    await waitFor(() => expect(result.current.connected).toBe(true))

    await act(async () => {
      await result.current.sendMessage('Q')
    })

    await waitFor(() => expect(result.current.stream).toBeNull())
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]?.role).toBe('assistant')
  })

  it('surfaces abrupt SSE close without done as error state', async () => {
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta: 'Hi' })}\n\n`),
        )
        controller.close()
      },
    })

    let historyCalls = 0
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        historyCalls += 1
        const messages =
          historyCalls === 1
            ? []
            : [{ role: 'user', content: [{ type: 'text', text: 'Q' }] }]
        return new Response(JSON.stringify({ messages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (u.endsWith('/api/chat/send') && init?.method === 'POST') {
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat())

    await waitFor(() => expect(result.current.connected).toBe(true))

    await act(async () => {
      await expect(result.current.sendMessage('Q')).rejects.toThrow(CHAT_SSE_INCOMPLETE_MESSAGE)
    })

    await waitFor(() => expect(result.current.stream).toBeNull())
    expect(result.current.error).toBe(CHAT_SSE_INCOMPLETE_MESSAGE)
  })

  it('surfaces in-stream SSE error event', async () => {
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'upstream failed' })}\n\n`,
          ),
        )
        controller.close()
      },
    })

    let historyCalls = 0
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/chat/history')) {
        historyCalls += 1
        const messages = historyCalls === 1 ? [] : []
        return new Response(JSON.stringify({ messages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (u.endsWith('/api/chat/send') && init?.method === 'POST') {
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const { result } = renderHook(() => useHermesChat())

    await waitFor(() => expect(result.current.connected).toBe(true))

    await act(async () => {
      await expect(result.current.sendMessage('Q')).rejects.toThrow('upstream failed')
    })

    await waitFor(() => expect(result.current.stream).toBeNull())
    expect(result.current.error).toBe('upstream failed')
  })
})
