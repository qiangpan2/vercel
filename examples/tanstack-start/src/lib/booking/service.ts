/**
 * Shared booking service layer.
 *
 * Both the existing /api/bookings/* routes and the new /api/calendar/* routes
 * (consumed by the OpenClaw AI Agent via the booking plugin) call these
 * functions so the Ansible grant/revoke logic and timer scheduling are not
 * duplicated.
 */

import db from '../db/booking'
import { executeAnsible } from '../utils/execAnsible'
import { scheduleBookingStart, scheduleBookingEnd, cancelBookingTimers } from './timer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateBookingParams {
  machineId: string
  startTime: number
  endTime: number
  ntid: string
  displayName?: string
  reason?: string
  isExclusive?: boolean
}

export interface CreateBookingResult {
  success: boolean
  bookingId?: string
  message?: string
  error?: string
}

export interface CancelBookingResult {
  success: boolean
  message?: string
  error?: string
  ansibleSuccess?: boolean
}

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

/**
 * Create a new booking.
 *
 * Mirrors the logic in /api/bookings/create.ts:
 *   - validates fields exist
 *   - checks machine exists
 *   - ensures user row exists
 *   - checks exclusive-booking conflicts
 *   - inserts the booking
 *   - grants access immediately if the slot is currently active, or schedules
 *     start/end timers for future slots
 *
 * Callers should already have validated input.  Validation errors are returned
 * as { success: false, error: "..." } with no exception thrown.
 */
export async function createBooking(
  params: CreateBookingParams,
): Promise<CreateBookingResult> {
  const { machineId, startTime, endTime, ntid, displayName, reason, isExclusive } = params

  if (!machineId || !startTime || !endTime || !ntid) {
    return {
      success: false,
      error: 'Missing required fields: machineId, startTime, endTime, ntid',
    }
  }

  // Look up machine hostname (required for Ansible)
  const machine = db
    .prepare('SELECT hostname FROM servers WHERE id = ?')
    .get(machineId) as { hostname: string } | undefined

  if (!machine) {
    return { success: false, error: 'Machine not found' }
  }

  // Ensure user row exists
  const existingUser = db.prepare('SELECT ntid FROM users WHERE ntid = ?').get(ntid)
  if (!existingUser) {
    db.prepare(`
      INSERT INTO users (ntid, display_name, user_level)
      VALUES (?, ?, 'developer')
    `).run(ntid, displayName || ntid)
    console.log('[BookingService] Created new user:', ntid)
  }

  // Check exclusive-booking time conflicts
  if (isExclusive) {
    const conflicts = db
      .prepare(
        `
        SELECT id FROM bookings
        WHERE server_id = ?
          AND status = 'active'
          AND is_exclusive = 1
          AND (
            (start_time < ? AND end_time > ?)
            OR (start_time < ? AND end_time > ?)
            OR (start_time >= ? AND end_time <= ?)
          )
      `,
      )
      .all(machineId, endTime, startTime, endTime, startTime, startTime, endTime)

    if (conflicts.length > 0) {
      return {
        success: false,
        error: 'Time slot conflicts with existing exclusive booking',
      }
    }
  }

  // Insert booking
  const result = db
    .prepare(
      `
      INSERT INTO bookings (server_id, ntid, book_reason, start_time, end_time, is_exclusive, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `,
    )
    .run(machineId, ntid, reason || null, startTime, endTime, isExclusive ? 1 : 0)

  const bookingId = result.lastInsertRowid
  console.log('[BookingService] Booking created with ID:', bookingId)

  const now = Date.now()
  const isActiveNow = startTime <= now && endTime > now

  if (isActiveNow) {
    // Grant access immediately if the booking window includes right now
    const hasExistingAccess = db
      .prepare(
        `
        SELECT id FROM bookings
        WHERE server_id = ? AND ntid = ? AND status = 'active'
          AND start_time <= ? AND end_time > ? AND id != ?
      `,
      )
      .get(machineId, ntid, now, now, bookingId)

    if (!hasExistingAccess) {
      console.log('[BookingService] Booking is active now, granting access immediately')
      await executeAnsible('grant_access.yml', {
        target_machine: machine.hostname,
        ntid,
      })
    } else {
      console.log('[BookingService] User already has access from another booking')
    }
  } else {
    // Schedule future start
    console.log('[BookingService] Booking is in the future, setting timer')
    scheduleBookingStart(bookingId, machine.hostname, ntid, Number(machineId), startTime)
  }

  // Always schedule end timer
  scheduleBookingEnd(bookingId, machine.hostname, ntid, Number(machineId), endTime)

  return {
    success: true,
    bookingId: String(bookingId),
    message: isActiveNow
      ? 'Booking created and access granted immediately'
      : `Booking created, access will be granted at ${new Date(startTime).toLocaleString()}`,
  }
}

