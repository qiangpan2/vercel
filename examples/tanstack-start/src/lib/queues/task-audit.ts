import path from "node:path"
import Database from "better-sqlite3"
import type { TaskAuditRecord, TaskEventPayload } from "./task-model"

const dbPath = path.join(process.cwd(), "data", "booking.db")
const db = new Database(dbPath)

const initJobs = `
CREATE TABLE IF NOT EXISTS jobs_audit (
  job_id TEXT PRIMARY KEY,
  queue TEXT,
  type TEXT,
  status TEXT,
  target_host TEXT,
  container_id TEXT,
  process_id TEXT,
  exit_code INTEGER,
  attempts INTEGER,
  duration_ms INTEGER,
  trace_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);`

const initEvents = `
CREATE TABLE IF NOT EXISTS job_events (
  job_id TEXT,
  seq INTEGER,
  event_type TEXT,
  ts INTEGER,
  payload_json TEXT,
  log_tail TEXT,
  truncated INTEGER DEFAULT 0,
  PRIMARY KEY (job_id, seq)
);`

db.exec(initJobs)
db.exec(initEvents)

function ensureColumn(table: string, column: string, ddl: string) {
	const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
	if (columns.some((col) => col.name === column)) {
		return
	}
	db.exec(ddl)
}

ensureColumn("jobs_audit", "process_id", "ALTER TABLE jobs_audit ADD COLUMN process_id TEXT;")

const insertEventStmt = db.prepare(
	`INSERT OR REPLACE INTO job_events (job_id, seq, event_type, ts, payload_json, log_tail, truncated)
   VALUES (@job_id, @seq, @event_type, @ts, @payload_json, @log_tail, @truncated)`,
)

const upsertJobStmt = db.prepare(
	`INSERT INTO jobs_audit (job_id, queue, type, status, target_host, container_id, process_id, exit_code, attempts, duration_ms, trace_id, created_at, updated_at)
   VALUES (@job_id, @queue, @type, @status, @target_host, @container_id, @process_id, @exit_code, @attempts, @duration_ms, @trace_id, @created_at, @updated_at)
   ON CONFLICT(job_id) DO UPDATE SET
     status=excluded.status,
     target_host=excluded.target_host,
     container_id=excluded.container_id,
     process_id=excluded.process_id,
     exit_code=excluded.exit_code,
     attempts=excluded.attempts,
     duration_ms=excluded.duration_ms,
     trace_id=excluded.trace_id,
     created_at=jobs_audit.created_at,
     updated_at=excluded.updated_at`,
)

const nextSeqStmt = db.prepare(
	`SELECT COALESCE(MAX(seq), 0) as seq FROM job_events WHERE job_id = ?`,
)

const getCreatedAtStmt = db.prepare(`SELECT created_at as created_at FROM jobs_audit WHERE job_id = ?`)

export function recordAuditEvent(
	jobId: string,
	queue: string,
	type: string,
	event: TaskEventPayload,
) {
	const nextSeq = (nextSeqStmt.get(jobId) as { seq: number }).seq + 1
	insertEventStmt.run({
		job_id: jobId,
		seq: nextSeq,
		event_type: event.event,
		ts: event.timestamp,
		payload_json: JSON.stringify(event),
		log_tail: event.logTail ?? null,
		truncated: event.logTruncated ? 1 : 0,
	})

	const createdAtRow = getCreatedAtStmt.get(jobId) as { created_at?: number } | undefined
	const createdAt = createdAtRow?.created_at ?? event.timestamp

	const summary: TaskAuditRecord = {
		jobId,
		queue,
		type,
		status:
			event.event === 'completed'
				? 'completed'
				: event.event === 'failed'
					? 'failed'
					: event.event === 'cancelled'
						? 'cancelled'
						: 'active',
		targetHost: event.host,
		containerId: event.containerId,
		processId: event.processId,
		exitCode: event.exitCode ?? null,
		attempts: event.attempts ?? 0,
		durationMs: event.durationMs,
		traceId: event.traceId,
		createdAt,
		updatedAt: event.timestamp,
	}
	upsertJob(summary)
}

export function upsertJob(summary: TaskAuditRecord) {
	upsertJobStmt.run({
		job_id: summary.jobId,
		queue: summary.queue,
		type: summary.type,
		status: summary.status,
		target_host: summary.targetHost ?? null,
		container_id: summary.containerId ?? null,
		process_id: summary.processId ?? null,
		exit_code: summary.exitCode ?? null,
		attempts: summary.attempts,
		duration_ms: summary.durationMs ?? null,
		trace_id: summary.traceId ?? null,
		created_at: summary.createdAt,
		updated_at: summary.updatedAt,
	})
}

export function getJobEvents(jobId: string) {
	const rows = db
		.prepare(`SELECT event_type, ts, payload_json, log_tail, truncated FROM job_events WHERE job_id = ? ORDER BY seq ASC`)
		.all(jobId) as Array<{
			event_type: string
			ts: number
			payload_json: string
			log_tail: string | null
			truncated: number
		}>
	return rows.map((row) => ({
		event: row.event_type,
		timestamp: row.ts,
		payload: JSON.parse(row.payload_json),
		logTail: row.log_tail,
		truncated: row.truncated === 1,
	}))
}

export function getJobSummary(jobId: string) {
	const row = db
		.prepare(
			`SELECT job_id, queue, type, status, target_host, container_id, process_id, exit_code, attempts, duration_ms, trace_id, created_at, updated_at
       FROM jobs_audit WHERE job_id = ?`,
		)
		.get(jobId) as
		| ({
				job_id: string
				queue: string
				type: string
				status: string
				target_host: string | null
				container_id: string | null
				process_id: string | null
				exit_code: number | null
				attempts: number
				duration_ms: number | null
				trace_id: string | null
				created_at: number
				updated_at: number
			})
		| undefined

	if (!row) {
		return null
	}

	return {
		jobId: row.job_id,
		queue: row.queue,
		type: row.type,
		status: row.status,
		targetHost: row.target_host ?? undefined,
		containerId: row.container_id ?? undefined,
		processId: row.process_id ?? undefined,
		exitCode: row.exit_code ?? undefined,
		attempts: row.attempts,
		durationMs: row.duration_ms ?? undefined,
		traceId: row.trace_id ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}
