import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

// GET /api/calendar/availability
//
// New endpoint (no equivalent in /api/bookings/*).
// Computes structured free/busy time slots for a machine on a given date,
// which is the key capability needed for Agent queries like
// "Is gpu-3 free tomorrow afternoon?".
//
// Query params (required):
//   machineId — server id
//   date      — YYYY-MM-DD (interpreted as UTC day 00:00–24:00)
export const Route = createFileRoute('/api/calendar/availability')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const machineId = url.searchParams.get('machineId')
          const dateStr = url.searchParams.get('date')

          if (!machineId || !dateStr) {
            return json(
              { success: false, error: 'Missing required params: machineId, date' },
              { status: 400 },
            )
          }

          // Parse the date into a UTC day window
          const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime()
          if (Number.isNaN(dayStart)) {
            return json(
              { success: false, error: 'Invalid date format; expected YYYY-MM-DD' },
              { status: 400 },
            )
          }
          const dayEnd = dayStart + 24 * 60 * 60 * 1000 // exclusive

          // Look up machine name
          const machine = db
            .prepare('SELECT id, hostname FROM servers WHERE id = ?')
            .get(machineId) as { id: number; hostname: string } | undefined

          if (!machine) {
            return json({ success: false, error: 'Machine not found' }, { status: 404 })
          }

          // Fetch all active bookings that overlap with the requested day
          const bookings = db
            .prepare(
              `
              SELECT
                b.id,
                b.ntid,
                b.book_reason,
                b.start_time,
                b.end_time
              FROM bookings b
              WHERE b.server_id = ?
                AND b.status = 'active'
                AND b.end_time > ?
                AND b.start_time < ?
              ORDER BY b.start_time
            `,
            )
            .all(machineId, dayStart, dayEnd) as Array<{
            id: number
            ntid: string
            book_reason: string | null
            start_time: number
            end_time: number
          }>

          // Clip bookings to the day window for free-slot calculation
          const clippedBookings = bookings.map((b) => ({
            start: Math.max(b.start_time, dayStart),
            end: Math.min(b.end_time, dayEnd),
          }))

          // Compute free slots by walking the sorted booking list
          const freeSlots: Array<{ start: number; end: number }> = []
          let cursor = dayStart

          for (const b of clippedBookings) {
            if (b.start > cursor) {
              freeSlots.push({ start: cursor, end: b.start })
            }
            cursor = Math.max(cursor, b.end)
          }

          // Remaining time after the last booking
          if (cursor < dayEnd) {
            freeSlots.push({ start: cursor, end: dayEnd })
          }

          return json({
            success: true,
            machineId: String(machine.id),
            machineName: machine.hostname,
            date: dateStr,
            bookings: bookings.map((b) => ({
              id: String(b.id),
              userId: b.ntid,
              start: b.start_time,
              end: b.end_time,
              reason: b.book_reason,
            })),
            freeSlots,
          })
        } catch (error) {
          console.error('[API] calendar/availability GET error:', error)
          return json(
            { success: false, error: 'Failed to compute availability' },
            { status: 500 },
          )
        }
      },
    },
  },
})
