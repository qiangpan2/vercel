import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser } from '../../../lib/auth/middleware'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        return json({ user })
      }
    }
  }
})