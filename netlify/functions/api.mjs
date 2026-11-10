/**
 * PostgreSQL API (Netlify Function)
 * =================================
 * Database: Netlify Database (managed PostgreSQL) via @netlify/database
 * Identity: Firebase Auth ID tokens (Google Sign-In), verified with Google public keys
 *
 * Endpoint: /.netlify/functions/api   (POST, JSON body: { action, ...params })
 */
import { getDatabase } from '@netlify/database';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mojassam-9666e';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'aahaji.110@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

let _sql = null;
const sql = (...args) => (_sql || (_sql = getDatabase().sql))(...args);

/* ── Schema ──
 * SCHEMA_VERSION 2 = fresh start: drops every table from the old site once,
 * then creates a clean `users` table. Bump the version for future schema changes.
 */
const SCHEMA_VERSION = 2;
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
      const [row] = await sql`SELECT value FROM app_meta WHERE key = 'schema_version'`;
      if (row && Number(row.value) >= SCHEMA_VERSION) return;

      // One-time reset of the old site's data
      await sql`DROP TABLE IF EXISTS transactions CASCADE`;
      await sql`DROP TABLE IF EXISTS security_logs CASCADE`;
      await sql`DROP TABLE IF EXISTS users CASCADE`;

      await sql`CREATE TABLE users (
        uid           TEXT PRIMARY KEY,
        email         TEXT,
        display_name  TEXT NOT NULL DEFAULT '',
        photo_url     TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`INSERT INTO app_meta (key, value) VALUES ('schema_version', ${String(SCHEMA_VERSION)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* ── Helpers ── */
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

async function verifyUser(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });
    return { uid: payload.sub, email: payload.email || null, name: payload.name || '', picture: payload.picture || null };
  } catch {
    return null;
  }
}

const toProfile = (r) => r && ({
  uid: r.uid,
  email: r.email,
  displayName: r.display_name,
  photoURL: r.photo_url,
  role: r.role,
  createdAt: r.created_at,
  lastLogin: r.last_login
});

async function upsertUser(u) {
  const role = u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()) ? 'admin' : 'user';
  const [row] = await sql`
    INSERT INTO users (uid, email, display_name, photo_url, role)
    VALUES (${u.uid}, ${u.email}, ${u.name}, ${u.picture}, ${role})
    ON CONFLICT (uid) DO UPDATE SET
      email = EXCLUDED.email,
      photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
      role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE users.role END
    RETURNING *`;
  return row;
}

/* ── Handler ── */
export default async (req) => {
  if (req.method !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  let body;
  try { body = await req.json(); } catch { return json(400, { success: false, error: 'Invalid JSON' }); }

  try {
    await ensureSchema();
    const user = await verifyUser(req);
    if (!user) return json(401, { success: false, error: 'يجب تسجيل الدخول' });
    const me = await upsertUser(user);

    switch (body.action) {
      case 'login': {
        const [r] = await sql`UPDATE users SET last_login = now() WHERE uid = ${user.uid} RETURNING *`;
        return json(200, { success: true, data: toProfile(r) });
      }
      case 'getProfile':
        return json(200, { success: true, data: toProfile(me) });

      case 'updateProfile': {
        const d = body.data || {};
        const name = d.displayName == null ? null : String(d.displayName).slice(0, 100);
        const [r] = await sql`UPDATE users SET
            display_name = COALESCE(${name}, display_name),
            updated_at   = now()
          WHERE uid = ${user.uid} RETURNING *`;
        return json(200, { success: true, data: toProfile(r) });
      }
      case 'isAdmin':
        return json(200, { success: true, data: me.role === 'admin' });

      default:
        return json(400, { success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[api] error:', err);
    return json(500, { success: false, error: 'خطأ في الخادم' });
  }
};
