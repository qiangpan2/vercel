/**
 * IPMI 控制任务队列
 */

import { Queue } from 'bullmq'
import { getRedis } from '../db/redis'

// 任务数据类型
export interface IPMITask {
  action: 'power_on' | 'power_off' | 'reboot' | 'status' | 'sensors' | 'event_log'
  machineId: string
  operator: string  // 操作者用户名
}

// 创建 IPMI 任务队列
export const ipmiQueue = new Queue<IPMITask>('ipmi-tasks', {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,  // 失败后重试 2 次
    timeout: 10000,  // IPMI 命令 10 秒超时
    backoff: {
      type: 'fixed',
      delay: 1000
    },
    removeOnComplete: {
      age: 3600,  // 保留 1 小时
      count: 500
    },
    removeOnFail: {
      age: 24 * 3600
    }
  }
})

/**
 * 添加 IPMI 控制任务
 */
export async function addIPMITask(task: IPMITask) {
  return await ipmiQueue.add(
    `ipmi-${task.action}`,
    task,
    {
      priority: task.action === 'status' ? 1 : 2  // 状态查询高优先级
    }
  )
}

