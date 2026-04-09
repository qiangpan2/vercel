import { authenticateWithLDAP, getUserByNtid, normalizeNtid } from './ldap_auth';
import db from '../db/booking';
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

// 自定义错误类型，携带用户审批状态
export class AuthApprovalError extends Error {
  userStatus: string;
  constructor(message: string, userStatus: string) {
    super(message);
    this.name = 'AuthApprovalError';
    this.userStatus = userStatus;
  }
}

/**
 * 检查 NTID 用户的审批状态
 * - 不存在：不创建记录（让 LDAP 认证成功后再创建），但需要特殊处理
 * - pending / rejected / revoked：抛出 AuthApprovalError
 * - approved：放行
 */
function checkUserApproval(ntid: string): void {
  const user = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User | undefined;

  if (!user) {
    // 用户不存在，暂时放行 → LDAP 验证成功后 createOrUpdateUser 会建 pending 记录
    // 但 LDAP 成功后我们还需要再检查一次（因为新建的是 pending）
    return;
  }

  switch (user.status) {
    case 'approved':
      return; // 放行
    case 'pending':
      throw new AuthApprovalError(
        'Your account is pending approval. Please contact an administrator.',
        'pending'
      );
    case 'rejected':
      throw new AuthApprovalError(
        'Your account request has been rejected. Please contact an administrator.',
        'rejected'
      );
    case 'revoked':
      throw new AuthApprovalError(
        'Your account has been revoked. Please contact an administrator.',
        'revoked'
      );
    default:
      throw new AuthApprovalError(
        'Unknown account status. Please contact an administrator.',
        user.status
      );
  }
}

/**
 * 登录 API
 * 使用 LDAP 进行身份验证
 */
export async function login(ntid: string, password: string): Promise<AuthUser> {
  const normalizedNtid = normalizeNtid(ntid);
  const isLocalAccount = ntid === 'coresw';

  // test 模式下自动通过认证
  const testMode = process.env.AUTH_TEST_MODE === 'true';
  console.log('[Auth] Login attempt for NTID:', normalizedNtid, 'Test mode:', testMode);
  if (testMode) {
    console.log('[Auth] Test mode enabled - auto-approving user:', normalizedNtid);
    return {
      ntid: normalizedNtid,
      displayName: `Test User ${normalizedNtid}`,
      email: `${normalizedNtid}@amd.com`,
      role: normalizedNtid === 'admin' ? 'admin' : 'developer',
      timezone: 'UTC',
    };
  }

  // ===== 第一步：非本地账户先检查审批状态 =====
  if (!isLocalAccount) {
    checkUserApproval(ntid);
  }

  // ===== 第二步：验证密码 =====
  if (isLocalAccount) {
    // coresw 本地密码验证
    const localPassword = process.env.LOCAL_ADMIN_PASSWORD;
    if (!localPassword) {
      throw new Error('Server configuration error: LOCAL_ADMIN_PASSWORD not set');
    }
    if (password !== localPassword) {
      throw new Error('Invalid credentials');
    }
    // 更新 coresw 的 last_login
    db.prepare('UPDATE users SET last_login = ? WHERE ntid = ?')
      .run(new Date().toISOString(), 'coresw');

    const coreswUser = db.prepare('SELECT * FROM users WHERE ntid = ?').get('coresw') as User;
    return {
      ntid: coreswUser.ntid,
      displayName: coreswUser.display_name || 'Core System Admin',
      email: coreswUser.email || undefined,
      role: coreswUser.user_level,
      timezone: coreswUser.timezone,
    };
  }

  // 正常进行 LDAP 认证
  const result = await authenticateWithLDAP(normalizedNtid, password);
  
  if (!result.success || !result.user) {
    throw new Error(result.error || 'Authentication failed');
  }
  
  const user = result.user;

  // ===== 第三步：LDAP 成功后再次检查状态（处理首次登录的新用户）=====
  // createOrUpdateUser 已在 authenticateWithLDAP 中执行，新用户此时 status='pending'
  if (user.status === 'pending') {
    throw new AuthApprovalError(
      'Your account has been registered and is pending approval. Please contact an administrator.',
      'pending'
    );
  }

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
  
  // 从 DB 获取最新的 role（管理员可能已经改了）
  const dbUser = db.prepare('SELECT * FROM users WHERE ntid = ?').get(user.ntid) as User | undefined;

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
