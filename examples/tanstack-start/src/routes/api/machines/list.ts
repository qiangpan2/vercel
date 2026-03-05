import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

// GET /api/machines/list
export const Route = createFileRoute('/api/machines/list')({
  server: {
    handlers: {
      GET: async () => {
        try {
          console.log('[API] Fetching servers from SQLite...')
          
          const servers = db.prepare(`
            SELECT 
              id,
              hostname,
              ip,
              ipmi_ip,
	      ssh_user,
              domain_name,
              location,
              model,
              sn,
              bmc_mac,
              cpu_model,
              gpu_arch,
              num_gpus,
              ram,
              disk,
              nic,
              is_exclusive,
              status,
              description
            FROM servers
            ORDER BY hostname
          `).all() as any[]
          
          // 转换为前端需要的格式
          const machines = servers.map(s => ({
            id: String(s.id),  // 前端用字符串 ID
            name: s.hostname,
            description: s.description || `${s.model || 'Server'} - ${s.location || 'Unknown'}`,
            status: s.status || 'available',
            intro: s.description,
            specs: {
              gpu: s.gpu_arch ? `${s.gpu_arch} x${s.num_gpus}` : 'None',
              cpu: s.cpu_model || 'N/A',
              ram: s.ram || 'N/A',
              storage: s.disk || 'N/A',
              network: s.nic || 'N/A'
            },
            maxSharedUsers: s.is_exclusive ? 1 : 4,
            ip: s.ip,
            ipmi_ip: s.ipmi_ip,
	    ssh_user: s.ssh_user,
            location: s.location,
            model: s.model
          }))
          
          console.log('[API] Found servers:', machines.length)
          
          return json({
            success: true,
            servers: machines,
            machines: machines
          })
        } catch (error) {
          console.error('[API] List servers error:', error)
          return json({ 
            success: false,
            error: 'Failed to fetch servers',
            machines: []
          }, { status: 500 })
        }
      }
    }
  }
})
