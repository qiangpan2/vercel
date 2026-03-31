import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser } from '../../../lib/auth/middleware'
import db from '../../../lib/db/booking'
import type { User } from '../../../lib/db/booking'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        
        if (!user) {
          return json({ user: null })
        }

        // 从 DB 获取最新的 status
        const dbUser = db.prepare('SELECT * FROM users WHERE ntid = ?').get(user.ntid) as User | undefined;

        return json({
          user: {
            ...user,
            isAdmin: user.role === 'admin',
            userStatus: dbUser?.status || 'approved',
          }
        })
      }
    }
  }
})