import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || '/booking'
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/login' })
  
  const [ntid, setNtid] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userStatus, setUserStatus] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setUserStatus(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ntid, password }),
      })

      const data = await response.json()

      if (data.success) {
        console.log('[Login] Success:', data.user)
        
        // 存储用户信息到 localStorage（供前端使用）
        localStorage.setItem('user', JSON.stringify({
          ntid: data.user.ntid,
          username: data.user.ntid,  // 兼容旧代码
          displayName: data.user.displayName,
          email: data.user.email,
          role: data.user.role
        }))
        
        // 使用 window.location 强制跳转
        window.location.href = redirect
        
      } else {
        setError(data.error || 'Login failed')
        // 如果返回了审批状态，记录下来
        if (data.userStatus) {
          setUserStatus(data.userStatus)
        }
      }
    } catch (err) {
      console.error('[Login] Error:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = () => {
    switch (userStatus) {
      case 'pending': return '⏳'
      case 'rejected': return '❌'
      case 'revoked': return '🚫'
      default: return '⚠️'
    }
  }

  const getStatusBgClass = () => {
    switch (userStatus) {
      case 'pending': return 'bg-yellow-900/20 border-yellow-700 text-yellow-400'
      case 'rejected': return 'bg-red-900/20 border-red-700 text-red-400'
      case 'revoked': return 'bg-gray-900/20 border-gray-600 text-gray-400'
      default: return 'bg-red-900/20 border-red-700 text-red-400'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          RAPID Login
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              NTID
            </label>
            <input
              type="text"
              value={ntid}
              onChange={(e) => setNtid(e.target.value)}
              placeholder="Enter your NTID"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              required
            />
          </div>

          {/* 错误信息：区分普通认证错误和审批状态错误 */}
          {error && (
            <div className={`text-sm p-3 rounded-lg border flex items-start gap-2 ${
              userStatus ? getStatusBgClass() : 'bg-red-900/20 border-red-700 text-red-400'
            }`}>
              <span className="text-lg leading-none flex-shrink-0">{getStatusIcon()}</span>
              <span>{error}</span>
            </div>
          )}
          
          {/* 首次注册的额外提示 */}
          {userStatus === 'pending' && (
            <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
              <p className="text-blue-400 text-xs">
                Your account has been registered in the system. An administrator needs to approve 
                your access before you can log in. Please contact your team admin.
              </p>
            </div>
          )}

          {userStatus === 'rejected' && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-red-400 text-xs">
                Your access request was rejected. If you believe this is a mistake, 
                please contact an administrator.
              </p>
            </div>
          )}

          {userStatus === 'revoked' && (
            <div className="p-3 bg-gray-800/50 border border-gray-600 rounded-lg">
              <p className="text-gray-400 text-xs">
                Your account access has been revoked. Please contact an administrator 
                if you need to regain access.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-gray-400 text-sm text-center">
          Use your AMD LDAP credentials
        </p>
        
        {/* 开发模式提示 */}
        {/* <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-blue-400 text-xs">
            <strong>Test Mode:</strong> Any NTID/password will work.<br/>
            Use "admin" as NTID for admin privileges.
          </p>
        </div> */}
      </div>
    </div>
  )
}