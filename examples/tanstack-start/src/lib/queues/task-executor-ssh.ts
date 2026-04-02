import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { TaskEventPayload, TaskPayload } from "./task-model"

const execFileAsync = promisify(execFile)

export interface SshCommandOptions {
	host: string
	user?: string
	keyPath?: string
	command: string
	timeoutMs?: number
}

export interface ExecuteResult {
	containerId?: string
	processId?: string
	exitCode: number | null
	logTail?: string
	logTruncated?: boolean
}

export interface ExecuteOptions {
	jobId: string
	traceId?: string
	pollIntervalMs?: number
	logTailLines?: number
	onEvent?: (event: TaskEventPayload) => Promise<void> | void
	checkCancelled?: () => Promise<boolean> | boolean
}

export function buildSshArgs({ host, user, keyPath, command, timeoutMs }: SshCommandOptions) {
	const target = user ? `${user}@${host}` : host
	const args = [
		"-o",
		"BatchMode=yes",
		"-o",
		"StrictHostKeyChecking=no",
		"-o",
		"ConnectTimeout=5",
		"-o",
		"ServerAliveInterval=30",
	]
	if (keyPath) {
		args.push("-i", keyPath)
	}
	args.push(target, "--", "bash", "-lc", command)
	const execOptions = {
		timeout: timeoutMs,
		maxBuffer: 5 * 1024 * 1024,
	}
	return { args, execOptions }
}

async function runSshCommand(options: SshCommandOptions) {
	const { args, execOptions } = buildSshArgs(options)
	const result = await execFileAsync("ssh", args, execOptions)
	return {
		stdout: result.stdout?.toString() ?? "",
		stderr: result.stderr?.toString() ?? "",
	}
}

function sanitizeId(value: string) {
	return value.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")
}

function shQuote(value: string) {
	return `'${value.replaceAll("'", `'\"'\"'`)}'`
}

function renderRemoteStart(payload: TaskPayload, jobId: string, traceId?: string) {
	if (!payload.image && !payload.command) {
		throw new Error("docker image or command is required for remote execution")
	}

	const safeJobId = sanitizeId(jobId)
	const logPath = payload.logPath ?? `/tmp/task-${safeJobId}.log`
	const exitPath = `/tmp/task-${safeJobId}.exit`

	if (!payload.image) {
		const shellCmd = payload.command ?? ""
		const wrapped = [
			`rm -f ${shQuote(exitPath)};`,
			`( bash -lc ${shQuote(shellCmd)}; echo $? > ${shQuote(exitPath)} ) > ${shQuote(logPath)} 2>&1 &`,
			"echo $!",
		].join(" ")
		return { cmd: wrapped, mode: "bash" as const, logPath, exitPath }
	}

	const parts = ["docker", "run", "-d"]
	if (payload.containerName) {
		parts.push(`--name ${payload.containerName}`)
	}

	parts.push(`-e JOB_ID=${jobId}`)
	if (traceId) {
		parts.push(`-e TRACE_ID=${traceId}`)
	}

	if (payload.env) {
		for (const [key, value] of Object.entries(payload.env)) {
			parts.push(`-e ${key}=${value}`)
		}
	}
	if (payload.volumes) {
		for (const volume of payload.volumes) {
			parts.push(`-v ${volume}`)
		}
	}
	if (payload.workdir) {
		parts.push(`-w ${payload.workdir}`)
	}
	const runCommand = payload.command ? `sh -c ${shQuote(payload.command)}` : ""
	parts.push(payload.image)
	if (runCommand) {
		parts.push(runCommand)
	}
	const cmd = parts.filter(Boolean).join(' ')
	return { cmd, mode: "docker" as const }
}

type StartInfo =
	| { mode: "docker"; containerId: string }
	| { mode: "bash"; processId: string; logPath: string; exitPath: string }

async function startRemote(payload: TaskPayload, jobId: string, traceId?: string): Promise<StartInfo> {
	const rendered = renderRemoteStart(payload, jobId, traceId)
	const { stdout, stderr } = await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: rendered.cmd,
		timeoutMs: payload.timeoutMinutes ? payload.timeoutMinutes * 60 * 1000 : undefined,
	})

	const out = stdout.trim()
	if (rendered.mode === "docker") {
		const containerId = out.split("\n").pop() || ""
		if (!containerId || !/^[0-9a-f]{12,64}$/i.test(containerId)) {
			throw new Error(`Failed to start remote container: ${stderr || "no container id"}`)
		}
		return { mode: "docker", containerId }
	}

	const processId = out.split("\n").pop() || ""
	if (!processId) {
		throw new Error(`Failed to start remote process: ${stderr || "no pid"}`)
	}
	if (!/^\d+$/.test(processId)) {
		throw new Error(`Invalid remote pid: ${processId}`)
	}
	return { mode: "bash", processId, logPath: rendered.logPath, exitPath: rendered.exitPath }
}

async function fetchContainerStatus(payload: TaskPayload, containerId: string) {
	const { stdout } = await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}' ${containerId}`,
	})
	const [status, exitCodeRaw] = stdout.trim().split('|')
	const exitCode = exitCodeRaw ? Number(exitCodeRaw) : null
	return { status, exitCode }
}

async function fetchContainerLogs(payload: TaskPayload, containerId: string, lines: number) {
	const { stdout } = await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `docker logs --tail ${lines} ${containerId} 2>/dev/null`,
	})
	return stdout
}

