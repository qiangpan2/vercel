import { useState, useCallback, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, SlotInfo, Event as BigCalendarEvent, View } from 'react-big-calendar'
import { format, parse, startOfWeek as dateFnsStartOfWeek, getDay as dateFnsGetDay } from 'date-fns'
import { Clock, User, X } from 'lucide-react'
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
}

interface User {
  username: string
  role: 'admin' | 'user'
  displayName: string
}

interface MachineBookingCalendarProps {
  machine: Machine
  bookings: Booking[]
  onBooking: (machineId: string, startTime: Date, endTime: Date) => void
  onDeleteBooking: (bookingId: string) => void
  currentUser: User | null
}

interface CalendarEvent extends BigCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: {
    booking: Booking
    isCurrentUser: boolean
  }
}

interface BookingDialogState {
  isOpen: boolean
  start: Date | null
  end: Date | null
}

interface BookingDetailDialogState {
  isOpen: boolean
  booking: Booking | null
}

// Configure date-fns localizer without locale (uses English by default)
// Helper function to format date and time
const formatDateTime = (date: Date, type: 'full' | 'time' | 'short') => {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  
  if (type === 'full') {
    // "Monday, November 25, 2024"
    return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  } else if (type === 'time') {
    // "9:30 AM"
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
  } else {
    // "Nov 25"
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${shortMonths[date.getMonth()]} ${date.getDate()}`
  }
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

  const [bookingDialog, setBookingDialog] = useState<BookingDialogState>({
    isOpen: false,
    start: null,
    end: null
  })

  const [bookingDetailDialog, setBookingDetailDialog] = useState<BookingDetailDialogState>({
    isOpen: false,
    booking: null
  })

  // Convert bookings to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return bookings.map(booking => ({
      id: booking.id,
      title: booking.userName,
      start: new Date(booking.startTime),
      end: new Date(booking.endTime),
      resource: {
        booking,
        isCurrentUser: currentUser ? booking.userId === currentUser.username : false
      }
    }))
  }, [bookings, currentUser])

  // Handle selecting a time slot
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if (machine.status !== 'available') return
    
    const now = new Date()
    if (slotInfo.start < now) return // Prevent booking past time slots
    
    setBookingDialog({
      isOpen: true,
      start: slotInfo.start,
      end: slotInfo.end
    })
  }, [machine.status])

  // Handle selecting an existing event
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setBookingDetailDialog({
      isOpen: true,
      booking: event.resource.booking
    })
  }, [])

  // Create a new booking
  const handleCreateBooking = () => {
    if (bookingDialog.start && bookingDialog.end) {
      onBooking(machine.id, bookingDialog.start, bookingDialog.end)
      setBookingDialog({ isOpen: false, start: null, end: null })
    }
  }

  // Delete a booking
  const handleDeleteBooking = () => {
    if (bookingDetailDialog.booking) {
      onDeleteBooking(bookingDetailDialog.booking.id)
      setBookingDetailDialog({ isOpen: false, booking: null })
    }
  }

  const isCurrentUserBooking = (booking: Booking) => {
    if (!currentUser) return false
    return booking.userId === currentUser.username || currentUser.role === 'admin'
  }

  // Custom event style
  const eventStyleGetter = (event: CalendarEvent) => {
    const isCurrentUser = event.resource.isCurrentUser
    
    return {
      style: {
        backgroundColor: isCurrentUser ? '#0891b2' : '#9333ea',
        borderColor: isCurrentUser ? '#06b6d4' : '#a855f7',
        color: 'white',
        borderRadius: '6px',
        border: '2px solid',
        fontSize: '12px',
        fontWeight: '500',
        padding: '2px 6px',
      }
    }
  }

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
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
          cursor: 'not-allowed'
        }
      }
    }
    
    return {}
  }, [machine.status])

  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white">{machine.name}</h2>
          <p className="text-gray-400 text-sm">{machine.description}</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="p-6">
        <div className="bg-white rounded-lg overflow-hidden" style={{ height: '800px' }}>
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
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            slotPropGetter={slotPropGetter}
            components={{
              event: EventComponent,
            }}
            min={new Date(0, 0, 0, 0, 0, 0)} // 12:00 AM (midnight)
            max={new Date(0, 0, 0, 23, 59, 59)} // 11:59 PM
            step={30}
            timeslots={2}
            formats={{
              timeGutterFormat: (date: Date) => {
                const hours = date.getHours()
                const minutes = date.getMinutes()
                const ampm = hours >= 12 ? 'PM' : 'AM'
                const displayHours = hours % 12 || 12
                return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
              },
              eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
                return `${formatDateTime(start, 'time')} - ${formatDateTime(end, 'time')}`
              },
              agendaTimeFormat: (date: Date) => formatDateTime(date, 'time'),
              agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
                return `${formatDateTime(start, 'time')} - ${formatDateTime(end, 'time')}`
              },
              dayFormat: (date: Date) => {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                return `${days[date.getDay()]} ${date.getDate()}`
              },
              weekdayFormat: (date: Date) => {
                const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                return weekdays[date.getDay()]
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

        {/* Legend */}
        <div className="mt-6 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-cyan-600 rounded border-2 border-cyan-400"></div>
            <span className="text-gray-300">Your Bookings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-600 rounded border-2 border-purple-400"></div>
            <span className="text-gray-300">Others' Bookings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-800/50 rounded"></div>
            <span className="text-gray-300">Past / Unavailable</span>
          </div>
        </div>
      </div>

      {/* Booking Dialog */}
      {bookingDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Create Booking</h3>
              <button
                onClick={() => setBookingDialog({ isOpen: false, start: null, end: null })}
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

              {bookingDialog.start && bookingDialog.end && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
                    <input
                      type="date"
                      value={bookingDialog.start.toISOString().split('T')[0]}
                      onChange={(e) => {
                        if (!bookingDialog.start || !bookingDialog.end) return
                        
                        const newDate = new Date(e.target.value)
                        const newStart = new Date(bookingDialog.start)
                        const newEnd = new Date(bookingDialog.end)
                        
                        newStart.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate())
                        newEnd.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate())
                        
                        setBookingDialog({
                          ...bookingDialog,
                          start: newStart,
                          end: newEnd
                        })
                      }}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Start Time</label>
                      <input
                        type="time"
                        value={`${bookingDialog.start.getHours().toString().padStart(2, '0')}:${bookingDialog.start.getMinutes().toString().padStart(2, '0')}`}
                        step="1800"
                        onChange={(e) => {
                          if (!bookingDialog.start || !bookingDialog.end) return
                          
                          const [hours, minutes] = e.target.value.split(':').map(Number)
                          const newStart = new Date(bookingDialog.start)
                          newStart.setHours(hours, minutes, 0, 0)
                          
                          // If start time is after end time, adjust end time
                          let newEnd = new Date(bookingDialog.end)
                          if (newStart >= newEnd) {
                            newEnd = new Date(newStart)
                            newEnd.setMinutes(newStart.getMinutes() + 30)
                          }
                          
                          setBookingDialog({
                            ...bookingDialog,
                            start: newStart,
                            end: newEnd
                          })
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">End Time</label>
                      <input
                        type="time"
                        value={`${bookingDialog.end.getHours().toString().padStart(2, '0')}:${bookingDialog.end.getMinutes().toString().padStart(2, '0')}`}
                        step="1800"
                        onChange={(e) => {
                          if (!bookingDialog.start || !bookingDialog.end) return
                          
                          const [hours, minutes] = e.target.value.split(':').map(Number)
                          const newEnd = new Date(bookingDialog.end)
                          newEnd.setHours(hours, minutes, 0, 0)
                          
                          // Ensure end time is after start time
                          if (newEnd > bookingDialog.start) {
                            setBookingDialog({
                              ...bookingDialog,
                              end: newEnd
                            })
                          }
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                      <Clock size={16} />
                      <span>Booking Summary</span>
                    </div>
                    <div className="text-white">
                      <div className="font-medium">
                        {formatDateTime(bookingDialog.start, 'full')}
                      </div>
                      <div className="text-cyan-400 mt-1">
                        {formatDateTime(bookingDialog.start, 'time')} → {formatDateTime(bookingDialog.end, 'time')}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Duration: {Math.round((bookingDialog.end.getTime() - bookingDialog.start.getTime()) / (1000 * 60 * 60) * 2) / 2} hour(s)
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setBookingDialog({ isOpen: false, start: null, end: null })}
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
                  <User size={16} />
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
        .rbc-calendar {
          font-family: inherit;
        }
        
        .rbc-header {
          padding: 12px 4px;
          font-weight: 600;
          color: #1f2937;
          border-bottom: 2px solid #e5e7eb;
        }
        
        .rbc-time-view {
          border: 1px solid #e5e7eb;
        }
        
        .rbc-time-header-content {
          border-left: 1px solid #e5e7eb;
        }
        
        .rbc-time-content {
          border-top: 1px solid #e5e7eb;
        }
        
        .rbc-day-slot .rbc-time-slot {
          border-top: 1px solid #f3f4f6;
        }
        
        .rbc-time-slot {
          min-height: 25px;
        }
        
        .rbc-today {
          background-color: #ecfeff;
        }
        
        .rbc-current-time-indicator {
          background-color: #ef4444;
          height: 2px;
        }
        
        .rbc-event {
          padding: 4px 6px;
          cursor: pointer;
        }
        
        .rbc-event:hover {
          opacity: 0.9;
        }
        
        .rbc-slot-selection {
          background-color: rgba(8, 145, 178, 0.3);
          border: 2px dashed #0891b2;
        }
        
        .rbc-toolbar {
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 0;
        }
        
        .rbc-toolbar button {
          color: #374151;
          border: 1px solid #d1d5db;
          background-color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .rbc-toolbar button:hover {
          background-color: #f3f4f6;
          border-color: #9ca3af;
        }
        
        .rbc-toolbar button:active,
        .rbc-toolbar button.rbc-active {
          background-color: #0891b2;
          color: white;
          border-color: #0891b2;
        }
        
        .rbc-toolbar button:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.2);
        }
        
        .rbc-month-view {
          border: 1px solid #e5e7eb;
        }
        
        .rbc-month-row {
          border-top: 1px solid #e5e7eb;
        }
        
        .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid #e5e7eb;
        }
        
        .rbc-date-cell {
          padding: 8px;
          text-align: right;
        }
        
        .rbc-off-range {
          color: #9ca3af;
        }
        
        .rbc-off-range-bg {
          background-color: rgba(31, 41, 55, 0.5);
        }
      `}</style>
    </div>
  )
}
