/**
 * 用户认证中间件
 * 提供登录验证和会话管理功能
 */

import { verifySSOUser } from './sso-verify'

export interface AuthUser {
  username: string      // SSO 用户名
  displayName: string   // 显示名称
  email?: string
  role: 'admin' | 'user'
}

/**
 * 登录 API
 * 调用 Python SSO 验证程序进行身份验证
 */
export async function login(username: string, password: string): Promise<AuthUser> {
  // 调用 Python SSO 验证
  const ssoUser = await verifySSOUser(username, password)
  
  if (!ssoUser) {
    throw new Error('Invalid credentials')
  }
  
  // 确定用户角色 (简单实现：root 用户为管理员)
  const role: 'admin' | 'user' = username === 'root' ? 'admin' : 'user'
  
  // 创建会话，存储用户名
  return {
    username: ssoUser.username,      // SSO 用户名
    displayName: ssoUser.displayName,
    email: ssoUser.email,
    role
  }
}

/**
 * 从请求中获取当前用户
 * 注意：这是一个简化版本，实际生产环境应该使用会话/Cookie/JWT
 */
export async function getCurrentUser(_request: Request): Promise<AuthUser | null> {
  // TODO: 在实际生产环境中，这里应该从会话/Cookie/JWT 中获取用户信息
  // 目前作为示例，返回 null，前端使用 localStorage
  
  // 示例实现（需要根据实际会话管理方案调整）:
  // const session = await getSession(_request)
  // if (!session?.username) {
  //   return null
  // }
  // return {
  //   username: session.username,  // SSO 用户名
  //   displayName: session.displayName,
  //   email: session.email,
  //   role: session.role
  // }
  
  return null
}

/**
 * 验证用户是否为管理员
 */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin'
}

