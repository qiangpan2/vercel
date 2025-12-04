/**
 * 服务器健康检查 API
 * 可以通过 cron job 或手动调用
 * 
 * GET /api/cron/health-check - 检查所有服务器
 * POST /api/cron/health-check - 检查指定服务器
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { 
  checkAllServersHealth, 
  checkServerHealth,
  updateServerStatus,
  updateAllBookedStatus
} from '../../../lib/utils/server-monitor'
import db from '../../../lib/db/booking'

export const Route = createFileRoute('/api/ansible/health-check')({
  server: {
    handlers: {
      // GET - 检查所有服务器
      GET: async ({ request }) => {
        try {
          // 可选：验证 cron secret
          const url = new URL(request.url)
          const secret = url.searchParams.get('secret')
          const expectedSecret = process.env.CRON_SECRET
          
          if (expectedSecret && secret !== expectedSecret) {
            return json({ success: false, error: 'Unauthorized' }, { status: 401 })
          }
          
          console.log('[HealthCheck] Starting health check for all servers...')
          const startTime = Date.now()
          
          // 检查所有服务器健康状态
          const results = await checkAllServersHealth()
          
          // 更新 booked 状态
          updateAllBookedStatus()
          
          const duration = Date.now() - startTime
          const changedCount = results.filter(r => r.changed).length
          const onlineCount = results.filter(r => r.online).length
          
          console.log(`[HealthCheck] Completed in ${duration}ms`)
          console.log(`[HealthCheck] ${onlineCount}/${results.length} online, ${changedCount} status changes`)
          
          return json({
            success: true,
            duration,
            summary: {
              total: results.length,
              online: onlineCount,
              offline: results.length - onlineCount,
              changed: changedCount
            },
            results
          })
        } catch (error) {
          console.error('[HealthCheck] Error:', error)
          return json({ 
            success: false, 
            error: 'Health check failed' 
          }, { status: 500 })
        }
      },
      
      // POST - 检查指定服务器
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { hostname, userRole } = body
          
          // 权限检查
          if (userRole !== 'admin') {
            return json({ 
              success: false, 
              error: 'Permission denied' 
            }, { status: 403 })
          }
          
          if (!hostname) {
            return json({ 
              success: false, 
              error: 'Hostname is required' 
            }, { status: 400 })
          }
          
          // 获取服务器信息
          const server = db.prepare(`
            SELECT id, hostname, status, previous_status 
            FROM servers WHERE hostname = ?
          `).get(hostname) as { 
            id: number; 
            hostname: string; 
            status: string; 
            previous_status: string | null 
          } | undefined
          
          if (!server) {
            return json({ 
              success: false, 
              error: 'Server not found' 
            }, { status: 404 })
          }
          
          console.log(`[HealthCheck] Checking ${hostname}...`)
          
          // 检查健康状态
          const isOnline = await checkServerHealth(hostname)
          const { newStatus, changed } = updateServerStatus(
            server.id,
            isOnline,
            server.status,
            server.previous_status
          )
          
          return json({
            success: true,
            hostname,
            online: isOnline,
            previousStatus: server.status,
            newStatus,
            changed
          })
        } catch (error) {
          console.error('[HealthCheck] Error:', error)
          return json({ 
            success: false, 
            error: 'Health check failed' 
          }, { status: 500 })
        }
      }
    }
  }
})