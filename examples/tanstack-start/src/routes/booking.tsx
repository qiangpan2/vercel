import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, lazy, Suspense, useEffect } from 'react'
import { Info, X, Power, PowerOff, Settings } from 'lucide-react'
import { fetchCurrentUser, getCurrentUser, isAdmin, type User } from '../utils/auth'

// Dynamic import to avoid SSR issues with date-fns
const MachineBookingCalendar = lazy(() => import('../components/MachineBookingCalendar'))

export const Route = createFileRoute('/booking')({
  component: BookingPage,
  ssr: false,
})

interface Machine {
  id: string
  name: string  // 对应 servers.hostname
  description: string
  status: string
  intro?: string
  specs: {
    gpu: string
    cpu: string
    ram: string
    storage: string
    network: string
  }
  is_exclusive: boolean
  maxSharedUsers?: number
  ip?: string
  ipmi_ip?: string
  location?: string
  model?: string
}

interface Booking {
  id: string
  machineId: string
  userId: string
  userName: string
  startTime: number
  endTime: number
}

function BookingPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [machines, setMachines] = useState<Machine[]>([])
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null)
  const [localBookings, setLocalBookings] = useState<Booking[]>([])
  const [showMachineDetails, setShowMachineDetails] = useState(false)
  const [detailMachine, setDetailMachine] = useState<Machine | null>(null)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 客户端认证检查
  useEffect(() => {
    const initAuth = async () => {
      let currentUser = getCurrentUser()
      if (!currentUser) {
        currentUser = await fetchCurrentUser()
      }

      console.log('[Booking] Current user:', currentUser)

      if (!currentUser) {
        console.log('[Booking] No user, redirecting to login')
        window.location.href = '/login?redirect=/booking'
        return
      }

      setUser(currentUser)
      setAuthChecked(true)
    }

    initAuth()
  }, [])

  // 获取机器列表（客户端通过 API）
  useEffect(() => {
    if (!authChecked) return

    const fetchMachines = async () => {
      try {
        console.log('[Booking] Fetching machines from API...')
        const response = await fetch('/api/machines/list')
        const data = await response.json()
        
        console.log('[Booking] Machines response:', data)
        
        if (data.success && data.machines && data.machines.length > 0) {
          const formattedMachines = data.machines.map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            status: m.status || 'available',
            intro: m.intro,
            specs: typeof m.specs === 'string' ? JSON.parse(m.specs) : m.specs || {
              gpu: 'N/A',
              cpu: 'N/A',
              ram: 'N/A',
              storage: 'N/A',
              network: 'N/A'
            },
            maxSharedUsers: m.maxSharedUsers || 1,
            is_exclusive: m.is_exclusive || false,
          }))
          setMachines(formattedMachines)
          setSelectedMachine(formattedMachines[0])
          console.log('[Booking] Loaded machines:', formattedMachines.length)
        } else {
          console.warn('[Booking] No machines returned from API')
        }
      } catch (error) {
        console.error('[Booking] Failed to fetch machines:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMachines()
  }, [authChecked])

  // 获取用户的预订
  useEffect(() => {
    if (!user) return

    const fetchBookings = async () => {
      try {
        const username = user.ntid || user.username
        const response = await fetch(`/api/bookings/list?username=${username}`)
        const data = await response.json()
        
        if (data.success && data.bookings) {
          const formattedBookings = data.bookings.map((b: any) => ({
            id: b.id,
            machineId: b.machineId || b.machine_id,
            userId: b.ssoUsername || b.ntid || b.userId || b.sso_username,
            userName: b.displayName || b.userName || b.display_name,
            startTime: b.startTime || b.start_time,
            endTime: b.endTime || b.end_time,
            status: b.status,
          }))
          
          setLocalBookings(formattedBookings)
          console.log('[Booking] Loaded bookings:', formattedBookings.length)
        }
      } catch (error) {
        console.error('[Booking] Failed to fetch bookings:', error)
        setLocalBookings([])
      }
    }

    fetchBookings()
  }, [user])

  // 显示加载状态
  if (!authChecked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // ...保留原来的其他函数和 JSX...
  const handleBooking = async (machineId: string, startTime: Date, endTime: Date): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    try {
      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          ntid: user.ntid || user.username,
          displayName: user.displayName,
        })
      })
      
      const data = await response.json()
      
    if (!data.success) {
      throw new Error(data.error || 'Booking failed')
    }

      if (data.success) {
        const newBooking: Booking = {
          id: data.bookingId || `booking-${Date.now()}`,
          machineId,
          userId: user.ntid || user.username,
          userName: user.displayName,
          startTime: startTime.getTime(),
          endTime: endTime.getTime()
        }
        setLocalBookings([...localBookings, newBooking])
        console.log('[Booking] Created:', newBooking)
      } else {
        console.error('[Booking] Failed to create:', data.error)
        alert('Failed to create booking: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[Booking] Error creating booking:', error)
    }
  }

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      const response = await fetch(`/api/bookings/delete?id=${bookingId}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (data.success) {
        setLocalBookings(localBookings.filter(b => b.id !== bookingId))
        console.log('[Booking] Deleted:', bookingId)
      }
    } catch (error) {
      console.error('[Booking] Error deleting booking:', error)
      setLocalBookings(localBookings.filter(b => b.id !== bookingId))
    }
  }

  const handleToggleMachineStatus = (machineId: string) => {
    if (!isAdmin(user)) return
    
    setMachines(machines.map(m => {
      if (m.id === machineId) {
        const newStatus = m.status === 'available' ? 'offline' : 'available'
        return { ...m, status: newStatus }
      }
      return m
    }))
  }

  const handleIPMIControl = async (machineId: string, action: 'power-on' | 'power-off' | 'reboot') => {
    if (!isAdmin(user)) return
    
    const machine = machines.find(m => m.id === machineId)
    if (!machine) return
    
    const actionText = { 'power-on': '开机', 'power-off': '关机', 'reboot': '重启' }[action]
    alert(`IPMI ${actionText}命令已发送到 ${machine.name}`)
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'maintenance': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'offline': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header - 更紧凑 */}
      <header className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Machine Booking</h1>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400 text-sm">{user.displayName} ({user.role})</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin(user) && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <Settings size={16} />
                <span>Admin</span>
              </button>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('user')
                window.location.href = '/login'
              }}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - 减少 padding，全宽 */}
      <div className="p-2">
        {/* 如果没有机器，显示提示 */}
        {machines.length === 0 ? (
          <div className="bg-yellow-500/20 border border-yellow-500 rounded-xl p-6 text-center">
            <p className="text-yellow-400 text-lg mb-2">No machines available</p>
            <p className="text-gray-400">Please check if the machines API is working correctly.</p>
            <p className="text-gray-500 text-sm mt-2">Try: curl http://localhost:3000/api/machines/list</p>
          </div>
        ) : (
          <div className="flex gap-2">
            {/* Machine List - 固定宽度，更窄 */}
            <div className="w-48 flex-shrink-0">
              <div className="bg-gray-800/50 backdrop-blur-lg rounded-lg border border-gray-700 p-2">
                <h2 className="text-sm font-semibold text-gray-400 mb-2 px-2">Machines ({machines.length})</h2>
                <div className="space-y-1">
                  {machines.map((machine) => (
                    <button
                      key={machine.id}
                      onClick={() => setSelectedMachine(machine)}
                      className={`w-full text-left p-2 rounded-lg transition-colors ${
                        selectedMachine?.id === machine.id
                          ? 'bg-cyan-600 hover:bg-cyan-700'
                          : 'bg-gray-700/50 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className="font-medium text-white text-xs truncate">{machine.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailMachine(machine)
                            setShowMachineDetails(true)
                          }}
                          className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                        >
                          <Info size={12} className="text-gray-300" />
                        </button>
                      </div>
                      <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusBadgeColor(machine.status)}`}>
                        {machine.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar - 占据剩余空间 */}
            <div className="flex-1 min-w-0">
              {selectedMachine ? (
                <Suspense fallback={
                  <div className="bg-gray-800/50 backdrop-blur-lg rounded-lg border border-gray-700 p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading calendar...</p>
                  </div>
                }>
                  <MachineBookingCalendar
                    machine={selectedMachine}
                    bookings={localBookings.filter(b => b.machineId === selectedMachine.id)}
                    onBooking={handleBooking}
                    onDeleteBooking={handleDeleteBooking}
                    currentUser={user}
                  />
                </Suspense>
              ) : (
                <div className="bg-gray-800/50 backdrop-blur-lg rounded-lg border border-gray-700 p-8 text-center">
                  <p className="text-gray-400">Please select a machine</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
    {/* </div>
  )
} */}
      {/* Machine Details Modal - 响应式设计 */}
      {showMachineDetails && detailMachine && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4 md:p-6"
          onClick={() => setShowMachineDetails(false)} // 点击背景关闭
        >
          <div 
            className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-[95vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()} // 阻止冒泡
          >
            {/* Header - 固定在顶部 */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700 shrink-0">
              <h3 className="text-lg sm:text-xl font-bold text-white truncate pr-2">{detailMachine.name}</h3>
              <button
                onClick={() => setShowMachineDetails(false)}
                className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors shrink-0"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            
            {/* Content - 可滚动区域 */}
            <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
              {/* Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-sm">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(detailMachine.status)}`}>
                  {detailMachine.status}
                </span>
              </div>
              
              {/* Description */}
              {detailMachine.description && (
                <div>
                  <span className="text-gray-400 text-xs sm:text-sm">Description:</span>
                  <p className="text-white mt-1 text-sm sm:text-base break-words">{detailMachine.description}</p>
                </div>
              )}
              
              {/* Intro */}
              {detailMachine.intro && (
                <div>
                  <span className="text-gray-400 text-xs sm:text-sm">Introduction:</span>
                  <p className="text-white mt-1 text-sm sm:text-base break-words">{detailMachine.intro}</p>
                </div>
              )}
              
              {/* Network Info - 响应式网格 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {detailMachine.ip && (
                  <div className="bg-gray-700/30 rounded-lg p-2 sm:p-3">
                    <span className="text-gray-400 text-xs">IP Address:</span>
                    <p className="text-white font-mono text-sm sm:text-base truncate">{detailMachine.ip}</p>
                  </div>
                )}
                {detailMachine.ipmi_ip && (
                  <div className="bg-gray-700/30 rounded-lg p-2 sm:p-3">
                    <span className="text-gray-400 text-xs">IPMI IP:</span>
                    <p className="text-white font-mono text-sm sm:text-base truncate">{detailMachine.ipmi_ip}</p>
                  </div>
                )}
              </div>
              
              {/* Location & Model - 响应式网格 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {detailMachine.location && (
                  <div className="bg-gray-700/30 rounded-lg p-2 sm:p-3">
                    <span className="text-gray-400 text-xs">Location:</span>
                    <p className="text-white text-sm sm:text-base truncate">{detailMachine.location}</p>
                  </div>
                )}
                {detailMachine.model && (
                  <div className="bg-gray-700/30 rounded-lg p-2 sm:p-3">
                    <span className="text-gray-400 text-xs">Model:</span>
                    <p className="text-white text-sm sm:text-base truncate">{detailMachine.model}</p>
                  </div>
                )}
              </div>
              
              {/* Specs - 响应式设计 */}
              <div>
                <span className="text-gray-400 text-xs sm:text-sm block mb-2">Specifications:</span>
                <div className="bg-gray-700/50 rounded-lg p-2 sm:p-3">
                  {/* 小屏幕：垂直列表，大屏幕：网格布局 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                    <div className="flex justify-between sm:flex-col sm:gap-1 bg-gray-600/30 rounded p-2">
                      <span className="text-gray-400 text-xs">GPU</span>
                      <span className="text-white text-xs sm:text-sm font-medium truncate">{detailMachine.specs?.gpu || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-1 bg-gray-600/30 rounded p-2">
                      <span className="text-gray-400 text-xs">CPU</span>
                      <span className="text-white text-xs sm:text-sm font-medium truncate">{detailMachine.specs?.cpu || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-1 bg-gray-600/30 rounded p-2">
                      <span className="text-gray-400 text-xs">RAM</span>
                      <span className="text-white text-xs sm:text-sm font-medium truncate">{detailMachine.specs?.ram || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-1 bg-gray-600/30 rounded p-2">
                      <span className="text-gray-400 text-xs">Storage</span>
                      <span className="text-white text-xs sm:text-sm font-medium truncate">{detailMachine.specs?.storage || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-1 bg-gray-600/30 rounded p-2">
                      <span className="text-gray-400 text-xs">Network</span>
                      <span className="text-white text-xs sm:text-sm font-medium truncate">{detailMachine.specs?.network || 'N/A'}</span>
                    </div>
                    {detailMachine.maxSharedUsers && (
                      <div className="flex justify-between sm:flex-col sm:gap-1 bg-cyan-600/20 rounded p-2">
                        <span className="text-gray-400 text-xs">Max Users</span>
                        <span className="text-cyan-400 text-xs sm:text-sm font-medium">{detailMachine.maxSharedUsers}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer - 固定在底部 */}
            <div className="p-3 sm:p-4 border-t border-gray-700 shrink-0">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => setShowMachineDetails(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm sm:text-base"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setSelectedMachine(detailMachine)
                    setShowMachineDetails(false)
                  }}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors text-sm sm:text-base"
                >
                  Select This Machine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
