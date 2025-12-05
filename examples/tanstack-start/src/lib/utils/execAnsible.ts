import { spawn } from 'child_process'
import path from 'path'
// import { exitCode } from 'process'

export interface ExecResult {
  success: boolean
  output: string
  error: string
  exitCode: number
}

// 获取 Ansible 文件路径
function getAnsiblePath(relativePath: string): string {
  return path.join(process.cwd(), 'ansible', relativePath)
}

// 执行 Ansible Playbook
export async function executeAnsible(
  playbookName: string,
  extraVars: Record<string, string>,
  targetHost?: string,
  timeout: number = 60000
): Promise<ExecResult> {
  return new Promise((resolve) => {
    //const inventoryPath = process.env.ANSIBLE_INVENTORY_PATH || './ansible/inventory/hosts.yml'
    const playbookPath = getAnsiblePath(`playbooks/${playbookName}`)
    const inventoryPath = getAnsiblePath('inventory/hosts.yml')

    const args = ['-i', inventoryPath, playbookPath,]
    
    // 添加额外变量
    for (const [key, value] of Object.entries(extraVars)) {
      args.push('-e', `${key}=${value}`)
    }

    // 添加目标主机限制
    if (targetHost) {
      args.push('--limit', targetHost)
    }

    console.log(`[Ansible] Executing: ansible-playbook ${args.join(' ')}`)
    
    const proc = spawn('ansible-playbook', args, {
      cwd: process.cwd(),
      env: { ...process.env }
    })
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString()
      console.log(`[Ansible stdout] ${data}`)
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error(`[Ansible stderr] ${data}`)
    })
    
    // 添加超时处理
    const timer = setTimeout(() => {
      proc.kill()
      resolve({ success: false, output: stdout, error: 'Timeout', exitCode: -1 })
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ success: true, output: stdout, error: '', exitCode: 0 })
      } else {
        resolve({ success: false, output: stdout, error: stderr, exitCode: code || -1 })
      }
    })
    
    proc.on('error', (err) => {
      clearTimeout(timer)
      console.error(`[Ansible] Process error:`, err)
      resolve({ success: false, output: '', error: err.message, exitCode: -1 })
    })
  })
}

// 添加白名单
export async function grantUserAccess(
  targetHost: string,
  username: string
): Promise<ExecResult> {
  return executeAnsible(
    'grant_access.yml',
    { ntid: username, target_machine: targetHost },
    targetHost
  )
}

// 移除白名单
export async function revokeUserAccess(
  targetHost: string,
  username: string
): Promise<ExecResult> {
  return executeAnsible(
    'revoke_access.yml',
    { ntid: username, target_machine: targetHost },
    targetHost
  )
}