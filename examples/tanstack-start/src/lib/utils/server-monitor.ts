/**
 * 服务器健康监控服务
 * 定期检查服务器在线状态
 */

import { executeAnsible } from '../utils/execAnsible'
import db from '../db/booking'

interface ServerRecord {
  id: number
  hostname: string
  ip: string
  status: 'available' | 'booked' | 'maintenance' | 'offline'
  previous_status: string | null
}

interface HealthCheckResult {
  hostname: string
  online: boolean
  previousStatus: string | null
  newStatus: string
  changed: boolean
}

/**
 * 检查单个服务器是否在线
 */
export async function checkServerHealth(hostname: string): Promise<boolean> {
  try {
    const result = await executeAnsible(
      'ping.yml',
      { target_machine: hostname },
      hostname,
      30000 // 30秒超时
    )
    return result.success
  } catch (error) {
    console.error(`[Monitor] Ping failed for ${hostname}:`, error)
    return false
  }
}

/**
 * 更新服务器状态（根据健康检查结果）
 */
export function updateServerStatus(
  serverId: number, 
  isOnline: boolean, 
  currentStatus: string,
  previousStatus: string | null
): { newStatus: string; changed: boolean } {
  
  let newStatus = currentStatus
  let changed = false

  if (!isOnline) {
    // 服务器离线
    if (currentStatus !== 'offline') {
      // 保存当前状态，然后设为 offline
      db.prepare(`
        UPDATE servers 
        SET status = 'offline', 
            previous_status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(currentStatus, serverId)
      
      newStatus = 'offline'
      changed = true
      console.log(`[Monitor] Server ${serverId}: ${currentStatus} → offline (saved previous: ${currentStatus})`)
      
      // 暂停该服务器的所有活跃预订
      suspendBookings(serverId)
    }
  } else {
    // 服务器在线
    if (currentStatus === 'offline') {
      // 从 offline 恢复
      const restoreStatus = previousStatus || 'available'
      
      db.prepare(`
        UPDATE servers 
        SET status = ?,
            previous_status = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(restoreStatus, serverId)
      
      newStatus = restoreStatus
      changed = true
      console.log(`[Monitor] Server ${serverId}: offline → ${restoreStatus} (restored)`)
      
      // 恢复该服务器的暂停预订
      resumeBookings(serverId)
      
      // 如果恢复到 available，检查是否需要变成 booked
      if (restoreStatus === 'available') {
        checkAndUpdateBookedStatus(serverId)
      }
    }
    // 如果不是 offline，保持当前状态不变
  }

  return { newStatus, changed }
}

/**
 * 暂停服务器的所有活跃预订
 */
function suspendBookings(serverId: number): void {
  const now = Date.now()
  
  const result = db.prepare(`
    UPDATE bookings 
    SET status = 'suspend',
        updated_at = CURRENT_TIMESTAMP
    WHERE server_id = ? 
      AND status = 'active'
      AND end_time > ?
  `).run(serverId, now)
  
  console.log(`[Monitor] Suspend ${result.changes} booking(s) for server ${serverId}`)
}

/**
 * 恢复服务器的暂停预订
 */
function resumeBookings(serverId: number): void {
  const now = Date.now()
  
  const result = db.prepare(`
    UPDATE bookings 
    SET status = 'active',
        updated_at = CURRENT_TIMESTAMP
    WHERE server_id = ? 
      AND status = 'suspend'
      AND end_time > ?
  `).run(serverId, now)
  
  console.log(`[Monitor] Resumed ${result.changes} booking(s) for server ${serverId}`)
}

/**
 * 检查服务器是否应该变成 booked 状态
 */
export function checkAndUpdateBookedStatus(serverId: number): void {
  const now = Date.now()
  
  // 检查是否有当前时间的独占预订
  const exclusiveBooking = db.prepare(`
    SELECT id FROM bookings
    WHERE server_id = ?
      AND status = 'active'
      AND is_exclusive = 1
      AND start_time <= ?
      AND end_time > ?
  `).get(serverId, now, now)
  
  const server = db.prepare('SELECT status FROM servers WHERE id = ?').get(serverId) as { status: string } | undefined
  
  if (!server) return
  
  if (exclusiveBooking && server.status === 'available') {
    // 有独占预订，变成 booked
    db.prepare(`
      UPDATE servers SET status = 'booked', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(serverId)
    console.log(`[Monitor] Server ${serverId}: available → booked (exclusive booking active)`)
  } else if (!exclusiveBooking && server.status === 'booked') {
    // 没有独占预订了，变回 available
    db.prepare(`
      UPDATE servers SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(serverId)
    console.log(`[Monitor] Server ${serverId}: booked → available (no exclusive booking)`)
  }
}

/**
 * 批量检查所有服务器健康状态
 */
export async function checkAllServersHealth(): Promise<HealthCheckResult[]> {
  const servers = db.prepare(`
    SELECT id, hostname, ip, status, previous_status
    FROM servers
    WHERE ip IS NOT NULL AND ip != ''
  `).all() as ServerRecord[]
  
  const results: HealthCheckResult[] = []
  
  for (const server of servers) {
    try {
      const isOnline = await checkServerHealth(server.hostname)
      const { newStatus, changed } = updateServerStatus(
        server.id,
        isOnline,
        server.status,
        server.previous_status
      )
      
      results.push({
        hostname: server.hostname,
        online: isOnline,
        previousStatus: server.previous_status,
        newStatus,
        changed
      })
    } catch (error) {
      console.error(`[Monitor] Error checking ${server.hostname}:`, error)
      results.push({
        hostname: server.hostname,
        online: false,
        previousStatus: server.previous_status,
        newStatus: server.status,
        changed: false
      })
    }
  }
  
  return results
}

/**
 * 检查所有服务器的 booked 状态
 * （应定期运行，处理预订开始/结束）
 */
export function updateAllBookedStatus(): void {
  const servers = db.prepare(`
    SELECT id FROM servers WHERE status IN ('available', 'booked')
  `).all() as { id: number }[]
  
  for (const server of servers) {
    checkAndUpdateBookedStatus(server.id)
  }
}