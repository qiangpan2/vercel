/**
 * 初始化机器数据到 Redis
 * 运行: pnpm seed:machines
 * 
 * 从 machines.json 读取配置，初始化到 Redis
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { machineDB, type Machine } from '../src/lib/db/redis'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 读取配置文件
const configPath = path.join(__dirname, 'machines.json')
const configContent = fs.readFileSync(configPath, 'utf-8')
const config = JSON.parse(configContent)

// 转换为 Redis Machine 格式
const machines: Machine[] = config.machines.map((m: any) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  status: m.status,
  specs: m.specs,
  maxSharedUsers: m.maxSharedUsers,
  ansible_host: m.ansible.host,
  ansible_user: m.ansible.user,
  ipmi_host: m.ipmi.host,
  ipmi_user: m.ipmi.user,
  ipmi_password: m.ipmi.password,
  access_group: m.access_group
}))

async function seed() {
  console.log('🌱 Seeding machines to Redis from machines.json...\n')
  console.log(`📁 Config file: ${configPath}`)
  console.log(`📊 Version: ${config.version}`)
  console.log(`📅 Last updated: ${config.lastUpdated}\n`)
  
  for (const machine of machines) {
    await machineDB.set(machine)
    console.log(`✅ Added: ${machine.name} (${machine.description})`)
    console.log(`   └─ Ansible: ${machine.ansible_host}`)
    console.log(`   └─ IPMI: ${machine.ipmi_host}`)
  }
  
  console.log(`\n✅ Successfully seeded ${machines.length} machines to Redis!`)
  console.log('\nYou can now start the application and workers.')
  console.log('💡 Tip: Run "pnpm generate:ansible" to update Ansible inventory')
  
  process.exit(0)
}

seed().catch(error => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})
