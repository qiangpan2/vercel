import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getHermesClientConfig,
  openHermesChatStream,
  relayHermesChatStream,
} from './hermes-client.server'

describe('getHermesClientConfig', () => {
  it('requires a base URL and API key', () => {
    expect(() => getHermesClientConfig({} as NodeJS.ProcessEnv)).toThrow(
      'HERMES_API_BASE_URL and HERMES_API_KEY must be set',
    )
  })
})

describe('openHermesChatStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the auth header and existing Hermes session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { 'X-Hermes-Session-Id': 'hsess_next' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await openHermesChatStream(
      {
        baseUrl: 'http://127.0.0.1:8642/v1',
        apiKey: 'secret',
        model: 'hermes-agent',
      },
      {
        message: 'hello',
        hermesSessionId: 'hsess_prev',
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8642/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
          'X-Hermes-Session-Id': 'hsess_prev',
        }),
      }),
    )
    expect(result.hermesSessionId).toBe('hsess_next')
  })
})

describe('relayHermesChatStream', () => {
  it('accumulates assistant deltas and ignores the role-only chunk', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const deltas: string[] = []
    const finalText = await relayHermesChatStream(stream, {
      onDelta(delta) {
        deltas.push(delta)
      },
    })

    expect(deltas).toEqual(['Hel', 'lo'])
    expect(finalText).toBe('Hello')
  })

  it('accumulates deltas when content is an array of text parts', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":[{"type":"text","text":"A"},{"type":"text","text":"B"}]},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const deltas: string[] = []
    const finalText = await relayHermesChatStream(stream, {
      onDelta(d) {
        deltas.push(d)
      },
    })

    expect(deltas).toEqual(['AB'])
    expect(finalText).toBe('AB')
  })
})
