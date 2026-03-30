import { useState, useCallback, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, SlotInfo, Event as BigCalendarEvent, View } from 'react-big-calendar'
import { format, parse, startOfWeek as dateFnsStartOfWeek, getDay as dateFnsGetDay } from 'date-fns'
import { Clock, User as UserIcon, X, Calendar as CalendarIcon } from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

interface Machine {
  id: string
  name: string
  description: string
  status: string
  intro?: string
  specs?: {
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
  status?: string
}

// 更新 User 接口以匹配实际数据
interface User {
  ntid?: string
  username?: string
  role: 'viewer' | 'developer' | 'admin' | 'user'
  displayName: string
  email?: string
  timezone?: string
}

interface MachineBookingCalendarProps {
  machine: Machine
  bookings: Booking[]
  onBooking: (machineId: string, start: Date, end: Date) => void
  onDeleteBooking: (bookingId: string) => Promise<void>
  currentUser: User | null
}

interface CalendarEvent extends BigCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay?: boolean
  resource: {
    booking: Booking | null
    isCurrentUser: boolean
    isPending?: boolean
    pendingStatus?: 'loading' | 'success' | 'error'
    isDeleting?: boolean
  }
}

interface BookingDialogState {
  isOpen: boolean
  start: Date | null
  end: Date | null
  allDay: boolean
}

interface BookingDetailDialogState {
  isOpen: boolean
  booking: Booking | null
}

// Helper function to get user identifier (ntid or username)
const getUserId = (user: User | null): string => {
  if (!user) return ''
  return user.ntid || user.username || ''
}

// Helper function to check if user is admin
const isAdminUser = (user: User | null): boolean => {
  if (!user) return false
  return user.role === 'admin'
}

// Configure date-fns localizer without locale (uses English by default)
// Helper function to format date and time
const formatDateTime = (date: Date, type: 'full' | 'time' | 'short') => {
  
  if (type === 'full') {
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    }).format(date)
  } else if (type === 'time') {
    const hours = date.getHours()
    const minutes = date.getMinutes()
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  } else {
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).format(date)
  }
}

// Round a date up to the next 30-minute boundary
const roundToNext30Min = (date: Date): Date => {
  const ms = 30 * 60 * 1000
  return new Date(Math.ceil(date.getTime() / ms) * ms)
}

