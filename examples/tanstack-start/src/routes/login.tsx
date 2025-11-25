import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { LogIn } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || '/booking',
    }
  },
})

function LoginPage() {
  const search = useSearch({ from: '/login' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 简单的认证逻辑（实际应用中应该调用后端API）
    if (username === 'root' && password === '1234') {
      // 管理员登录
      localStorage.setItem('user', JSON.stringify({
        username: 'root',
        role: 'admin',
        displayName: 'Administrator'
      }))
      window.location.href = search.redirect
    } else if (username && password) {
      // 普通用户登录（任何非空用户名密码都可以登录）
      localStorage.setItem('user', JSON.stringify({
        username: username,
        role: 'user',
        displayName: username
      }))
      window.location.href = search.redirect
    } else {
      setError('Please enter username and password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 p-8 shadow-2xl">
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-600 rounded-full mb-4">
              <LogIn size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Machine Booking System</h1>
            <p className="text-gray-400">Sign in to manage your bookings</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                placeholder="Enter your username"
                autoComplete="username"
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
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Sign In
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-400 font-medium mb-2">Demo Accounts:</p>
              <div className="text-xs text-gray-300 space-y-1">
                <div>
                  <span className="font-medium">Admin:</span> root / 1234
                </div>
                <div>
                  <span className="font-medium">User:</span> Any username/password
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
