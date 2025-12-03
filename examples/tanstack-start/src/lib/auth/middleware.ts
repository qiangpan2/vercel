import { authenticateWithLDAP, getUserByNtid } from './ldap_auth';
import type { User } from '../db/booking';

// 重新导出 User 类型供外部使用
export type { User };

export interface AuthUser {
  ntid: string;
  displayName: string;
  email?: string;
  role: 'viewer' | 'developer' | 'admin';
  timezone: string;
}

/**
 * 登录 API
 * 使用 LDAP 进行身份验证
 */
export async function login(ntid: string, password: string): Promise<AuthUser> {
  // test 模式下自动通过认证
  const testMode = process.env.AUTH_TEST_MODE === 'true';
  console.log('[Auth] Login attempt for NTID:', ntid, 'Test mode:', testMode);
  if (testMode) {
    console.log('[Auth] Test mode enabled - auto-approving user:', ntid);
    return {
      ntid,
      displayName: `Test User ${ntid}`,
      email: `${ntid}@amd.com`,
      role: ntid === 'admin' ? 'admin' : 'developer',
      timezone: 'UTC',
    };
  }

  // 正常进行 LDAP 认证
  const result = await authenticateWithLDAP(ntid, password);
  
  if (!result.success || !result.user) {
    throw new Error(result.error || 'Authentication failed');
  }
  
  const user = result.user;
  
  return {
    ntid: user.ntid,
    displayName: user.display_name || user.ntid,
    email: user.email || `${user.ntid}@amd.com`,
    role: user.user_level,
    timezone: user.timezone,
  };
}

// 获取当前用户信息
export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  // 从 cookie 中获取 session
  const cookie = request.headers.get('cookie') || '';
  const sessionId = cookie.match(/rapid_session=([^;]+)/)?.[1];
  
  if (!sessionId) {
    return null;
  }
  
  // 验证 session
  const { validateSession } = await import('./session');
  const user = validateSession(sessionId);
  
  if (!user) {
    return null;
  }
  
  return {
    ntid: user.ntid,
    displayName: user.display_name || user.ntid,
    email: user.email || undefined,
    role: user.user_level,
    timezone: user.timezone,
  };
}

// 检查用户权限
export function hasPermission(user: AuthUser | null, requiredLevel: 'viewer' | 'developer' | 'admin'): boolean {
  if (!user) return false;
  
  const levels = { viewer: 0, developer: 1, admin: 2 };
  return levels[user.role] >= levels[requiredLevel];
}

// 判断管理员权限
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin';
}

// 判断是否可以预定
export function canBook(user: AuthUser | null): boolean {
  return hasPermission(user, 'developer');
}