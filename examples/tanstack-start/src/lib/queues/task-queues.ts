import { Queue } from "bullmq"

import { getRedis } from "../db/redis"
import { FAST_QUEUE_OPTIONS, QUEUE_NAMES, SLOW_QUEUE_OPTIONS, type TaskPayload } from "./task-model"

type TaskQueues = {
	fastQueue: Queue<TaskPayload>
	slowQueue: Queue<TaskPayload>
	dlq: Queue<TaskPayload>
}

let queues: TaskQueues | null = null

export function getTaskQueues(): TaskQueues {
	if (queues) return queues

	const connection = getRedis()

	const fastQueue = new Queue<TaskPayload>(QUEUE_NAMES.fast, {
		connection,
		...FAST_QUEUE_OPTIONS,
	})

	const slowQueue = new Queue<TaskPayload>(QUEUE_NAMES.slow, {
		connection,
		...SLOW_QUEUE_OPTIONS,
	})

	const dlq = new Queue<TaskPayload>(QUEUE_NAMES.dlq, {
		connection,
		defaultJobOptions: {
			removeOnComplete: false,
			removeOnFail: false,
		},
	})

	queues = { fastQueue, slowQueue, dlq }
	return queues
}

