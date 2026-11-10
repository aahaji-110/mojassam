/**
 * Auth (Google via Firebase) + Database API client
 * =================================================
 * Identity : Firebase Auth – Google Sign-In only (compat SDK)
 * Database : PostgreSQL (Netlify Database) via /.netlify/functions/api
 *
 * Requires (before this file):
 *   https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js
 *   https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js
 *
 * Global namespace: window.MJ
 */

const firebaseConfig = {
  apiKey: "AIzaSyD91V9cu-zr1OhEh1QZJJ8DqWq2u_5req0",
  authDomain: "mojassam-9666e.firebaseapp.com",
  projectId: "mojassam-9666e",
  storageBucket: "mojassam-9666e.firebasestorage.app",
  messagingSenderId: "498373838795",
  appId: "1:498373838795:web:482d0b48abe5c0111b584e"
};

if (firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
auth.languageCode = 'ar';

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/* ── API client ── */
const API_URL = '/.netlify/functions/api';

async function api(action, params = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const user = auth.currentUser;
  if (user) headers.Authorization = 'Bearer ' + (await user.getIdToken());
  try {
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ action, ...params }) });
    return await res.json();
  } catch (e) {
    console.error('[MJ] API error:', e);
    return { success: false, error: 'خطأ في الاتصال بالخادم' };
  }
}

/* ── Auth ── */
async function signInWithGoogle() {
  try {
    const cred = await auth.signInWithPopup(googleProvider);
    const profile = await api('login');
    return { success: true, user: cred.user, profile: profile.data };
  } catch (error) {
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signOut() {
  await auth.signOut();
  return { success: true };
}

const getCurrentUser = () => auth.currentUser;
const onAuthChange = (cb) => auth.onAuthStateChanged(cb);

/* ── Profile ── */
const getProfile    = ()     => api('getProfile');
const updateProfile = (data) => api('updateProfile', { data });
const isAdmin       = async () => { const r = await api('isAdmin'); return !!(r.success && r.data); };

function _mapAuthError(error) {
  const map = {
    'auth/popup-closed-by-user':    'تم إغلاق نافذة تسجيل الدخول',
    'auth/cancelled-popup-request': 'تم إلغاء الطلب',
    'auth/popup-blocked':           'المتصفح منع النافذة المنبثقة، اسمح بها وحاول مجدداً',
    'auth/unauthorized-domain':     'هذا النطاق غير مصرح به في إعدادات Firebase',
    'auth/network-request-failed':  'خطأ في الاتصال بالشبكة',
    'auth/user-disabled':           'هذا الحساب معطّل'
  };
  return map[error.code] || error.message;
}

window.MJ = Object.freeze({
  auth, api,
  signInWithGoogle, signOut, getCurrentUser, onAuthChange,
  getProfile, updateProfile, isAdmin
});
