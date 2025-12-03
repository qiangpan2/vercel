import db, { User } from '../db/booking';

// session kv
const sessions = new Map<string, { ntid: string; expires: number }>();

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 小时

// 生成唯一 session ID
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + Date.now().toString(36);
}

export function createSession(ntid: string): string {
  const sessionId = generateSessionId();
  const expires = Date.now() + SESSION_DURATION;
  
  sessions.set(sessionId, { ntid, expires });
  
  console.log(`[Session] Created session for ${ntid}, expires in 8 hours`);
  return sessionId;
}

export function validateSession(sessionId: string): User | null {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (Date.now() > session.expires) {
    sessions.delete(sessionId);
    console.log(`[Session] Session expired for ${session.ntid}`);
    return null;
  }
  
  // 从数据库获取用户信息
  try {
    const user = db.prepare('SELECT * FROM users WHERE ntid = ?').get(session.ntid) as User | null;
    return user;
  } catch (error) {
    console.error('[Session] Failed to get user from database:', error);
    return null;
  }
}

export function deleteSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    console.log(`[Session] Deleted session for ${session.ntid}`);
  }
  sessions.delete(sessionId);
}

// 刷新 session 有效期
export function refreshSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  
  session.expires = Date.now() + SESSION_DURATION;
  return true;
}

// 清理过期 session
export function cleanupSessions(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [id, session] of sessions) {
    if (now > session.expires) {
      sessions.delete(id);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Session] Cleaned up ${cleaned} expired sessions`);
  }
}

// 每小时清理一次过期 session
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupSessions, 60 * 60 * 1000);
}