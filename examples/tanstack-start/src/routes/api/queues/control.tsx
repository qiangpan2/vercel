import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
	pauseQueue,
	resumeQueue,
	cancelJob,
	requeueFromDlq,
	discardFromDlq,
} from '../../../lib/queues/task-control'

type QueueName = 'fast' | 'slow' | 'dlq'

export const Route = createFileRoute('/api/queues/control')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.json().catch(() => ({}))
				const action = body.action as string
				const queue = body.queue as QueueName
				const jobId = body.jobId as string | undefined

				try {
					switch (action) {
						case 'pause':
							if (!queue) throw new Error('queue is required')
							await pauseQueue(queue)
							return json({ success: true, queue, action: 'paused' })
						case 'resume':
							if (!queue) throw new Error('queue is required')
							await resumeQueue(queue)
							return json({ success: true, queue, action: 'resumed' })
						case 'cancel':
							if (!jobId) throw new Error('jobId is required')
							return json({ success: true, ...(await cancelJob(jobId)) })
						case 'requeue':
							if (!jobId) throw new Error('jobId is required')
							return json({ success: true, ...(await requeueFromDlq(jobId)) })
						case 'discard':
							if (!jobId) throw new Error('jobId is required')
							return json({ success: true, ...(await discardFromDlq(jobId)) })
						default:
							return json({ success: false, error: `unknown action: ${action}` }, { status: 400 })
					}
				} catch (error) {
					const err = error as Error
					return json({ success: false, error: err.message }, { status: 400 })
				}
			},
		},
	},
})
