/**
 * 服务生命周期管理
 * 处理服务启动、关闭时的权限同步
 */

import db from '../db/booking'
import { executeAnsible } from '../utils/execAnsible'
import { restoreAllTimers } from '../booking/timer'

interface ActiveBooking {
  id: number
  ntid: string
  server_id: number
  machine_hostname: string
  start_time: number
  end_time: number
}

interface AdminUser {
  ntid: string
}

/**
 * 获取所有管理员用户
 */
function getAdminUsers(): string[] {
  const admins = db.prepare(`
    SELECT ntid FROM users WHERE user_level = 'admin'
  `).all() as AdminUser[]
  
  return admins.map(a => a.ntid)
}

/**
 * 获取当前时间正在生效的预订
 */
function getCurrentActiveBookings(): ActiveBooking[] {
  const now = Date.now()
  
  return db.prepare(`
    SELECT 
      b.id, 
      b.ntid, 
      b.server_id, 
      s.hostname as machine_hostname,
      b.start_time, 
      b.end_time
    FROM bookings b
    JOIN servers s ON b.server_id = s.id
    WHERE b.status = 'active' 
      AND b.start_time <= ? 
      AND b.end_time > ?
  `).all(now, now) as ActiveBooking[]
}

/**
 * 获取所有服务器上当前有权限的用户（去重）
 */
function getUsersWithAccess(): Map<string, Set<string>> {
  const now = Date.now()
  
  const bookings = db.prepare(`
    SELECT DISTINCT b.ntid, s.hostname
    FROM bookings b
    JOIN servers s ON b.server_id = s.id
    WHERE b.status = 'active' 
      AND b.start_time <= ? 
      AND b.end_time > ?
  `).all(now, now) as { ntid: string; hostname: string }[]
  
  // Map<hostname, Set<ntid>>
  const result = new Map<string, Set<string>>()
  
  for (const b of bookings) {
    if (!result.has(b.hostname)) {
      result.set(b.hostname, new Set())
    }
    result.get(b.hostname)!.add(b.ntid)
  }
  
  return result
}

/**
 * 服务关闭时：撤销所有非管理员的权限
 */
export async function handleShutdown(): Promise<void> {
  console.log('[Lifecycle] Service shutting down, revoking non-admin access...')
  
  const adminUsers = getAdminUsers()
  const usersWithAccess = getUsersWithAccess()
  
  const revokePromises: Promise<void>[] = []
  
  for (const [hostname, users] of usersWithAccess) {
    for (const ntid of users) {
      // 跳过管理员
      if (adminUsers.includes(ntid)) {
        console.log(`[Lifecycle] Skipping admin user: ${ntid}`)
        continue
      }
      
      console.log(`[Lifecycle] Revoking access: ${ntid} on ${hostname}`)
      
      revokePromises.push(
        executeAnsible('revoke_access.yml', {
          target_machine: hostname,
          ntid: ntid
        }).then(result => {
          if (result.success) {
            console.log(`[Lifecycle] Revoked: ${ntid} on ${hostname}`)
          } else {
            console.error(`[Lifecycle] Failed to revoke ${ntid} on ${hostname}:`, result.error)
          }
        }).catch(err => {
          console.error(`[Lifecycle] Error revoking ${ntid} on ${hostname}:`, err)
        })
      )
    }
  }
  
  // 等待所有撤销操作完成（设置超时）
  await Promise.race([
    Promise.all(revokePromises),
    new Promise(resolve => setTimeout(resolve, 30000)) // 30秒超时
  ])
  
  console.log('[Lifecycle] Shutdown cleanup completed')
}

/**
 * 服务启动时：恢复所有当前有效预订的权限
 */
export async function handleStartup(): Promise<void> {
  console.log('[Lifecycle] Service starting, restoring active bookings...')
  
  // 1. 恢复定时器
  restoreAllTimers()
  
  // 2. 获取当前应该有权限的用户
  const activeBookings = getCurrentActiveBookings()
  
  if (activeBookings.length === 0) {
    console.log('[Lifecycle] No active bookings to restore')
    return
  }
  
  console.log(`[Lifecycle] Found ${activeBookings.length} active booking(s) to restore`)
  
  // 按服务器和用户去重，避免重复授权
  const toGrant = new Map<string, Set<string>>() // hostname -> Set<ntid>
  
  for (const booking of activeBookings) {
    const key = booking.machine_hostname
    if (!toGrant.has(key)) {
      toGrant.set(key, new Set())
    }
    toGrant.get(key)!.add(booking.ntid)
  }
  
  // 3. 执行授权
  const grantPromises: Promise<void>[] = []
  
  for (const [hostname, users] of toGrant) {
    for (const ntid of users) {
      console.log(`[Lifecycle] Granting access: ${ntid} on ${hostname}`)
      
      grantPromises.push(
        executeAnsible('grant_access.yml', {
          target_machine: hostname,
          ntid: ntid
        }).then(result => {
          if (result.success) {
            console.log(`[Lifecycle] Granted: ${ntid} on ${hostname}`)
          } else {
            console.error(`[Lifecycle] Failed to grant ${ntid} on ${hostname}:`, result.error)
          }
        }).catch(err => {
          console.error(`[Lifecycle] Error granting ${ntid} on ${hostname}:`, err)
        })
      )
    }
  }
  
  // 等待所有授权操作完成
  await Promise.all(grantPromises)
  
  console.log('[Lifecycle] Startup restoration completed')
}

/**
 * 注册进程信号处理
 */
export function registerShutdownHandlers(): void {
  let isShuttingDown = false
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log('[Lifecycle] Already shutting down...')
      return
    }
    
    isShuttingDown = true
    console.log(`[Lifecycle] Received ${signal}, starting graceful shutdown...`)
    
    try {
      await handleShutdown()
    } catch (error) {
      console.error('[Lifecycle] Error during shutdown:', error)
    } finally {
      console.log('[Lifecycle] Exiting...')
      process.exit(0)
    }
  }
  
  // 处理各种终止信号
  process.on('SIGINT', () => shutdown('SIGINT'))   // Ctrl+C
  process.on('SIGTERM', () => shutdown('SIGTERM')) // kill command
  process.on('SIGHUP', () => shutdown('SIGHUP'))   // terminal closed
  
  // 处理未捕获的异常
  process.on('uncaughtException', async (error) => {
    console.error('[Lifecycle] Uncaught exception:', error)
    await shutdown('uncaughtException')
  })
  
  process.on('unhandledRejection', async (reason) => {
    console.error('[Lifecycle] Unhandled rejection:', reason)
    // 不立即退出，只记录
  })
  
  console.log('[Lifecycle] Shutdown handlers registered')
}