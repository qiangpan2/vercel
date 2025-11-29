/**
 * SSO 认证接口
 * 调用现有的 Python SSO 验证程序
 * 
 * 测试模式说明:
 * - 默认情况下启用测试模式（自动通过验证）
 * - 设置环境变量 SSO_TEST_MODE=false 可切换到生产模式（真实 SSO 验证）
 * - 测试模式适用于开发和测试环境
 */

import { spawn } from 'child_process'

export interface SSOUser {
  username: string      // SSO 用户名（如 zhangsan）
  displayName: string   // 显示名称
  email?: string
  groups?: string[]
}

/**
 * 调用 Python SSO 验证程序
 * @param username - 用户名
 * @param password - 密码
 * @returns SSO 用户信息或 null
 */
export async function verifySSOUser(
  username: string, 
  password: string
): Promise<SSOUser | null> {
  
  // 测试模式：默认启用，只有明确设置 SSO_TEST_MODE=false 时才使用真实 SSO 验证
  const testMode = process.env.SSO_TEST_MODE !== 'false'
  
  if (testMode) {
    console.log('[SSO] Test mode enabled - auto-approving user:', username)
    return {
      username,
      displayName: `Test User ${username}`,
      email: `${username}@example.com`,
      groups: ['staff', 'developers']
    }
  }
  
  // 正常 SSO 验证流程
  console.log('[SSO] Production mode - verifying user:', username)
  
  // Python SSO 验证程序路径
  const pythonScript = process.env.SSO_VERIFY_SCRIPT || '/opt/sso/verify.py'
  
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      pythonScript,
      '--username', username,
      '--password', password
    ])
    
    let output = ''
    let error = ''
    
    python.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    python.stderr.on('data', (data) => {
      error += data.toString()
    })
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          // 假设 Python 程序返回 JSON
          const result = JSON.parse(output)
          resolve({
            username: result.username,
            displayName: result.display_name || result.username,
            email: result.email,
            groups: result.groups
          })
        } catch (e) {
          reject(new Error('Invalid SSO response format'))
        }
      } else {
        // 认证失败
        console.error('[SSO] Authentication failed:', error)
        resolve(null)
      }
    })
    
    python.on('error', (err) => {
      console.error('[SSO] Failed to execute Python script:', err)
      reject(err)
    })
  })
}

/**
 * Python SSO 验证程序接口规范
 * 
 * 脚本路径: ${SSO_VERIFY_SCRIPT}
 * 
 * 使用方式:
 * python3 /path/to/verify.py --username zhangsan --password xxxxxx
 * 
 * 成功返回（exit code 0）:
 * {
 *   "username": "zhangsan",
 *   "display_name": "张三",
 *   "email": "zhangsan@example.com",
 *   "groups": ["staff", "developers"]
 * }
 * 
 * 失败返回（exit code 1）:
 * {"error": "Invalid credentials"}
 */

