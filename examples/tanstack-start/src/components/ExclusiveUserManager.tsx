import { useState, useEffect, useCallback } from 'react'

interface PermissionUser {
  id: number
  ntid: string
  added_by: string
  can_book: number
  can_manage: number
  created_at: string
}

interface KnownUser {
  ntid: string
  name: string
  email: string
}

interface Props {
  serverId: number
  isExclusive: boolean
  userRole: string
  adminUser: string
}

export function ExclusiveUserManager({ serverId, isExclusive, userRole, adminUser }: Props) {
  const [allowedUsers, setAllowedUsers] = useState<PermissionUser[]>([])
  const [newNtid, setNewNtid] = useState('')
  const [suggestions, setSuggestions] = useState<KnownUser[]>([])
  const [canBook, setCanBook] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchAllowedUsers = useCallback(async () => {
    if (!isExclusive || !serverId) return
    try {
      const res = await fetch(`/api/machines/exclusive-users?server_id=${serverId}`)
      const data = await res.json()
      if (data.success) {
        setAllowedUsers(data.users)
      }
    } catch (err) {
      console.error('Failed to fetch allowed users:', err)
    }
  }, [serverId, isExclusive])

  useEffect(() => {
    fetchAllowedUsers()
  }, [fetchAllowedUsers])

  // 搜索用户（防抖）
  useEffect(() => {
    if (newNtid.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/machines/exclusive-users?search=${encodeURIComponent(newNtid)}`)
        const data = await res.json()
        if (data.success) {
          setSuggestions(data.users.map((u: any) => ({
            ntid: u.ntid,
            name: u.display_name || u.ntid,
            email: u.email || ''
          })))
        }
      } catch (err) {
        console.error('Failed to search users:', err)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [newNtid])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const addUser = async () => {
    if (!newNtid.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/machines/exclusive-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          ntid: newNtid.trim(),
          action: 'add',
          userRole,
          adminUser,
          can_book: canBook,
          can_manage: canManage,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setNewNtid('')
        setCanBook(true)
        setCanManage(false)
        showMessage('success', data.message)
        await fetchAllowedUsers()
      } else {
        showMessage('error', data.error)
      }
    } catch (err) {
      showMessage('error', 'Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  const removeUser = async (ntid: string) => {
    if (!confirm(`Remove ${ntid} from whitelist?`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/machines/exclusive-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          ntid,
          action: 'remove',
          userRole,
          adminUser,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message)
        await fetchAllowedUsers()
      } else {
        showMessage('error', data.error)
      }
    } catch (err) {
      showMessage('error', 'Failed to remove user')
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = async (ntid: string, field: 'can_book' | 'can_manage', currentValue: number) => {
    setLoading(true)
    const user = allowedUsers.find(u => u.ntid === ntid)
    if (!user) return
    try {
      const res = await fetch('/api/machines/exclusive-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          ntid,
          action: 'update',
          userRole,
          adminUser,
          can_book: field === 'can_book' ? (currentValue ? 0 : 1) : user.can_book,
          can_manage: field === 'can_manage' ? (currentValue ? 0 : 1) : user.can_manage,
        }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchAllowedUsers()
      } else {
        showMessage('error', data.error)
      }
    } catch (err) {
      showMessage('error', 'Failed to update permission')
    } finally {
      setLoading(false)
    }
  }

  if (!isExclusive) return null
  if (userRole !== 'admin') return null

  return (
    <div className="border border-orange-500/30 rounded-lg p-4 mt-4 bg-gray-900/50">
      <h3 className="text-sm font-semibold text-orange-400 mb-3">
        🔒 Exclusive Access Whitelist
      </h3>

      {message && (
        <div className={`px-3 py-2 mb-3 rounded text-sm ${
          message.type === 'success'
            ? 'bg-green-600/20 text-green-400 border border-green-600/30'
            : 'bg-red-600/20 text-red-400 border border-red-600/30'
        }`}>
          {message.text}
        </div>
      )}

      {/* 用户列表 */}
      {allowedUsers.length > 0 ? (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left px-2 py-1.5 text-gray-400 font-medium">NTID</th>
                <th className="text-center px-2 py-1.5 text-gray-400 font-medium">Can Book</th>
                <th className="text-center px-2 py-1.5 text-gray-400 font-medium">Can Manage</th>
                <th className="text-left px-2 py-1.5 text-gray-400 font-medium">Added By</th>
                <th className="text-center px-2 py-1.5 text-gray-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {allowedUsers.map((u) => (
                <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-2 py-1.5 font-medium text-white">{u.ntid}</td>
                  <td className="text-center px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!!u.can_book}
                      onChange={() => togglePermission(u.ntid, 'can_book', u.can_book)}
                      disabled={loading}
                      className="w-4 h-4 rounded accent-cyan-500"
                    />
                  </td>
                  <td className="text-center px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!!u.can_manage}
                      onChange={() => togglePermission(u.ntid, 'can_manage', u.can_manage)}
                      disabled={loading}
                      className="w-4 h-4 rounded accent-cyan-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-gray-400">{u.added_by}</td>
                  <td className="text-center px-2 py-1.5">
                    <button
                      onClick={() => removeUser(u.ntid)}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-3">
          No users in whitelist. Add users to allow them to book this exclusive machine.
        </p>
      )}

      {/* 添加用户 */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <input
            type="text"
            value={newNtid}
            onChange={(e) => setNewNtid(e.target.value)}
            placeholder="Enter NTID..."
            list={`ntid-suggestions-${serverId}`}
            className="w-full bg-gray-700 text-white placeholder-gray-500 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 outline-none border border-gray-600"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUser() } }}
          />
          <datalist id={`ntid-suggestions-${serverId}`}>
            {suggestions.map((s) => (
              <option key={s.ntid} value={s.ntid} label={`${s.name} (${s.ntid})`} />
            ))}
          </datalist>
        </div>
        <label className="text-xs text-gray-300 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={canBook}
            onChange={(e) => setCanBook(e.target.checked)}
            className="w-3.5 h-3.5 accent-cyan-500"
          />
          Book
        </label>
        <label className="text-xs text-gray-300 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={canManage}
            onChange={(e) => setCanManage(e.target.checked)}
            className="w-3.5 h-3.5 accent-cyan-500"
          />
          Manage
        </label>
        <button
          onClick={addUser}
          disabled={loading || !newNtid.trim()}
          className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-4 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  )
}