import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { executeAnsible } from '../../../lib/utils/execAnsible'
import { scheduleBookingStart, scheduleBookingEnd } from '../../../lib/booking/timer'

// POST /api/bookings/create
export const Route = createFileRoute('/api/bookings/create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { 
            machineId,
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
          
          // 获取机器名称（用于 Ansible）
          const machine = db.prepare(
            'SELECT id, hostname, is_exclusive FROM servers WHERE id = ?'
          ).get(machineId) as { id: number; hostname: string; is_exclusive: number } | undefined
          if (!machine) {
            return json({ 
              success: false, 
              error: 'Machine not found' 
            }, { status: 404 })
          }

          // 如果服务器被管理员标记为 exclusive 模式，检查用户是否在白名单中且有 can_book 权限
          if (machine.is_exclusive) {
            const permission = db.prepare(
              'SELECT id, can_book FROM booking_permissions WHERE server_id = ? AND ntid = ?'
            ).get(machineId, ntid) as { id: number; can_book: number } | undefined
            
            if (!permission || !permission.can_book) {
              console.log('[API] User not in exclusive whitelist:', { ntid, machineId })
              return json({ 
                success: false, 
                error: 'This machine is in exclusive mode. You are not authorized to book it. Contact an admin to be added to the whitelist.' 
              }, { status: 403 })
            }
            console.log('[API] User passed exclusive whitelist check:', ntid)
          }

          // 确保用户存在
          const existingUser = db.prepare('SELECT ntid FROM users WHERE ntid = ?').get(ntid)
          if (!existingUser) {
            db.prepare(`
              INSERT INTO users (ntid, display_name, user_level)
              VALUES (?, ?, 'developer')
            `).run(ntid, displayName || ntid)
            console.log('[API] Created new user:', ntid)
          }
          
          // 检查时间冲突（独占预订）
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
          
          const bookingId = result.lastInsertRowid
          console.log('[API] Booking created with ID:', bookingId)
          
          // ========== 关键逻辑 ==========
          const now = Date.now()
          const isActiveNow = startTime <= now && endTime > now
          
          if (isActiveNow) {
            // 预定时间包含"现在" → 立即授权
            const hasExistingAccess = db.prepare(`
              SELECT id FROM bookings
              WHERE server_id = ? AND ntid = ? AND status = 'active'
                AND start_time <= ? AND end_time > ? AND id != ?
            `).get(machineId, ntid, now, now, bookingId)
            
            if (!hasExistingAccess) {
              console.log('[API] Booking is active now, granting access immediately')
              await executeAnsible('grant_access.yml', {
                target_machine: machine.hostname,
                ntid: ntid
              })
            } else {
              console.log('[API] User already has access from another booking')
            }
          } else {
            // 预定是未来时间 → 设置精准定时器
            console.log('[API] Booking is in the future, setting timer')
            scheduleBookingStart(
              bookingId,
              machine.hostname,
              ntid,
              machineId,
              startTime
            )
          }
          
          // 设置结束定时器
          scheduleBookingEnd(
            bookingId,
            machine.hostname,
            ntid,
            machineId,
            endTime
          )

          return json({
            success: true,
            bookingId: String(bookingId),
            message: isActiveNow 
              ? 'Booking created and access granted immediately' 
              : `Booking created, access will be granted at ${new Date(startTime).toLocaleString()}`
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