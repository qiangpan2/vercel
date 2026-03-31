// import { createFileRoute } from '@tanstack/react-router'
// import { json } from '@tanstack/react-start'
// import db from '../../../lib/db/booking'

// export const Route = createFileRoute('/api/machines/exclusive-users')({
//   server: {
//     handlers: {
//       // 获取某台机器的白名单用户
//       GET: async ({ request }) => {
//         try {
//           const url = new URL(request.url)
//           const serverId = url.searchParams.get('server_id')
//           const search = url.searchParams.get('search')
          
//           // 搜索用户（用于自动补全）
//           // GET /api/machines/exclusive-users?search=xxx
//           if (search !== null) {
//             let users
//             if (search.length >= 1) {
//               users = db.prepare(
//                 'SELECT ntid, display_name, email FROM users WHERE ntid LIKE ? OR display_name LIKE ? LIMIT 20'
//               ).all(`%${search}%`, `%${search}%`)
//             } else {
//               users = db.prepare(
//                 'SELECT ntid, display_name, email FROM users LIMIT 50'
//               ).all()
//             }
//             return json({ success: true, users })
//           }

//           // 获取白名单
//           // GET /api/machines/exclusive-users?server_id=xxx
//           if (!serverId) {
//             return json({ success: false, error: 'server_id is required' }, { status: 400 })
//           }
          
//           const users = db.prepare(
//             'SELECT id, ntid, added_by, can_book, can_manage, created_at FROM booking_permissions WHERE server_id = ?'
//           ).all(Number(serverId))
          
//           return json({ success: true, users })
//         } catch (error) {
//           console.error('[API] Get exclusive users error:', error)
//           return json({ success: false, error: 'Failed to get exclusive users' }, { status: 500 })
//         }
//       },

//       // 添加/删除白名单用户
//       POST: async ({ request }) => {
//         try {
//           const body = await request.json()
//           const { server_id, ntid, action, userRole, adminUser, can_book, can_manage } = body
          
//           // 权限检查：只有 admin 可以操作
//           if (userRole !== 'admin') {
//             return json({ 
//               success: false, 
//               error: 'Permission denied. Only admin can manage exclusive users.' 
//             }, { status: 403 })
//           }
          
//           if (!server_id || !ntid) {
//             return json({ 
//               success: false, 
//               error: 'server_id and ntid are required' 
//             }, { status: 400 })
//           }

//           // 验证机器是否是 exclusive 模式
//           const server = db.prepare(
//             'SELECT id, is_exclusive FROM servers WHERE id = ?'
//           ).get(Number(server_id)) as { id: number; is_exclusive: number } | undefined
          
//           if (!server) {
//             return json({ success: false, error: 'Server not found' }, { status: 404 })
//           }
          
//           if (!server.is_exclusive) {
//             return json({ 
//               success: false, 
//               error: 'Server is not in exclusive mode. Whitelist only applies to exclusive machines.' 
//             }, { status: 400 })
//           }

//           if (action === 'remove') {
//             db.prepare(
//               'DELETE FROM booking_permissions WHERE server_id = ? AND ntid = ?'
//             ).run(Number(server_id), ntid)
            
//             return json({ success: true, message: `User ${ntid} removed from whitelist` })
//           } else if (action === 'update') {
//             // 更新权限
//             db.prepare(
//               'UPDATE booking_permissions SET can_book = ?, can_manage = ?, updated_at = CURRENT_TIMESTAMP WHERE server_id = ? AND ntid = ?'
//             ).run(can_book ? 1 : 0, can_manage ? 1 : 0, Number(server_id), ntid)
            
//             return json({ success: true, message: `User ${ntid} permissions updated` })
//           } else {
//             // 默认 action 是添加
//             const existingUsers = db.prepare('SELECT DISTINCT ntid FROM bookings').all() as { ntid: string }[]
//             const knownNtids = existingUsers.map(u => u.ntid)
            
//             db.prepare(
//               'INSERT OR IGNORE INTO booking_permissions (server_id, ntid, added_by, can_book, can_manage) VALUES (?, ?, ?, ?, ?)'
//             ).run(Number(server_id), ntid, adminUser || 'admin', can_book ? 1 : 0, can_manage ? 1 : 0)
            
