import { Worker } from 'bullmq'
import { randomUUID } from 'crypto'
import { getRedis } from '../lib/db/redis'
import {
	SLOW_WORKER_OPTIONS,
	QUEUE_NAMES,
	TaskEventPayload,
	TaskPayload,
} from '../lib/queues/task-model'
import { executeTask } from "../lib/queues/task-executor"
import { recordAuditEvent } from '../lib/queues/task-audit'
import { getTaskQueues } from '../lib/queues/task-queues'

const redis = getRedis()

function streamKey(jobId: string) {
	return `events:${jobId}`
}

async function recordEvent(jobId: string, event: TaskEventPayload) {
	const payload = JSON.stringify(event)
	await redis.xadd(streamKey(jobId), 'MAXLEN', '~', 500, '*', 'event', event.event, 'payload', payload)
}

async function isCancelled(jobId: string) {
	const key = `control:${jobId}`
	const flag = await redis.hget(key, 'cancel')
	return flag === '1' || flag === 'true'
}

const worker = new Worker<TaskPayload>(
	QUEUE_NAMES.slow,
	async (job) => {
		const traceId = job.data.traceId ?? randomUUID()
		const onEvent = async (event: TaskEventPayload) => {
			const enriched: TaskEventPayload = {
				...event,
				traceId,
				timestamp: event.timestamp ?? Date.now(),
				attempts: job.attemptsMade,
			}
			await recordEvent(job.id as string, enriched)
			recordAuditEvent(job.id as string, QUEUE_NAMES.slow, job.name, enriched)
		}

		const result = await executeTask(job.data, {
			jobId: job.id as string,
			traceId,
			onEvent,
			checkCancelled: () => isCancelled(job.id as string),
			logTailLines: 400,
			pollIntervalMs: 60000,
		})

		return {
			containerId: result.containerId,
			processId: result.processId,
			exitCode: result.exitCode,
			logTail: result.logTail,
		}
	},
	{
		connection: redis,
		...SLOW_WORKER_OPTIONS,
	},
)

worker.on('failed', async (job, error) => {
	console.error('[slow-worker] failed', job?.id, error)
	if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
		const { dlq } = getTaskQueues()
		await dlq.add(job.name, job.data, { jobId: job.id as string })
	}
})

worker.on('error', (error) => {
	console.error('[slow-worker] worker error', error)
})

console.log('🚀 Slow worker started')
