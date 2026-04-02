import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { ExecuteOptions, ExecuteResult } from "./task-executor-ssh"
import type { MatsExecution, TaskEventPayload, TaskPayload } from "./task-model"

const execFileAsync = promisify(execFile)

function sanitizeId(value: string) {
	return value.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")
}

function shQuote(value: string) {
	return `'${value.replaceAll("'", `'\"'\"'`)}'`
}

function inventoryPath() {
	return path.join(process.cwd(), "ansible", "inventory", "hosts.yml")
}

async function resolveHostVars(hostname: string) {
	const args = ["-i", inventoryPath(), "--host", hostname]
	const { stdout } = await execFileAsync("ansible-inventory", args, { maxBuffer: 5 * 1024 * 1024 })
	const parsed = JSON.parse(stdout.toString()) as Record<string, unknown>
	return parsed
}

function getStringVar(vars: Record<string, unknown>, key: string) {
	const value = vars[key]
	return typeof value === "string" && value.length > 0 ? value : undefined
}

async function buildMatsSpec(jobId: string, traceId: string | undefined, mats: MatsExecution) {
	const resolved = await Promise.all(
		mats.hosts.map(async (hostname) => {
			const vars = await resolveHostVars(hostname)
			const host = getStringVar(vars, "ansible_host") ?? hostname
			const user = getStringVar(vars, "ansible_user") ?? "root"
			const keyPath = getStringVar(vars, "ansible_ssh_private_key_file")
			return { hostname, host, user, keyPath }
		}),
	)

	const distinctKeyPaths = Array.from(new Set(resolved.map((r) => r.keyPath).filter(Boolean)))
	if (distinctKeyPaths.length !== 1) {
		throw new Error("mats hosts must share the same ansible_ssh_private_key_file (keyPath override not implemented)")
	}

	const keyPath = distinctKeyPaths[0]
	if (!keyPath) {
		throw new Error("ansible_ssh_private_key_file is missing for mats hosts")
	}

	return {
		jobId,
		traceId,
		workload: mats.workload,
		targets: {
			hosts: resolved.map((r) => ({ host: r.host, user: r.user, hostname: r.hostname })),
		},
		ssh: {
			keyPath,
		},
		params: mats.params ?? {},
	}
}

async function readExitCode(exitPath: string) {
	try {
		const content = await fs.readFile(exitPath, "utf8")
		const value = Number(content.trim())
		return Number.isFinite(value) ? value : null
	} catch {
		return null
	}
}

async function tailFile(filePath: string, maxBytes = 256 * 1024, maxLines = 400) {
	try {
		const stat = await fs.stat(filePath)
		const start = Math.max(0, stat.size - maxBytes)
		const handle = await fs.open(filePath, "r")
		try {
			const buffer = Buffer.alloc(stat.size - start)
			await handle.read(buffer, 0, buffer.length, start)
			const text = buffer.toString("utf8")
			const lines = text.split("\n")
			return lines.slice(-maxLines).join("\n")
		} finally {
			await handle.close()
		}
	} catch {
		return ""
	}
}

async function killLocalProcess(processId: string) {
	await execFileAsync("bash", ["-lc", `kill ${processId} 2>/dev/null || true; sleep 2; kill -9 ${processId} 2>/dev/null || true`])
}

async function startMatsLocal(jobId: string, mats: MatsExecution, specPath: string, logPath: string, exitPath: string) {
	const bin = mats.bin ?? process.env.MATS_BIN ?? "mats"
	const args = mats.args ?? ["run", "--spec", specPath]
	const cmd = [bin, ...args.map((a) => shQuote(a))].join(" ")
	const wrapped = [
		`rm -f ${shQuote(exitPath)};`,
		`( ${cmd}; echo $? > ${shQuote(exitPath)} ) > ${shQuote(logPath)} 2>&1 &`,
		"echo $!",
	].join(" ")
	const { stdout, stderr } = await execFileAsync("bash", ["-lc", wrapped], { maxBuffer: 1024 * 1024 })
	const pid = stdout.toString().trim().split("\n").pop() ?? ""
	if (!pid || !/^[0-9]+$/.test(pid)) {
		throw new Error(`Failed to start mats (no pid): ${stderr?.toString() ?? ""}`)
	}
	return pid
}

export async function executeMatsTask(payload: TaskPayload, options: ExecuteOptions): Promise<ExecuteResult> {
	if (!payload.mats) {
		throw new Error("executeMatsTask called without payload.mats")
	}

	const jobId = options.jobId
	const traceId = options.traceId ?? payload.traceId
	const safeJobId = sanitizeId(jobId)
	const tempDir = os.tmpdir()
	const specPath = path.join(tempDir, `mats-spec-${safeJobId}.json`)
	const logPath = path.join(tempDir, `task-${safeJobId}.log`)
	const exitPath = path.join(tempDir, `task-${safeJobId}.exit`)

	const onEvent = options.onEvent ?? (() => undefined)
	const pollInterval = options.pollIntervalMs ?? 60000
	const logTailLines = options.logTailLines ?? 400
	const checkCancelled = options.checkCancelled ?? (() => false)

	const spec = await buildMatsSpec(jobId, traceId, payload.mats)
	await fs.writeFile(specPath, JSON.stringify(spec, null, 2), "utf8")

	const processId = await startMatsLocal(jobId, payload.mats, specPath, logPath, exitPath)

	await onEvent({
		event: "started",
		host: "runner-local",
		processId,
		exitCode: null,
		timestamp: Date.now(),
		traceId,
	})

	const startedAt = Date.now()
	let lastLog = ""

	while (true) {
		if (await checkCancelled()) {
			await killLocalProcess(processId)
			await onEvent({
				event: "cancelled",
				host: "runner-local",
				processId,
				exitCode: null,
				timestamp: Date.now(),
				traceId,
			})
			return { processId, exitCode: null, logTail: lastLog }
		}

		const logTail = await tailFile(logPath, 256 * 1024, logTailLines)
		if (logTail && logTail !== lastLog) {
			lastLog = logTail
			await onEvent({
				event: "log_tail",
				host: "runner-local",
				processId,
				logTail,
				logTruncated: false,
				timestamp: Date.now(),
				traceId,
			} satisfies TaskEventPayload)
		}

		const exitCode = await readExitCode(exitPath)
		if (exitCode !== null) {
			const durationMs = Date.now() - startedAt
			await onEvent(
				exitCode === 0
					? {
							event: "completed",
							host: "runner-local",
							processId,
							exitCode,
							logTail: lastLog,
							logTruncated: false,
							durationMs,
							timestamp: Date.now(),
							traceId,
					  }
					: {
							event: "failed",
							host: "runner-local",
							processId,
							exitCode,
							logTail: lastLog,
							logTruncated: false,
							durationMs,
							timestamp: Date.now(),
							traceId,
							errorMessage: `mats exited with code ${exitCode}`,
					  },
			)
			return { processId, exitCode, logTail: lastLog }
		}

		await new Promise((resolve) => setTimeout(resolve, pollInterval))
	}
}

