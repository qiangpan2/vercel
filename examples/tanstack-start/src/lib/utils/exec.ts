/**
 * 命令执行工具
 */

import { spawn } from 'child_process'

export interface ExecResult {
  success: boolean
  output: string
  error: string
  exitCode: number
}

/**
 * 执行命令
 */
export async function execCommand(
  command: string,
  args: string[],
  timeout: number = 30000
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args)
    
    let output = ''
    let error = ''
    
    // 设置超时
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM')
      setTimeout(() => {
        proc.kill('SIGKILL')
      }, 5000)
    }, timeout)
    
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    proc.stderr.on('data', (data) => {
      error += data.toString()
    })
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        success: code === 0,
        output,
        error,
        exitCode: code || 0
      })
    })
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      resolve({
        success: false,
        output: '',
        error: err.message,
        exitCode: -1
      })
    })
  })
}

/**
 * 执行 Ansible Playbook
 */
export async function executeAnsible(
  playbookPath: string,
  extraVars: Record<string, string>,
  timeout: number = 60000
): Promise<ExecResult> {
  const inventoryPath = process.env.ANSIBLE_INVENTORY_PATH || './ansible/inventory/hosts.yml'
  
  const args = [
    '-i', inventoryPath,
    playbookPath,
  ]
  
  // 添加额外变量
  for (const [key, value] of Object.entries(extraVars)) {
    args.push('-e', `${key}=${value}`)
  }
  
  console.log(`[Ansible] Executing: ansible-playbook ${args.join(' ')}`)
  
  return execCommand('ansible-playbook', args, timeout)
}

