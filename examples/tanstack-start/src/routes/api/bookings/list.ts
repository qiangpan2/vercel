import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { bookingDB } from '~/lib/db/redis'

/**
 * GET /api/bookings/list
 * 获取预订列表
 * 
 * TODO: 实现真实的服务器端会话管理
 * 当前为演示版本，返回所有预订（生产环境需改为只返回当前用户的预订）
 */
export const Route = createFileRoute('/api/bookings/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // TODO: 在生产环境中，应该从会话/Cookie/JWT 中获取用户
        // const user = await getCurrentUser(request)
        // if (!user) {
        //   return json({ error: 'Please login first' }, { status: 401 })
        // }
        
        try {
          // 临时方案：返回所有预订（生产环境应该只返回当前用户的预订）
          // const bookings = await bookingDB.getByUser(user.username)
          const url = new URL(request.url)
          const username = url.searchParams.get('username')
          
          let bookings
          if (username) {
            bookings = await bookingDB.getByUser(username)
          } else {
            // 返回所有预订（仅用于开发/演示）
            bookings = await bookingDB.getAll()
          }
          
          return json({
            success: true,
            bookings
          })
        } catch (error) {
          console.error('[API] List bookings error:', error)
          return json({ 
            error: 'Failed to fetch bookings' 
          }, { status: 500 })
        }
      }
    }
  }
})
