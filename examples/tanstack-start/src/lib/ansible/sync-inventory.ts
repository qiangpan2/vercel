/**
 * 自动同步 servers 表到 Ansible inventory
 * 每当 servers 表有变化时调用
 */

import fs from 'fs'
import path from 'path'
import db from '../db/booking'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ServerRecord {
  id: number
  hostname: string
  ip: string | null
  ipmi_ip: string | null
  ipmi_password: string | null
  ssh_user: string | null
  status: string
}

// 获取项目根目录
function getProjectRoot(): string {
  // 从当前文件向上查找到项目根目录
  let currentDir = __dirname
  while (currentDir !== '/' && currentDir !== '') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
  }
  return process.cwd()
}

// 从数据库生成 Ansible inventory YAML 内容
function generateInventoryYAML(): string {
  const servers = db.prepare(`
    SELECT 
      id, hostname, ip, ipmi_ip, ipmi_password, ssh_user, status
    FROM servers
    WHERE ip IS NOT NULL AND ip != ''
    ORDER BY hostname
  `).all() as ServerRecord[]

  let yaml = '# Auto-generated from SQLite database\n'
  yaml += '# DO NOT EDIT MANUALLY - Changes will be overwritten\n'
  yaml += `# Generated at: ${new Date().toISOString()}\n`
  yaml += `# Total servers: ${servers.length}\n`
  yaml += '#\n'
  yaml += '# This file is automatically updated when servers are modified via the web UI.\n'
  yaml += '# Manual regeneration: pnpm generate:ansible\n\n'

  yaml += 'all:\n'
  yaml += '  children:\n'
  yaml += '    gpu_servers:\n'
  yaml += '      hosts:\n'

  for (const server of servers) {
    // 跳过 offline 状态的服务器
    if (server.status === 'offline') {
      yaml += `        # ${server.hostname}: skipped (offline)\n`
      continue
    }

    yaml += `        ${server.hostname}:\n`
    yaml += `          ansible_host: ${server.ip}\n`
    yaml += `          ansible_user: ${server.ssh_user || 'admin'}\n`
    yaml += `          ansible_ssh_private_key_file: ~/.ssh/id_rsa\n`

    // IPMI 配置
    if (server.ipmi_ip) {
      yaml += `          ipmi_host: ${server.ipmi_ip}\n`
      yaml += `          ipmi_user: ADMIN\n`
      yaml += `          ipmi_password: "${server.ipmi_password || ''}"\n`
    }

    // 动态生成 access_group
    yaml += `          access_group: machine-access-${server.hostname}\n`
    yaml += '\n'
  }

  return yaml
}

// 同步 inventory 文件
export function syncInventory(): { success: boolean; message: string; serverCount: number } {
  try {
    const projectRoot = getProjectRoot()
    const outputPath = path.join(projectRoot, 'ansible/inventory/hosts.yml')
    console.log(`[Inventory] Syncing inventory to ${outputPath}...`)
    // 确保目录存在
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // 生成并写入
    const yamlContent = generateInventoryYAML()
    fs.writeFileSync(outputPath, yamlContent)

    // 统计服务器数量
    const serverCount = (yamlContent.match(/ansible_host:/g) || []).length

    console.log(`[Inventory] Synced ${serverCount} server(s) to ${outputPath}`)
    
    return {
      success: true,
      message: `Inventory synced: ${serverCount} server(s)`,
      serverCount
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Inventory] Sync failed:', errorMessage)
    
    return {
      success: false,
      message: `Sync failed: ${errorMessage}`,
      serverCount: 0
    }
  }
}

// 异步同步（不阻塞主流程）
export function syncInventoryAsync(): void {
  // 使用 setImmediate 在下一个事件循环执行，不阻塞当前请求
  setImmediate(() => {
    try {
      syncInventory()
    } catch (error) {
      console.error('[Inventory] Async sync failed:', error)
    }
  })
}