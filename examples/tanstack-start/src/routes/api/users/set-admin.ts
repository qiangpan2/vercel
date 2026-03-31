import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser, isAdmin } from '../../../lib/auth/middleware'
import db from '../../../lib/db/booking'
import type { User } from '../../../lib/db/booking'

const VALID_LEVELS = ['viewer', 'developer', 'admin']

export const Route = createFileRoute('/api/users/set-admin')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const actor = await getCurrentUser(request)
        if (!actor || !isAdmin(actor)) {
          return json({ error: 'Forbidden: admin access required' }, { status: 403 })
        }

        try {
          const { ntid, user_level } = await request.json()

          if (!ntid || !user_level) {
            return json({ error: 'ntid and user_level are required' }, { status: 400 })
          }
          if (!VALID_LEVELS.includes(user_level)) {
            return json({ error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 })
          }

          // 保护 coresw
          if (ntid === 'coresw') {
            return json({ error: 'Cannot modify the coresw system account' }, { status: 400 })
          }

          const existing = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User | undefined
          if (!existing) {
            return json({ error: `User ${ntid} not found` }, { status: 404 })
          }

          db.prepare('UPDATE users SET user_level = ? WHERE ntid = ?')
            .run(user_level, ntid)

          const updated = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User
          console.log(`[Users] ${actor.ntid} changed ${ntid} user_level to ${user_level}`)

          return json({ user: updated })
        } catch (error: any) {
          return json({ error: error.message || 'Failed to update user level' }, { status: 500 })
        }
      }
    }
  }
})