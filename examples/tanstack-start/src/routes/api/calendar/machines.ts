import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import db from '../../../lib/db/booking'

// GET /api/calendar/machines
//
// Agent-friendly machine list.  Returns a trimmed payload (no IPMI IPs or
// other ops-internal fields) suitable for inclusion in an LLM tool response.
//
// Query params (all optional):
//   status — filter by machine status: available | maintenance | offline
export const Route = createFileRoute('/api/calendar/machines')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const statusFilter = url.searchParams.get('status')

          let query = `
            SELECT
              id,
              hostname,
              gpu_arch,
              num_gpus,
              cpu_model,
              ram,
              status,
              description
            FROM servers
          `
          const params: string[] = []

          if (statusFilter) {
            query += ' WHERE status = ?'
            params.push(statusFilter)
          }

          query += ' ORDER BY hostname'

          const servers = db.prepare(query).all(...params) as Array<{
            id: number
            hostname: string
            gpu_arch: string | null
            num_gpus: number | null
            cpu_model: string | null
            ram: string | null
            status: string | null
            description: string | null
          }>

          const machines = servers.map((s) => ({
            id: String(s.id),
            name: s.hostname,
            status: s.status || 'available',
            gpu: s.gpu_arch ? `${s.gpu_arch} x${s.num_gpus}` : 'None',
            cpu: s.cpu_model || 'N/A',
            ram: s.ram || 'N/A',
            description: s.description || '',
          }))

          return json({ success: true, machines })
        } catch (error) {
          console.error('[API] calendar/machines GET error:', error)
          return json(
            { success: false, error: 'Failed to fetch machines', machines: [] },
            { status: 500 },
          )
        }
      },
    },
  },
})
