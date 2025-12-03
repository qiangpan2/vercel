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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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
      }
    } catch (err) {
      console.error('[Login] Error:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
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

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
              {error}
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