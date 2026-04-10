export interface HermesClientConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export function getHermesClientConfig(env: NodeJS.ProcessEnv = process.env): HermesClientConfig {
  const baseUrl = env.HERMES_API_BASE_URL?.trim()
  const apiKey = env.HERMES_API_KEY?.trim()
  const model = env.HERMES_MODEL?.trim() || 'hermes-agent'

  if (!baseUrl || !apiKey) {
    throw new Error('HERMES_API_BASE_URL and HERMES_API_KEY must be set')
  }

  return { baseUrl, apiKey, model }
}

export async function openHermesChatStream(
  config: HermesClientConfig,
  args: { message: string; hermesSessionId?: string | null },
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }

  if (args.hermesSessionId) {
    headers['X-Hermes-Session-Id'] = args.hermesSessionId
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [{ role: 'user', content: args.message }],
    }),
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`Hermes chat request failed: ${response.status} ${text}`)
  }

  return {
    hermesSessionId: response.headers.get('x-hermes-session-id'),
    stream: response.body,
  }
}

function extractDelta(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const content = (choices[0] as { delta?: { content?: unknown } })?.delta?.content
  if (typeof content === 'string' && content.length > 0) {
    return content
  }
  if (Array.isArray(content)) {
    let out = ''
    for (const part of content) {
      if (part && typeof part === 'object' && 'type' in part && (part as { type: string }).type === 'text') {
        const t = (part as { text?: unknown }).text
        if (typeof t === 'string') out += t
      }
    }
    return out.length > 0 ? out : null
  }
  return null
}

export async function relayHermesChatStream(
  stream: ReadableStream<Uint8Array>,
  handlers: { onDelta(delta: string): void },
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.split('\n').find((entry) => entry.startsWith('data: '))
      if (!line) continue

      const raw = line.slice(6).trim()
      if (raw === '[DONE]') {
        return finalText
      }

      let payload: unknown
      try {
        payload = JSON.parse(raw)
      } catch {
        continue
      }

      const delta = extractDelta(payload)
      if (!delta) continue

      finalText += delta
      handlers.onDelta(delta)
    }
  }

  return finalText
}
