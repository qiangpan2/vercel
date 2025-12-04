import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { syncInventoryAsync } from '../../../lib/ansible/sync-inventory'

// POST /api/machines/delete
export const Route = createFileRoute('/api/machines/delete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { id, userRole } = body
          
          console.log('[API] Delete machine request:', { id, userRole })
          
          // 权限检查
          if (userRole !== 'admin') {
            return json({ 
              success: false, 
              error: 'Permission denied. Only admin can delete machines.' 
            }, { status: 403 })
          }
          
          if (!id) {
            return json({ success: false, error: 'Server ID is required' }, { status: 400 })
          }
          
          // 检查服务器是否存在
          const existing = db.prepare('SELECT id, hostname FROM servers WHERE id = ?').get(id) as { id: number, hostname: string } | undefined
          if (!existing) {
            return json({ success: false, error: 'Server not found' }, { status: 404 })
          }
          
          // 检查是否有活跃的预订
          const activeBookings = db.prepare(`
            SELECT COUNT(*) as count 
            FROM bookings 
            WHERE server_id = ? AND end_time > ?
          `).get(id, Date.now()) as { count: number }
          
          if (activeBookings && activeBookings.count > 0) {
            return json({ 
              success: false, 
              error: `Cannot delete: ${activeBookings.count} active booking(s) exist`
            }, { status: 400 })
          }
          
          // 删除服务器
          db.prepare('DELETE FROM servers WHERE id = ?').run(id)
          
          // 可选：删除历史预订记录
          db.prepare('DELETE FROM bookings WHERE server_id = ?').run(id)
          
          console.log('[API] Server deleted:', existing.hostname)
          
          // ✅ 自动同步到 Ansible inventory（异步，不阻塞响应）
          syncInventoryAsync()
          
          return json({ 
            success: true, 
            message: `Server "${existing.hostname}" deleted successfully`
          })
        } catch (error) {
          console.error('[API] Delete machine error:', error)
          return json({ 
            success: false, 
            error: 'Failed to delete server' 
          }, { status: 500 })
        }
      }
    }
  }
})