export interface User {
  username: string
  role: 'admin' | 'user'
  displayName: string
}

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null
  
  const userStr = localStorage.getItem('user')
  if (!userStr) return null
  
  try {
    return JSON.parse(userStr) as User
  } catch {
    return null
  }
}

export const logout = () => {
  localStorage.removeItem('user')
}

export const isAdmin = (user: User | null): boolean => {
  return user?.role === 'admin'
}

