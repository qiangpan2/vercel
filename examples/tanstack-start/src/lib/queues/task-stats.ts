import { getRedis } from "../db/redis"
import { getTaskQueues } from "./task-queues"
import { getJobEvents, getJobSummary } from "./task-audit"

export async function getQueueSnapshot() {
	const { fastQueue, slowQueue, dlq } = getTaskQueues()
	const [fastCounts, slowCounts, dlqCounts] = await Promise.all([
		fastQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
		slowQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
		dlq.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
	])

	return {
		fast: fastCounts,
		slow: slowCounts,
		dlq: dlqCounts,
	}
}

export async function getJobEventsRedis(jobId: string, limit = 100) {
	const redis = getRedis()
	const entries = await redis.xrevrange(`events:${jobId}`, '+', '-', 'COUNT', limit)
	return entries
		.map((entry) => {
			const [, fields] = entry
			const payloadIndex = fields.findIndex((value: string) => value === 'payload')
			const payload = payloadIndex >= 0 ? fields[payloadIndex + 1] : '{}'
			return JSON.parse(payload)
		})
		.reverse()
}

export async function getJobDetails(jobId: string) {
	const { fastQueue, slowQueue, dlq } = getTaskQueues()
	const job =
		(await fastQueue.getJob(jobId)) ||
		(await slowQueue.getJob(jobId)) ||
		(await dlq.getJob(jobId))

	const summary = getJobSummary(jobId)
	const events = await getJobEventsRedis(jobId, 200)
	return {
		job: job
			? {
					id: job.id,
					name: job.name,
					queue: job.queueName,
					data: job.data,
					attemptsMade: job.attemptsMade,
					opts: job.opts,
			  }
			: null,
		summary,
		events: events.length > 0 ? events : getJobEvents(jobId),
	}
}
