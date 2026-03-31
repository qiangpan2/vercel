import { useState } from 'react'
import { 
  Play, 
  Power, 
  PowerOff, 
  RotateCcw, 
  Activity,
  UserPlus,
  UserMinus,
  Terminal,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wrench,
  HeartPulse
} from 'lucide-react'

interface Server {
  id: number
  hostname: string
  ip: string
  ipmi_ip?: string
  status?: string
}

interface AnsibleControlPanelProps {
  server: Server
  userRole: string
  onClose?: () => void
  onStatusChange?: () => void
}

type ActionStatus = 'idle' | 'running' | 'success' | 'error'

interface ActionResult {
  status: ActionStatus
  output?: string
  error?: string
}

export default function AnsibleControlPanel({ server, userRole, onClose, onStatusChange }: AnsibleControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'power' | 'access' | 'maintenance'>('status')
  const [actionResult, setActionResult] = useState<ActionResult>({ status: 'idle' })
  const [accessUsername, setAccessUsername] = useState('')
  const [showOutput, setShowOutput] = useState(false)

  const executeAnsible = async (
    playbook: string, 
    extraVars: Record<string, string> = {}
  ) => {
    setActionResult({ status: 'running' })
    setShowOutput(true)
    
    try {
      const response = await fetch('/api/ansible/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playbook,
          targetHost: server.hostname,
          extraVars: {
            target_machine: server.hostname,
            ...extraVars
          },
          userRole
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActionResult({
          status: 'success',
          output: data.output
        })
      } else {
        setActionResult({
          status: 'error',
          error: data.error,
          output: data.output
        })
      }
    } catch (error) {
      setActionResult({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // 状态检查操作
  const handlePing = () => executeAnsible('ping.yml')
  const handleCheckStatus = () => executeAnsible('check_status.yml')

  // 健康检查（带状态更新）
  const handleHealthCheck = async () => {
    setActionResult({ status: 'running' })
    setShowOutput(true)
    
    try {
      const response = await fetch('/api/ansible/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: server.hostname,
          userRole
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        const statusMsg = data.online ? '✅ Server is ONLINE' : '❌ Server is OFFLINE'
        const changeMsg = data.changed ? `\nStatus changed: ${data.previousStatus} → ${data.newStatus}` : '\nStatus unchanged'
        
        setActionResult({
          status: data.online ? 'success' : 'error',
          output: statusMsg + changeMsg
        })
        
        // 通知父组件刷新数据
        if (data.changed && onStatusChange) {
          onStatusChange()
        }
      } else {
        setActionResult({
          status: 'error',
          error: data.error
        })
      }
    } catch (error) {
      setActionResult({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // 电源操作
  const handlePower = (action: string) => {
    if (!server.ipmi_ip) {
      setActionResult({
        status: 'error',
        error: 'IPMI not configured for this server'
      })
      return
    }
    
    if (action !== 'status' && !confirm(`Are you sure you want to ${action} ${server.hostname}?`)) {
      return
    }
    
    executeAnsible('power_control.yml', { power_action: action })
  }

  // 访问控制操作
  const handleGrantAccess = () => {
    if (!accessUsername.trim()) {
      setActionResult({ status: 'error', error: 'Please enter a username' })
      return
    }
    executeAnsible('grant_access.yml', { 
      sso_username: accessUsername.trim(),
      ntid: accessUsername.trim(),
      access_group: `machine-access-${server.hostname}`
    })
  }

  const handleRevokeAccess = () => {
    if (!accessUsername.trim()) {
      setActionResult({ status: 'error', error: 'Please enter a username' })
      return
    }
    if (!confirm(`Revoke access for ${accessUsername} on ${server.hostname}?`)) {
      return
    }
    executeAnsible('revoke_access.yml', { 
      sso_username: accessUsername.trim(),
      ntid: accessUsername.trim(),
      access_group: `machine-access-${server.hostname}`
    })
  }

  // 维护模式操作
  const handleMaintenance = async (action: 'set' | 'clear') => {
    if (action === 'set' && !confirm(`Set ${server.hostname} to maintenance mode? Active bookings will be suspended.`)) {
      return
    }
    
    setActionResult({ status: 'running' })
    setShowOutput(true)
    
    try {
      const response = await fetch('/api/machines/set-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: server.id,
          action,
          userRole
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setActionResult({
          status: 'success',
          output: `${data.message}\nPrevious status: ${data.previousStatus}\nNew status: ${data.newStatus}\nAffected bookings: ${data.affectedBookings}`
        })
        
        // 通知父组件刷新数据
        if (onStatusChange) {
          onStatusChange()
        }
      } else {
        setActionResult({
          status: 'error',
          error: data.error
        })
      }
    } catch (error) {
      setActionResult({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const isRunning = actionResult.status === 'running'
  const isMaintenance = server.status === 'maintenance'
  const isOffline = server.status === 'offline'

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Terminal className="text-cyan-400" size={20} />
          <div>
            <h3 className="font-medium">Ansible Control</h3>
            {/* <p className="text-sm text-gray-400">{server.hostname}</p> */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{server.hostname}</span>
              {server.status && (
                <span className={`text-xs px-2 py-0.5 rounded ${
                  server.status === 'available' ? 'bg-green-600' :
                  server.status === 'booked' ? 'bg-blue-600' :
                  server.status === 'maintenance' ? 'bg-yellow-600' :
                  'bg-red-600'
                }`}>
                  {server.status}
                </span>
              )}
            </div>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'status', label: 'Status', icon: Activity },
          { id: 'power', label: 'Power', icon: Power },
          { id: 'access', label: 'Access', icon: UserPlus },
          { id: 'maintenance', label: 'Maintenance', icon: Wrench }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id 
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-gray-700/50' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {/* Status Tab */}
        {activeTab === 'status' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4">
              Check server connectivity and system status
            </p>
            <div className="flex flex-wrap gap-3">
              <ActionButton
                onClick={handlePing}
                disabled={isRunning}
                icon={<Play size={16} />}
                label="Ping"
                color="cyan"
              />
              <ActionButton
                onClick={handleCheckStatus}
                disabled={isRunning}
                icon={<Activity size={16} />}
                label="Full Status"
                color="blue"
              />
              <ActionButton
                onClick={handleHealthCheck}
                disabled={isRunning}
                icon={<HeartPulse size={16} />}
                label="Health Check"
                color="purple"
                title="Check and update server status"
              />
            </div>
          </div>
        )}

        {/* Power Tab */}
        {activeTab === 'power' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4">
              IPMI power management {!server.ipmi_ip && (
                <span className="text-yellow-500">(IPMI not configured)</span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ActionButton
                onClick={() => handlePower('status')}
                disabled={isRunning || !server.ipmi_ip}
                icon={<Activity size={16} />}
                label="Status"
                color="gray"
              />
              <ActionButton
                onClick={() => handlePower('on')}
                disabled={isRunning || !server.ipmi_ip}
                icon={<Power size={16} />}
                label="Power On"
                color="green"
              />
              <ActionButton
                onClick={() => handlePower('off')}
                disabled={isRunning || !server.ipmi_ip}
                icon={<PowerOff size={16} />}
                label="Power Off"
                color="red"
              />
              <ActionButton
                onClick={() => handlePower('reset')}
                disabled={isRunning || !server.ipmi_ip}
                icon={<RotateCcw size={16} />}
                label="Reset"
                color="yellow"
              />
            </div>
          </div>
        )}

        {/* Access Tab */}
        {activeTab === 'access' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Grant or revoke SSH access for users
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={accessUsername}
                onChange={e => setAccessUsername(e.target.value)}
                placeholder="Enter ntid"
                className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                disabled={isRunning}
              />
            </div>
            <div className="flex gap-3">
              <ActionButton
                onClick={handleGrantAccess}
                disabled={isRunning || !accessUsername.trim()}
                icon={<UserPlus size={16} />}
                label="Grant Access"
                color="green"
              />
              <ActionButton
                onClick={handleRevokeAccess}
                disabled={isRunning || !accessUsername.trim()}
                icon={<UserMinus size={16} />}
                label="Revoke Access"
                color="red"
              />
            </div>
          </div>
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Control server maintenance mode. Active bookings will be suspended during maintenance.
            </p>
            
            {isOffline && (
              <div className="bg-red-600/20 border border-red-600 rounded-lg p-3 text-sm text-red-400">
                ⚠️ Server is currently offline. Maintenance mode cannot be set on offline servers.
              </div>
            )}
            
            <div className="flex gap-3">
              <ActionButton
                onClick={() => handleMaintenance('set')}
                disabled={isRunning || isMaintenance || isOffline}
                icon={<Wrench size={16} />}
                label="Set Maintenance"
                color="yellow"
              />
              <ActionButton
                onClick={() => handleMaintenance('clear')}
                disabled={isRunning || !isMaintenance}
                icon={<CheckCircle size={16} />}
                label="Clear Maintenance"
                color="green"
              />
            </div>
            
            {isMaintenance && (
              <div className="bg-yellow-600/20 border border-yellow-600 rounded-lg p-3 text-sm text-yellow-400">
                🔧 Server is in maintenance mode. All active bookings are suspended.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Output Section */}
      {(actionResult.status !== 'idle' || showOutput) && (
        <div className="border-t border-gray-700">
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-400 hover:bg-gray-700/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              {actionResult.status === 'running' && (
                <Loader2 size={14} className="animate-spin text-cyan-400" />
              )}
              {actionResult.status === 'success' && (
                <CheckCircle size={14} className="text-green-400" />
              )}
              {actionResult.status === 'error' && (
                <XCircle size={14} className="text-red-400" />
              )}
              Output
            </span>
            {showOutput ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {showOutput && (
            <div className="p-4 bg-gray-900 max-h-64 overflow-auto">
              {actionResult.status === 'running' && (
                <div className="flex items-center gap-2 text-cyan-400">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Executing...</span>
                </div>
              )}
              
              {actionResult.error && (
                <div className="text-red-400 mb-2">
                  Error: {actionResult.error}
                </div>
              )}
              
              {actionResult.output && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {actionResult.output}
                </pre>
              )}
              
              {actionResult.status === 'idle' && (
                <div className="text-gray-500 text-sm">
                  Run an action to see output here
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 操作按钮组件
interface ActionButtonProps {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  color: 'cyan' | 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple'
  title?: string
}

function ActionButton({ onClick, disabled, icon, label, color, title }: ActionButtonProps) {
  const colorClasses = {
    cyan: 'bg-cyan-600 hover:bg-cyan-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
    red: 'bg-red-600 hover:bg-red-700',
    yellow: 'bg-yellow-600 hover:bg-yellow-700',
    gray: 'bg-gray-600 hover:bg-gray-500',
    purple: 'bg-purple-600 hover:bg-purple-700'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses[color]}`}
    >
      {icon}
      {label}
    </button>
  )
}