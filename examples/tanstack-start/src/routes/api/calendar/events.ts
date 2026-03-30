import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { createBooking, cancelBooking } from '../../../lib/booking/service'

// GET  /api/calendar/events              — list bookings
// GET  /api/calendar/events?id=N         — get single booking detail
// POST /api/calendar/events              — create booking
// DELETE /api/calendar/events?id=N       — cancel booking
//
// The ?id= variants replace the former /api/calendar/events/$id route,
// which was deleted to work around a @tanstack/router-plugin@1.139 bug
// that caused it to be registered as a catch-all, breaking all routes.
export const Route = createFileRoute('/api/calendar/events')({
  server: {
    handlers: {
      // -----------------------------------------------------------------------
      // GET /api/calendar/events
      // With ?id=N  → return single booking detail (replaces GET /events/:id)
      // Without     → return list, filtered by optional from/to/userId/machineId
      // -----------------------------------------------------------------------
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')

          // ── Single booking ──────────────────────────────────────────────────
          if (id) {
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
          }

          // ── Booking list ────────────────────────────────────────────────────
          const from = url.searchParams.get('from')
          const to = url.searchParams.get('to')
          const userId = url.searchParams.get('userId')
          const machineId = url.searchParams.get('machineId')

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
            WHERE b.status != 'cancelled'
          `
          const params: (string | number)[] = []

          if (from) {
            query += ' AND b.end_time > ?'
            params.push(Number(from))
          }
          if (to) {
            query += ' AND b.start_time < ?'
            params.push(Number(to))
          }
          if (userId) {
            query += ' AND b.ntid = ?'
            params.push(userId)
          }
          if (machineId) {
            query += ' AND b.server_id = ?'
            params.push(machineId)
          }

          query += ' ORDER BY b.start_time'

          const bookings = db.prepare(query).all(...params) as Array<{
            id: number
            server_id: number
            ntid: string
            book_reason: string | null
            start_time: number
            end_time: number
            is_exclusive: number
            status: string
            display_name: string | null
          }>

          const formatted = bookings.map((b) => ({
            id: String(b.id),
            machineId: String(b.server_id),
            userId: b.ntid,
            userName: b.display_name || b.ntid,
            startTime: b.start_time,
            endTime: b.end_time,
            isExclusive: b.is_exclusive === 1,
            reason: b.book_reason,
            status: b.status,
          }))

          return json({ success: true, bookings: formatted })
        } catch (error) {
          console.error('[API] calendar/events GET error:', error)
          return json(
            { success: false, error: 'Failed to fetch events', bookings: [] },
            { status: 500 },
          )
        }
      },

      // -----------------------------------------------------------------------
      // POST /api/calendar/events
      // -----------------------------------------------------------------------
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          console.log('[API] calendar/events POST:', body)

          const result = await createBooking(body)

          if (!result.success) {
            const status = result.error === 'Machine not found' ? 404
              : result.error?.startsWith('Missing') ? 400
              : result.error?.startsWith('Time slot conflicts') ? 409
              : 500
            return json({ success: false, error: result.error }, { status })
          }

          return json(result)
        } catch (error) {
          console.error('[API] calendar/events POST error:', error)
          return json({ success: false, error: 'Failed to create event' }, { status: 500 })
        }
      },

      // -----------------------------------------------------------------------
      // DELETE /api/calendar/events?id=N
      // -----------------------------------------------------------------------
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')
          console.log('[API] calendar/events DELETE id:', id)

          if (!id) {
            return json({ success: false, error: 'Missing id query parameter' }, { status: 400 })
          }

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
          console.error('[API] calendar/events DELETE error:', error)
          return json({ success: false, error: 'Failed to cancel event' }, { status: 500 })
        }
      },
    },
  },
})