//             return json({ 
//               success: true, 
//               message: `User ${ntid} added to whitelist`,
//               knownUser: knownNtids.includes(ntid)
//             })
//           }
//         } catch (error) {
//           console.error('[API] Manage exclusive users error:', error)
//           return json({ success: false, error: 'Failed to manage exclusive users' }, { status: 500 })
//         }
//       }
//     }
//   }
// })
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

export const Route = createFileRoute('/api/machines/exclusive-users')({
  server: {
    handlers: {
      // 获取某台机器的白名单用户
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const serverId = url.searchParams.get('server_id')
          const search = url.searchParams.get('search')
          
          // 搜索用户（用于自动补全）
          if (search !== null) {
            let users
            if (search.length >= 1) {
              users = db.prepare(
                'SELECT ntid, display_name, email FROM users WHERE ntid LIKE ? OR display_name LIKE ? LIMIT 20'
              ).all(`%${search}%`, `%${search}%`)
            } else {
              users = db.prepare(
                'SELECT ntid, display_name, email FROM users LIMIT 50'
              ).all()
            }
            return json({ success: true, users })
          }

          // 获取白名单
          if (!serverId) {
            return json({ success: false, error: 'server_id is required' }, { status: 400 })
          }
          
          const users = db.prepare(
            'SELECT id, ntid, added_by, can_book, can_manage, created_at FROM booking_permissions WHERE server_id = ?'
          ).all(Number(serverId))
          
          return json({ success: true, users })
        } catch (error) {
          console.error('[API] Get exclusive users error:', error)
          return json({ success: false, error: 'Failed to get exclusive users' }, { status: 500 })
        }
      },

      // 添加/删除白名单用户
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { server_id, ntid, action, userRole, adminUser, can_book, can_manage } = body
          
          // 权限检查：只有 admin 可以操作
          if (userRole !== 'admin') {
            return json({ 
              success: false, 
              error: 'Permission denied. Only admin can manage exclusive users.' 
            }, { status: 403 })
          }
          
          if (!server_id || !ntid) {
            return json({ 
              success: false, 
              error: 'server_id and ntid are required' 
            }, { status: 400 })
          }

          // 验证机器是否存在（不再强制检查 is_exclusive）
          const server = db.prepare(
            'SELECT id, is_exclusive FROM servers WHERE id = ?'
          ).get(Number(server_id)) as { id: number; is_exclusive: number } | undefined
          
          if (!server) {
            return json({ success: false, error: 'Server not found' }, { status: 404 })
          }
          
          // 仅警告，不阻止操作。
          // 前端可能正在编辑中还未保存 is_exclusive，
          // 白名单数据先写入，server 保存时会一起生效。
          const exclusiveWarning = !server.is_exclusive 
            ? ' (Note: server is not yet in exclusive mode, whitelist will take effect once saved as exclusive)' 
            : ''

          if (action === 'remove') {
            db.prepare(
              'DELETE FROM booking_permissions WHERE server_id = ? AND ntid = ?'
            ).run(Number(server_id), ntid)
            
            return json({ success: true, message: `User ${ntid} removed from whitelist${exclusiveWarning}` })
          } else if (action === 'update') {
            db.prepare(
              'UPDATE booking_permissions SET can_book = ?, can_manage = ?, updated_at = CURRENT_TIMESTAMP WHERE server_id = ? AND ntid = ?'
            ).run(can_book ? 1 : 0, can_manage ? 1 : 0, Number(server_id), ntid)
            
            return json({ success: true, message: `User ${ntid} permissions updated${exclusiveWarning}` })
          } else {
            // 默认 action 是添加
            const existingUsers = db.prepare('SELECT DISTINCT ntid FROM bookings').all() as { ntid: string }[]
            const knownNtids = existingUsers.map(u => u.ntid)
            
            db.prepare(
              'INSERT OR IGNORE INTO booking_permissions (server_id, ntid, added_by, can_book, can_manage) VALUES (?, ?, ?, ?, ?)'
            ).run(Number(server_id), ntid, adminUser || 'admin', can_book ? 1 : 0, can_manage ? 1 : 0)
            
            return json({ 
              success: true, 
              message: `User ${ntid} added to whitelist${exclusiveWarning}`,
              knownUser: knownNtids.includes(ntid)
            })
          }
        } catch (error) {
          console.error('[API] Manage exclusive users error:', error)
          return json({ success: false, error: 'Failed to manage exclusive users' }, { status: 500 })
        }
      }
    }
  }
})