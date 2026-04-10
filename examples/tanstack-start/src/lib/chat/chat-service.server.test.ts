import { beforeEach, describe, expect, it, vi } from 'vitest'

const prepareMock = vi.fn(() => ({
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(() => []),
}))

vi.mock('../db/booking', () => ({
  default: {
    prepare: (...args: unknown[]) => prepareMock(...args),
  },
}))
vi.mock('./conversation-store', () => ({
  appendConversationMessage: vi.fn(),
  ensureCurrentConversation: vi.fn(),
  listConversationMessages: vi.fn(),
  resetCurrentConversation: vi.fn(),
  setHermesSessionId: vi.fn(),
}))
vi.mock('./hermes-client.server', () => ({
  getHermesClientConfig: vi.fn(() => ({
    baseUrl: 'http://127.0.0.1:8642/v1',
    apiKey: 'secret',
    model: 'hermes-agent',
  })),
  openHermesChatStream: vi.fn(),
  relayHermesChatStream: vi.fn(),
}))

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
import { buildChatSendResponse, getChatHistory, resetChat } from './chat-service.server'

describe('chat-service.server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps transcript rows into widget messages', async () => {
    vi.mocked(ensureCurrentConversation).mockReturnValue({
      conversationId: 'c_1',
      ntid: 'bob',
      hermesSessionId: 'hsess_1',
      isCurrent: true,
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
    })
    vi.mocked(listConversationMessages).mockReturnValue([
      { id: 1, conversationId: 'c_1', role: 'assistant', content: 'Saved', createdAt: 1 },
    ])

    const messages = await getChatHistory('bob')

    expect(messages).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'Saved' }] }])
  })

  it('persists the user message, assistant message, and updated Hermes session id', async () => {
    vi.mocked(ensureCurrentConversation).mockReturnValue({
      conversationId: 'c_1',
      ntid: 'bob',
      hermesSessionId: 'hsess_old',
      isCurrent: true,
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
    })
    vi.mocked(openHermesChatStream).mockResolvedValue({
      hermesSessionId: 'hsess_new',
      stream: new ReadableStream(),
    })
    vi.mocked(relayHermesChatStream).mockImplementation(async (_stream, handlers) => {
      handlers.onDelta('Hi Bob')
      return 'Hi Bob'
    })

    const response = await buildChatSendResponse('bob', 'hello')
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const reader = response.body!.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }

    expect(setHermesSessionId).toHaveBeenCalledWith(expect.anything(), 'c_1', 'hsess_new')
    expect(appendConversationMessage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      {
        conversationId: 'c_1',
        role: 'user',
        content: 'hello',
        createdAt: expect.any(Number),
      },
    )
    expect(appendConversationMessage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      {
        conversationId: 'c_1',
        role: 'assistant',
        content: 'Hi Bob',
        createdAt: expect.any(Number),
      },
    )
  })

  it('returns JSON 503 when Hermes env config is missing', async () => {
    vi.mocked(ensureCurrentConversation).mockReturnValue({
      conversationId: 'c_1',
      ntid: 'bob',
      hermesSessionId: null,
      isCurrent: true,
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
    })
    vi.mocked(getHermesClientConfig).mockImplementationOnce(() => {
      throw new Error('HERMES_API_BASE_URL and HERMES_API_KEY must be set')
    })

    const response = await buildChatSendResponse('bob', 'hello')

    expect(response.status).toBe(503)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('hermes_config')
    expect(appendConversationMessage).not.toHaveBeenCalled()
  })

  it('returns JSON error before SSE when Hermes setup fails', async () => {
    vi.mocked(ensureCurrentConversation).mockReturnValue({
      conversationId: 'c_1',
      ntid: 'bob',
      hermesSessionId: null,
      isCurrent: true,
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
    })
    vi.mocked(openHermesChatStream).mockRejectedValue(new Error('Hermes chat request failed: 500'))

    const response = await buildChatSendResponse('bob', 'hello')

    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.status).toBe(502)
    const body = (await response.json()) as { error?: string; code?: string }
    expect(body.error).toContain('Hermes chat request failed')
    expect(body.code).toBe('hermes_upstream')
    expect(appendConversationMessage).not.toHaveBeenCalled()
  })

  it('rotates the current conversation on reset', async () => {
    vi.mocked(resetCurrentConversation).mockReturnValue({
      conversationId: 'c_2',
      ntid: 'bob',
      hermesSessionId: null,
      isCurrent: true,
      createdAt: '2026-04-10T00:01:00Z',
      updatedAt: '2026-04-10T00:01:00Z',
    })

    const result = await resetChat('bob')

    expect(result).toEqual({ conversationId: 'c_2' })
  })
})
