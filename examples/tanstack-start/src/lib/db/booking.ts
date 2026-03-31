import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { restoreAllTimers } from '../booking/timer'
import { handleStartup, registerShutdownHandlers } from '../booking/restart_hold'

type BookingDb = InstanceType<typeof Database>

function isTruthyEnv(value: string | undefined) {
	return value === "1" || value === "true" || value === "yes"
}

<<<<<<< HEAD
export function resolveBookingDbPath({
	env = process.env,
	cwd = process.cwd(),
}: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) {
	const explicit = env.BOOKING_DB_PATH?.trim()
	if (explicit) return explicit

	const dbDir = env.BOOKING_DB_DIR?.trim()
	if (dbDir) return path.join(dbDir, "booking.db")

	// Tests should always use the repo DB to avoid relying on external mounts.
	if (isTruthyEnv(env.VITEST) || env.NODE_ENV === "test") {
		return path.join(cwd, "data", "booking.db")
	}

	// Default to the persistent mount used in Vercel/containers.
	// Local dev/tests can override via BOOKING_DB_PATH/BOOKING_DB_DIR.
	return "/mnt/data/vercel/booking.db"
}

function ensureDbDirExists(dbPath: string) {
	try {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true })
	} catch {
		// best-effort
	}
}

function maybeSeedDb(dbPath: string) {
	try {
		if (fs.existsSync(dbPath)) return

		const seed = path.join(process.cwd(), "data", "booking.db")
		if (!fs.existsSync(seed)) return

		fs.copyFileSync(seed, dbPath)
	} catch {
		// best-effort
	}
}
=======
const dbPath = '/mnt/data/vercel/booking.db';
// 数据库文件固定放在项目根目录的 data 文件夹中
//const dbPath = path.join(__dirname, '../../../data/booking.db');
//const dbPath = path.join(process.cwd(), 'booking.db');
>>>>>>> 93cafb05c (Sync update, mainly user management and bugfix.)

// import fs from 'fs';
// // 打印路径用于调试
// console.log('[booking.ts] __dirname:', __dirname);
// console.log('[booking.ts] Database path:', dbPath);
// console.log('[booking.ts] File exists:', fs.existsSync(dbPath));

// // 确保 data 目录存在
// const dataDir = path.dirname(dbPath);
// if (!fs.existsSync(dataDir)) {
//   fs.mkdirSync(dataDir, { recursive: true });
//   console.log('[booking.ts] Created data directory:', dataDir);
// }

const primaryDbPath = resolveBookingDbPath()

function isTestRuntime(env: NodeJS.ProcessEnv) {
	return isTruthyEnv(env.VITEST) || env.NODE_ENV === "test"
}

function openDb(dbPath: string) {
	const effectiveDbPath = isTestRuntime(process.env)
		? path.join(fs.mkdtempSync(path.join(os.tmpdir(), "booking-db-")), "booking.db")
		: dbPath

	ensureDbDirExists(effectiveDbPath)
	maybeSeedDb(effectiveDbPath)
	return new Database(effectiveDbPath)
}

function getTableColumns(db: BookingDb, tableName: string): Set<string> {
	const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
	return new Set(rows.map((row) => row.name))
}

