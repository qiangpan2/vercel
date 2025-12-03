import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

// GET /api/bookings/list
export const Route = createFileRoute('/api/bookings/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const username = url.searchParams.get('username')
          const serverId = url.searchParams.get('serverId') || url.searchParams.get('machineId')
          
          console.log('[API] Fetching bookings, username:', username, 'serverId:', serverId)
          
          let query = `
            SELECT 
              b.id,
              b.server_id,
              b.ntid,
              b.book_reason,
              b.start_time,
              b.end_time,
              b.is_exclusive,
              b.status,
              u.display_name
            FROM bookings b
            LEFT JOIN users u ON b.ntid = u.ntid
            WHERE b.status = 'active'
          `
          const params: any[] = []
          
          if (serverId) {
            query += ' AND b.server_id = ?'
            params.push(serverId)
          }
          
          // 获取所有活跃预订（不只是当前用户的）
          query += ' ORDER BY b.start_time'
          
          const bookings = db.prepare(query).all(...params) as any[]
          
          // 转换为前端格式
          const formattedBookings = bookings.map(b => ({
            id: String(b.id),
            machineId: String(b.server_id),  // 前端用 machineId
            userId: b.ntid,
            userName: b.display_name || b.ntid,
            startTime: b.start_time,
            endTime: b.end_time,
            isExclusive: b.is_exclusive === 1,
            reason: b.book_reason
          }))
          
          console.log('[API] Found bookings:', formattedBookings.length)
          
          return json({
            success: true,
            bookings: formattedBookings
          })
        } catch (error) {
          console.error('[API] List bookings error:', error)
          return json({ 
            success: false,
            error: 'Failed to fetch bookings',
            bookings: []
          }, { status: 500 })
        }
      }
    }
  }
})