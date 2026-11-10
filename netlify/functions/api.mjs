/**
 * مجسمات (Mojassamat) - Serverless PostgreSQL API
 * =================================================
 * Database: Netlify Database (PostgreSQL) via @netlify/database
 * Identity: Firebase Auth ID tokens + Admin PIN layer
 */
import { getDatabase } from '@netlify/database';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mojassam-9666e';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'aahaji.110@gmail.com,aahaji_110@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

let _sql = null;
const sql = (...args) => (_sql || (_sql = getDatabase().sql))(...args);

const DEFAULT_PACKAGES = [
  { id: 'pack_starter', category: 'coins', nameAr: 'باقة البداية', nameEn: 'Starter Pack', coins: 6, priceSar: 9, badgeAr: 'تجريبية', badgeEn: 'Starter', popular: false },
  { id: 'pack_basic', category: 'coins', nameAr: 'باقة الأساس', nameEn: 'Basic Pack', coins: 20, priceSar: 24, badgeAr: 'وفّر 20%', badgeEn: 'Save 20%', popular: false },
  { id: 'pack_pro', category: 'coins', nameAr: 'باقة المحترفين', nameEn: 'Pro Pack', coins: 50, priceSar: 49, badgeAr: 'الأكثر طلباً ⭐', badgeEn: 'Most Popular ⭐', popular: true },
  { id: 'pack_mega', category: 'coins', nameAr: 'باقة الاستوديو', nameEn: 'Studio Pack', coins: 120, priceSar: 99, badgeAr: 'أفضل قيمة', badgeEn: 'Best Value', popular: false },
  { id: 'sub_daily', category: 'subscription', period: 'daily', durationDays: 1, nameAr: 'اشتراك يومي', nameEn: 'Daily Pass', coins: 20, priceSar: 12, badgeAr: '24 ساعة', badgeEn: '24 Hours', popular: false },
  { id: 'sub_weekly', category: 'subscription', period: 'weekly', durationDays: 7, nameAr: 'اشتراك أسبوعي', nameEn: 'Weekly Plan', coins: 60, priceSar: 29, badgeAr: '7 أيام', badgeEn: '7 Days', popular: false },
  { id: 'sub_monthly', category: 'subscription', period: 'monthly', durationDays: 30, nameAr: 'اشتراك شهري', nameEn: 'Monthly Plan', coins: 160, priceSar: 60, badgeAr: 'الأفضل شهرياً 🔥', badgeEn: 'Best Monthly 🔥', popular: true },
  { id: 'sub_yearly', category: 'subscription', period: 'yearly', durationDays: 365, nameAr: 'اشتراك سنوي', nameEn: 'Yearly Plan', coins: 1200, priceSar: 300, badgeAr: 'وفّر 58% 💎', badgeEn: 'Save 58% 💎', popular: false }
];

const DEFAULT_SITE_SETTINGS = {
  siteNameAr: 'مجسمات',
  siteNameEn: 'Mojassamat',
  contactEmail: 'aahaji.110@gmail.com',
  whatsappNumber: '966500000000',
  freelanceDocNumber: 'FL-76849201',
  freelanceVerifyUrl: 'https://freelance.sa',
  ownerName: 'علي الحاجي',
  announcementAr: '🎁 سجّل الآن واحصل على 6 كوينز مجاناً + مكافآت تسجيل دخول يومي و20% عمولة دعوة الأصدقاء!',
  announcementEn: '🎁 Sign up now and get 6 FREE Coins + Daily Check-in rewards & 20% referral commission!',
  exportCostCoins: 2,
  signupBonusCoins: 6,
  referralBonusCoins: 5,
  referralCommissionPercent: 20,
  paymentEnabled: true,
  moyasarPublishableKey: '',
  moyasarSecretKey: '',
  moyasarPaymentLink: '',
  paypalClientId: '',
  paypalPaymentLink: '',
  resendApiKey: '',
  resendFromEmail: 'onboarding@resend.dev',
  twitterUrl: '',
  instagramUrl: '',
  tiktokUrl: ''
};

