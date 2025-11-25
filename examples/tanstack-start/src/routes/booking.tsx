import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, lazy, Suspense, useEffect } from 'react'
import { Info, X, Power, PowerOff, Settings } from 'lucide-react'
import { getCurrentUser, isAdmin, type User } from '../utils/auth'

// Dynamic import to avoid SSR issues with date-fns
const MachineBookingCalendar = lazy(() => import('../components/MachineBookingCalendar'))

export const Route = createFileRoute('/booking')({
  component: BookingPage,
  // Disable SSR for this route to avoid date-fns compatibility issues
  ssr: false,
  beforeLoad: ({ location }) => {
    const user = getCurrentUser()
    if (!user) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  loader: async () => {
    // 在实际应用中，这里会从数据库获取机器列表和预订数据
    const machines = [
      {
        id: '1',
        name: 'cse-ai-1',
        description: 'GPU Server',
        status: 'available',
        intro: '8x A100 GPU | 64-Core CPU | 1TB RAM',
        specs: {
          gpu: 'NVIDIA A100 80GB x8',
          cpu: 'AMD EPYC 7763 64-Core',
          ram: '1TB DDR4',
          storage: '4TB NVMe SSD',
          network: '100Gbps InfiniBand'
        }
      },
      {
        id: '2',
        name: 'cse-ai-2',
        description: 'GPU Server',
        status: 'available',
        intro: '8x A100 GPU | 64-Core CPU | 1TB RAM',
        specs: {
          gpu: 'NVIDIA A100 80GB x8',
          cpu: 'AMD EPYC 7763 64-Core',
          ram: '1TB DDR4',
          storage: '4TB NVMe SSD',
          network: '100Gbps InfiniBand'
        }
      },
      {
        id: '3',
        name: 'cse-ai-3',
        description: 'High-Memory Server',
        status: 'available',
        intro: '4x H100 GPU | 56-Core CPU | 2TB RAM',
        specs: {
          gpu: 'NVIDIA H100 80GB x4',
          cpu: 'Intel Xeon Platinum 8480+ 56-Core',
          ram: '2TB DDR5',
          storage: '8TB NVMe SSD',
          network: '200Gbps InfiniBand'
        }
      },
      {
        id: '4',
        name: 'cse-ai-4',
        description: 'CPU Compute Server',
        status: 'available',
        intro: '192 Cores | 1.5TB RAM | No GPU',
        specs: {
          gpu: 'None',
          cpu: 'AMD EPYC 9654 96-Core x2',
          ram: '1.5TB DDR5',
          storage: '10TB NVMe SSD',
          network: '100Gbps InfiniBand'
        }
      }
    ]

    // 模拟现有预订数据
    const bookings = [
      {
        id: '1',
        machineId: '1',
        userId: 'user1',
        userName: 'John Doe',
        startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).setHours(9, 0, 0, 0),
        endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).setHours(17, 0, 0, 0),
      },
      {
        id: '2',
        machineId: '2',
        userId: 'user2',
        userName: 'Jane Smith',
        startTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).setHours(10, 0, 0, 0),
        endTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).setHours(16, 0, 0, 0),
      },
      {
        id: '3',
        machineId: '1',
        userId: 'user3',
        userName: 'Alice Johnson',
        startTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).setHours(13, 0, 0, 0),
        endTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).setHours(18, 0, 0, 0),
      }
    ]

    return { machines, bookings }
  }
})

