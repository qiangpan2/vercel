// /**
//  * 从 machines.json 生成 Ansible inventory
//  * 运行: bun run generate:ansible
//  */

// import fs from 'fs'
// import path from 'path'
// import { fileURLToPath } from 'url'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// // 读取配置文件
// const configPath = path.join(__dirname, 'machines.json')
// const configContent = fs.readFileSync(configPath, 'utf-8')
// const config = JSON.parse(configContent)

// // 生成 YAML 内容（手动格式化，避免依赖 js-yaml）
// function generateYAML(config: any): string {
//   let yaml = '# Auto-generated from scripts/machines.json\n'
//   yaml += '# DO NOT EDIT MANUALLY\n'
//   yaml += `# Generated at: ${new Date().toISOString()}\n`
//   yaml += `# Version: ${config.version}\n`
//   yaml += '#\n'
//   yaml += '# To update this file:\n'
//   yaml += '#   1. Edit scripts/machines.json\n'
//   yaml += '#   2. Run: bun run generate:ansible\n\n'
  
//   yaml += 'all:\n'
//   yaml += '  children:\n'
//   yaml += '    gpu_servers:\n'
//   yaml += '      hosts:\n'
  
//   for (const machine of config.machines) {
//     yaml += `        ${machine.id}:\n`
//     yaml += `          ansible_host: ${machine.ansible.host}\n`
//     yaml += `          ansible_user: ${machine.ansible.user}\n`
//     yaml += `          ansible_ssh_private_key_file: ${machine.ansible.ssh_key}\n`
//     yaml += `          ipmi_host: ${machine.ipmi.host}\n`
//     yaml += `          ipmi_user: ${machine.ipmi.user}\n`
//     yaml += `          ipmi_password: ${machine.ipmi.password}\n`
//     yaml += `          access_group: ${machine.access_group}\n`
//     yaml += '\n'
//   }
  
//   return yaml
// }

// // 生成并写入文件
// const yamlContent = generateYAML(config)
// const outputPath = path.join(__dirname, '../ansible/inventory/hosts.yml')

// // 确保目录存在
// const outputDir = path.dirname(outputPath)
// if (!fs.existsSync(outputDir)) {
//   fs.mkdirSync(outputDir, { recursive: true })
// }

// fs.writeFileSync(outputPath, yamlContent)

// console.log('✅ Generated Ansible inventory successfully!')
// console.log(`📁 Output: ansible/inventory/hosts.yml`)
// console.log(`📊 Configured ${config.machines.length} machines:`)

// for (const machine of config.machines) {
//   console.log(`   - ${machine.name} (${machine.ansible.host})`)
// }

// console.log('\n💡 Next step: Run "bun run seed:machines" to update Redis')


/**
 * 从 SQLite 数据库生成 Ansible inventory
 * 运行: bun run generate:ansible
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 数据库路径
const dbPath = path.join(__dirname, '../data/booking.db')

// 检查数据库是否存在
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database not found:', dbPath)
  console.error('   Please run the application first to initialize the database.')
  process.exit(1)
}

// 连接数据库
const db = new Database(dbPath, { readonly: true })

interface ServerRecord {
  id: number
  hostname: string
  ip: string | null
  ipmi_ip: string | null
  ipmi_password: string | null
  ssh_user: string | null
  status: string
}

// 从数据库读取服务器
function getServersFromDB(): ServerRecord[] {
  const servers = db.prepare(`
    SELECT 
      id,
      hostname,
      ip,
      ipmi_ip,
      ipmi_password,
      ssh_user,
      status
    FROM servers
    WHERE ip IS NOT NULL AND ip != ''
    ORDER BY hostname
  `).all() as ServerRecord[]
  
  return servers
}

// 生成 YAML 内容
function generateYAML(servers: ServerRecord[]): string {
  let yaml = '# Auto-generated from SQLite database (data/booking.db)\n'
  yaml += '# DO NOT EDIT MANUALLY\n'
  yaml += `# Generated at: ${new Date().toISOString()}\n`
  yaml += `# Total servers: ${servers.length}\n`
  yaml += '#\n'
  yaml += '# To regenerate this file:\n'
  yaml += '#   Run: bun run generate:ansible\n'
  yaml += '#\n'
  yaml += '# To update server data:\n'
  yaml += '#   Use the web UI at /machines\n\n'
  
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
    
    // IPMI 配置（如果有）
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

// 主函数
function main() {
  console.log('🔍 Reading servers from database...')
  console.log(`   Database: ${dbPath}\n`)
  
  const servers = getServersFromDB()
  
  if (servers.length === 0) {
    console.warn('⚠️  No servers found in database!')
    console.warn('   Add servers via the web UI at /machines')
    process.exit(0)
  }
  
  // 生成 YAML
  const yamlContent = generateYAML(servers)
  
  // 输出路径
  const outputPath = path.join(__dirname, '../ansible/inventory/hosts.yml')
  
  // 确保目录存在
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  // 写入文件
  fs.writeFileSync(outputPath, yamlContent)
  
  // 输出结果
  console.log('✅ Generated Ansible inventory successfully!')
  console.log(`📁 Output: ansible/inventory/hosts.yml`)
  console.log(`📊 Configured ${servers.length} server(s):\n`)
  
  for (const server of servers) {
    const status = server.status === 'offline' ? '⏸️ (skipped)' : '✓'
    const ipmi = server.ipmi_ip ? `IPMI: ${server.ipmi_ip}` : 'No IPMI'
    console.log(`   ${status} ${server.hostname}`)
    console.log(`      IP: ${server.ip} | ${ipmi}`)
  }
  
  console.log('\n💡 Tip: Run "ansible all -m ping -i ansible/inventory/hosts.yml" to test connectivity')
}

// 执行
try {
  main()
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
} finally {
  db.close()
}