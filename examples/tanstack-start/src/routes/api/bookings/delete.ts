import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { executeAnsible } from '../../../lib/utils/execAnsible'
import { cancelBookingTimers } from '../../../lib/booking/timer'

// DELETE /api/bookings/delete
export const Route = createFileRoute('/api/bookings/delete')({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const bookingId = url.searchParams.get('id')
          
          console.log('[API] Deleting booking:', bookingId)
          
          if (!bookingId) {
            return json({ 
              success: false, 
              error: 'Missing booking ID' 
            }, { status: 400 })
          }
          
          // 获取预订详情
          const booking = db.prepare(`
            SELECT b.id, b.ntid, b.status, b.server_id, b.start_time, b.end_time, s.hostname as machine_name
            FROM bookings b
            JOIN servers s ON b.server_id = s.id
            WHERE b.id = ?
          `).get(bookingId) as { 
            id: number
            ntid: string
            status: string
            server_id: number
            start_time: number
            end_time: number
            machine_name: string 
          } | undefined
          
          if (!booking) {
            return json({ 
              success: false, 
              error: 'Booking not found' 
            }, { status: 404 })
          }
          
          if (booking.status !== 'active') {
            return json({ 
              success: false, 
              error: 'Booking is not active' 
            }, { status: 400 })
          }
          
          // 取消这个预定的定时器
          cancelBookingTimers(bookingId)
          
          // 将状态改为 cancelled
          const result = db.prepare(`
            UPDATE bookings 
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'active'
          `).run(bookingId)
          
          if (result.changes === 0) {
            return json({ 
              success: false, 
              error: 'Failed to cancel booking' 
            }, { status: 500 })
          }
          
          console.log('[API] Booking cancelled:', bookingId)
          
          // ========== 检查是否需要撤销权限 ==========
          const now = Date.now()
          
          // 检查用户是否还有其他活跃的、当前生效的预定
          const hasOtherActiveBooking = db.prepare(`
            SELECT id FROM bookings
            WHERE server_id = ? AND ntid = ? AND status = 'active'
              AND start_time <= ? AND end_time > ?
          `).get(booking.server_id, booking.ntid, now, now)
          
          let ansibleSuccess = true
          
          if (!hasOtherActiveBooking) {
            // 没有其他活跃预定，撤销权限
            console.log('[API] No other active bookings, revoking access')
            const ansibleResult = await executeAnsible('revoke_access.yml', {
              target_machine: booking.machine_name,
              ntid: booking.ntid
            })
            
            ansibleSuccess = ansibleResult.success
            if (!ansibleSuccess) {
              console.error('[API] Revoke access failed:', ansibleResult.error)
            }
          } else {
            console.log('[API] User has other active bookings, keeping access')
          }
          
          return json({
            success: true,
            message: hasOtherActiveBooking 
              ? 'Booking cancelled, access kept (user has other active bookings)'
              : 'Booking cancelled and access revoked',
            ansibleSuccess
          })
        } catch (error) {
          console.error('[API] Delete booking error:', error)
          return json({ 
            success: false, 
            error: 'Failed to delete booking' 
          }, { status: 500 })
        }
      }
    }
  }
})