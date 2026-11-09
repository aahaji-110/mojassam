/**
 * مُجسَّم - PostgreSQL API (Netlify Function)
 * ===========================================
 * Database: Netlify Database (managed serverless PostgreSQL) via @netlify/database
 * Identity: Firebase Auth ID tokens (verified with Google public keys)
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

// Lazy client – Netlify Database resolves the connection automatically
let _sql = null;
const sql = (...args) => (_sql || (_sql = getDatabase().sql))(...args);

/* ── Schema (idempotent, runs once per cold start) ── */
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        uid           TEXT PRIMARY KEY,
        email         TEXT,
        display_name  TEXT DEFAULT '',
        photo_url     TEXT,
        phone         TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        credits       NUMERIC NOT NULL DEFAULT 0 CHECK (credits >= 0),
        plan          TEXT NOT NULL DEFAULT 'free',
        plan_expiry   TIMESTAMPTZ,
        plan_started  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS transactions (
        id          BIGSERIAL PRIMARY KEY,
        uid         TEXT REFERENCES users(uid) ON DELETE CASCADE,
        type        TEXT NOT NULL,
        amount      NUMERIC,
        plan        TEXT,
        expiry_date TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS security_logs (
        id          BIGSERIAL PRIMARY KEY,
        uid         TEXT,
        type        TEXT NOT NULL,
        details     JSONB,
        user_agent  TEXT,
        url         TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_tx_uid ON transactions(uid)`;
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
    return {
      uid: payload.sub,
      email: payload.email || null,
      name: payload.name || '',
      picture: payload.picture || null
    };
  } catch {
    return null;
  }
}

function toProfile(r) {
  if (!r) return null;
  return {
    uid: r.uid,
    email: r.email,
    displayName: r.display_name || '',
    photoURL: r.photo_url,
    phone: r.phone,
    role: r.role,
    credits: Number(r.credits),
    subscription: {
      plan: r.plan,
      expiryDate: r.plan_expiry,
      startedAt: r.plan_started,
      expired: r.plan_expiry ? new Date(r.plan_expiry) < new Date() : false
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLogin: r.last_login
  };
}

/** Upsert the caller's row on every authenticated request. */
async function upsertUser(u, displayName) {
  const role = u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()) ? 'admin' : 'user';
  const name = displayName || u.name || '';
  const [row] = await sql`
    INSERT INTO users (uid, email, display_name, photo_url, role)
    VALUES (${u.uid}, ${u.email}, ${name}, ${u.picture}, ${role})
    ON CONFLICT (uid) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = CASE WHEN users.display_name = '' THEN EXCLUDED.display_name ELSE users.display_name END,
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
  const { action } = body || {};

  try {
    await ensureSchema();
    const user = await verifyUser(req);

    // Anonymous security log is allowed (e.g. failed login attempts)
    if (action === 'logSecurity') {
      const details = body.details && typeof body.details === 'object' ? body.details : {};
      await sql`INSERT INTO security_logs (uid, type, details, user_agent, url)
        VALUES (${user ? user.uid : null}, ${String(body.type || 'unknown').slice(0, 100)},
                ${JSON.stringify(details).slice(0, 4000)}::jsonb,
                ${(req.headers.get('user-agent') || '').slice(0, 500)},
                ${String(body.url || '').slice(0, 500)})`;
      return json(200, { success: true });
    }

    if (!user) return json(401, { success: false, error: 'يجب تسجيل الدخول' });
    const me = await upsertUser(user, body.displayName);
    const isAdmin = me.role === 'admin';
    const targetUid = body.uid || user.uid;
    const ownOrAdmin = targetUid === user.uid || isAdmin;

    switch (action) {
      case 'login': {
        const [r] = await sql`UPDATE users SET last_login = now() WHERE uid = ${user.uid} RETURNING *`;
        return json(200, { success: true, data: toProfile(r) });
      }

      case 'getProfile': {
        if (!ownOrAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const [r] = await sql`SELECT * FROM users WHERE uid = ${targetUid}`;
        if (!r) return json(404, { success: false, error: 'المستخدم غير موجود' });
        return json(200, { success: true, data: toProfile(r) });
      }

      case 'updateProfile': {
        if (!ownOrAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const d = body.data || {};
        const [r] = await sql`UPDATE users SET
            display_name = COALESCE(${d.displayName ?? null}, display_name),
            phone        = COALESCE(${d.phone ?? null}, phone),
            photo_url    = COALESCE(${d.photoURL ?? null}, photo_url),
            updated_at   = now()
          WHERE uid = ${targetUid} RETURNING *`;
        return json(200, { success: true, data: toProfile(r) });
      }

      case 'isAdmin':
        return json(200, { success: true, data: isAdmin });

      case 'addCredits': {
        if (!isAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const amount = Number(body.amount);
        if (!(amount > 0)) return json(400, { success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' });
        await sql`UPDATE users SET credits = credits + ${amount}, updated_at = now() WHERE uid = ${targetUid}`;
        await sql`INSERT INTO transactions (uid, type, amount) VALUES (${targetUid}, 'credit', ${amount})`;
        return json(200, { success: true });
      }

      case 'deductCredits': {
        if (!ownOrAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const amount = Number(body.amount);
        if (!(amount > 0)) return json(400, { success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' });
        // Atomic: only deducts when balance is sufficient
        const rows = await sql`UPDATE users SET credits = credits - ${amount}, updated_at = now()
          WHERE uid = ${targetUid} AND credits >= ${amount} RETURNING uid`;
        if (rows.length === 0) return json(400, { success: false, error: 'رصيد غير كافٍ' });
        await sql`INSERT INTO transactions (uid, type, amount) VALUES (${targetUid}, 'debit', ${amount})`;
        return json(200, { success: true });
      }

      case 'getSubscription': {
        if (!ownOrAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const [r] = await sql`SELECT * FROM users WHERE uid = ${targetUid}`;
        if (!r) return json(404, { success: false, error: 'المستخدم غير موجود' });
        return json(200, { success: true, data: toProfile(r).subscription });
      }

      case 'setSubscription': {
        if (!isAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const plan = String(body.plan || 'free').slice(0, 50);
        const expiry = body.expiryDate ? new Date(body.expiryDate).toISOString() : null;
        await sql`UPDATE users SET plan = ${plan}, plan_expiry = ${expiry}, plan_started = now(), updated_at = now()
          WHERE uid = ${targetUid}`;
        await sql`INSERT INTO transactions (uid, type, plan, expiry_date)
          VALUES (${targetUid}, 'subscription', ${plan}, ${expiry})`;
        return json(200, { success: true });
      }

      case 'getAllUsers': {
        if (!isAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const rows = await sql`SELECT * FROM users ORDER BY created_at DESC LIMIT 1000`;
        return json(200, { success: true, data: rows.map((r) => ({ id: r.uid, ...toProfile(r) })) });
      }

      case 'getAllPayments': {
        if (!isAdmin) return json(403, { success: false, error: 'غير مصرح لك بهذا الإجراء' });
        const rows = await sql`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1000`;
        return json(200, {
          success: true,
          data: rows.map((r) => ({
            id: String(r.id), uid: r.uid, type: r.type,
            amount: r.amount == null ? null : Number(r.amount),
            plan: r.plan, expiryDate: r.expiry_date, createdAt: r.created_at
          }))
        });
      }

      default:
        return json(400, { success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[api] error:', err);
    return json(500, { success: false, error: 'خطأ في الخادم' });
  }
};
