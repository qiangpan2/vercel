import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser } from '../../../lib/auth/middleware'
import { resetChat } from '../../../lib/chat/chat-service.server'

export const Route = createFileRoute('/api/chat/reset')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const result = await resetChat(user.ntid)
        return json(result)
      },
    },
  },
})
