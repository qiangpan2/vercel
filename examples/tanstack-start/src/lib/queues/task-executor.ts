import type { ExecuteOptions, ExecuteResult } from "./task-executor-ssh"
import type { TaskPayload } from "./task-model"
import { executeMatsTask } from "./task-executor-mats"
import { executeRemoteTask } from "./task-executor-ssh"

export async function executeTask(payload: TaskPayload, options: ExecuteOptions): Promise<ExecuteResult> {
	if (payload.mats) {
		return executeMatsTask(payload, options)
	}
	return executeRemoteTask(payload, options)
}

