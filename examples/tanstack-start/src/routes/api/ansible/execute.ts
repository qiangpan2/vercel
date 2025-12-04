import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { executeAnsible } from '../../../lib/utils/execAnsible'

// POST /api/ansible/execute
export const Route = createFileRoute('/api/ansible/execute')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { 
            playbook, 
            targetHost, 
            extraVars,
            userRole 
          } = body
          
          console.log('[API] Ansible execute request:', { playbook, targetHost, userRole })
          
          // 权限检查
          if (userRole !== 'admin') {
            return json({ 
              success: false, 
              error: 'Permission denied. Only admin can execute Ansible.' 
            }, { status: 403 })
          }
          
          // 验证 playbook 名称（防止任意文件执行）
          const allowedPlaybooks = [
            'ping.yml',
            'grant_access.yml',
            'revoke_access.yml',
            'power_control.yml',
            'check_status.yml'
          ]
          
          if (!allowedPlaybooks.includes(playbook)) {
            return json({ 
              success: false, 
              error: `Playbook not allowed: ${playbook}` 
            }, { status: 400 })
          }
          
          // 执行 Ansible
          const result = await executeAnsible(
            playbook,
            extraVars || {},
            targetHost,
            120000 // 2分钟超时
          )
          
          return json({
            success: result.success,
            output: result.output,
            error: result.error,
            exitCode: result.exitCode
          })
        } catch (error) {
          console.error('[API] Ansible execute error:', error)
          return json({ 
            success: false, 
            error: 'Failed to execute Ansible' 
          }, { status: 500 })
        }
      }
    }
  }
})