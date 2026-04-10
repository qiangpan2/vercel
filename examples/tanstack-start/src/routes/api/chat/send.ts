import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser } from '../../../lib/auth/middleware'
import { buildChatSendResponse } from '../../../lib/chat/chat-service.server'

export const Route = createFileRoute('/api/chat/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? (body as { message: unknown }).message
            : undefined
        if (typeof message !== 'string' || !message.trim()) {
          return json({ error: 'Missing or invalid "message" string' }, { status: 400 })
        }
        return buildChatSendResponse(user.ntid, message.trim())
      },
    },
  },
})
