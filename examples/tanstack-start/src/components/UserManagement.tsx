import { useState, useEffect, useCallback } from 'react'

type UserStatus = 'pending' | 'approved' | 'rejected' | 'revoked'
type UserLevel = 'viewer' | 'developer' | 'admin'

interface UserRecord {
  ntid: string
  display_name: string | null
  email: string | null
  timezone: string
  user_level: UserLevel
  status: UserStatus
  created_at: string
  last_login: string | null
}

const STATUS_CONFIG: Record<UserStatus, { label: string; icon: string; badge: string }> = {
  pending:  { label: 'Pending',  icon: '⏳', badge: 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50' },
  approved: { label: 'Approved', icon: '✅', badge: 'bg-green-900/30 text-green-400 border border-green-700/50' },
  rejected: { label: 'Rejected', icon: '❌', badge: 'bg-red-900/30 text-red-400 border border-red-700/50' },
  revoked:  { label: 'Revoked',  icon: '🚫', badge: 'bg-gray-800/50 text-gray-400 border border-gray-600/50' },
}

const LEVEL_CONFIG: Record<UserLevel, { label: string; icon: string; color: string }> = {
  viewer:    { label: 'Viewer',    icon: '👁️',  color: 'text-gray-400' },
  developer: { label: 'Developer', icon: '💻', color: 'text-cyan-400' },
  admin:     { label: 'Admin',     icon: '👑', color: 'text-yellow-400' },
}

export function UserManagement({ currentUser }: { currentUser: string }) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | UserStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/users/list')

      // session 过期 → 跳转登录
      if (res.status === 401 || res.status === 403) {
        const data = await res.json()
        if (data.error?.includes('Forbidden') || data.error?.includes('Unauthorized')) {
          window.location.href = '/login?redirect=/users'
          return
        }
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch users')
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateStatus = async (ntid: string, status: UserStatus) => {
    try {
      setActionLoading(`${ntid}-status`)
      const res = await fetch('/api/users/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ntid, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      await fetchUsers()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  const updateLevel = async (ntid: string, user_level: UserLevel) => {
    try {
      setActionLoading(`${ntid}-level`)
      const res = await fetch('/api/users/set-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ntid, user_level }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      await fetchUsers()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesFilter = filter === 'all' || u.status === filter
    const matchesSearch =
      u.ntid.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.display_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const pendingCount = users.filter((u) => u.status === 'pending').length

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-lg">Loading users...</div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-400 text-lg">Error: {error}</p>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-gray-600 transition-colors"
        >
          🔄 Retry
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            👥 User Management
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2.5 py-1 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Manage NTID user access and permissions · {users.length} total users
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg border border-gray-600 transition-colors text-sm self-start sm:self-auto"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by NTID or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm w-full sm:w-64"
        />
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected', 'revoked'] as const).map((f) => {
            const count = f === 'all' ? users.length : users.filter((u) => u.status === f).length
            const isActive = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isActive
                    ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                {f === 'all' ? `All (${count})` : `${STATUS_CONFIG[f].icon} ${STATUS_CONFIG[f].label} (${count})`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">NTID</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Level</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium hidden lg:table-cell">Last Login</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isCoresw = user.ntid === 'coresw'
                  const isMe = user.ntid === currentUser
                  const sc = STATUS_CONFIG[user.status]
                  const lc = LEVEL_CONFIG[user.user_level]
                  const isActing = actionLoading?.startsWith(user.ntid)

                  return (
                    <tr
                      key={user.ntid}
                      className={`border-b border-gray-700/50 transition-colors ${
                        isCoresw
                          ? 'bg-indigo-950/20'
                          : isMe
                          ? 'bg-cyan-950/10'
                          : 'hover:bg-gray-700/30'
                      } ${isActing ? 'opacity-60' : ''}`}
                    >
                      {/* NTID */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{user.ntid}</span>
                          {isCoresw && (
                            <span className="text-[10px] bg-yellow-900/40 text-yellow-500 px-1.5 py-0.5 rounded font-bold">
                              🔒 LOCAL
                            </span>
                          )}
                          {isMe && !isCoresw && (
                            <span className="text-[10px] text-cyan-500 italic">← you</span>
                          )}
                        </div>
                        {user.display_name && user.display_name !== user.ntid && (
                          <div className="text-gray-500 text-xs mt-0.5">{user.display_name}</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.badge}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>

                      {/* Level */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${lc.color}`}>
                          {lc.icon} {lc.label}
                        </span>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-gray-500 text-xs">{user.email || '-'}</span>
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-500 text-xs">
                          {user.last_login
                            ? new Date(user.last_login).toLocaleString()
                            : 'Never'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {isCoresw ? (
                          <div className="text-center">
                            <span className="text-gray-600 text-xs italic">Protected</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            {/* Approve */}
                            {user.status !== 'approved' && (
                              <button
                                onClick={() => updateStatus(user.ntid, 'approved')}
                                disabled={!!actionLoading}
                                className="px-2 py-1 text-xs rounded border border-green-700/60 text-green-400 hover:bg-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                ✅ Approve
                              </button>
                            )}

                            {/* Reject */}
                            {user.status === 'pending' && (
                              <button
                                onClick={() => updateStatus(user.ntid, 'rejected')}
                                disabled={!!actionLoading}
                                className="px-2 py-1 text-xs rounded border border-red-700/60 text-red-400 hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                ❌ Reject
                              </button>
                            )}

                            {/* Revoke */}
                            {user.status === 'approved' && (
                              <button
                                onClick={() => updateStatus(user.ntid, 'revoked')}
                                disabled={!!actionLoading}
                                className="px-2 py-1 text-xs rounded border border-gray-600 text-gray-400 hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                🚫 Revoke
                              </button>
                            )}

                            {/* Level dropdown */}
                            <select
                              value={user.user_level}
                              onChange={(e) => updateLevel(user.ntid, e.target.value as UserLevel)}
                              disabled={!!actionLoading}
                              className="px-2 py-1 text-xs rounded border border-purple-700/60 text-purple-400 bg-transparent hover:bg-purple-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              <option value="viewer" className="bg-gray-800 text-gray-300">👁️ Viewer</option>
                              <option value="developer" className="bg-gray-800 text-gray-300">💻 Developer</option>
                              <option value="admin" className="bg-gray-800 text-gray-300">👑 Admin</option>
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex gap-4 mt-4 text-xs text-gray-500 flex-wrap">
        <span>✅ Approved: {users.filter((u) => u.status === 'approved').length}</span>
        <span>⏳ Pending: {pendingCount}</span>
        <span>❌ Rejected: {users.filter((u) => u.status === 'rejected').length}</span>
        <span>🚫 Revoked: {users.filter((u) => u.status === 'revoked').length}</span>
      </div>
    </div>
  )
}