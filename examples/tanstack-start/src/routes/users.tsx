import { createFileRoute } from '@tanstack/react-router'
import { UserManagement } from '../components/UserManagement'
import { getCurrentUser, isAdmin } from '../utils/auth'

export const Route = createFileRoute('/users')({
  component: UsersPage,
})

function UsersPage() {
  const user = getCurrentUser()

  if (!user) {
    window.location.href = '/login?redirect=/users'
    return null
  }

  if (!isAdmin(user)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-4">⛔ Access Denied</h2>
          <p className="text-gray-400 mb-6">You need admin privileges to access user management.</p>
          <a href="/booking" className="text-cyan-400 hover:text-cyan-300 underline">
            ← Back to Booking
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <UserManagement currentUser={user.ntid} />
    </div>
  )
}