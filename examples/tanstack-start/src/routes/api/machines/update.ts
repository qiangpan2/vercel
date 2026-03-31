import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'
import { syncInventoryAsync } from '../../../lib/ansible/sync-inventory'

// POST /api/machines/update
export const Route = createFileRoute('/api/machines/update')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { 
            id,
            hostname, 
            ip, 
            ipmi_ip,
            ipmi_password,
            ssh_user,
            sudo_password,
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
            description,
            userRole
          } = body
          
          console.log('[API] Update machine request:', { id, hostname, userRole })
          
          // 权限检查
          if (userRole !== 'admin') {
            return json({ 
              success: false, 
              error: 'Permission denied. Only admin can modify machines.' 
            }, { status: 403 })
          }
          
          // 验证必填字段
          if (!hostname || hostname.trim() === '') {
            return json({ 
              success: false, 
              error: 'Hostname is required' 
            }, { status: 400 })
          }
          
          if (id) {
            // 更新现有服务器
            const existing = db.prepare('SELECT id FROM servers WHERE id = ?').get(id)
            if (!existing) {
              return json({ success: false, error: 'Server not found' }, { status: 404 })
            }
            
            db.prepare(`
              UPDATE servers SET
                hostname = ?,
                ip = ?,
                ipmi_ip = ?,
                ipmi_password = ?,
                ssh_user = ?,
                sudo_password = ?,
                domain_name = ?,
                location = ?,
                model = ?,
                sn = ?,
                bmc_mac = ?,
                cpu_model = ?,
                gpu_arch = ?,
                num_gpus = ?,
                ram = ?,
                disk = ?,
                nic = ?,
                is_exclusive = ?,
                status = ?,
                description = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              hostname,
              ip || null,
              ipmi_ip || null,
              ipmi_password || null,
              ssh_user || 'admin',
              sudo_password || null,
              domain_name || null,
              location || null,
              model || null,
              sn || null,
              bmc_mac || null,
              cpu_model || null,
              gpu_arch || null,
              num_gpus || 0,
              ram || null,
              disk || null,
              nic || null,
              is_exclusive ? 1 : 0,
              status || 'available',
              description || null,
              id
            )
            
            console.log('[API] Server updated:', id)
            if (!is_exclusive) {
              db.prepare('DELETE FROM booking_permissions WHERE server_id = ?').run(id)
              console.log('[API] Cleared exclusive whitelist for server:', id)
            }
          } else {
            // 创建新服务器
            const existing = db.prepare('SELECT id FROM servers WHERE hostname = ?').get(hostname)
            if (existing) {
              return json({ 
                success: false, 
                error: 'Server with this hostname already exists' 
              }, { status: 400 })
            }
            
            db.prepare(`
              INSERT INTO servers (
                hostname, ip, ipmi_ip, ipmi_password, ssh_user, sudo_password, 
                domain_name, location, model, sn, bmc_mac,
                cpu_model, gpu_arch, num_gpus, ram, disk, nic,
                is_exclusive, status, description
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              hostname,
              ip || null,
              ipmi_ip || null,
              ipmi_password || null,
              ssh_user || 'admin',
              sudo_password || null,
              domain_name || null,
              location || null,
              model || null,
              sn || null,
              bmc_mac || null,
              cpu_model || null,
              gpu_arch || null,
              num_gpus || 0,
              ram || null,
              disk || null,
              nic || null,
              is_exclusive ? 1 : 0,
              status || 'available',
              description || null
            )
            
            console.log('[API] Server created:', hostname)
          }
          
          // ✅ 自动同步到 Ansible inventory（异步，不阻塞响应）
          syncInventoryAsync()
          
          return json({ 
            success: true, 
            message: id ? 'Server updated successfully' : 'Server created successfully'
          })
        } catch (error) {
          console.error('[API] Update machine error:', error)
          return json({ 
            success: false, 
            error: 'Failed to update server' 
          }, { status: 500 })
        }
      }
    }
  }
})