interface Machine {
  id: string
  name: string
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
  const { machines: initialMachines, bookings } = Route.useLoaderData() as { machines: Machine[], bookings: Booking[] }
  const [user, setUser] = useState<User | null>(null)
  const [machines, setMachines] = useState<Machine[]>(initialMachines)
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(machines[0] || null)
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings)
  const [showMachineDetails, setShowMachineDetails] = useState(false)
  const [detailMachine, setDetailMachine] = useState<Machine | null>(null)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null)
  const [editingIntro, setEditingIntro] = useState('')

  useEffect(() => {
    const currentUser = getCurrentUser()
    setUser(currentUser)
  }, [])

  const handleBooking = (machineId: string, startTime: Date, endTime: Date) => {
    if (!user) return
    
    // 在实际应用中，这里会调用API保存预订
    const newBooking: Booking = {
      id: `booking-${Date.now()}`,
      machineId,
      userId: user.username,
      userName: user.displayName,
      startTime: startTime.getTime(),
      endTime: endTime.getTime()
    }
    setLocalBookings([...localBookings, newBooking])
    console.log('New booking created:', newBooking)
  }

  const handleDeleteBooking = (bookingId: string) => {
    // 在实际应用中，这里会调用API删除预订
    setLocalBookings(localBookings.filter(b => b.id !== bookingId))
    console.log('Booking deleted:', bookingId)
  }

  const handleToggleMachineStatus = (machineId: string) => {
    if (!isAdmin(user)) return
    
    setMachines(machines.map(m => {
      if (m.id === machineId) {
        const newStatus = m.status === 'available' ? 'offline' : 'available'
        console.log(`Machine ${m.name} status changed to: ${newStatus}`)
        return { ...m, status: newStatus }
      }
      return m
    }))
  }

  const handleEditMachineIntro = (machineId: string, currentIntro: string) => {
    setEditingMachineId(machineId)
    setEditingIntro(currentIntro || '')
  }

  const handleSaveMachineIntro = (machineId: string) => {
    if (!isAdmin(user)) return
    
    setMachines(machines.map(m => {
      if (m.id === machineId) {
        console.log(`Machine ${m.name} intro updated to: ${editingIntro}`)
        return { ...m, intro: editingIntro }
      }
      return m
    }))
    setEditingMachineId(null)
    setEditingIntro('')
  }

  const handleCancelEdit = () => {
    setEditingMachineId(null)
    setEditingIntro('')
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'maintenance':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'offline':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="container mx-auto p-6">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2">Machine Booking System</h1>
            <p className="text-gray-600">Schedule and manage machine access time slots</p>
          </div>
          {user && isAdmin(user) && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Settings size={20} />
              <span>Admin Panel</span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        {/* Machine List */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 p-4">
            <h2 className="text-lg font-semibold text-white mb-4">Machines</h2>
            <div className="space-y-2">
              {machines.map((machine) => (
                <div key={machine.id} className="relative">
                  <button
                    onClick={() => setSelectedMachine(machine)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedMachine?.id === machine.id
                        ? 'bg-cyan-600 hover:bg-cyan-700'
                        : 'bg-gray-700/50 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-white text-sm">{machine.name}</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailMachine(machine)
                          setShowMachineDetails(true)
                        }}
                        className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                      >
                        <Info size={14} className="text-gray-300" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-300 mb-1">{machine.description}</p>
                    {machine.intro && (
                      <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">{machine.intro}</p>
                    )}
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${getStatusBadgeColor(machine.status)}`}>
                      {machine.status}
                    </span>
                  </button>
                </div>
              ))}
            </div>

            {/* Statistics */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Available</span>
                  <span className="text-green-400 font-medium">
                    {machines.filter(m => m.status === 'available').length}/{machines.length}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Your Bookings</span>
                  <span className="text-cyan-400 font-medium">
                    {localBookings.filter(b => b.userId === 'current-user').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="lg:col-span-5">
          {selectedMachine ? (
            <Suspense fallback={
              <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 p-8 text-center">
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
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 p-8 text-center">
              <p className="text-gray-400">Please select a machine to view its booking calendar</p>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-2">How to Book</h3>
        <ul className="text-gray-300 space-y-2">
          <li>• Select a machine from the list on the left</li>
          <li>• Click <Info size={14} className="inline" /> to view detailed machine specifications</li>
          <li>• Click on a time slot in the calendar to create a booking</li>
          <li>• Click on an existing booking to view details or delete it</li>
          <li>• Machine access will be automatically granted during your booked time slots</li>
        </ul>
      </div>

      {/* Admin Panel */}
      {showAdminPanel && isAdmin(user) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">👑 Admin Control Panel</h3>
              <button
                onClick={() => setShowAdminPanel(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Machine Control */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Machine Control</h4>
                <div className="grid grid-cols-1 gap-4">
                  {machines.map((machine) => (
                    <div
                      key={machine.id}
                      className="bg-gray-700/30 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-white">{machine.name}</div>
                          <div className="text-sm text-gray-400">{machine.description}</div>
                          <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full border ${getStatusBadgeColor(machine.status)}`}>
                            {machine.status}
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleMachineStatus(machine.id)}
                          className={`p-3 rounded-lg transition-colors ${
                            machine.status === 'available'
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                          title={machine.status === 'available' ? 'Turn Off' : 'Turn On'}
                        >
                          {machine.status === 'available' ? (
                            <PowerOff size={20} className="text-white" />
                          ) : (
                            <Power size={20} className="text-white" />
                          )}
                        </button>
                      </div>
                      
                      <div className="border-t border-gray-600 pt-3">
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                          Machine Introduction
                        </label>
                        {editingMachineId === machine.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingIntro}
                              onChange={(e) => setEditingIntro(e.target.value)}
                              className="w-full bg-gray-600 text-white text-sm rounded-lg px-3 py-2 border border-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                              placeholder="e.g., 8x A100 GPU | 64-Core CPU | 1TB RAM"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveMachineIntro(machine.id)}
                                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-300">
                              {machine.intro || 'No introduction set'}
                            </p>
                            <button
                              onClick={() => handleEditMachineIntro(machine.id, machine.intro || '')}
                              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* All Bookings Management */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">All Bookings</h4>
                <div className="space-y-2">
                  {localBookings.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">No bookings yet</div>
                  ) : (
                    localBookings.map((booking) => {
                      const machine = machines.find(m => m.id === booking.machineId)
                      return (
                        <div
                          key={booking.id}
                          className="bg-gray-700/30 rounded-lg p-4 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-white">{machine?.name}</span>
                              <span className="text-xs text-gray-400">by {booking.userName}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                              {new Date(booking.startTime).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                              {' → '}
                              {new Date(booking.endTime).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteBooking(booking.id)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowAdminPanel(false)}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Machine Details Dialog */}
      {showMachineDetails && detailMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{detailMachine.name}</h3>
                <p className="text-gray-400 mt-1">{detailMachine.description}</p>
              </div>
              <button
                onClick={() => setShowMachineDetails(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase">Hardware Specifications</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-xs text-gray-400 mb-1">GPU</div>
                    <div className="text-white font-medium">{detailMachine.specs.gpu}</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-xs text-gray-400 mb-1">CPU</div>
                    <div className="text-white font-medium">{detailMachine.specs.cpu}</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-xs text-gray-400 mb-1">RAM</div>
                    <div className="text-white font-medium">{detailMachine.specs.ram}</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-xs text-gray-400 mb-1">Storage</div>
                    <div className="text-white font-medium">{detailMachine.specs.storage}</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4 md:col-span-2">
                    <div className="text-xs text-gray-400 mb-1">Network</div>
                    <div className="text-white font-medium">{detailMachine.specs.network}</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase">Status</h4>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full border text-sm ${getStatusBadgeColor(detailMachine.status)}`}>
                    {detailMachine.status}
                  </span>
                  {detailMachine.status === 'available' && (
                    <span className="text-sm text-gray-400">Ready for booking</span>
                  )}
                  {detailMachine.status === 'maintenance' && (
                    <span className="text-sm text-gray-400">Under maintenance</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowMachineDetails(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
                {detailMachine.status === 'available' && (
                  <button
                    onClick={() => {
                      setSelectedMachine(detailMachine)
                      setShowMachineDetails(false)
                    }}
                    className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                  >
                    Select & Book
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

