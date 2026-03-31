import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser, isAdmin } from '../../../lib/auth/middleware'
import db from '../../../lib/db/booking'
import type { User } from '../../../lib/db/booking'

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'revoked']

export const Route = createFileRoute('/api/users/update-status')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const actor = await getCurrentUser(request)
        if (!actor || !isAdmin(actor)) {
          return json({ error: 'Forbidden: admin access required' }, { status: 403 })
        }

        try {
          const { ntid, status } = await request.json()

          if (!ntid || !status) {
            return json({ error: 'ntid and status are required' }, { status: 400 })
          }
          if (!VALID_STATUSES.includes(status)) {
            return json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
          }

          // 保护 coresw 账户
          if (ntid === 'coresw') {
            return json({ error: 'Cannot modify the coresw system account' }, { status: 400 })
          }

          const existing = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User | undefined
          if (!existing) {
            return json({ error: `User ${ntid} not found` }, { status: 404 })
          }

          db.prepare('UPDATE users SET status = ?, last_login = CURRENT_TIMESTAMP WHERE ntid = ?')
            .run(status, ntid)

          const updated = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User
          console.log(`[Users] ${actor.ntid} changed ${ntid} status to ${status}`)

          return json({ user: updated })
        } catch (error: any) {
          return json({ error: error.message || 'Failed to update status' }, { status: 500 })
        }
      }
    }
  }
})