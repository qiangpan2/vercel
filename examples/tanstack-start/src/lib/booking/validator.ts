/**
 * 预订冲突检查逻辑
 */

import { bookingDB, machineDB, type Booking } from '../db/redis'

export interface ValidationResult {
  canBook: boolean
  reason?: string
  currentCount?: number
}

/**
 * 检查是否可以预订
 */
export async function canBook(
  machineId: string,
  startTime: number,
  endTime: number,
  mode: 'exclusive' | 'shared'
): Promise<ValidationResult> {
  
  // 1. 获取冲突的预订
  const conflicts = await getConflictingBookings(machineId, startTime, endTime)
  
  // 2. 没有冲突，可以预订
  if (conflicts.length === 0) {
    return { canBook: true }
  }
  
  // 3. 如果有任何独占预订，直接拒绝
  const hasExclusive = conflicts.some(b => b.mode === 'exclusive')
  if (hasExclusive) {
    return { 
      canBook: false, 
      reason: '该时间段已被独占预订' 
    }
  }
  
  // 4. 如果要独占，但有其他预订，拒绝
  if (mode === 'exclusive') {
    return { 
      canBook: false, 
      reason: `该时间段已有 ${conflicts.length} 个共享预订` 
    }
  }
  
  // 5. 都是共享模式，检查人数限制
  if (mode === 'shared') {
    const machine = await machineDB.get(machineId)
    if (!machine) {
      return { canBook: false, reason: '机器不存在' }
    }
    
    const currentCount = conflicts.length
    
    if (currentCount >= machine.maxSharedUsers) {
      return { 
        canBook: false, 
        reason: `共享人数已满 (${currentCount}/${machine.maxSharedUsers})`,
        currentCount 
      }
    }
    
    return { 
      canBook: true, 
      currentCount 
    }
  }
  
  return { canBook: false, reason: '未知错误' }
}

/**
 * 获取冲突的预订
 */
export async function getConflictingBookings(
  machineId: string,
  startTime: number,
  endTime: number
): Promise<Booking[]> {
  // 获取该机器的所有预订
  const allBookings = await bookingDB.getByMachine(machineId)
  
  // 过滤出有效状态的预订
  const activeBookings = allBookings.filter(b => 
    b.status === 'active' || b.status === 'pending'
  )
  
  // 过滤出时间重叠的预订
  const conflicts = activeBookings.filter(b => {
    // 检查时间是否重叠
    // 不重叠的条件：b 结束时间 <= 查询开始时间 或 b 开始时间 >= 查询结束时间
    // 重叠的条件：取反
    return !(b.endTime <= startTime || b.startTime >= endTime)
  })
  
  return conflicts
}

