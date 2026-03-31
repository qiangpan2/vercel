/**
 * 权限管理 Worker
 * 处理用户访问权限的授予和撤销
 * 
 * 启动方式:
 * npx tsx src/workers/permission-worker.ts
 */

import { Worker } from 'bullmq'
import { getRedis, bookingDB } from '../lib/db/redis'
import { executeAnsible } from '../lib/utils/exec'
import type { PermissionTask } from '../lib/queues/permission'

console.log('🚀 Starting Permission Worker...')

const worker = new Worker<PermissionTask>(
  'permission-tasks',
  async (job) => {
    const { action, bookingId, machineId, ssoUsername, accessGroup } = job.data
    
    console.log(`\n📝 Processing Job ${job.id}`)
    console.log(`   Action: ${action}`)
    console.log(`   Machine: ${machineId}`)
    console.log(`   User: ${ssoUsername}`)
    console.log(`   Group: ${accessGroup}`)
    
    const startTime = Date.now()
    
    try {
      if (action === 'grant') {
        // 执行授权 Playbook
        const result = await executeAnsible(
          'ansible/playbooks/grant_access.yml',
          {
            target_machine: machineId,
            sso_username: ssoUsername,
            ntid: ssoUsername, // 假设 NTID 与 SSO 用户名相同
            access_group: accessGroup
          }
        )
        
        if (!result.success) {
          throw new Error(`Ansible failed: ${result.error}`)
        }
        
        // 更新预订状态
        await bookingDB.update(bookingId, {
          status: 'active',
          accessGrantedAt: Date.now()
        })
        
        const duration = Date.now() - startTime
        console.log(`✅ Job ${job.id} completed in ${duration}ms`)
        console.log(`   Access granted: ${ssoUsername} → ${machineId}`)
        
        return {
          success: true,
          output: result.output,
          duration
        }
        
      } else if (action === 'revoke') {
        // 执行撤销 Playbook
        const result = await executeAnsible(
          'ansible/playbooks/revoke_access.yml',
          {
            target_machine: machineId,
            sso_username: ssoUsername,
            ntid: ssoUsername, // 假设 NTID 与 SSO 用户名相同
            access_group: accessGroup
          }
        )
        
        if (!result.success) {
          throw new Error(`Ansible failed: ${result.error}`)
        }
        
        // 更新预订状态
        await bookingDB.update(bookingId, {
          status: 'expired'
        })
        
        const duration = Date.now() - startTime
        console.log(`✅ Job ${job.id} completed in ${duration}ms`)
        console.log(`   Access revoked: ${ssoUsername} → ${machineId}`)
        
        return {
          success: true,
          output: result.output,
          duration
        }
      }
      
      throw new Error(`Unknown action: ${action}`)
      
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error)
      throw error
    }
  },
  {
    connection: getRedis(),
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 3,
    limiter: {
      max: 10,
      duration: 1000
    }
  }
)

// Worker 事件监听
worker.on('completed', (job, result) => {
  console.log(`\n✅ Job ${job.id} completed successfully`)
  console.log(`   Duration: ${result.duration}ms`)
})

worker.on('failed', (job, error) => {
  console.error(`\n❌ Job ${job?.id} failed:`, error.message)
  if (job) {
    console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts}`)
  }
})

worker.on('active', (job) => {
  console.log(`\n⚡ Job ${job.id} started`)
})

worker.on('error', (error) => {
  console.error('\n❌ Worker error:', error)
})

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, closing worker...')
  await worker.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, closing worker...')
  await worker.close()
  process.exit(0)
})

console.log('✅ Permission Worker is running and waiting for jobs...\n')

