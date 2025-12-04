import { useState } from 'react'
import { Activity, Power, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface QuickActionsProps {
  hostname: string
  hasIpmi: boolean
  userRole: string
}

export default function QuickActions({ hostname, hasIpmi, userRole }: QuickActionsProps) {
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<'idle' | 'success' | 'error'>('idle')

  const handleQuickPing = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setPinging(true)
    setPingResult('idle')
    
    try {
      const response = await fetch('/api/ansible/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playbook: 'ping.yml',
          targetHost: hostname,
          extraVars: { target_machine: hostname },
          userRole
        })
      })
      
      const data = await response.json()
      setPingResult(data.success ? 'success' : 'error')
    } catch {
      setPingResult('error')
    } finally {
      setPinging(false)
      // 3秒后重置状态
      setTimeout(() => setPingResult('idle'), 3000)
    }
  }

  if (userRole !== 'admin') return null

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleQuickPing}
        disabled={pinging}
        className="p-1 rounded hover:bg-gray-600 transition-colors"
        title="Quick Ping"
      >
        {pinging ? (
          <Loader2 size={14} className="animate-spin text-cyan-400" />
        ) : pingResult === 'success' ? (
          <CheckCircle size={14} className="text-green-400" />
        ) : pingResult === 'error' ? (
          <XCircle size={14} className="text-red-400" />
        ) : (
          <Activity size={14} className="text-gray-400" />
        )}
      </button>
    </div>
  )
}