/**
 * 从 machines.json 生成 Ansible inventory
 * 运行: pnpm generate:ansible
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 读取配置文件
const configPath = path.join(__dirname, 'machines.json')
const configContent = fs.readFileSync(configPath, 'utf-8')
const config = JSON.parse(configContent)

// 生成 YAML 内容（手动格式化，避免依赖 js-yaml）
function generateYAML(config: any): string {
  let yaml = '# Auto-generated from scripts/machines.json\n'
  yaml += '# DO NOT EDIT MANUALLY\n'
  yaml += `# Generated at: ${new Date().toISOString()}\n`
  yaml += `# Version: ${config.version}\n`
  yaml += '#\n'
  yaml += '# To update this file:\n'
  yaml += '#   1. Edit scripts/machines.json\n'
  yaml += '#   2. Run: pnpm generate:ansible\n\n'
  
  yaml += 'all:\n'
  yaml += '  children:\n'
  yaml += '    gpu_servers:\n'
  yaml += '      hosts:\n'
  
  for (const machine of config.machines) {
    yaml += `        ${machine.id}:\n`
    yaml += `          ansible_host: ${machine.ansible.host}\n`
    yaml += `          ansible_user: ${machine.ansible.user}\n`
    yaml += `          ansible_ssh_private_key_file: ${machine.ansible.ssh_key}\n`
    yaml += `          ipmi_host: ${machine.ipmi.host}\n`
    yaml += `          ipmi_user: ${machine.ipmi.user}\n`
    yaml += `          ipmi_password: ${machine.ipmi.password}\n`
    yaml += `          access_group: ${machine.access_group}\n`
    yaml += '\n'
  }
  
  return yaml
}

// 生成并写入文件
const yamlContent = generateYAML(config)
const outputPath = path.join(__dirname, '../ansible/inventory/hosts.yml')

// 确保目录存在
const outputDir = path.dirname(outputPath)
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

fs.writeFileSync(outputPath, yamlContent)

console.log('✅ Generated Ansible inventory successfully!')
console.log(`📁 Output: ansible/inventory/hosts.yml`)
console.log(`📊 Configured ${config.machines.length} machines:`)

for (const machine of config.machines) {
  console.log(`   - ${machine.name} (${machine.ansible.host})`)
}

console.log('\n💡 Next step: Run "pnpm seed:machines" to update Redis')

