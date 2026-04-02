import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { login } from '../../../lib/auth/middleware'
import { createSession } from '../../../lib/auth/session'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { ntid, password } = body
          
          if (!ntid || !password) {
            return json({
              success: false,
              error: 'NTID and password are required'
            }, { status: 400 })
          }
          
          // LDAP 认证
          const user = await login(ntid, password)
          
          // 创建会话
          const sessionId = createSession(user.ntid)
          
          return json({
            success: true,
            user: {
              ntid: user.ntid,
              displayName: user.displayName,
              email: user.email,
              role: user.role
            }
          }, {
            status: 200,
            headers: {
              'Set-Cookie': `rapid_session=${sessionId}; HttpOnly; Path=/; Max-Age=${8 * 60 * 60}; SameSite=Lax`
            }
          })
        } catch (error) {
          console.error('[Login API] Error:', error)
          return json({
            success: false,
            error: error instanceof Error ? error.message : 'Invalid NTID or password'
          }, { status: 401 })
        }
      }
    }
  }
})
