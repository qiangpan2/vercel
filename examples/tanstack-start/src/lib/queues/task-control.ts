import { getRedis } from "../db/redis"
import type { TaskPayload } from "./task-model"
import { getTaskQueues } from "./task-queues"

export async function pauseQueue(name: 'fast' | 'slow' | 'dlq') {
	const { fastQueue, slowQueue, dlq } = getTaskQueues()
	if (name === 'fast') return fastQueue.pause()
	if (name === 'slow') return slowQueue.pause()
	return dlq.pause()
}

export async function resumeQueue(name: 'fast' | 'slow' | 'dlq') {
	const { fastQueue, slowQueue, dlq } = getTaskQueues()
	if (name === 'fast') return fastQueue.resume()
	if (name === 'slow') return slowQueue.resume()
	return dlq.resume()
}

export async function cancelJob(jobId: string) {
	const key = `control:${jobId}`
	const redis = getRedis()
	await redis.hset(key, 'cancel', '1')
	return { jobId, cancelled: true }
}

export async function requeueFromDlq(jobId: string) {
	const { fastQueue, slowQueue, dlq } = getTaskQueues()
	const job = await dlq.getJob(jobId)
	if (!job) return { success: false, error: 'job not found in DLQ' }
	const data = job.data as TaskPayload
	await dlq.removeJobs([jobId])
	const target = data.timeoutMinutes && data.timeoutMinutes > 60 ? slowQueue : fastQueue
	const requeued = await target.add(job.name, data, {
		jobId,
		attempts: job.opts.attempts,
		backoff: job.opts.backoff,
		priority: job.opts.priority,
	})
	return { success: true, requeuedJobId: requeued.id }
}

export async function discardFromDlq(jobId: string) {
	const { dlq } = getTaskQueues()
	const job = await dlq.getJob(jobId)
	if (!job) return { success: false, error: 'job not found in DLQ' }
	await job.remove()
	return { success: true }
}
