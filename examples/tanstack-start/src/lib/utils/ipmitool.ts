import { spawn } from 'child_process'

export interface IPMIResult {
  success: boolean
  output: string
  error?: string
}

async function runIPMI(
  host: string,
  user: string,
  password: string,
  command: string[]
): Promise<IPMIResult> {
  return new Promise((resolve) => {
    const args = [
      '-I', 'lanplus',
      '-H', host,
      '-U', user,
      '-P', password,
      ...command
    ]
    
    // 日志中隐藏密码
    console.log(`[IPMI] Running: ipmitool -I lanplus -H ${host} -U ${user} -P *** ${command.join(' ')}`)
    
    const proc = spawn('ipmitool', args)
    
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (data) => { 
      stdout += data.toString() 
    })
    proc.stderr.on('data', (data) => { 
      stderr += data.toString() 
    })
    
    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout.trim(),
        error: code !== 0 ? stderr : undefined
      })
    })
    
    proc.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: `Failed to run ipmitool: ${err.message}`
      })
    })
  })
}

export async function powerOn(host: string, user: string, password: string): Promise<IPMIResult> {
  return runIPMI(host, user, password, ['power', 'on'])
}

export async function powerOff(host: string, user: string, password: string): Promise<IPMIResult> {
  return runIPMI(host, user, password, ['power', 'off'])
}

export async function powerStatus(host: string, user: string, password: string): Promise<IPMIResult> {
  return runIPMI(host, user, password, ['power', 'status'])
}

export async function powerCycle(host: string, user: string, password: string): Promise<IPMIResult> {
  return runIPMI(host, user, password, ['power', 'cycle'])
}

export async function powerReset(host: string, user: string, password: string): Promise<IPMIResult> {
  return runIPMI(host, user, password, ['power', 'reset'])
}