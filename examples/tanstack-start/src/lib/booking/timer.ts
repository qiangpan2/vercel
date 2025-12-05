import db from '../db/booking'
import { executeAnsible } from '../utils/execAnsible'

/**
 * 预定定时器管理
 * 使用 setTimeout 实现精准定时，不依赖轮询
 */

// 存储所有活跃的定时器
// key: `${bookingId}-start` 或 `${bookingId}-end`
const timers = new Map<string, NodeJS.Timeout>()

/**
 * 为预定设置开始定时器
 */
export function scheduleBookingStart(
  bookingId: bigint | number,
  machineHostname: string,
  ntid: string,
  serverId: number,
  startTime: number
) {
  const timerId = `${bookingId}-start`
  const now = Date.now()
  const delay = startTime - now
  
  // 如果已经过了开始时间，立即执行
  if (delay <= 0) {
    console.log(`[Timer] Booking ${bookingId} start time already passed, executing now`)
    handleBookingStart(bookingId, machineHostname, ntid, serverId)
    return
  }
  
  // 清除已存在的定时器
  if (timers.has(timerId)) {
    clearTimeout(timers.get(timerId)!)
  }
  
  console.log(`[Timer] Scheduling booking ${bookingId} to start in ${Math.round(delay / 1000)}s`)
  
  const timer = setTimeout(() => {
    timers.delete(timerId)
    handleBookingStart(bookingId, machineHostname, ntid, serverId)
  }, delay)
  
  timers.set(timerId, timer)
}

/**
 * 为预定设置结束定时器
 */
export function scheduleBookingEnd(
  bookingId: bigint | number,
  machineHostname: string,
  ntid: string,
  serverId: number,
  endTime: number
) {
  const timerId = `${bookingId}-end`
  const now = Date.now()
  const delay = endTime - now
  
  // 如果已经过了结束时间，立即执行
  if (delay <= 0) {
    console.log(`[Timer] Booking ${bookingId} end time already passed, executing now`)
    handleBookingEnd(bookingId, machineHostname, ntid, serverId)
    return
  }
  
  // 清除已存在的定时器
  if (timers.has(timerId)) {
    clearTimeout(timers.get(timerId)!)
  }
  
  console.log(`[Timer] Scheduling booking ${bookingId} to end in ${Math.round(delay / 1000)}s`)
  
  const timer = setTimeout(() => {
    timers.delete(timerId)
    handleBookingEnd(bookingId, machineHostname, ntid, serverId)
  }, delay)
  
  timers.set(timerId, timer)
}

/**
 * 取消预定的所有定时器
 */
export function cancelBookingTimers(bookingId: string | number) {
  const startTimerId = `${bookingId}-start`
  const endTimerId = `${bookingId}-end`
  
  if (timers.has(startTimerId)) {
    clearTimeout(timers.get(startTimerId)!)
    timers.delete(startTimerId)
    console.log(`[Timer] Cancelled start timer for booking ${bookingId}`)
  }
  
  if (timers.has(endTimerId)) {
    clearTimeout(timers.get(endTimerId)!)
    timers.delete(endTimerId)
    console.log(`[Timer] Cancelled end timer for booking ${bookingId}`)
  }
}

/**
 * 处理预定开始
 */
async function handleBookingStart(
  bookingId: bigint | number,
  machineHostname: string,
  ntid: string,
  serverId: number
) {
  console.log(`[Timer] Booking ${bookingId} starting now`)
  
  // 验证预定仍然有效
  const booking = db.prepare(`
    SELECT status FROM bookings WHERE id = ?
  `).get(bookingId) as { status: string } | undefined
  
  if (!booking || booking.status !== 'active') {
    console.log(`[Timer] Booking ${bookingId} is no longer active, skipping`)
    return
  }
  
  // 检查用户是否已经有权限（之前的预定可能已授权）
  const now = Date.now()
  const hasExistingAccess = db.prepare(`
    SELECT id FROM bookings
    WHERE server_id = ? AND ntid = ? AND status = 'active'
      AND start_time <= ? AND end_time > ?
      AND id != ?
  `).get(serverId, ntid, now, now, bookingId)
  
  if (hasExistingAccess) {
    console.log(`[Timer] User ${ntid} already has access, skipping grant`)
    return
  }
  
  // 授权
  const result = await executeAnsible('grant_access.yml', {
    target_machine: machineHostname,
    ntid: ntid
  })
  
  if (result.success) {
    console.log(`[Timer] Grant access succeeded for ${ntid} on ${machineHostname}`)
  } else {
    console.error(`[Timer] Grant access failed:`, result.error)
  }
}

/**
 * 处理预定结束
 */
async function handleBookingEnd(
  bookingId: bigint | number,
  machineHostname: string,
  ntid: string,
  serverId: number
) {
  console.log(`[Timer] Booking ${bookingId} ending now`)
  
  // 将预定标记为 completed
  db.prepare(`
    UPDATE bookings
    SET status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'active'
  `).run(bookingId)
  
  // 检查用户是否还有其他活跃预定
  const now = Date.now()
  const hasOtherBooking = db.prepare(`
    SELECT id FROM bookings
    WHERE server_id = ? AND ntid = ? AND status = 'active'
      AND start_time <= ? AND end_time > ?
  `).get(serverId, ntid, now, now)
  
  if (hasOtherBooking) {
    console.log(`[Timer] User ${ntid} has other active bookings, keeping access`)
    return
  }
  
  // 撤销权限
  const result = await executeAnsible('revoke_access.yml', {
    target_machine: machineHostname,
    ntid: ntid
  })
  
  if (result.success) {
    console.log(`[Timer] Revoke access succeeded for ${ntid} on ${machineHostname}`)
  } else {
    console.error(`[Timer] Revoke access failed:`, result.error)
  }
}

/**
 * 服务启动时恢复所有定时器
 */
export function restoreAllTimers() {
  console.log('[Timer] Restoring timers for active bookings...')
  
  const now = Date.now()
  
  // 查询所有活跃预定
  const activeBookings = db.prepare(`
    SELECT b.id, b.ntid, b.server_id, b.start_time, b.end_time, s.hostname as machine_hostname
    FROM bookings b
    JOIN servers s ON b.server_id = s.id
    WHERE b.status = 'active' AND b.end_time > ?
  `).all(now) as Array<{
    id: number
    ntid: string
    server_id: number
    start_time: number
    end_time: number
    machine_hostname: string
  }>
  
  for (const booking of activeBookings) {
    // 如果开始时间在未来，设置开始定时器
    if (booking.start_time > now) {
      scheduleBookingStart(
        booking.id,
        booking.machine_hostname,
        booking.ntid,
        booking.server_id,
        booking.start_time
      )
    }
    
    // 设置结束定时器
    scheduleBookingEnd(
      booking.id,
      booking.machine_hostname,
      booking.ntid,
      booking.server_id,
      booking.end_time
    )
  }
  
  console.log(`[Timer] Restored ${activeBookings.length} booking timers`)
}

/**
 * 获取当前活跃定时器数量（用于调试）
 */
export function getActiveTimerCount(): number {
  return timers.size
}