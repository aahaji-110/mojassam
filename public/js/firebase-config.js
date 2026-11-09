/**
 * مُجسَّم - Auth + PostgreSQL Data Layer
 * =====================================================
 * Identity : Firebase Auth (Google / Email) – compat SDK
 * Database : PostgreSQL (Netlify DB / Neon) via /.netlify/functions/api
 *
 * Global namespace: window.MJ
 */

/* ──────────────────────────────────────────────
   1. Firebase Configuration (Auth only)
   ────────────────────────────────────────────── */
let firebaseConfig = {
  apiKey: "AIzaSyD91V9cu-zr1OhEh1QZJJ8DqWq2u_5req0",
  authDomain: "mojassam-9666e.firebaseapp.com",
  projectId: "mojassam-9666e",
  storageBucket: "mojassam-9666e.firebasestorage.app",
  messagingSenderId: "498373838795",
  appId: "1:498373838795:web:482d0b48abe5c0111b584e"
};

try {
  const savedFb = localStorage.getItem('_mj_firebase_config');
  if (savedFb) {
    const parsed = JSON.parse(savedFb);
    if (parsed && parsed.apiKey && parsed.apiKey !== 'YOUR_API_KEY') {
      firebaseConfig = parsed;
    }
  }
} catch (e) {}

/* ──────────────────────────────────────────────
   2. Initialize Firebase Auth Safely
   ────────────────────────────────────────────── */
let auth = null;
let googleProvider = null;
const db = null; // Firestore removed – data lives in PostgreSQL

try {
  if (typeof firebase !== 'undefined') {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    auth.languageCode = 'ar';

    // Sync every signed-in user (incl. Google) into PostgreSQL
    auth.onAuthStateChanged((u) => { if (u) api('login').catch(() => {}); });
  }
} catch (err) {
  console.warn('[MJ] Firebase running in fallback/local mode:', err.message);
}

/* ──────────────────────────────────────────────
   3. API Client (PostgreSQL backend)
   ────────────────────────────────────────────── */
const API_URL = '/.netlify/functions/api';

async function api(action, params = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const user = auth && auth.currentUser;
  if (user) headers.Authorization = 'Bearer ' + (await user.getIdToken());

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params })
  });
  let data;
  try { data = await res.json(); } catch { data = { success: false, error: 'خطأ في الاتصال بالخادم' }; }
  return data;
}

async function _safe(fn) {
  try { return await fn(); }
  catch (error) {
    console.error('[MJ] API error:', error);
    return { success: false, error: error.message || 'خطأ في الاتصال بالشبكة' };
  }
}

/* ──────────────────────────────────────────────
   4. Auth Functions
   ────────────────────────────────────────────── */
async function signUp(email, password, displayName = '') {
  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;
    if (displayName) await user.updateProfile({ displayName });
    await api('login', { displayName });
    return { success: true, user };
  } catch (error) {
    console.error('[MJ] signUp error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signIn(email, password) {
  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    await api('login');
    return { success: true, user: credential.user };
  } catch (error) {
    console.error('[MJ] signIn error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signOut() {
  try {
    await auth.signOut();
    return { success: true };
  } catch (error) {
    console.error('[MJ] signOut error:', error.code);
    return { success: false, error: error.message };
  }
}

async function resetPassword(email) {
  try {
    await auth.sendPasswordResetEmail(email);
    return { success: true };
  } catch (error) {
    console.error('[MJ] resetPassword error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

function onAuthChange(callback) {
  return auth ? auth.onAuthStateChanged(callback) : () => {};
}

/* ──────────────────────────────────────────────
   5. User Profile
   ────────────────────────────────────────────── */
const getUserProfile    = (uid) => _safe(() => api('getProfile', { uid }));
const updateUserProfile = (uid, data) => _safe(() => api('updateProfile', { uid, data }));

async function isAdmin() {
  const r = await _safe(() => api('isAdmin'));
  return !!(r && r.success && r.data);
}

/* ──────────────────────────────────────────────
   6. Credits
   ────────────────────────────────────────────── */
function addCredits(uid, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    return Promise.resolve({ success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' });
  }
  return _safe(() => api('addCredits', { uid, amount }));
}

function deductCredits(uid, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    return Promise.resolve({ success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' });
  }
  return _safe(() => api('deductCredits', { uid, amount }));
}

/* ──────────────────────────────────────────────
   7. Subscriptions
   ────────────────────────────────────────────── */
const getSubscription = (uid) => _safe(() => api('getSubscription', { uid }));

function setSubscription(uid, plan, expiryDate) {
  const expiry = expiryDate instanceof Date ? expiryDate.toISOString() : expiryDate;
  return _safe(() => api('setSubscription', { uid, plan, expiryDate: expiry }));
}

/* ──────────────────────────────────────────────
   8. Admin
   ────────────────────────────────────────────── */
const getAllUsers    = () => _safe(() => api('getAllUsers'));
const getAllPayments = () => _safe(() => api('getAllPayments'));

/* ──────────────────────────────────────────────
   9. Security Logging
   ────────────────────────────────────────────── */
const logSecurity = (type, details = {}) =>
  _safe(() => api('logSecurity', { type, details, url: window.location.href }));

/* ──────────────────────────────────────────────
   10. Error Mapping (Arabic)
   ────────────────────────────────────────────── */
function _mapAuthError(error) {
  const map = {
    'auth/email-already-in-use':    'البريد الإلكتروني مستخدم بالفعل',
    'auth/invalid-email':           'البريد الإلكتروني غير صالح',
    'auth/user-disabled':           'هذا الحساب معطّل',
    'auth/user-not-found':          'لم يتم العثور على حساب بهذا البريد',
    'auth/wrong-password':          'كلمة المرور غير صحيحة',
    'auth/weak-password':           'كلمة المرور ضعيفة جداً',
    'auth/too-many-requests':       'محاولات كثيرة. حاول مجدداً لاحقاً',
    'auth/network-request-failed':  'خطأ في الاتصال بالشبكة',
    'auth/invalid-credential':      'بيانات الاعتماد غير صالحة'
  };
  return map[error.code] || error.message;
}

/* ──────────────────────────────────────────────
   11. Global Namespace Export
   ────────────────────────────────────────────── */
window.MJ = Object.freeze({
  auth,
  db,
  googleProvider,
  api,

  signUp,
  signIn,
  signOut,
  resetPassword,
  getCurrentUser,
  onAuthChange,

  getUserProfile,
  updateUserProfile,
  isAdmin,

  addCredits,
  deductCredits,

  getSubscription,
  setSubscription,

  getAllUsers,
  getAllPayments,

  logSecurity
});

console.log('[MJ] Auth ready ✓ | Backend: PostgreSQL');
