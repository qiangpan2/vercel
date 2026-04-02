import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getQueueSnapshot } from '../../../lib/queues/task-stats'
import { getRedis } from '../../../lib/db/redis'

export const Route = createFileRoute('/api/queues/status')({
	server: {
		loader: async () => {
			const redis = getRedis()
			const info = await getQueueSnapshot()
			const pong = await redis.ping()
			return json({
				success: true,
				redis: pong === 'PONG',
				queues: info,
			})
		},
	},
})
