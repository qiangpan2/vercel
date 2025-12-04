/**
 * 服务器状态管理服务
 * 处理管理员对服务器状态的控制
 */

import db from '../db/booking'

interface StatusChangeResult {
  success: boolean
  message: string
  previousStatus?: string
  newStatus?: string
  affectedBookings?: number
}

/**
 * 设置服务器为维护模式
 */
export function setMaintenance(serverId: number): StatusChangeResult {
  const server = db.prepare(`
    SELECT id, hostname, status, previous_status FROM servers WHERE id = ?
  `).get(serverId) as { id: number; hostname: string; status: string; previous_status: string | null } | undefined
  
  if (!server) {
    return { success: false, message: 'Server not found' }
  }
  
  if (server.status === 'maintenance') {
    return { success: false, message: 'Server is already in maintenance mode' }
  }
  
  if (server.status === 'offline') {
    return { success: false, message: 'Cannot set maintenance on offline server' }
  }
  
  const now = Date.now()
  
  // 保存当前状态，设为 maintenance
  db.prepare(`
    UPDATE servers 
    SET status = 'maintenance',
        previous_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(server.status, serverId)
  
  // 暂停该服务器的所有活跃预订
  const suspendResult = db.prepare(`
    UPDATE bookings 
    SET status = 'suspend',
        updated_at = CURRENT_TIMESTAMP
    WHERE server_id = ? 
      AND status = 'active'
      AND end_time > ?
  `).run(serverId, now)
  
  console.log(`[StatusManager] Server ${server.hostname}: ${server.status} → maintenance`)
  console.log(`[StatusManager] Suspend ${suspendResult.changes} booking(s)`)
  
  return {
    success: true,
    message: `Server set to maintenance mode`,
    previousStatus: server.status,
    newStatus: 'maintenance',
    affectedBookings: suspendResult.changes
  }
}

/**
 * 解除维护模式
 */
export function clearMaintenance(serverId: number): StatusChangeResult {
  const server = db.prepare(`
    SELECT id, hostname, status, previous_status FROM servers WHERE id = ?
  `).get(serverId) as { id: number; hostname: string; status: string; previous_status: string | null } | undefined
  
  if (!server) {
    return { success: false, message: 'Server not found' }
  }
  
  if (server.status !== 'maintenance') {
    return { success: false, message: 'Server is not in maintenance mode' }
  }
  
  const now = Date.now()
  const restoreStatus = server.previous_status || 'available'
  
  // 恢复状态
  db.prepare(`
    UPDATE servers 
    SET status = ?,
        previous_status = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(restoreStatus, serverId)
  
  // 恢复暂停的预订
  const resumeResult = db.prepare(`
    UPDATE bookings 
    SET status = 'active',
        updated_at = CURRENT_TIMESTAMP
    WHERE server_id = ? 
      AND status = 'suspend'
      AND end_time > ?
  `).run(serverId, now)
  
  console.log(`[StatusManager] Server ${server.hostname}: maintenance → ${restoreStatus}`)
  console.log(`[StatusManager] Resumed ${resumeResult.changes} booking(s)`)
  
  return {
    success: true,
    message: `Maintenance mode cleared`,
    previousStatus: 'maintenance',
    newStatus: restoreStatus,
    affectedBookings: resumeResult.changes
  }
}

/**
 * 获取服务器状态详情
 */
export function getServerStatusDetails(serverId: number) {
  const server = db.prepare(`
    SELECT id, hostname, status, previous_status FROM servers WHERE id = ?
  `).get(serverId) as { id: number; hostname: string; status: string; previous_status: string | null } | undefined
  
  if (!server) return null
  
  const now = Date.now()
  
  // 获取活跃预订数
  const activeBookings = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE server_id = ? AND status = 'active' AND end_time > ?
  `).get(serverId, now) as { count: number }
  
  // 获取暂停预订数
  const suspendBookings = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE server_id = ? AND status = 'suspend' AND end_time > ?
  `).get(serverId, now) as { count: number }
  
  // 获取当前独占预订
  const exclusiveBooking = db.prepare(`
    SELECT id, ntid, start_time, end_time FROM bookings
    WHERE server_id = ? AND status = 'active' AND is_exclusive = 1
      AND start_time <= ? AND end_time > ?
  `).get(serverId, now, now)
  
  return {
    ...server,
    activeBookings: activeBookings.count,
    suspendBookings: suspendBookings.count,
    currentExclusiveBooking: exclusiveBooking || null
  }
}