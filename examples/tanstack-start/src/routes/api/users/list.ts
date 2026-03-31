import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser, isAdmin } from '../../../lib/auth/middleware'
import db from '../../../lib/db/booking'
import type { User } from '../../../lib/db/booking'

export const Route = createFileRoute('/api/users/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)

        if (!user || !isAdmin(user)) {
          return json({ error: 'Forbidden: admin access required' }, { status: 403 })
        }

        const users = db.prepare(`
          SELECT * FROM users ORDER BY
            CASE status
              WHEN 'pending' THEN 0
              WHEN 'approved' THEN 1
              WHEN 'rejected' THEN 2
              WHEN 'revoked' THEN 3
            END,
            created_at DESC
        `).all() as User[]

        return json({ users })
      }
    }
  }
})