import ldap from 'ldapjs';
import db, { User } from '../db/booking';

const LDAP_SERVER = 'ldap://ausldap.amd.com:389';
const LDAP_DOMAIN = '@amd.com';

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export async function authenticateWithLDAP(ntid: string, password: string): Promise<AuthResult> {
  return new Promise((resolve) => {
    const client = ldap.createClient({
      url: LDAP_SERVER,
      connectTimeout: 5000,
      timeout: 5000,
    });

    client.on('error', (err) => {
      console.error('LDAP connection error:', err);
      resolve({ success: false, error: 'LDAP connection failed' });
    });

    const userDN = `${ntid}${LDAP_DOMAIN}`;

    client.bind(userDN, password, (err) => {
      client.unbind();

      if (err) {
        console.error('LDAP bind failed:', err.message);
        resolve({ success: false, error: 'Invalid credentials' });
        return;
      }

      const user = createOrUpdateUser(ntid);
      resolve({ success: true, user });
    });
  });
}

function createOrUpdateUser(ntid: string): User {
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User | undefined;

    if (existing) {
      db.prepare('UPDATE users SET last_login = ? WHERE ntid = ?').run(now, ntid);
      return { ...existing, last_login: now };
    }

    db.prepare(`
    INSERT INTO users (ntid, display_name, email, user_level, last_login)
    VALUES (?, ?, ?, 'developer', ?)
    `).run(ntid, ntid, `${ntid}@amd.com`, now);  // 默认 developer
    console.log('Created new user:', ntid);
    return db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User;
}


export function getUserByNtid(ntid: string): User | null {
  return db.prepare('SELECT * FROM users WHERE ntid = ?').get(ntid) as User | null;
}


// 更改用户权限（仅 admin 可操作）
export function updateUserLevel(ntid: string, level: User['user_level']): boolean {
  const result = db.prepare('UPDATE users SET user_level = ? WHERE ntid = ?').run(level, ntid);
  return result.changes > 0;
}