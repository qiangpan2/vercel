/**
 * 权限管理任务队列
 */

import { Queue } from 'bullmq'
import { getRedis } from '../db/redis'

// 任务数据类型
export interface PermissionTask {
  action: 'grant' | 'revoke'
  bookingId: string
  machineId: string
  ssoUsername: string
  accessGroup: string
  endTime?: number
}

// 创建权限任务队列
export const permissionQueue = new Queue<PermissionTask>('permission-tasks', {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,  // 失败后重试 3 次
    backoff: {
      type: 'exponential',
      delay: 2000  // 初始延迟 2 秒，指数增长
    },
    removeOnComplete: {
      age: 24 * 3600,  // 保留完成的任务 24 小时
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 3600  // 保留失败的任务 7 天
    }
  }
})

/**
 * 添加授权任务
 */
export async function addGrantAccessTask(task: Omit<PermissionTask, 'action'>) {
  return await permissionQueue.add(
    'grant-access',
    {
      ...task,
      action: 'grant'
    },
    {
      priority: 1  // 高优先级
    }
  )
}

/**
 * 添加撤销任务
 */
export async function addRevokeAccessTask(task: Omit<PermissionTask, 'action' | 'endTime'>) {
  return await permissionQueue.add(
    'revoke-access',
    {
      ...task,
      action: 'revoke'
    },
    {
      priority: 2  // 中等优先级
    }
  )
}

