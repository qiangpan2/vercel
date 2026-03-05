import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { restoreAllTimers } from '../booking/timer'
import { handleStartup, registerShutdownHandlers } from '../booking/restart_hold'


// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件固定放在项目根目录的 data 文件夹中
const dbPath = path.join(__dirname, '../../../data/booking.db');
//const dbPath = path.join(process.cwd(), 'booking.db');

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

const db = new Database(dbPath);

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

`);

export default db;

// 类型定义
export interface User {
  ntid: string;
  display_name: string | null;
  email: string | null;
  timezone: string;
  user_level: 'viewer' | 'developer' | 'admin';
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
