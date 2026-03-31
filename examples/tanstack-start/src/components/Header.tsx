import { Link, useNavigate } from '@tanstack/react-router'

import { useState, useEffect } from 'react'
import {
  Calendar,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react'
import { getCurrentUser, logout, isAdmin, type User } from '../utils/auth'

export default function Header() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const currentUser = getCurrentUser()
    setUser(currentUser)
  }, [])

  const handleLogout = () => {
    logout()
    setUser(null)
    navigate({ to: '/login', search: { redirect: '/booking' } })
  }

  const handleAdminPanel = () => {
    navigate({ to: '/booking' })
    navigate({ to: '/machines' })
    navigate({ to: '/users' })
  }

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg flex-shrink-0">
        <div className="flex items-center">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-4 text-xl font-semibold">
            <Link to="/booking">
              <img
                src="/amd-header-logo.svg"
                alt="CSE Docker Gen CI Logo"
                className="h-10"
              />
            </Link>
          </h1>
        </div>

        {user && (
          <div className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700 rounded-lg transition-colors">
            <div className="text-right">
              <div className="text-sm font-medium text-white">{user.displayName}</div>
              <div className="text-xs text-gray-300">
                {isAdmin(user) ? '👑 Administrator' : '👤 User'}
              </div>
            </div>
            <div className="h-8 w-px bg-gray-600"></div>
            {isAdmin(user) && (
              <button
                onClick={handleAdminPanel}
                className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
                title="Admin Panel"
              >
                <Settings size={18} className="text-white" />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut size={18} className="text-white" />
            </button>
          </div>
        )}
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {user?.role === 'admin' && (
            <Link
              to="/users"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
              }}
            >
              <Settings size={20} />
              <span className="font-medium">User Management</span>
              {/* 如果有 pending 用户可以加个小红点 */}
            </Link>
          )}
          <Link
            to="/machines"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Calendar size={20} />
            <span className="font-medium">Servers Manager</span>
          </Link>

          <Link
            to="/booking"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Calendar size={20} />
            <span className="font-medium">Machine Booking</span>
          </Link>
        </nav>
      </aside>
    </>
  )
}