async function fetchFileTail(payload: TaskPayload, filePath: string, lines: number) {
	const { stdout } = await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `tail -n ${lines} ${shQuote(filePath)} 2>/dev/null || true`,
	})
	return stdout
}

async function fetchExitCodeFromFile(payload: TaskPayload, exitPath: string) {
	const { stdout } = await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `if [ -f ${shQuote(exitPath)} ]; then cat ${shQuote(exitPath)}; fi`,
	})
	const trimmed = stdout.trim()
	if (!trimmed) return null
	const parsed = Number(trimmed)
	return Number.isFinite(parsed) ? parsed : null
}

async function killProcess(payload: TaskPayload, processId: string) {
	await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `kill ${processId} 2>/dev/null || true; sleep 2; kill -9 ${processId} 2>/dev/null || true`,
	})
}

async function stopContainer(payload: TaskPayload, containerId: string) {
	await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `docker stop ${containerId} || true`,
	})
}

async function killContainer(payload: TaskPayload, containerId: string) {
	await runSshCommand({
		host: payload.targetHost,
		user: payload.sshUser,
		keyPath: payload.sshKeyPath,
		command: `docker kill ${containerId} || true`,
	})
}

export async function executeRemoteTask(
	payload: TaskPayload,
	options: ExecuteOptions,
): Promise<ExecuteResult> {
	if (!payload.targetHost) {
		throw new Error("targetHost is required for ssh execution")
	}
	const startedAt = Date.now()
	const logTailLines = options.logTailLines ?? 200
	const pollInterval = options.pollIntervalMs ?? 20000
	const onEvent = options.onEvent ?? (() => undefined)
	const checkCancelled = options.checkCancelled ?? (() => false)

	const startedEvent: TaskEventPayload = {
		event: "started",
		host: payload.targetHost,
		containerId: undefined,
		processId: undefined,
		exitCode: null,
		timestamp: Date.now(),
		traceId: options.traceId ?? payload.traceId,
	}

	try {
		const startInfo = await startRemote(payload, options.jobId, options.traceId ?? payload.traceId)
		const containerId = startInfo.mode === "docker" ? startInfo.containerId : undefined
		const processId = startInfo.mode === "bash" ? startInfo.processId : undefined
		startedEvent.containerId = containerId
		startedEvent.processId = processId
		await onEvent(startedEvent)

		let lastLog = ""
		let exitCode: number | null = null

		while (true) {
			if (await checkCancelled()) {
				if (containerId) {
					await stopContainer(payload, containerId)
				}
				if (processId) {
					await killProcess(payload, processId)
				}
				await onEvent({
					event: "cancelled",
					host: payload.targetHost,
					containerId,
					processId,
					exitCode: null,
					timestamp: Date.now(),
					traceId: options.traceId ?? payload.traceId,
				})
				return { containerId, processId, exitCode: null, logTail: lastLog }
			}

			if (containerId) {
				const status = await fetchContainerStatus(payload, containerId)
				const logTail = await fetchContainerLogs(payload, containerId, logTailLines)
				if (logTail && logTail !== lastLog) {
					lastLog = logTail
					await onEvent({
						event: "log_tail",
						host: payload.targetHost,
						containerId,
						processId,
						logTail,
						logTruncated: false,
						timestamp: Date.now(),
						traceId: options.traceId ?? payload.traceId,
					})
				}

				if (status.status === "exited" || status.status === "dead") {
					exitCode = status.exitCode ?? 0
					break
				}
			} else if (processId && startInfo.mode === "bash") {
				const code = await fetchExitCodeFromFile(payload, startInfo.exitPath)
				const logTail = await fetchFileTail(payload, startInfo.logPath, logTailLines)
				if (logTail && logTail !== lastLog) {
					lastLog = logTail
					await onEvent({
						event: "log_tail",
						host: payload.targetHost,
						processId,
						logTail,
						logTruncated: false,
						timestamp: Date.now(),
						traceId: options.traceId ?? payload.traceId,
					})
				}

				if (code !== null) {
					exitCode = code
					break
				}
			} else {
				throw new Error("Invalid start state: neither containerId nor processId is set")
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval))
		}

		const durationMs = Date.now() - startedAt
		const event: TaskEventPayload = exitCode === 0
			? {
					event: "completed",
					host: payload.targetHost,
					containerId,
					processId,
					exitCode,
					logTail: lastLog,
					logTruncated: false,
					durationMs,
					timestamp: Date.now(),
					traceId: options.traceId ?? payload.traceId,
				}
			: {
					event: "failed",
					host: payload.targetHost,
					containerId,
					processId,
					exitCode,
					logTail: lastLog,
					logTruncated: false,
					durationMs,
					timestamp: Date.now(),
					traceId: options.traceId ?? payload.traceId,
					errorMessage: `Remote task exited with code ${exitCode}`,
				}
		await onEvent(event)
		return { containerId, processId, exitCode, logTail: lastLog }
	} catch (error) {
		const err = error as Error
		await onEvent({
			event: "failed",
			host: payload.targetHost,
			containerId: startedEvent.containerId,
			processId: startedEvent.processId,
			exitCode: null,
			errorMessage: err.message,
			timestamp: Date.now(),
			traceId: options.traceId ?? payload.traceId,
		})
		throw error
	}
}

export async function cancelRemoteTask(payload: TaskPayload, opts: { containerId?: string; processId?: string }) {
	if (opts.containerId) {
		await stopContainer(payload, opts.containerId)
		await killContainer(payload, opts.containerId)
	}
	if (opts.processId) {
		await killProcess(payload, opts.processId)
	}
}
