import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { createBooking } from '../../../lib/booking/service'

// GET  /api/calendar/events  — list bookings (Agent semantic interface)
// POST /api/calendar/events  — create booking (Agent semantic interface)
//
// These routes are consumed by the OpenClaw booking plugin.
// The existing /api/bookings/* routes remain unchanged for the frontend UI.
export const Route = createFileRoute('/api/calendar/events')({
  server: {
    handlers: {
      // -----------------------------------------------------------------------
      // GET /api/calendar/events
      // Query params (all optional):
      //   from      — Unix ms; return only bookings whose end_time > from
      //   to        — Unix ms; return only bookings whose start_time < to
      //   userId    — filter by ntid
      //   machineId — filter by server_id
      // -----------------------------------------------------------------------
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
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
      // Body (JSON):
      //   machineId   string  required
      //   startTime   number  required  Unix ms
      //   endTime     number  required  Unix ms
      //   ntid        string  required  user ID
      //   displayName string  optional
      //   reason      string  optional
      //   isExclusive boolean optional  default false
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
    },
  },
})