// Format a Date as a YYYY-MM-DD string for <input type="date">
const toDateInputValue = (date: Date): string => {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

// Detect whether a booking occupies a full day (00:00 start, 23:59+ end)
const isAllDayEvent = (start: Date, end: Date): boolean => {
  return start.getHours() === 0 && start.getMinutes() === 0 &&
         end.getHours() === 23 && end.getMinutes() >= 59
}

const localizer = dateFnsLocalizer({
  format: (date: Date, formatStr: string) => format(date, formatStr),
  parse: (dateString: string, formatString: string, baseDate: Date) => parse(dateString, formatString, baseDate),
  startOfWeek: (date: Date) => dateFnsStartOfWeek(date, { weekStartsOn: 0 }),
  getDay: (date: Date) => dateFnsGetDay(date),
  locales: {},
})

export default function MachineBookingCalendar({
  machine,
  bookings,
  onBooking,
  onDeleteBooking,
  currentUser
}: MachineBookingCalendarProps) {
  const [view, setView] = useState<View>('week')
  const [date, setDate] = useState(new Date())

  // pending booking 状态
  const [pendingBooking, setPendingBooking] = useState<{
    start: Date
    end: Date
    status: 'loading' | 'success' | 'error'
  } | null>(null)

  // deleting booking 状态
  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null)

  const [bookingDialog, setBookingDialog] = useState<BookingDialogState>({
    isOpen: false,
    start: null,
    end: null,
    allDay: false,
  })

  const [bookingDetailDialog, setBookingDetailDialog] = useState<BookingDetailDialogState>({
    isOpen: false,
    booking: null
  })

  // 获取当前用户 ID
  const currentUserId = getUserId(currentUser)

  // 获取当前用户时区，默认为浏览器时区
  const displayTimezone = currentUser?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone


  // Convert bookings to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const bookingEvents: CalendarEvent[] = bookings.map(booking => {
      // 新增：判断是否正在删除
      const isDeleting = booking.id === deletingBookingId

      const startDate = new Date(booking.startTime)
      const endDate = new Date(booking.endTime)
      return {
        id: booking.id,
        title: isDeleting ? 'Deleting...' : booking.userName,
        start: startDate,
        end: endDate,
        allDay: isAllDayEvent(startDate, endDate),
        resource: {
          booking,
          isCurrentUser: currentUserId ? booking.userId === currentUserId : false,
          isPending: false,
          isDeleting // 传入状态
        }
      }
    })
    // 添加 pending booking 到日历显示
    if (pendingBooking) {
      bookingEvents.push({
        id: 'pending-booking',
        title: pendingBooking.status === 'loading' ? '⏳ Booking...' :
               pendingBooking.status === 'error' ? '❌ Failed' : '✓ Booked',
        start: pendingBooking.start,
        end: pendingBooking.end,
        allDay: isAllDayEvent(pendingBooking.start, pendingBooking.end),
        resource: {
          booking: null,
          isCurrentUser: true,
          isPending: true,
          pendingStatus: pendingBooking.status
        }
      })
    }
    
    return bookingEvents
  }, [bookings, currentUserId, pendingBooking, deletingBookingId])

  // Handle selecting a time slot
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    // 检查用户权限（viewer 不能预订）
    if (!currentUser || currentUser.role === 'viewer') {
      alert('You do not have permission to create bookings')
      return
    }
    
    if (machine.status !== 'available') {
      alert('This machine is not available for booking')
      return
    }
    
    const now = new Date()
    if (slotInfo.end < now) {
      alert('Cannot book time slots that have already ended')
      return
    }

    setBookingDialog({
      isOpen: true,
      start: slotInfo.start,
      end: slotInfo.end,
      allDay: false,
    })
  }, [machine.status, currentUser])

  // Handle selecting an existing event
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setBookingDetailDialog({
      isOpen: true,
      booking: event.resource.booking
    })
  }, [])

  // Create a new booking
  const handleCreateBooking = async () => {
    if (!bookingDialog.start || !bookingDialog.end) return

    let start = bookingDialog.start
    let end = bookingDialog.end

    if (bookingDialog.allDay) {
      // Ensure times are exactly 00:00 and 23:59:59 on their respective dates
      start = new Date(bookingDialog.start)
      start.setHours(0, 0, 0, 0)
      end = new Date(bookingDialog.end)
      end.setHours(23, 59, 59, 999)
    } else {
      // Non-all-day: if start is in the past, snap forward to next 30-min boundary
      const now = new Date()
      if (start < now) {
        start = roundToNext30Min(now)
      }
    }

    // Close dialog immediately
    setBookingDialog({ isOpen: false, start: null, end: null, allDay: false })

    // Set pending state
    setPendingBooking({ start, end, status: 'loading' })

    try {
      onBooking(machine.id, start, end)
      setPendingBooking({ start, end, status: 'success' })
      setTimeout(() => setPendingBooking(null), 1000)
    } catch (error) {
      setPendingBooking({ start, end, status: 'error' })
      setTimeout(() => setPendingBooking(null), 3000)
    }
  }

  // Delete a booking
  const handleDeleteBooking = async () => {
    if (bookingDetailDialog.booking) {
      const bookingId = bookingDetailDialog.booking.id
      
      // 1. 关闭弹窗
      setBookingDetailDialog({ isOpen: false, booking: null })
      
      // 2. 设置正在删除状态
      setDeletingBookingId(bookingId)

      try {
        // 3. 等待删除完成
        await onDeleteBooking(bookingId)
        // 成功后，bookings 列表更新，该事件会自动消失，无需手动清除状态
        setDeletingBookingId(null)
      } catch (error) {
        console.error('Delete failed', error)
        alert('Failed to delete booking')
        // 4. 失败则恢复显示
        setDeletingBookingId(null)
      }
    }
  }

  // 检查当前用户是否可以删除预订
  const isCurrentUserBooking = (booking: Booking) => {
    if (!currentUser) return false
    // Admin 可以删除任何预订，否则只能删除自己的
    return booking.userId === currentUserId || isAdminUser(currentUser)
  }

  // Custom event style
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const { isCurrentUser, isPending, pendingStatus, isDeleting, booking } = event.resource

    const isPast = booking ? new Date(booking.endTime) < new Date() : false
    // 已完成预订（灰色，低透明度）
    if (booking && booking.status === 'completed' || isPast) {
      return {
        style: {
          backgroundColor: '#374151', // gray-700
          borderColor: '#4b5563',     // gray-600
          color: '#9ca3af',           // gray-400
          opacity: 0.6,
          borderStyle: 'dashed'       // 可选：虚线边框表示过去式
        }
      }
    }
    // deleting状态样式
    if (isDeleting) {
      return {
        style: {
          backgroundColor: '#6b7280', // 灰色
          borderColor: '#4b5563',
          color: '#e5e7eb',
          opacity: 0.7,
          cursor: 'wait',
          animation: 'pulse 1.5s infinite'
        }
      }
    }

    // Pending booking 样式
    if (isPending) {
      if (pendingStatus === 'loading') {
        return {
          style: {
            backgroundColor: '#fbbf24', // 黄色
            borderColor: '#f59e0b',
            color: '#1f2937',
            animation: 'pulse 1.5s infinite'
          }
        }
      } else if (pendingStatus === 'error') {
        return {
          style: {
            backgroundColor: '#ef4444',
            borderColor: '#dc2626',
            color: 'white'
          }
        }
      } else {
        return {
          style: {
            backgroundColor: '#10b981',
            borderColor: '#059669',
            color: 'white'
          }
        }
      }
    }

    // 正常预订样式
    return {
      style: {
        backgroundColor: isCurrentUser ? '#0891b2' : '#9333ea',
        borderColor: isCurrentUser ? '#0e7490' : '#7e22ce',
        color: 'white',
      }
    }
  }, [])

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    const { isPending, pendingStatus, isDeleting } = event.resource

    // deleting状态显示
    if (isDeleting) {
      return (
        <div className="flex items-center gap-1 text-xs p-1 animate-pulse">
          <span>🗑️</span>
          <span>Deleting...</span>
        </div>
      )
    }

    // Pending booking 显示
    if (isPending) {
      return (
        <div className={`flex items-center gap-1 text-xs p-1 ${pendingStatus === 'loading' ? 'animate-pulse' : ''}`}>
          {pendingStatus === 'loading' && (
            <>
              <span>⏳</span>
              <span>Booking...</span>
            </>
          )}
          {pendingStatus === 'error' && <span>❌ Failed</span>}
          {pendingStatus === 'success' && <span>✓ Booked</span>}
        </div>
      )
    }
    return (
      <div className="truncate">
        <div className="font-medium">{event.title}</div>
        <div className="text-[10px] opacity-90">
          {formatDateTime(event.start, 'time')} - {formatDateTime(event.end, 'time')}
        </div>
      </div>
    )
  }

  // Prevent selecting non-available machines
  const slotPropGetter = useCallback((date: Date) => {
    const now = new Date()
    const isPast = date < now
    
    if (isPast || machine.status !== 'available') {
      return {
        className: 'rbc-off-range-bg',
        style: {
          backgroundColor: 'rgba(31, 41, 55, 0.5)',
        }
      }
    }
    
    return {}
  }, [machine.status])

    return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-lg border border-gray-700 h-full flex flex-col">
      {/* Header - 更紧凑，单行 */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">{machine.name}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            machine.status === 'available' 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {machine.status}
          </span>
          <span className="text-gray-500 text-sm hidden md:inline">— {machine.description}</span>
        </div>
        {/* Legend - 移到 header 右侧 */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-gray-400 bg-gray-800/80 px-2 py-1 rounded border border-gray-600">
            <Clock size={12} />
            <span>{displayTimezone}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-cyan-600 rounded"></div>
            <span className="text-gray-400">You</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-purple-600 rounded"></div>
            <span className="text-gray-400">Others</span>
          </div>
        </div>
      </div>

      {/* Calendar - 最大化高度 */}
      <div className="p-2 flex-1 min-h-0 overflow-hidden">
        <div className="bg-white rounded-lg overflow-hidden" style={{ height: '100%' }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            views={['month', 'week', 'day']}
            selectable={currentUser?.role !== 'viewer'}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            slotPropGetter={slotPropGetter}
            showMultiDayTimes={true}
            components={{
              event: EventComponent,
            }}
            min={new Date(0, 0, 0, 7, 0, 0)}
            max={new Date(0, 0, 0, 23, 0, 0)}
            scrollToTime={new Date(0, 0, 0, 8, 0, 0)}
            step={30}
            timeslots={2}
            formats={{
              timeGutterFormat: (date: Date) => {
                const hours = date.getHours()
                const minutes = date.getMinutes()
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
              },
              eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
                return `${formatDateTime(start, 'time')} - ${formatDateTime(end, 'time')}`
              },
              dayFormat: (date: Date) => {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                return `${days[date.getDay()]} ${date.getDate()}`
              },
              monthHeaderFormat: (date: Date) => {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                return `${months[date.getMonth()]} ${date.getFullYear()}`
              },
              dayHeaderFormat: (date: Date) => {
                const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
              },
              dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) => {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
              },
            }}
            style={{ height: '100%' }}
          />
        </div>
      </div>

      {/* Booking Dialog */}
      {bookingDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Create Booking</h3>
              <button
                onClick={() => setBookingDialog({ isOpen: false, start: null, end: null, allDay: false })}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Machine name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Machine</label>
                <div className="text-white font-semibold">{machine.name}</div>
              </div>

              {/* All Day toggle */}
              <div className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3">
                <label className="text-sm font-medium text-gray-300">All Day</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!bookingDialog.allDay) {
                      const start = new Date(bookingDialog.start || new Date())
                      start.setHours(0, 0, 0, 0)
                      const end = new Date(start)
                      end.setHours(23, 59, 59, 999)
                      setBookingDialog(prev => ({ ...prev, allDay: true, start, end }))
                    } else {
                      const now = new Date()
                      const rawStart = bookingDialog.start || now
                      const start = rawStart > now ? rawStart : roundToNext30Min(now)
                      const end = new Date(start.getTime() + 60 * 60 * 1000)
                      setBookingDialog(prev => ({ ...prev, allDay: false, start, end }))
                    }
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${bookingDialog.allDay ? 'bg-cyan-600' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${bookingDialog.allDay ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {bookingDialog.start && bookingDialog.end && (
                bookingDialog.allDay ? (
                  /* All Day: date-only pickers */
                  <div className="space-y-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
                        <CalendarIcon size={14} className="text-cyan-400" />
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue(bookingDialog.start)}
                        onChange={(e) => {
                          if (!e.target.value) return
                          const start = new Date(e.target.value + 'T00:00:00')
                          const end = bookingDialog.end && start <= bookingDialog.end
                            ? bookingDialog.end
                            : new Date(e.target.value + 'T23:59:59.999')
                          setBookingDialog(prev => ({ ...prev, start, end }))
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
                        <CalendarIcon size={14} className="text-cyan-400" />
                        End Date
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue(bookingDialog.end)}
                        min={toDateInputValue(bookingDialog.start)}
                        onChange={(e) => {
                          if (!e.target.value) return
                          const end = new Date(e.target.value + 'T23:59:59.999')
                          setBookingDialog(prev => ({ ...prev, end }))
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                ) : (
                  /* Timed: datetime-local pickers */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Start Time</label>
                      <input
                        type="datetime-local"
                        value={new Date(bookingDialog.start.getTime() - bookingDialog.start.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        onChange={(e) => {
                          if (!e.target.value) return
                          const newStart = new Date(e.target.value)
                          let newEnd = bookingDialog.end
                          if (newEnd && newStart >= newEnd) {
                            newEnd = new Date(newStart.getTime() + 60 * 60 * 1000)
                          }
                          setBookingDialog(prev => ({ ...prev, start: newStart, end: newEnd }))
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">End Time</label>
                      <input
                        type="datetime-local"
                        value={new Date(bookingDialog.end.getTime() - bookingDialog.end.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        min={new Date(bookingDialog.start.getTime() - bookingDialog.start.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        onChange={(e) => {
                          if (!e.target.value) return
                          const newEnd = new Date(e.target.value)
                          setBookingDialog(prev => ({ ...prev, end: newEnd }))
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                )
              )}

              {/* Booking Summary */}
              {bookingDialog.start && bookingDialog.end && (
                <div className="bg-gray-700/50 rounded-lg p-4 border-l-4 border-cyan-500">
                  <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                    <Clock size={16} />
                    <span>Booking Summary</span>
                  </div>
                  <div className="text-white">
                    {bookingDialog.allDay ? (
                      <>
                        <div className="font-medium">{formatDateTime(bookingDialog.start, 'full')}</div>
                        {bookingDialog.end.toDateString() !== bookingDialog.start.toDateString() && (
                          <div className="text-cyan-400 mt-1">→ {formatDateTime(bookingDialog.end, 'full')}</div>
                        )}
                        <div className="text-sm text-gray-400 mt-1">
                          Duration: {
                            Math.round(
                              (new Date(bookingDialog.end.getFullYear(), bookingDialog.end.getMonth(), bookingDialog.end.getDate()).getTime() -
                               new Date(bookingDialog.start.getFullYear(), bookingDialog.start.getMonth(), bookingDialog.start.getDate()).getTime()
                              ) / (1000 * 60 * 60 * 24)
                            ) + 1
                          } day(s) · All Day
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">{formatDateTime(bookingDialog.start, 'full')}</div>
                        <div className="text-cyan-400 mt-1">
                          {formatDateTime(bookingDialog.start, 'time')} → {formatDateTime(bookingDialog.end, 'time')}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          Duration: {Math.round((bookingDialog.end.getTime() - bookingDialog.start.getTime()) / (1000 * 60 * 60) * 2) / 2} hour(s)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setBookingDialog({ isOpen: false, start: null, end: null, allDay: false })}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBooking}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                >
                  Confirm Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Detail Dialog */}
      {bookingDetailDialog.isOpen && bookingDetailDialog.booking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Booking Details</h3>
              <button
                onClick={() => setBookingDetailDialog({ isOpen: false, booking: null })}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Machine</label>
                <div className="text-white font-semibold">{machine.name}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <UserIcon size={16} />
                  Booked By
                </label>
                <div className="text-white">{bookingDetailDialog.booking.userName}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Clock size={16} />
                  Time Slot
                </label>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="text-white">
                    <div className="font-medium">
                      {formatDateTime(new Date(bookingDetailDialog.booking.startTime), 'full')}
                    </div>
                    <div className="text-cyan-400 mt-1">
                      {formatDateTime(new Date(bookingDetailDialog.booking.startTime), 'time')} 
                      {' → '}
                      {formatDateTime(new Date(bookingDetailDialog.booking.endTime), 'time')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setBookingDetailDialog({ isOpen: false, booking: null })}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
                {isCurrentUserBooking(bookingDetailDialog.booking) && (
                  <button
                    onClick={handleDeleteBooking}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    Delete Booking
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles */}
      <style>{`
        .rbc-calendar { font-family: inherit; }
        .rbc-header { padding: 12px 4px; font-weight: 600; color: #1f2937; border-bottom: 2px solid #e5e7eb; }
        .rbc-time-view { border: 1px solid #e5e7eb; }
        .rbc-time-header-content { border-left: 1px solid #e5e7eb; }
        .rbc-time-content { border-top: 1px solid #e5e7eb; }
        .rbc-day-slot .rbc-time-slot { border-top: 1px solid #f3f4f6; }
        .rbc-time-slot { min-height: 20px; }
        .rbc-today { background-color: #ecfeff; }
        .rbc-current-time-indicator { background-color: #ef4444; height: 2px; }
        .rbc-event { padding: 4px 6px; cursor: pointer; }
        .rbc-event:hover { opacity: 0.9; }
        .rbc-slot-selection { background-color: rgba(8, 145, 178, 0.3); border: 2px dashed #0891b2; }
        .rbc-toolbar { padding: 16px; display: flex; justify-content: space-between; align-items: center; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; margin-bottom: 0; }
        .rbc-toolbar button { color: #374151; border: 1px solid #d1d5db; background-color: white; padding: 6px 12px; border-radius: 6px; font-weight: 500; transition: all 0.2s; }
        .rbc-toolbar button:hover { background-color: #f3f4f6; border-color: #9ca3af; }
        .rbc-toolbar button:active, .rbc-toolbar button.rbc-active { background-color: #0891b2; color: white; border-color: #0891b2; }
        .rbc-toolbar button:focus { outline: none; box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.2); }
        .rbc-month-view { border: 1px solid #e5e7eb; }
        .rbc-month-row { border-top: 1px solid #e5e7eb; }
        .rbc-day-bg + .rbc-day-bg { border-left: 1px solid #e5e7eb; }
        .rbc-date-cell { padding: 8px; text-align: right; }
        .rbc-off-range { color: #9ca3af; }
        .rbc-off-range-bg { background-color: rgba(31, 41, 55, 0.5); }
        /* All-day event strip styling */
        .rbc-allday-cell { background-color: rgba(8, 145, 178, 0.05); border-bottom: 2px solid rgba(6, 182, 212, 0.2); }
        .rbc-event.rbc-event-allday { border-radius: 4px; font-weight: 600; opacity: 0.9; }
        .rbc-row-segment .rbc-event-content { font-size: 12px; }
      `}</style>
    </div>
  )
}