const SCHEMA_VERSION = 3;
let schemaReady = null;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`;
      const [ver] = await sql`SELECT value FROM app_meta WHERE key = 'schema_version'`;
      if (!ver || Number(ver.value) < SCHEMA_VERSION) {
        await sql`DROP TABLE IF EXISTS security_logs CASCADE`;
        await sql`DROP TABLE IF EXISTS coupons CASCADE`;
        await sql`DROP TABLE IF EXISTS redeem_codes CASCADE`;
        await sql`DROP TABLE IF EXISTS transactions CASCADE`;
        await sql`DROP TABLE IF EXISTS users CASCADE`;

        await sql`CREATE TABLE users (
          uid               TEXT PRIMARY KEY,
          email             TEXT,
          display_name      TEXT NOT NULL DEFAULT '',
          photo_url         TEXT,
          role              TEXT NOT NULL DEFAULT 'user',
          status            TEXT NOT NULL DEFAULT 'active',
          coins             NUMERIC NOT NULL DEFAULT 6 CHECK (coins >= 0),
          plan              TEXT NOT NULL DEFAULT 'free',
          plan_expiry       TIMESTAMPTZ,
          referral_code     TEXT UNIQUE,
          referred_by       TEXT,
          streak_days       INT NOT NULL DEFAULT 0,
          last_checkin_date TEXT,
          total_spent       NUMERIC NOT NULL DEFAULT 0,
          exports_count     INT NOT NULL DEFAULT 0,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_login        TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;

        await sql`CREATE TABLE transactions (
          id          BIGSERIAL PRIMARY KEY,
          uid         TEXT REFERENCES users(uid) ON DELETE SET NULL,
          email       TEXT,
          type        TEXT NOT NULL,
          coins_delta NUMERIC NOT NULL DEFAULT 0,
          amount_sar  NUMERIC NOT NULL DEFAULT 0,
          method      TEXT,
          status      TEXT NOT NULL DEFAULT 'completed',
          description TEXT,
          meta        JSONB,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;

        await sql`CREATE TABLE redeem_codes (
          code           TEXT PRIMARY KEY,
          uid            TEXT,
          email          TEXT,
          package_id     TEXT,
          coins          NUMERIC NOT NULL DEFAULT 0,
          plan           TEXT,
          duration_days  INT NOT NULL DEFAULT 0,
          amount_sar     NUMERIC NOT NULL DEFAULT 0,
          payment_method TEXT,
          status         TEXT NOT NULL DEFAULT 'unused',
          used_by        TEXT,
          used_at        TIMESTAMPTZ,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;

        await sql`CREATE TABLE coupons (
          code             TEXT PRIMARY KEY,
          discount_percent INT NOT NULL DEFAULT 10,
          bonus_coins      INT NOT NULL DEFAULT 0,
          max_uses         INT NOT NULL DEFAULT 100,
          used_count       INT NOT NULL DEFAULT 0,
          active           BOOLEAN NOT NULL DEFAULT true,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;

        await sql`CREATE TABLE security_logs (
          id         BIGSERIAL PRIMARY KEY,
          uid        TEXT,
          type       TEXT NOT NULL,
          details    JSONB,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;

        await sql`INSERT INTO app_meta (key, value) VALUES ('schema_version', ${String(SCHEMA_VERSION)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      }

      // Ensure default meta keys exist
      await sql`INSERT INTO app_meta (key, value) VALUES ('admin_pin', '982461') ON CONFLICT (key) DO NOTHING`;
      await sql`INSERT INTO app_meta (key, value) VALUES ('admin_pin_changed', 'false') ON CONFLICT (key) DO NOTHING`;
      await sql`INSERT INTO app_meta (key, value) VALUES ('packages', ${JSON.stringify(DEFAULT_PACKAGES)}) ON CONFLICT (key) DO NOTHING`;
      await sql`INSERT INTO app_meta (key, value) VALUES ('site_settings', ${JSON.stringify(DEFAULT_SITE_SETTINGS)}) ON CONFLICT (key) DO NOTHING`;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function getMetaJson(key, fallback) {
  const [r] = await sql`SELECT value FROM app_meta WHERE key = ${key}`;
  if (!r) return fallback;
  try { return { ...fallback, ...JSON.parse(r.value) }; } catch { return fallback; }
}

async function getPackages() {
  const [r] = await sql`SELECT value FROM app_meta WHERE key = 'packages'`;
  if (!r) return DEFAULT_PACKAGES;
  try { return JSON.parse(r.value); } catch { return DEFAULT_PACKAGES; }
}

function publicSettings(s) {
  return {
    siteNameAr: s.siteNameAr,
    siteNameEn: s.siteNameEn,
    contactEmail: s.contactEmail,
    whatsappNumber: s.whatsappNumber,
    freelanceDocNumber: s.freelanceDocNumber,
    freelanceVerifyUrl: s.freelanceVerifyUrl,
    ownerName: s.ownerName,
    announcementAr: s.announcementAr,
    announcementEn: s.announcementEn,
    exportCostCoins: Number(s.exportCostCoins || 2),
    signupBonusCoins: Number(s.signupBonusCoins || 6),
    referralBonusCoins: Number(s.referralBonusCoins || 5),
    referralCommissionPercent: Number(s.referralCommissionPercent || 20),
    paymentEnabled: s.paymentEnabled !== false,
    moyasarPublishableKey: s.moyasarPublishableKey || '',
    moyasarPaymentLink: s.moyasarPaymentLink || '',
    paypalClientId: s.paypalClientId || '',
    paypalPaymentLink: s.paypalPaymentLink || '',
    twitterUrl: s.twitterUrl || '',
    instagramUrl: s.instagramUrl || '',
    tiktokUrl: s.tiktokUrl || ''
  };
}

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

function makeReferralCode(uid) {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `MJ${clean}${rand}`;
}

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '', part2 = '';
  for (let i = 0; i < 4; i++) part1 += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) part2 += chars[Math.floor(Math.random() * chars.length)];
  return `MJ-${part1}-${part2}`;
}

function toProfile(r) {
  if (!r) return null;
  const expired = r.plan_expiry ? new Date(r.plan_expiry) < new Date() : false;
  return {
    uid: r.uid,
    email: r.email,
    displayName: r.display_name || (r.email ? r.email.split('@')[0] : 'مستخدم'),
    photoURL: r.photo_url,
    role: r.role,
    status: r.status,
    coins: Number(r.coins),
    plan: expired ? 'free' : r.plan,
    planExpiry: r.plan_expiry,
    referralCode: r.referral_code,
    referredBy: r.referred_by,
    streakDays: Number(r.streak_days || 0),
    lastCheckinDate: r.last_checkin_date,
    totalSpent: Number(r.total_spent || 0),
    exportsCount: Number(r.exports_count || 0),
    createdAt: r.created_at,
    lastLogin: r.last_login
  };
}

async function upsertUser(u, displayName, referralCodeInput, settings) {
  const role = u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()) ? 'admin' : 'user';
  const [existing] = await sql`SELECT * FROM users WHERE uid = ${u.uid}`;
  if (existing) {
    const [updated] = await sql`
      UPDATE users SET
        email = COALESCE(${u.email}, email),
        display_name = CASE WHEN display_name = '' AND ${displayName || u.name || ''} <> '' THEN ${displayName || u.name || ''} ELSE display_name END,
        photo_url = COALESCE(${u.picture}, photo_url),
        role = CASE WHEN ${role} = 'admin' THEN 'admin' ELSE role END,
        last_login = now(),
        updated_at = now()
      WHERE uid = ${u.uid}
      RETURNING *`;
    return updated;
  }

  // First-time signup -> give 6 free coins!
  const signupCoins = Number(settings.signupBonusCoins ?? 6);
  const myRefCode = makeReferralCode(u.uid);
  let referredByUid = null;

  if (referralCodeInput) {
    const codeClean = String(referralCodeInput).trim().toUpperCase();
    const [refOwner] = await sql`SELECT uid FROM users WHERE referral_code = ${codeClean} AND uid <> ${u.uid}`;
    if (refOwner) {
      // Check monthly limit (max 10 referrals per month)
      const [cnt] = await sql`
        SELECT count(*)::int AS c FROM transactions
        WHERE uid = ${refOwner.uid} AND type = 'referral_bonus'
          AND created_at >= date_trunc('month', now())`;
      if ((cnt?.c || 0) < 10) {
        referredByUid = refOwner.uid;
      }
    }
  }

  const [created] = await sql`
    INSERT INTO users (uid, email, display_name, photo_url, role, coins, referral_code, referred_by)
    VALUES (${u.uid}, ${u.email}, ${displayName || u.name || ''}, ${u.picture}, ${role}, ${signupCoins}, ${myRefCode}, ${referredByUid})
    RETURNING *`;

  await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
    VALUES (${u.uid}, ${u.email}, 'signup_bonus', ${signupCoins}, 'هدية التسجيل المجانية (6 كوينز)')`;

  if (referredByUid) {
    const refBonus = Number(settings.referralBonusCoins ?? 5);
    await sql`UPDATE users SET coins = coins + ${refBonus}, updated_at = now() WHERE uid = ${referredByUid}`;
    await sql`INSERT INTO transactions (uid, type, coins_delta, description)
      VALUES (${referredByUid}, 'referral_bonus', ${refBonus}, ${'مكافأة دعوة صديق: ' + (u.email || u.uid)})`;
  }

  return created;
}

async function sendActivationEmail(settings, toEmail, code, pkgName, coins, amountSar) {
  if (!settings.resendApiKey || !toEmail) return { sent: false, reason: 'no_api_key' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: settings.resendFromEmail || 'Mojassamat <onboarding@resend.dev>',
        to: [toEmail],
        subject: `كود تفعيل باقتك في منصة مجسمات: ${code}`,
        html: `
          <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#181a1f;color:#fff;padding:28px;border-radius:16px;max-width:520px;margin:auto;border:1px solid #2e323b">
            <h2 style="color:#10b981;margin-top:0">منصة مجسمات ثلاثية الأبعاد</h2>
            <p>شكراً لشرائك <strong>${pkgName}</strong> بقيمة <strong>${amountSar} ر.س</strong>.</p>
            <p>استخدم كود التفعيل التالي في خانة شحن الرصيد داخل الموقع لإضافة <strong>${coins} كوينز</strong> لحسابك فوراً:</p>
            <div style="background:#0f1115;border:2px dashed #10b981;padding:16px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:3px;color:#10b981;border-radius:12px;margin:20px 0">
              ${code}
            </div>
            <p style="color:#9ca3af;font-size:12px">إذا واجهت أي استفسار تواصل معنا عبر: ${settings.contactEmail}</p>
          </div>
        `
      })
    });
    return { sent: res.ok };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

