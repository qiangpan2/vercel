import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

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
          
          // 将状态改为 cancelled（软删除）
          const result = db.prepare(`
            UPDATE bookings 
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'active'
          `).run(bookingId)
          
          if (result.changes === 0) {
            return json({ 
              success: false, 
              error: 'Booking not found or already cancelled' 
            }, { status: 404 })
          }
          
          console.log('[API] Booking cancelled:', bookingId)
          
          return json({
            success: true,
            message: 'Booking cancelled successfully'
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