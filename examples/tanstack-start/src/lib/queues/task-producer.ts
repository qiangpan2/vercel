import { randomUUID } from 'crypto'
import type { JobsOptions } from 'bullmq'
import { getTaskQueues } from './task-queues'
import type { TaskPayload } from './task-model'

interface EnqueueOptions extends TaskPayload {
	queue?: 'fast' | 'slow'
	delayMs?: number
	repeat?: JobsOptions['repeat']
}

function buildJobOptions(options: EnqueueOptions): JobsOptions {
	const jobId = options.jobId ?? options.traceId ?? randomUUID()
	const jobOptions: JobsOptions = {
		jobId,
		removeOnComplete: false,
		removeOnFail: false,
	}

	if (options.priority !== undefined) jobOptions.priority = options.priority
	if (options.maxAttempts !== undefined) jobOptions.attempts = options.maxAttempts
	if (options.backoff !== undefined) jobOptions.backoff = options.backoff
	if (options.delayMs !== undefined) jobOptions.delay = options.delayMs
	if (options.timeoutMinutes !== undefined) {
		jobOptions.timeout = options.timeoutMinutes * 60 * 1000
	}
	if (options.repeat !== undefined) jobOptions.repeat = options.repeat

	return jobOptions
}

export async function enqueueFast(options: EnqueueOptions) {
	const { fastQueue } = getTaskQueues()
	const payload: TaskPayload = {
		...options,
		traceId: options.traceId ?? randomUUID(),
		createdAt: Date.now(),
	}
	const jobOptions = buildJobOptions(options)
	return fastQueue.add(options.type, payload, jobOptions)
}

export async function enqueueSlow(options: EnqueueOptions) {
	const { slowQueue } = getTaskQueues()
	const payload: TaskPayload = {
		...options,
		traceId: options.traceId ?? randomUUID(),
		createdAt: Date.now(),
	}
	const jobOptions = buildJobOptions(options)
	return slowQueue.add(options.type, payload, jobOptions)
}

export async function enqueueToDlq(options: EnqueueOptions) {
	const { dlq } = getTaskQueues()
	const payload: TaskPayload = {
		...options,
		traceId: options.traceId ?? randomUUID(),
		createdAt: Date.now(),
	}
	const jobOptions = buildJobOptions(options)
	return dlq.add(options.type, payload, jobOptions)
}
