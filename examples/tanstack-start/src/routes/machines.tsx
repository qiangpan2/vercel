import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { getCurrentUser, isAdmin, type User } from '../utils/auth'
import AnsibleControlPanel from '../components/AnsibleControlPanel'


export const Route = createFileRoute('/machines')({
  component: MachinesPage,
})

interface Server {
  id: number
  hostname: string
  ip: string
  ipmi_ip: string
  ipmi_password?: string
  ssh_user?: string
  domain_name?: string
  location: string
  model: string
  sn: string
  bmc_mac: string
  cpu_model?: string
  gpu_arch?: string
  num_gpus?: number
  ram?: string
  disk?: string
  nic?: string
  is_exclusive?: boolean
  status: 'available' | 'booked' | 'maintenance' | 'offline'
  description?: string
}

function MachinesPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [controllingServer, setControllingServer] = useState<Server | null>(null)
  const [viewingServer, setViewingServer] = useState<Server | null>(null)  // 查看详情

  // 获取当前用户
  useEffect(() => {
    const currentUser = getCurrentUser()
    setUser(currentUser)
    
    if (!currentUser) {
      window.location.href = '/login?redirect=/machines'
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchServers()
    }
  }, [user])

  const fetchServers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/machines/list')
      const data = await response.json()
      console.log('[Machines] API response:', data)
      
      if (data.success && data.machines) {
        const serverList: Server[] = data.machines.map((m: any) => ({
          id: typeof m.id === 'string' ? parseInt(m.id) : m.id,
          hostname: m.name || m.hostname || '',
          ip: m.ip || '',
          ipmi_ip: m.ipmi_ip || '',
          ipmi_password: m.ipmi_password || '',
          ssh_user: m.ssh_user || 'admin',
          domain_name: m.domain_name || '',
          location: m.location || '',
          model: m.model || '',
          sn: m.sn || '',
          bmc_mac: m.bmc_mac || '',
          cpu_model: m.specs?.cpu || m.cpu_model || '',
          gpu_arch: m.specs?.gpu?.split(' x')[0] || m.gpu_arch || '',
          num_gpus: parseInt(m.specs?.gpu?.split(' x')[1]) || m.num_gpus || 0,
          ram: m.specs?.ram || m.ram || '',
          disk: m.specs?.storage || m.disk || '',
          nic: m.specs?.network || m.nic || '',
          is_exclusive: m.is_exclusive || false,
          status: (m.status || 'available') as Server['status'],
          description: m.description || m.intro || ''
        }))
        setServers(serverList)
      } else {
        setError(data.error || 'Failed to fetch servers')
      }
    } catch (err) {
      console.error('[Machines] Fetch error:', err)
      setError('Failed to fetch servers')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (server: Partial<Server>) => {
    if (!user || !isAdmin(user)) {
      setError('Permission denied. Only admin can modify machines.')
      return
    }

    try {
      const response = await fetch('/api/machines/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...server,
          userRole: user.role
        })
      })
      const data = await response.json()
      if (data.success) {
        await fetchServers()
        setIsModalOpen(false)
        setEditingServer(null)
        setError(null)
      } else {
        setError(data.error || 'Failed to save server')
      }
    } catch (err) {
      console.error('[Machines] Save error:', err)
      setError('Failed to save server')
    }
  }

  const handleDelete = async (id: number) => {
    if (!user || !isAdmin(user)) {
      setError('Permission denied. Only admin can delete machines.')
      return
    }

    const serverToDelete = servers.find(s => s.id === id)
    if (!confirm(`Are you sure you want to delete "${serverToDelete?.hostname}"?`)) return
    
    try {
      const response = await fetch('/api/machines/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id,
          userRole: user.role
        })
      })
      const data = await response.json()
      if (data.success) {
        await fetchServers()
        setError(null)
      } else {
        setError(data.error || 'Failed to delete server')
      }
    } catch (err) {
      console.error('[Machines] Delete error:', err)
      setError('Failed to delete server')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-600'
      case 'booked': return 'bg-blue-600'
      case 'maintenance': return 'bg-yellow-600'
      case 'offline': return 'bg-red-600'
      default: return 'bg-gray-600'
    }
  }

  const userIsAdmin = user && isAdmin(user)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading servers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Server Management</h1>
            {user && (
              <p className="text-gray-400 text-sm mt-1">
                Logged in as: {user.displayName} 
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                  userIsAdmin ? 'bg-purple-600' : 'bg-gray-600'
                }`}>
                  {user.role}
                </span>
              </p>
            )}
          </div>
          
          {userIsAdmin && (
            <button
              onClick={() => {
                setEditingServer(null)
                setIsModalOpen(true)
              }}
              className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <span>+</span> Add Server
            </button>
          )}
        </div>

        {/* 权限提示 */}
        {!userIsAdmin && (
          <div className="bg-yellow-600/20 border border-yellow-600 text-yellow-400 px-4 py-3 rounded-lg mb-4">
            <span className="font-medium">View Only Mode:</span> You can view server information but cannot make changes. Contact an admin for modifications.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-600/20 border border-red-600 text-red-400 px-4 py-3 rounded-lg mb-4 flex justify-between items-center">
            <span>{error}</span>
            <button 
              onClick={() => setError(null)} 
              className="text-red-400 hover:text-red-300 text-xl leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Server Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Hostname</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">IP</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">IPMI</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Location</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Model</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">GPU</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Mode</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {servers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      No servers found. {userIsAdmin && 'Click "Add Server" to add one.'}
                    </td>
                  </tr>
                ) : (
                  servers.map(server => (
                    <tr key={server.id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{server.hostname}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-300">{server.ip || '-'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-300">{server.ipmi_ip || '-'}</td>
                      <td className="px-4 py-3 text-gray-300">{server.location || '-'}</td>
                      <td className="px-4 py-3 text-gray-300">{server.model || '-'}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {server.gpu_arch ? `${server.gpu_arch} x${server.num_gpus || 0}` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          server.is_exclusive ? 'bg-orange-600' : 'bg-blue-600'
                        }`}>
                          {server.is_exclusive ? 'Exclusive' : 'Shared'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(server.status)}`}>
                          {server.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                        {/* 所有用户都能查看详情 */}
                          <button
                            onClick={() => setViewingServer(server)}
                            className="text-gray-400 hover:text-gray-300 mr-3 transition-colors"
                          >
                            View
                          </button>

                          {/* 管理员操作 */}
                          {userIsAdmin && (
                            <>
                              <span className="text-gray-600">|</span>
                              <button
                                onClick={() => setControllingServer(server)}
                                className="text-purple-400 hover:text-purple-300 transition-colors text-sm"
                                title="Ansible Control"
                              >
                                Control
                              </button>
                              <button
                                onClick={() => {
                                  setEditingServer(server)
                                  setIsModalOpen(true)
                                }}
                                className="text-cyan-400 hover:text-cyan-300 mr-3 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(server.id)}
                                className="text-red-400 hover:text-red-300 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Server count */}
        <div className="mt-4 text-gray-400 text-sm">
          Total: {servers.length} server(s)
        </div>
      </div>

      {/* View Modal - 所有用户可见（但敏感信息对非管理员隐藏） */}
      {viewingServer && (
        <ServerViewModal
          server={viewingServer}
          isAdmin={userIsAdmin || false}
          onClose={() => setViewingServer(null)}
        />
      )}

      {/* Edit Modal - 只有管理员能打开 */}
      {isModalOpen && userIsAdmin && (
        <ServerEditModal
          server={editingServer}
          onSave={handleSave}
          onClose={() => {
            setIsModalOpen(false)
            setEditingServer(null)
          }}
        />
      )}

      {/* Ansible Control Modal */}
      {controllingServer && userIsAdmin && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setControllingServer(null)}
        >
          <div 
            className="w-full max-w-2xl"
            onClick={e => e.stopPropagation()}
          >
            <AnsibleControlPanel
              server={{
                ...controllingServer,
                status: controllingServer.status
              }}
              userRole={user?.role || 'user'}
              onClose={() => setControllingServer(null)}
              onStatusChange={() => {
                // 状态变化后刷新服务器列表
                fetchServers()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============ 查看详情 Modal（普通用户） ============
interface ServerViewModalProps {
  server: Server
  isAdmin: boolean
  onClose: () => void
}

function ServerViewModal({ server, isAdmin, onClose }: ServerViewModalProps) {
  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Server Details</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Hostname" value={server.hostname} />
              <InfoField label="IP Address" value={server.ip} />
              <InfoField label="IPMI IP" value={server.ipmi_ip} />
              <InfoField label="Location" value={server.location} />
              <InfoField label="Model" value={server.model} />
              <InfoField label="Serial Number" value={server.sn} />
              <InfoField label="BMC MAC" value={server.bmc_mac} />
              <InfoField label="Domain" value={server.domain_name} />
            </div>

            {/* 硬件信息 */}
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Hardware</h3>
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="CPU" value={server.cpu_model} />
                <InfoField label="GPU" value={server.gpu_arch ? `${server.gpu_arch} x${server.num_gpus}` : undefined} />
                <InfoField label="RAM" value={server.ram} />
                <InfoField label="Disk" value={server.disk} />
                <InfoField label="NIC" value={server.nic} />
              </div>
            </div>

            {/* 状态信息 */}
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Status</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-400">Status:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    server.status === 'available' ? 'bg-green-600' :
                    server.status === 'booked' ? 'bg-blue-600' :
                    server.status === 'maintenance' ? 'bg-yellow-600' : 'bg-red-600'
                  }`}>
                    {server.status}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Booking Mode:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    server.is_exclusive ? 'bg-orange-600' : 'bg-blue-600'
                  }`}>
                    {server.is_exclusive ? 'Exclusive' : 'Shared'}
                  </span>
                </div>
              </div>
            </div>

            {/* 管理员可见的敏感信息 */}
            {isAdmin && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-purple-400 mb-3">🔒 Admin Only</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-900/50 rounded-lg p-3">
                  <InfoField label="SSH User" value={server.ssh_user} />
                  <InfoField label="IPMI Password" value={server.ipmi_password} isSensitive />
                </div>
              </div>
            )}

            {/* 描述 */}
            {server.description && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Description</h3>
                <p className="text-gray-400 text-sm">{server.description}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-700 mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 信息字段组件
function InfoField({ label, value, isSensitive }: { label: string, value?: string, isSensitive?: boolean }) {
  const [show, setShow] = useState(false)
  
  if (!value) {
    return (
      <div>
        <span className="text-sm text-gray-400">{label}:</span>
        <span className="ml-2 text-gray-500">-</span>
      </div>
    )
  }
  
  if (isSensitive) {
    return (
      <div className="flex items-center">
        <span className="text-sm text-gray-400">{label}:</span>
        <span className="ml-2 font-mono text-sm">
          {show ? value : '••••••••'}
        </span>
        <button
          onClick={() => setShow(!show)}
          className="ml-2 text-gray-400 hover:text-gray-300"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    )
  }
  
  return (
    <div>
      <span className="text-sm text-gray-400">{label}:</span>
      <span className="ml-2 text-white">{value}</span>
    </div>
  )
}

// ============ 编辑 Modal（管理员专用） ============
interface ServerEditModalProps {
  server: Server | null
  onSave: (server: Partial<Server>) => void
  onClose: () => void
}

function ServerEditModal({ server, onSave, onClose }: ServerEditModalProps) {
  const [formData, setFormData] = useState<Partial<Server>>(
    server || {
      hostname: '',
      ip: '',
      ipmi_ip: '',
      ipmi_password: '',
      ssh_user: 'admin',
      domain_name: '',
      location: '',
      model: '',
      sn: '',
      bmc_mac: '',
      cpu_model: '',
      gpu_arch: '',
      num_gpus: 0,
      ram: '',
      disk: '',
      nic: '',
      is_exclusive: false,
      status: 'available',
      description: ''
    }
  )
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave(formData)
    setSaving(false)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {server ? 'Edit Server' : 'Add New Server'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ========== 基本信息 ========== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hostname *</label>
                <input
                  type="text"
                  required
                  value={formData.hostname || ''}
                  onChange={e => setFormData({...formData, hostname: e.target.value})}
                  className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="e.g., gpu-server-01"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">IP Address</label>
                <input
                  type="text"
                  value={formData.ip || ''}
                  onChange={e => setFormData({...formData, ip: e.target.value})}
                  className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="10.67.xx.xx"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Domain Name</label>
                <input
                  type="text"
                  value={formData.domain_name || ''}
                  onChange={e => setFormData({...formData, domain_name: e.target.value})}
                  className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="server.example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Location</label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="e.g., SH-LAB-RACK01"
                />
              </div>
            </div>

            {/* ========== IPMI / SSH 配置 (管理员专用) ========== */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-purple-400 mb-3">🔒 Connection Settings (Admin Only)</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">IPMI IP</label>
                  <input
                    type="text"
                    value={formData.ipmi_ip || ''}
                    onChange={e => setFormData({...formData, ipmi_ip: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="10.67.xx.xx"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">IPMI Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.ipmi_password || ''}
                      onChange={e => setFormData({...formData, ipmi_password: e.target.value})}
                      className="w-full bg-gray-700 rounded px-3 py-2 pr-10 focus:ring-2 focus:ring-cyan-500 outline-none"
                      placeholder="IPMI password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SSH User</label>
                  <input
                    type="text"
                    value={formData.ssh_user || ''}
                    onChange={e => setFormData({...formData, ssh_user: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="admin"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for Ansible connections</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">BMC MAC Address</label>
                  <input
                    type="text"
                    value={formData.bmc_mac || ''}
                    onChange={e => setFormData({...formData, bmc_mac: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="AA:BB:CC:DD:EE:FF"
                  />
                </div>
              </div>
            </div>

            {/* ========== 设备信息 ========== */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Device Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model || ''}
                    onChange={e => setFormData({...formData, model: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="e.g., Dell R750"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.sn || ''}
                    onChange={e => setFormData({...formData, sn: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* ========== 硬件配置 ========== */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Hardware Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">CPU Model</label>
                  <input
                    type="text"
                    value={formData.cpu_model || ''}
                    onChange={e => setFormData({...formData, cpu_model: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="e.g., AMD EPYC 9654"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">GPU Architecture</label>
                  <input
                    type="text"
                    value={formData.gpu_arch || ''}
                    onChange={e => setFormData({...formData, gpu_arch: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="e.g., MI300X"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Number of GPUs</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.num_gpus || 0}
                    onChange={e => setFormData({...formData, num_gpus: parseInt(e.target.value) || 0})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">RAM</label>
                  <input
                    type="text"
                    value={formData.ram || ''}
                    onChange={e => setFormData({...formData, ram: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="256GB"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Disk</label>
                  <input
                    type="text"
                    value={formData.disk || ''}
                    onChange={e => setFormData({...formData, disk: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="2TB NVMe"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">NIC</label>
                  <input
                    type="text"
                    value={formData.nic || ''}
                    onChange={e => setFormData({...formData, nic: e.target.value})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="100GbE"
                  />
                </div>
              </div>
            </div>

            {/* ========== 状态与模式 ========== */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Status & Booking Mode</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Status</label>
                  <select
                    value={formData.status || 'available'}
                    onChange={e => setFormData({...formData, status: e.target.value as Server['status']})}
                    className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    <option value="available">Available</option>
                    <option value="booked">Booked</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Booking Mode</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="booking_mode"
                        checked={!formData.is_exclusive}
                        onChange={() => setFormData({...formData, is_exclusive: false})}
                        className="w-4 h-4 text-cyan-600"
                      />
                      <span className="text-sm">Shared</span>
                      <span className="text-xs text-gray-500">(Multiple users)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="booking_mode"
                        checked={formData.is_exclusive === true}
                        onChange={() => setFormData({...formData, is_exclusive: true})}
                        className="w-4 h-4 text-orange-600"
                      />
                      <span className="text-sm">Exclusive</span>
                      <span className="text-xs text-gray-500">(One user only)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ========== 描述 ========== */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full bg-gray-700 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none h-20 resize-none"
                placeholder="Additional notes about this server..."
              />
            </div>

            {/* ========== 按钮 ========== */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {server ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

