import type { QueueOptions, WorkerOptions, JobsOptions, BackoffOptions } from 'bullmq'

export const QUEUE_NAMES = {
	fast: 'fast-tasks',
	slow: 'slow-tasks',
	dlq: 'dlq',
} as const

export const DEFAULT_PRIORITY = 5
export const PRIORITIES = {
	high: 1,
	normal: 5,
	low: 9,
} as const

export const DEFAULT_LOCKS = {
	fast: {
		lockDuration: 3 * 60 * 1000,
		stalledInterval: 60 * 1000,
	},
	slow: {
		lockDuration: 10 * 60 * 1000,
		stalledInterval: 2 * 60 * 1000,
	},
} as const

export interface TimeoutSegment {
	name?: string
	timeoutMs: number
}

export interface SshExecution {
	targetHost?: string
	sshUser?: string
	sshKeyPath?: string
	workdir?: string
	command?: string
	image?: string
	env?: Record<string, string>
	volumes?: string[]
	timeoutMinutes?: number
	containerName?: string
	logPath?: string
	detach?: boolean
}

export interface MatsExecution {
	workload: string
	hosts: string[]
	bin?: string
	args?: string[]
	params?: Record<string, unknown>
}

export interface TaskPayload<TPayload = Record<string, unknown>> extends SshExecution {
	jobId?: string
	type: string
	payload?: TPayload
	priority?: number
	maxAttempts?: number
	backoff?: BackoffOptions
	timeoutSegments?: TimeoutSegment[]
	traceId?: string
	createdAt?: number
	mats?: MatsExecution
}

export interface TaskEventPayload {
	event: 'started' | 'progress' | 'log_tail' | 'completed' | 'failed' | 'cancelled'
	host?: string
	containerId?: string
	processId?: string
	exitCode?: number | null
	logTail?: string
	logTruncated?: boolean
	errorMessage?: string
	attempts?: number
	durationMs?: number
	timestamp: number
	traceId?: string
}

export interface TaskAuditRecord {
	jobId: string
	queue: string
	type: string
	status: 'waiting' | 'active' | 'completed' | 'failed' | 'cancelled'
	targetHost?: string
	containerId?: string
	processId?: string
	exitCode?: number | null
	attempts: number
	durationMs?: number
	traceId?: string
	updatedAt: number
	createdAt: number
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	backoff: {
		type: 'exponential',
		delay: 2000,
	},
	removeOnComplete: false,
	removeOnFail: false,
}

export const FAST_QUEUE_OPTIONS: QueueOptions = {
	defaultJobOptions: {
		...DEFAULT_JOB_OPTIONS,
		timeout: 5 * 60 * 1000,
	},
}

export const SLOW_QUEUE_OPTIONS: QueueOptions = {
	defaultJobOptions: {
		...DEFAULT_JOB_OPTIONS,
		timeout: 60 * 60 * 1000,
	},
}

export const FAST_WORKER_OPTIONS: WorkerOptions = {
	concurrency: Number(process.env.FAST_WORKER_CONCURRENCY) || 50,
	lockDuration: DEFAULT_LOCKS.fast.lockDuration,
	stalledInterval: DEFAULT_LOCKS.fast.stalledInterval,
}

export const SLOW_WORKER_OPTIONS: WorkerOptions = {
	concurrency: Number(process.env.SLOW_WORKER_CONCURRENCY) || 5,
	lockDuration: DEFAULT_LOCKS.slow.lockDuration,
	stalledInterval: DEFAULT_LOCKS.slow.stalledInterval,
}
