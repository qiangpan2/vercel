import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getJobDetails } from '../../../lib/queues/task-stats'

export const Route = createFileRoute('/api/queues/jobs')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url)
				const jobId = url.searchParams.get('jobId')
				if (!jobId) {
					return json({ success: false, error: 'jobId is required' }, { status: 400 })
				}

				const details = await getJobDetails(jobId)
				return json({
					success: true,
					jobId,
					...details,
				})
			},
		},
	},
})
