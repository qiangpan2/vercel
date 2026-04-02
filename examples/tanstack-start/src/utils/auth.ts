// 从 localStorage 读取用户信息
export interface User {
  ntid: string;
  username: string;  // 兼容旧代码，等于 ntid
  displayName: string;
  email?: string;
  role: 'viewer' | 'developer' | 'admin';
}

/**
 * 获取当前登录用户
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      return null;
    }

    const user = JSON.parse(userStr);
    
    // 兼容处理：确保 username 和 ntid 都存在
    return {
      ntid: user.ntid || user.username || '',
      username: user.ntid || user.username || '',
      displayName: user.displayName || user.ntid || user.username || '',
      email: user.email,
      role: user.role || 'developer',
    };
  } catch (e) {
    console.error('[Auth] Failed to parse user from localStorage:', e);
    return null;
  }
}

/**
 * 从后端 session cookie 获取当前用户（用于 localStorage 不可用/丢失时的兜底）
 */
export async function fetchCurrentUser(): Promise<User | null> {
  if (typeof window === "undefined") return null

  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null

    const data = (await res.json()) as { user?: any }
    if (!data.user) return null

    const user: User = {
      ntid: data.user.ntid ?? "",
      username: data.user.ntid ?? "",
      displayName: data.user.displayName ?? data.user.ntid ?? "",
      email: data.user.email ?? undefined,
      role: data.user.role ?? "developer",
    }

    try {
      localStorage.setItem("user", JSON.stringify(user))
    } catch {
      // ignore storage failures (e.g. privacy mode)
    }

    return user
  } catch (e) {
    console.error("[Auth] Failed to fetch user from /api/auth/me:", e)
    return null
  }
}

// 检查是否管理员
export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

// 检查是否可以预订
export function canBook(user: User | null): boolean {
  return user?.role === 'developer' || user?.role === 'admin';
}

// 登出
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user');
    
    // 同时调用后端登出 API 清除 session cookie
    fetch('/api/auth/logout', { method: 'POST' })
      .catch(err => console.error('[Auth] Logout API error:', err));
  }
}

// 检查是否已登录（仅客户端可用）
export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return getCurrentUser() !== null;
}