// ---------------------------------------------------------------------------
// cancelBooking
// ---------------------------------------------------------------------------

/**
 * Cancel an existing booking.
 *
 * Mirrors the logic in /api/bookings/delete.ts:
 *   - finds booking + machine
 *   - validates the booking is cancellable (active or completed)
 *   - cancels timers
 *   - marks booking cancelled in DB
 *   - revokes Ansible access if the user has no other active booking on that
 *     machine right now
 */
export async function cancelBooking(bookingId: string): Promise<CancelBookingResult> {
  if (!bookingId) {
    return { success: false, error: 'Missing booking ID' }
  }

  const booking = db
    .prepare(
      `
      SELECT b.id, b.ntid, b.status, b.server_id, b.start_time, b.end_time,
             s.hostname as machine_name
      FROM bookings b
      JOIN servers s ON b.server_id = s.id
      WHERE b.id = ?
    `,
    )
    .get(bookingId) as
    | {
        id: number
        ntid: string
        status: string
        server_id: number
        start_time: number
        end_time: number
        machine_name: string
      }
    | undefined

  if (!booking) {
    return { success: false, error: 'Booking not found' }
  }

  if (booking.status !== 'active' && booking.status !== 'completed') {
    return { success: false, error: 'Booking is not active or completed' }
  }

  // Cancel in-process timers
  if (booking.status === 'active') {
    cancelBookingTimers(bookingId)
  }

  // Mark cancelled
  const updateResult = db
    .prepare(
      `
      UPDATE bookings
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .run(bookingId)

  if (updateResult.changes === 0) {
    return { success: false, error: 'Failed to cancel booking' }
  }

  console.log('[BookingService] Booking cancelled:', bookingId)

  if (booking.status === 'completed') {
    return { success: true, message: 'Booking history deleted' }
  }

  // Check if user still has other currently-active bookings on this machine
  const now = Date.now()
  const hasOtherActiveBooking = db
    .prepare(
      `
      SELECT id FROM bookings
      WHERE server_id = ? AND ntid = ? AND status = 'active'
        AND start_time <= ? AND end_time > ?
    `,
    )
    .get(booking.server_id, booking.ntid, now, now)

  let ansibleSuccess = true

  if (!hasOtherActiveBooking) {
    console.log('[BookingService] No other active bookings, revoking access')
    const ansibleResult = await executeAnsible('revoke_access.yml', {
      target_machine: booking.machine_name,
      ntid: booking.ntid,
    })
    ansibleSuccess = ansibleResult.success
    if (!ansibleSuccess) {
      console.error('[BookingService] Revoke access failed:', ansibleResult.error)
    }
  } else {
    console.log('[BookingService] User has other active bookings, keeping access')
  }

  return {
    success: true,
    message: hasOtherActiveBooking
      ? 'Booking cancelled, access kept (user has other active bookings)'
      : 'Booking cancelled and access revoked',
    ansibleSuccess,
  }
}
