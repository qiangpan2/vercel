import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { deleteSession } from '../../../lib/auth/session'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookie = request.headers.get('cookie') || ''
        const sessionId = cookie.match(/rapid_session=([^;]+)/)?.[1]

        if (sessionId) {
          deleteSession(sessionId)
        }

        return json(
          { success: true },
          {
            status: 200,
            headers: {
              'Set-Cookie': 'rapid_session=; HttpOnly; Path=/; Max-Age=0'
            }
          }
        )
      }
    }
  }
})