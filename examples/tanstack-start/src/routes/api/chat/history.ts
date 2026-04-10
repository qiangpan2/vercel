import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser } from '../../../lib/auth/middleware'
import { getChatHistory } from '../../../lib/chat/chat-service.server'

export const Route = createFileRoute('/api/chat/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const messages = await getChatHistory(user.ntid)
        return json({ messages })
      },
    },
  },
})
