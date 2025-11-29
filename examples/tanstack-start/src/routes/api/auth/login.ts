/**
 * 登录 API 路由
 * 处理用户登录请求，调用 Python SSO 验证程序
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { login } from '../../../lib/auth/middleware'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { username, password } = body
          
          if (!username || !password) {
            return json({
              success: false,
              error: 'Username and password are required'
            }, { status: 400 })
          }
          
          // 调用 Python SSO 验证
          const user = await login(username, password)
          
          // 注意：这里简化了会话管理
          // 实际生产环境应该创建会话并设置 Cookie/JWT
          // const session = await createSession(user)
          
          return json({
            success: true,
            user: {
              username: user.username,
              displayName: user.displayName,
              email: user.email,
              role: user.role
            }
          }, {
            status: 200
            // 生产环境应该设置 Cookie:
            // headers: {
            //   'Set-Cookie': session.cookie
            // }
          })
        } catch (error) {
          console.error('[Login API] Error:', error)
          return json({
            success: false,
            error: error instanceof Error ? error.message : 'Invalid username or password'
          }, { status: 401 })
        }
      }
    }
  }
})