async function checkAdminPin(pinInput) {
  const [pinRow] = await sql`SELECT value FROM app_meta WHERE key = 'admin_pin'`;
  const currentPin = pinRow ? pinRow.value : '982461';
  return String(pinInput || '').trim() === currentPin;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  let body;
  try { body = await req.json(); } catch { return json(400, { success: false, error: 'Invalid JSON' }); }
  const { action } = body || {};

  try {
    await ensureSchema();
    const settings = await getMetaJson('site_settings', DEFAULT_SITE_SETTINGS);
    const packages = await getPackages();

    /* ── 1. Public Endpoints ── */
    if (action === 'getPublicConfig') {
      return json(200, {
        success: true,
        data: {
          settings: publicSettings(settings),
          packages
        }
      });
    }

    if (action === 'logSecurity') {
      const details = body.details && typeof body.details === 'object' ? body.details : {};
      await sql`INSERT INTO security_logs (uid, type, details, user_agent)
        VALUES (${body.uid || null}, ${String(body.type || 'event').slice(0, 80)},
                ${JSON.stringify(details).slice(0, 2000)}::jsonb,
                ${(req.headers.get('user-agent') || '').slice(0, 400)})`;
      return json(200, { success: true });
    }

    /* ── 2. Admin PIN Endpoints ── */
    if (action === 'verifyAdminPin') {
      const ok = await checkAdminPin(body.pin);
      if (!ok) {
        await sql`INSERT INTO security_logs (type, details, user_agent)
          VALUES ('admin_pin_failed', ${JSON.stringify({ attempted: String(body.pin || '').slice(0, 10) })}::jsonb, ${(req.headers.get('user-agent') || '').slice(0, 300)})`;
        return json(401, { success: false, error: 'رمز الإدارة غير صحيح' });
      }
      const [changedRow] = await sql`SELECT value FROM app_meta WHERE key = 'admin_pin_changed'`;
      const mustChangePin = !changedRow || changedRow.value !== 'true';
      return json(200, { success: true, data: { mustChangePin } });
    }

    if (action === 'changeAdminPin') {
      const ok = await checkAdminPin(body.currentPin);
      if (!ok) return json(401, { success: false, error: 'الرمز الحالي غير صحيح' });
      const newPin = String(body.newPin || '').trim();
      if (!/^\d{4,8}$/.test(newPin)) {
        return json(400, { success: false, error: 'الرمز الجديد يجب أن يتكون من 4 إلى 8 أرقام' });
      }
      await sql`INSERT INTO app_meta (key, value) VALUES ('admin_pin', ${newPin})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      await sql`INSERT INTO app_meta (key, value) VALUES ('admin_pin_changed', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true'`;
      return json(200, { success: true });
    }

    // Admin management actions authenticated by PIN
    if (action && action.startsWith('admin')) {
      const pinOk = await checkAdminPin(body.adminPin);
      const user = await verifyUser(req);
      const emailOk = user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
      if (!pinOk && !emailOk) {
        return json(403, { success: false, error: 'غير مصرح لك بالدخول للوحة الإدارة' });
      }

      if (action === 'adminOverview') {
        const users = await sql`SELECT * FROM users ORDER BY created_at DESC LIMIT 500`;
        const txs = await sql`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 300`;
        const codes = await sql`SELECT * FROM redeem_codes ORDER BY created_at DESC LIMIT 300`;
        const coupons = await sql`SELECT * FROM coupons ORDER BY created_at DESC`;
        const secLogs = await sql`SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 100`;
        const [changedRow] = await sql`SELECT value FROM app_meta WHERE key = 'admin_pin_changed'`;

        const totalRevenue = txs
          .filter((t) => (t.type === 'purchase' || t.type === 'redeem') && t.status === 'completed')
          .reduce((acc, t) => acc + Number(t.amount_sar || 0), 0);

        return json(200, {
          success: true,
          data: {
            stats: {
              totalUsers: users.length,
              activeUsers: users.filter((u) => u.status === 'active').length,
              totalRevenue,
              totalExports: users.reduce((a, u) => a + Number(u.exports_count || 0), 0),
              unusedCodes: codes.filter((c) => c.status === 'unused').length
            },
            mustChangePin: !changedRow || changedRow.value !== 'true',
            users: users.map(toProfile),
            transactions: txs,
            redeemCodes: codes,
            coupons,
            securityLogs: secLogs,
            settings,
            packages
          }
        });
      }

      if (action === 'adminUpdateUser') {
        const { targetUid, op, coinsAmount, plan, status, displayName } = body;
        const [u] = await sql`SELECT * FROM users WHERE uid = ${targetUid}`;
        if (!u) return json(404, { success: false, error: 'المستخدم غير موجود' });

        if (op === 'delete') {
          await sql`DELETE FROM users WHERE uid = ${targetUid}`;
          return json(200, { success: true });
        }
        if (op === 'addCoins') {
          const delta = Number(coinsAmount || 0);
          await sql`UPDATE users SET coins = GREATEST(0, coins + ${delta}), updated_at = now() WHERE uid = ${targetUid}`;
          await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
            VALUES (${targetUid}, ${u.email}, 'admin_adjust', ${delta}, 'تعديل رصيد من الإدارة')`;
        } else if (op === 'setCoins') {
          const val = Math.max(0, Number(coinsAmount || 0));
          const delta = val - Number(u.coins);
          await sql`UPDATE users SET coins = ${val}, updated_at = now() WHERE uid = ${targetUid}`;
          await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
            VALUES (${targetUid}, ${u.email}, 'admin_adjust', ${delta}, 'تحديد رصيد من الإدارة')`;
        } else if (op === 'setStatus') {
          await sql`UPDATE users SET status = ${status}, updated_at = now() WHERE uid = ${targetUid}`;
        } else if (op === 'setPlan') {
          const expiry = plan === 'free' ? null : new Date(Date.now() + 30 * 86400000).toISOString();
          await sql`UPDATE users SET plan = ${plan}, plan_expiry = ${expiry}, updated_at = now() WHERE uid = ${targetUid}`;
        } else if (op === 'cancelAndRefund') {
          const refundSar = Number(body.refundSar ?? u.total_spent ?? 0);
          await sql`UPDATE users SET status = 'cancelled', coins = 0, plan = 'free', updated_at = now() WHERE uid = ${targetUid}`;
          await sql`INSERT INTO transactions (uid, email, type, coins_delta, amount_sar, status, description)
            VALUES (${targetUid}, ${u.email}, 'refund', ${-Number(u.coins)}, ${-refundSar}, 'refunded', 'إلغاء الحساب وإعادة المبلغ للعميل')`;
        } else if (op === 'editInfo') {
          await sql`UPDATE users SET display_name = COALESCE(${displayName}, display_name), updated_at = now() WHERE uid = ${targetUid}`;
        }

        const [updated] = await sql`SELECT * FROM users WHERE uid = ${targetUid}`;
        return json(200, { success: true, data: toProfile(updated) });
      }

      if (action === 'adminCreateUser') {
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.displayName || '').trim();
        const coins = Math.max(0, Number(body.coins ?? 6));
        const plan = String(body.plan || 'free');
        if (!email) return json(400, { success: false, error: 'البريد الإلكتروني مطلوب' });
        const manualUid = 'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const refCode = makeReferralCode(manualUid);
        const [created] = await sql`
          INSERT INTO users (uid, email, display_name, coins, plan, referral_code)
          VALUES (${manualUid}, ${email}, ${name}, ${coins}, ${plan}, ${refCode})
          RETURNING *`;
        return json(200, { success: true, data: toProfile(created) });
      }

      if (action === 'adminGenerateCode') {
        const code = generateActivationCode();
        const coins = Number(body.coins || 20);
        const plan = body.plan || 'free';
        const durationDays = Number(body.durationDays || 0);
        const amountSar = Number(body.amountSar || 0);
        const email = String(body.email || '').trim();

        await sql`
          INSERT INTO redeem_codes (code, email, coins, plan, duration_days, amount_sar, payment_method, status)
          VALUES (${code}, ${email || null}, ${coins}, ${plan}, ${durationDays}, ${amountSar}, 'admin_manual', 'unused')`;

        let emailResult = { sent: false };
        if (email) {
          emailResult = await sendActivationEmail(settings, email, code, 'باقة مخصصة', coins, amountSar);
        }
        return json(200, { success: true, data: { code, emailSent: emailResult.sent } });
      }

      if (action === 'adminCancelCode') {
        await sql`UPDATE redeem_codes SET status = 'cancelled' WHERE code = ${body.code}`;
        return json(200, { success: true });
      }

      if (action === 'adminUpdateTransaction') {
        const { txId, status: newStatus } = body;
        await sql`UPDATE transactions SET status = ${newStatus} WHERE id = ${Number(txId)}`;
        return json(200, { success: true });
      }

      if (action === 'adminSavePackages') {
        const pkgs = Array.isArray(body.packages) ? body.packages : DEFAULT_PACKAGES;
        await sql`INSERT INTO app_meta (key, value) VALUES ('packages', ${JSON.stringify(pkgs)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
        return json(200, { success: true, data: pkgs });
      }

      if (action === 'adminSaveSettings') {
        const merged = { ...settings, ...(body.settings || {}) };
        await sql`INSERT INTO app_meta (key, value) VALUES ('site_settings', ${JSON.stringify(merged)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
        return json(200, { success: true, data: merged });
      }

      if (action === 'adminSaveCoupon') {
        const code = String(body.code || '').trim().toUpperCase();
        if (!code) return json(400, { success: false, error: 'أدخل رمز الكوبون' });
        const discount = Math.min(100, Math.max(1, Number(body.discountPercent || 10)));
        const bonus = Math.max(0, Number(body.bonusCoins || 0));
        const maxUses = Math.max(1, Number(body.maxUses || 100));
        await sql`
          INSERT INTO coupons (code, discount_percent, bonus_coins, max_uses, active)
          VALUES (${code}, ${discount}, ${bonus}, ${maxUses}, true)
          ON CONFLICT (code) DO UPDATE SET
            discount_percent = EXCLUDED.discount_percent,
            bonus_coins = EXCLUDED.bonus_coins,
            max_uses = EXCLUDED.max_uses,
            active = true`;
        return json(200, { success: true });
      }

      if (action === 'adminDeleteCoupon') {
        await sql`DELETE FROM coupons WHERE code = ${body.code}`;
        return json(200, { success: true });
      }
    }

    /* ── 3. Authenticated User Endpoints ── */
    const user = await verifyUser(req);
    if (!user) return json(401, { success: false, error: 'يرجى تسجيل الدخول للمتابعة' });

    const me = await upsertUser(user, body.displayName, body.referralCode, settings);
    if (me.status === 'suspended' || me.status === 'cancelled') {
      return json(403, {
        success: false,
        error: me.status === 'cancelled'
          ? 'تم إلغاء هذا الحساب واسترداد الرصيد.'
          : 'تم إيقاف هذا الحساب مؤقتاً. تواصل مع إدارة الموقع.'
      });
    }

    switch (action) {
      case 'login':
      case 'getProfile': {
        const txs = await sql`SELECT * FROM transactions WHERE uid = ${user.uid} ORDER BY created_at DESC LIMIT 30`;
        const [refCount] = await sql`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS month_count
          FROM transactions WHERE uid = ${user.uid} AND type = 'referral_bonus'`;
        return json(200, {
          success: true,
          data: {
            profile: toProfile(me),
            transactions: txs,
            referrals: {
              total: refCount?.total || 0,
              thisMonth: refCount?.month_count || 0,
              monthlyLimit: 10
            },
            settings: publicSettings(settings),
            packages
          }
        });
      }

      case 'spendCoins': {
        const cost = Number(settings.exportCostCoins || 2);
        if (Number(me.coins) < cost) {
          return json(402, {
            success: false,
            error: `رصيدك الحالي (${me.coins} كوينز) لا يكفي للتصدير (تحتاج ${cost} كوينز). اشحن رصيدك للمتابعة!`,
            needTopup: true
          });
        }
        const [updated] = await sql`
          UPDATE users
          SET coins = coins - ${cost},
              exports_count = exports_count + 1,
              updated_at = now()
          WHERE uid = ${user.uid} AND coins >= ${cost}
          RETURNING *`;
        if (!updated) {
          return json(402, { success: false, error: 'رصيد الكوينز غير كافٍ', needTopup: true });
        }
        await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
          VALUES (${user.uid}, ${me.email}, 'export', ${-cost}, ${'تصدير ملف ثلاثي الأبعاد (' + (body.format || 'STL') + ')'})`;
        return json(200, { success: true, data: toProfile(updated) });
      }

      case 'dailyCheckin': {
        const today = new Date().toISOString().slice(0, 10);
        if (me.last_checkin_date === today) {
          return json(400, { success: false, error: 'لقد حصلت على مكافأة الدخول اليومي لهذا اليوم بالفعل! عد غداً.' });
        }
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = me.last_checkin_date === yesterday ? Number(me.streak_days || 0) + 1 : 1;
        const isSevenDayBonus = newStreak % 7 === 0;
        const reward = isSevenDayBonus ? 6 : 1; // 1 coin daily + 5 extra on 7th consecutive day

        const [updated] = await sql`
          UPDATE users
          SET coins = coins + ${reward},
              streak_days = ${newStreak},
              last_checkin_date = ${today},
              updated_at = now()
          WHERE uid = ${user.uid}
          RETURNING *`;

        await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
          VALUES (${user.uid}, ${me.email}, 'checkin', ${reward},
                  ${isSevenDayBonus ? `مكافأة 7 أيام متتالية (+1 يومي +5 إضافية)` : `مكافأة الدخول اليومي (اليوم ${newStreak})`})`;

        return json(200, {
          success: true,
          data: {
            profile: toProfile(updated),
            reward,
            streakDays: newStreak,
            isSevenDayBonus
          }
        });
      }

      case 'applyReferralCode': {
        if (me.referred_by) {
          return json(400, { success: false, error: 'لقد قمت باستخدام كود دعوة مسبقاً' });
        }
        const code = String(body.code || '').trim().toUpperCase();
        if (!code || code === me.referral_code) {
          return json(400, { success: false, error: 'كود الدعوة غير صالح' });
        }
        const [refOwner] = await sql`SELECT * FROM users WHERE referral_code = ${code} AND uid <> ${user.uid}`;
        if (!refOwner) {
          return json(404, { success: false, error: 'لم يتم العثور على كود الدعوة هذا' });
        }
        const [cnt] = await sql`
          SELECT count(*)::int AS c FROM transactions
          WHERE uid = ${refOwner.uid} AND type = 'referral_bonus'
            AND created_at >= date_trunc('month', now())`;
        if ((cnt?.c || 0) >= 10) {
          return json(400, { success: false, error: 'وصل صاحب الكود للحد الأقصى للدعوات هذا الشهر (10 دعوات)' });
        }

        const refBonus = Number(settings.referralBonusCoins || 5);
        await sql`UPDATE users SET coins = coins + ${refBonus}, updated_at = now() WHERE uid = ${refOwner.uid}`;
        await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
          VALUES (${refOwner.uid}, ${refOwner.email}, 'referral_bonus', ${refBonus}, ${'مكافأة دعوة صديق: ' + (me.email || me.uid)})`;

        const [updated] = await sql`
          UPDATE users SET referred_by = ${refOwner.uid}, coins = coins + 2, updated_at = now()
          WHERE uid = ${user.uid} RETURNING *`;
        await sql`INSERT INTO transactions (uid, email, type, coins_delta, description)
          VALUES (${user.uid}, ${me.email}, 'referral_bonus', 2, 'هدية تفعيل كود الصديق (+2 كوينز)')`;

        return json(200, { success: true, data: toProfile(updated) });
      }

      case 'createPaymentOrder': {
        if (settings.paymentEnabled === false) {
          return json(403, { success: false, error: 'عمليات الدفع متوقفة مؤقتاً من قِبل الإدارة' });
        }
        const pkg = packages.find((p) => p.id === body.packageId);
        if (!pkg) return json(404, { success: false, error: 'الباقة غير موجودة' });

        let priceSar = Number(pkg.priceSar);
        let bonusCoins = 0;

        if (body.couponCode) {
          const cCode = String(body.couponCode).trim().toUpperCase();
          const [coupon] = await sql`SELECT * FROM coupons WHERE code = ${cCode} AND active = true`;
          if (coupon && coupon.used_count < coupon.max_uses) {
            priceSar = Math.max(1, Math.round(priceSar * (100 - coupon.discount_percent) / 100));
            bonusCoins = Number(coupon.bonus_coins || 0);
            await sql`UPDATE coupons SET used_count = used_count + 1 WHERE code = ${cCode}`;
          }
        }

        const totalCoins = Number(pkg.coins) + bonusCoins;
        const code = generateActivationCode();
        const method = String(body.paymentMethod || 'mada_visa');
        const durationDays = Number(pkg.durationDays || 0);
        const plan = pkg.period || 'free';

        await sql`
          INSERT INTO redeem_codes (code, uid, email, package_id, coins, plan, duration_days, amount_sar, payment_method, status)
          VALUES (${code}, ${user.uid}, ${me.email}, ${pkg.id}, ${totalCoins}, ${plan}, ${durationDays}, ${priceSar}, ${method}, 'unused')`;

        const [tx] = await sql`
          INSERT INTO transactions (uid, email, type, coins_delta, amount_sar, method, status, description, meta)
          VALUES (${user.uid}, ${me.email}, 'purchase', ${totalCoins}, ${priceSar}, ${method}, 'pending',
                  ${'طلب شراء: ' + pkg.nameAr}, ${JSON.stringify({ code, packageId: pkg.id })}::jsonb)
          RETURNING *`;

        const emailRes = await sendActivationEmail(settings, me.email, code, pkg.nameAr, totalCoins, priceSar);

        return json(200, {
          success: true,
          data: {
            orderId: tx.id,
            activationCode: code,
            emailSent: emailRes.sent,
            email: me.email,
            coins: totalCoins,
            amountSar: priceSar,
            packageName: pkg.nameAr
          }
        });
      }

      case 'cancelPaymentOrder': {
        const { code, orderId } = body;
        if (code) {
          await sql`UPDATE redeem_codes SET status = 'cancelled' WHERE code = ${code} AND uid = ${user.uid} AND status = 'unused'`;
        }
        if (orderId) {
          await sql`UPDATE transactions SET status = 'cancelled' WHERE id = ${Number(orderId)} AND uid = ${user.uid}`;
        }
        return json(200, { success: true });
      }

      case 'redeemCode': {
        const code = String(body.code || '').trim().toUpperCase();
        if (!code) return json(400, { success: false, error: 'أدخل كود التفعيل' });

        const [rc] = await sql`SELECT * FROM redeem_codes WHERE code = ${code}`;
        if (!rc) return json(404, { success: false, error: 'كود التفعيل غير صحيح' });
        if (rc.status === 'used') return json(400, { success: false, error: 'تم استخدام هذا الكود مسبقاً' });
        if (rc.status === 'cancelled') return json(400, { success: false, error: 'هذا الكود ملغي' });

        const coinsToAdd = Number(rc.coins || 0);
        const newPlan = rc.plan && rc.plan !== 'free' ? rc.plan : me.plan;
        const expiry = rc.duration_days > 0
          ? new Date(Date.now() + Number(rc.duration_days) * 86400000).toISOString()
          : me.plan_expiry;

        await sql`
          UPDATE redeem_codes
          SET status = 'used', used_by = ${user.uid}, used_at = now()
          WHERE code = ${code}`;

        const [updated] = await sql`
          UPDATE users
          SET coins = coins + ${coinsToAdd},
              plan = ${newPlan},
              plan_expiry = ${expiry},
              total_spent = total_spent + ${Number(rc.amount_sar || 0)},
              updated_at = now()
          WHERE uid = ${user.uid}
          RETURNING *`;

        await sql`
          INSERT INTO transactions (uid, email, type, coins_delta, amount_sar, method, status, description)
          VALUES (${user.uid}, ${me.email}, 'redeem', ${coinsToAdd}, ${Number(rc.amount_sar || 0)}, ${rc.payment_method || 'code'}, 'completed',
                  ${'تفعيل كود شحن: ' + code})`;

        // 20% Referral purchase commission!
        if (me.referred_by && coinsToAdd > 0) {
          const pct = Number(settings.referralCommissionPercent || 20);
          const commissionCoins = Math.max(1, Math.floor((coinsToAdd * pct) / 100));
          await sql`UPDATE users SET coins = coins + ${commissionCoins}, updated_at = now() WHERE uid = ${me.referred_by}`;
          await sql`
            INSERT INTO transactions (uid, type, coins_delta, description)
            VALUES (${me.referred_by}, 'referral_commission', ${commissionCoins},
                    ${`عمولة ${pct}% من مشتريات صديقك (${me.email || me.display_name})`})`;
        }

        return json(200, {
          success: true,
          data: {
            profile: toProfile(updated),
            coinsAdded: coinsToAdd,
            plan: newPlan
          }
        });
      }

      case 'requestCancelAccountRefund': {
        const reason = String(body.reason || 'طلب إلغاء الحساب واسترداد المبلغ المتبقي').slice(0, 500);
        await sql`
          INSERT INTO transactions (uid, email, type, coins_delta, amount_sar, status, description)
          VALUES (${user.uid}, ${me.email}, 'refund', ${-Number(me.coins)}, ${Number(me.total_spent || 0)}, 'pending',
                  ${'طلب إلغاء حساب واسترداد المبلغ: ' + reason})`;
        return json(200, {
          success: true,
          message: 'تم تسجيل طلب إلغاء الحساب واسترداد المبلغ بنجاح، وسيتم تنفيذه وإعادة المبلغ لوسيلة الدفع الخاصة بك.'
        });
      }

      default:
        return json(400, { success: false, error: 'إجراء غير معروف' });
    }
  } catch (err) {
    console.error('[api] error:', err);
    return json(500, { success: false, error: 'حدث خطأ في الخادم: ' + (err.message || '') });
  }
};