function addColumnIfMissing({
	db,
	tableName,
	columnName,
	columnDefinition,
}: {
	db: BookingDb
	tableName: string
	columnName: string
	columnDefinition: string
}) {
	const columns = getTableColumns(db, tableName)
	if (columns.has(columnName)) return
	db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`)
	console.log(`[DB] Migrated: added ${tableName}.${columnName}`)
}

function ensureBookingsAllowsSuspend(db: BookingDb) {
	const row = db
		.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'")
		.get() as { sql?: string } | undefined
	const sql = row?.sql || ""
	if (sql.includes("'suspend'")) return

	console.log("[DB] Migrating: bookings.status to allow 'suspend'...")

	db.exec(`
		BEGIN;
		CREATE TABLE IF NOT EXISTS bookings_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id INTEGER NOT NULL,
			ntid TEXT NOT NULL,
			book_reason TEXT,
			start_time INTEGER NOT NULL,
			end_time INTEGER NOT NULL,
			is_exclusive INTEGER DEFAULT 0,
			status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'completed', 'suspend')),
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
			FOREIGN KEY (ntid) REFERENCES users(ntid)
		);
		INSERT INTO bookings_new (
			id, server_id, ntid, book_reason, start_time, end_time, is_exclusive, status, created_at, updated_at
		)
		SELECT
			id, server_id, ntid, book_reason, start_time, end_time, is_exclusive, status, created_at, updated_at
		FROM bookings;
		DROP TABLE bookings;
		ALTER TABLE bookings_new RENAME TO bookings;
		CREATE INDEX IF NOT EXISTS idx_bookings_server ON bookings(server_id);
		CREATE INDEX IF NOT EXISTS idx_bookings_ntid ON bookings(ntid);
		CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time);
		COMMIT;
	`)

	console.log("[DB] Migrated: bookings.status now allows 'suspend'")
}

function runMigrations(db: BookingDb) {
	try {
		addColumnIfMissing({
			db,
			tableName: "servers",
			columnName: "ssh_user",
			columnDefinition: "ssh_user TEXT DEFAULT 'root'",
		})
		addColumnIfMissing({
			db,
			tableName: "servers",
			columnName: "ipmi_password",
			columnDefinition: "ipmi_password TEXT DEFAULT ''",
		})
		addColumnIfMissing({
			db,
			tableName: "servers",
			columnName: "previous_status",
			columnDefinition: "previous_status TEXT DEFAULT NULL",
		})

		ensureBookingsAllowsSuspend(db)
	} catch (error) {
		console.warn("[DB] Migration skipped/failed:", error)
	}
}

let db
try {
	db = openDb(primaryDbPath)
} catch (error) {
	// If we're in a read-only runtime (e.g. Vercel), fall back to /tmp.
	const fallbackDbPath = "/tmp/booking.db"
	db = openDb(fallbackDbPath)
	console.warn("[DB] Failed to open primary DB path:", primaryDbPath, "→ using", fallbackDbPath, error)
}

// 服务启动时恢复定时器（只执行一次）
let timerInitialized = false

export function initTimers() {
  if (timerInitialized) {
    console.log('[booking.ts] Timers already initialized, skipping')
    return
  }
  
  try {
    console.log('[DB] Initializing booking timers...')
    restoreAllTimers()
    timerInitialized = true
  } catch (error) {
    console.error('[DB] Failed to initialize timers:', error)
  }
}

// 添加生命周期初始化函数
let lifecycleInitialized = false
export async function initLifecycle() {
  if (lifecycleInitialized) {
    console.log('[booking.ts] Lifecycle already initialized, skipping')
    return
  }
  lifecycleInitialized = true
  
  console.log('[booking.ts] Initializing service restore_hold...')
  
  // 1. 注册关闭处理器
  registerShutdownHandlers()
  
  // 2. 恢复当前有效预订的权限
  await handleStartup()
}

// 在模块加载时自动初始化
// 延迟一点确保数据库连接就绪
setTimeout(async () => {
  initTimers()
  // 稍微延迟启动生命周期管理，确保定时器先恢复
  setTimeout(() => {
    initLifecycle().catch(err => {
      console.error('[booking.ts] Lifecycle init error:', err)
    })
  }, 2000)
}, 1000)

// 启用外键约束
db.pragma('foreign_keys = ON');

// 初始化表结构
db.exec(`
  -- 用户表
  CREATE TABLE IF NOT EXISTS users (
    ntid TEXT PRIMARY KEY,
    display_name TEXT,
    email TEXT,
    timezone TEXT DEFAULT 'UTC',
    user_level TEXT DEFAULT 'viewer' CHECK(user_level IN ('viewer', 'developer', 'admin')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT
  );

  -- 服务器表
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL UNIQUE,
    ip TEXT,
    ipmi_ip TEXT,
    domain_name TEXT,
    location TEXT,
    model TEXT,
    sn TEXT,
    bmc_mac TEXT,
    cpu_model TEXT,
    gpu_arch TEXT,
    num_gpus INTEGER DEFAULT 0,
    ram TEXT,
    disk TEXT,
    nic TEXT,
    is_exclusive INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'maintenance', 'offline')),
    description TEXT,
    ssh_user TEXT DEFAULT 'root',
    ipmi_password TEXT DEFAULT '',
    previous_status TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- 预订历史表
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    ntid TEXT NOT NULL,
    book_reason TEXT,
    start_time INTEGER NOT NULL,  -- Unix timestamp (ms)
    end_time INTEGER NOT NULL,    -- Unix timestamp (ms)
    is_exclusive INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'completed', 'suspend')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (ntid) REFERENCES users(ntid)
  );

  -- 创建索引
  CREATE INDEX IF NOT EXISTS idx_bookings_server ON bookings(server_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_ntid ON bookings(ntid);
  CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time);

  -- 预订权限表
  CREATE TABLE IF NOT EXISTS booking_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    ntid TEXT NOT NULL,
    added_by TEXT NOT NULL,
    can_book INTEGER DEFAULT 0,
    can_manage INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (ntid) REFERENCES users(ntid)
  );
