import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { bookingDB, machineDB } from '~/lib/db/redis'
import { canBook } from '~/lib/booking/validator'
import { addGrantAccessTask } from '~/lib/queues/permission'

/**
 * POST /api/bookings/create
 * 创建预订
 * 
 * TODO: 实现真实的服务器端会话管理
 * 当前为演示版本，从请求体中获取用户信息（生产环境需改为从会话获取）
 */
export const Route = createFileRoute('/api/bookings/create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { machineId, startTime, endTime, mode, username, displayName } = body
          
          // TODO: 在生产环境中，应该从会话/Cookie/JWT 中获取用户
          // const user = await getCurrentUser(request)
          // const username = user.username
          // const displayName = user.displayName
          
          // 验证参数
          if (!machineId || !startTime || !endTime || !mode) {
            return json({ error: 'Missing required fields' }, { status: 400 })
          }
          
          if (!username) {
            return json({ error: 'Please login first' }, { status: 401 })
          }
          
          if (!['exclusive', 'shared'].includes(mode)) {
            return json({ error: 'Invalid mode' }, { status: 400 })
          }
          
          // 冲突检查
          const validation = await canBook(machineId, startTime, endTime, mode)
          if (!validation.canBook) {
            return json({ 
              error: validation.reason,
              currentCount: validation.currentCount 
            }, { status: 409 })
          }
          
          // 创建预订
          const bookingId = await bookingDB.create({
            machineId,
            ssoUsername: username,
            displayName: displayName || username,
            startTime,
            endTime,
            mode,
            status: 'pending'
          })
          
          // 触发授权任务
          const machine = await machineDB.get(machineId)
          if (!machine) {
            return json({ error: 'Machine not found' }, { status: 404 })
          }
          
          await addGrantAccessTask({
            bookingId,
            machineId,
            ssoUsername: username,
            accessGroup: machine.access_group,
            endTime
          })
          
          return json({ 
            success: true,
            bookingId,
            ssoUsername: username,
            message: '预订成功！正在配置访问权限...'
          })
          
        } catch (error) {
          console.error('[API] Create booking error:', error)
          return json({ 
            error: 'Failed to create booking',
            details: String(error)
          }, { status: 500 })
        }
      }
    }
  }
})
