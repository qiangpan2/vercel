import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { cancelBooking } from '../../../lib/booking/service'

// GET    /api/calendar/events/:id  — get single booking detail
// DELETE /api/calendar/events/:id  — cancel booking (RESTful, replaces DELETE /api/bookings/delete?id=N)
//
// These routes are consumed by the OpenClaw booking plugin.
export const Route = createFileRoute('/api/calendar/events/$id')({
  server: {
    handlers: {
      // -----------------------------------------------------------------------
      // GET /api/calendar/events/:id
      // Returns full booking detail including machine info.
      // -----------------------------------------------------------------------
      GET: async ({ params }) => {
        try {
          const { id } = params

          const booking = db
            .prepare(
              `
              SELECT
                b.id,
                b.server_id,
                b.ntid,
                b.book_reason,
                b.start_time,
                b.end_time,
                b.is_exclusive,
                b.status,
                u.display_name,
                s.hostname as machine_name,
                s.gpu_arch,
                s.num_gpus,
                s.cpu_model
              FROM bookings b
              LEFT JOIN users u ON b.ntid = u.ntid
              JOIN servers s ON b.server_id = s.id
              WHERE b.id = ?
            `,
            )
            .get(id) as
            | {
                id: number
                server_id: number
                ntid: string
                book_reason: string | null
                start_time: number
                end_time: number
                is_exclusive: number
                status: string
                display_name: string | null
                machine_name: string
                gpu_arch: string | null
                num_gpus: number | null
                cpu_model: string | null
              }
            | undefined

          if (!booking) {
            return json({ success: false, error: 'Booking not found' }, { status: 404 })
          }

          return json({
            success: true,
            booking: {
              id: String(booking.id),
              machineId: String(booking.server_id),
              machineName: booking.machine_name,
              machineSpecs: {
                gpu: booking.gpu_arch
                  ? `${booking.gpu_arch} x${booking.num_gpus}`
                  : 'None',
                cpu: booking.cpu_model || 'N/A',
              },
              userId: booking.ntid,
              userName: booking.display_name || booking.ntid,
              startTime: booking.start_time,
              endTime: booking.end_time,
              isExclusive: booking.is_exclusive === 1,
              reason: booking.book_reason,
              status: booking.status,
            },
          })
        } catch (error) {
          console.error('[API] calendar/events/:id GET error:', error)
          return json({ success: false, error: 'Failed to fetch event' }, { status: 500 })
        }
      },

      // -----------------------------------------------------------------------
      // DELETE /api/calendar/events/:id
      // Cancels the booking.  RESTful equivalent of DELETE /api/bookings/delete?id=N.
      // -----------------------------------------------------------------------
      DELETE: async ({ params }) => {
        try {
          const { id } = params
          console.log('[API] calendar/events DELETE id:', id)

          const result = await cancelBooking(id)

          if (!result.success) {
            const status =
              result.error === 'Booking not found'
                ? 404
                : result.error === 'Booking is not active or completed'
                  ? 400
                  : 500
            return json({ success: false, error: result.error }, { status })
          }

          return json(result)
        } catch (error) {
          console.error('[API] calendar/events/:id DELETE error:', error)
          return json({ success: false, error: 'Failed to cancel event' }, { status: 500 })
        }
      },
    },
  },
})
