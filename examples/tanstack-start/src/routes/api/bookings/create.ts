import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'


// POST /api/bookings/create
export const Route = createFileRoute('/api/bookings/create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { 
            machineId,  // 前端传 machineId
            startTime, 
            endTime, 
            ntid, 
            displayName,
            reason,
            isExclusive 
          } = body
          
          console.log('[API] Creating booking:', { machineId, ntid, startTime, endTime })
          
          // 验证必填字段
          if (!machineId || !startTime || !endTime || !ntid) {
            return json({ 
              success: false, 
              error: 'Missing required fields: machineId, startTime, endTime, ntid' 
            }, { status: 400 })
          }
          
          // 确保用户存在（如果不存在则创建）
          const existingUser = db.prepare('SELECT ntid FROM users WHERE ntid = ?').get(ntid)
          if (!existingUser) {
            db.prepare(`
              INSERT INTO users (ntid, display_name, user_level)
              VALUES (?, ?, 'developer')
            `).run(ntid, displayName || ntid)
            console.log('[API] Created new user:', ntid)
          }
          
          // 检查时间冲突（对于独占预订）
          if (isExclusive) {
            const conflicts = db.prepare(`
              SELECT id FROM bookings
              WHERE server_id = ?
                AND status = 'active'
                AND is_exclusive = 1
                AND (
                  (start_time < ? AND end_time > ?)
                  OR (start_time < ? AND end_time > ?)
                  OR (start_time >= ? AND end_time <= ?)
                )
            `).all(machineId, endTime, startTime, endTime, startTime, startTime, endTime)
            
            if (conflicts.length > 0) {
              return json({ 
                success: false, 
                error: 'Time slot conflicts with existing exclusive booking' 
              }, { status: 409 })
            }
          }
          
          // 插入预订
          const result = db.prepare(`
            INSERT INTO bookings (server_id, ntid, book_reason, start_time, end_time, is_exclusive, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
          `).run(machineId, ntid, reason || null, startTime, endTime, isExclusive ? 1 : 0)
          
          console.log('[API] Booking created with ID:', result.lastInsertRowid)
          
          return json({
            success: true,
            bookingId: String(result.lastInsertRowid),
            message: 'Booking created successfully'
          })
        } catch (error) {
          console.error('[API] Create booking error:', error)
          return json({ 
            success: false, 
            error: 'Failed to create booking' 
          }, { status: 500 })
        }
      }
    }
  }
})