`);

<<<<<<< HEAD
runMigrations(db)
=======
// ============================================
// Migration: 给已有的 users 表补加 status 列
// ============================================
function runMigrations() {
  // 检查 users 表是否有 status 列
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasStatus = columns.some(col => col.name === 'status');

  if (!hasStatus) {
    console.log('[DB Migration] Adding status column to users table...');
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'revoked'))`);
    // 把已有的用户全部设为 approved（他们是在没有审批机制时创建的）
    db.exec(`UPDATE users SET status = 'approved' WHERE status IS NULL OR status = 'pending'`);
    console.log('[DB Migration] status column added, existing users set to approved');
  }
}

// 确保 coresw 账户始终存在且为 admin + approved
function ensureCoreswAccount() {
  const coresw = db.prepare('SELECT * FROM users WHERE ntid = ?').get('coresw') as any;
  if (!coresw) {
    db.prepare(
      `INSERT INTO users (ntid, display_name, user_level, status, created_at)
       VALUES ('coresw', 'Core System Admin', 'admin', 'approved', CURRENT_TIMESTAMP)`
    ).run();
    console.log('[DB] Created coresw account');
  } else {
    // 强制保证 coresw 一定是 admin + approved
    if (coresw.user_level !== 'admin' || coresw.status !== 'approved') {
      db.prepare(
        `UPDATE users SET user_level = 'admin', status = 'approved' WHERE ntid = 'coresw'`
      ).run();
      console.log('[DB] Enforced coresw as admin + approved');
    }
  }
}

runMigrations();
ensureCoreswAccount();
>>>>>>> 93cafb05c (Sync update, mainly user management and bugfix.)

export default db;

// 类型定义
export interface User {
  ntid: string;
  display_name: string | null;
  email: string | null;
  timezone: string;
  user_level: 'viewer' | 'developer' | 'admin';
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  created_at: string;
  last_login: string | null;
}

export interface Server {
  id: number;
  hostname: string;
  ip: string | null;
  ipmi_ip: string | null;
  domain_name: string | null;
  location: string | null;
  model: string | null;
  sn: string | null;
  bmc_mac: string | null;
  cpu_model: string | null;
  gpu_arch: string | null;
  num_gpus: number;
  ram: string | null;
  disk: string | null;
  nic: string | null;
  is_exclusive: number;
  status: 'available' | 'maintenance' | 'offline';
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  server_id: number;
  ntid: string;
  book_reason: string | null;
  start_time: number;
  end_time: number;
  is_exclusive: number;
  status: 'active' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface BookingPermission {
  id: number;
  server_id: number;
  ntid: string;
  added_by: string;
  can_book: number;
  can_manage: number;
  created_at: string;
  updated_at: string;
}