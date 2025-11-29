import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { machineDB } from '~/lib/db/redis'

/**
 * GET /api/machines/list
 * 获取所有机器列表
 */
export const Route = createFileRoute('/api/machines/list')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const machines = await machineDB.getAll()
          
          // 移除敏感信息
          const safeMachines = machines.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            status: m.status,
            intro: m.intro,
            specs: m.specs,
            maxSharedUsers: m.maxSharedUsers,
            ansible_host: m.ansible_host
          }))
          
          return json({
            success: true,
            machines: safeMachines
          })
        } catch (error) {
          console.error('[API] List machines error:', error)
          return json({ 
            error: 'Failed to fetch machines' 
          }, { status: 500 })
        }
      }
    }
  }
})

