/**
 * مجسمات (Mojassamat) - Auth (Google + Email/Password) & PostgreSQL API Client
 * ==============================================================================
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

let auth = null;
let googleProvider = null;

try {
  if (typeof firebase !== 'undefined') {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    auth.languageCode = 'ar';
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  }
} catch (err) {
  console.warn('[MJ] Firebase init warning:', err.message);
}

// Capture referral code from URL if present (?ref=MJXXXX)
try {
  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref');
  if (refParam) {
    localStorage.setItem('_mj_pending_ref', refParam.trim().toUpperCase());
  }
} catch (e) {}

const API_URL = '/.netlify/functions/api';

async function api(action, params = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const user = auth && auth.currentUser;
  if (user) {
    try {
      headers.Authorization = 'Bearer ' + (await user.getIdToken());
    } catch (e) {}
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...params })
    });
    return await res.json();
  } catch (e) {
    console.error('[MJ] API error:', e);
    return { success: false, error: 'خطأ في الاتصال بالخادم' };
  }
}

function _getPendingRef() {
  return localStorage.getItem('_mj_pending_ref') || '';
}

async function signInWithGoogle() {
  if (!auth) return { success: false, error: 'خدمة المصادقة غير جاهزة' };
  try {
    const cred = await auth.signInWithPopup(googleProvider);
    const res = await api('login', {
      displayName: cred.user.displayName || '',
      referralCode: _getPendingRef()
    });
    if (res.success) localStorage.removeItem('_mj_pending_ref');
    return { success: true, user: cred.user, data: res.data };
  } catch (error) {
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signUpWithEmail(email, password, displayName = '', referralCode = '') {
  if (!auth) return { success: false, error: 'خدمة المصادقة غير جاهزة' };
  try {
    const cred = await auth.createUserWithEmailAndPassword(email.trim(), password);
    if (displayName) {
      await cred.user.updateProfile({ displayName: displayName.trim() });
    }
    const refToUse = referralCode || _getPendingRef();
    const res = await api('login', {
      displayName: displayName.trim(),
      referralCode: refToUse
    });
    if (res.success) localStorage.removeItem('_mj_pending_ref');
    return { success: true, user: cred.user, data: res.data };
  } catch (error) {
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signInWithEmail(email, password) {
  if (!auth) return { success: false, error: 'خدمة المصادقة غير جاهزة' };
  try {
    const cred = await auth.signInWithEmailAndPassword(email.trim(), password);
    const res = await api('login');
    return { success: true, user: cred.user, data: res.data };
  } catch (error) {
    return { success: false, error: _mapAuthError(error) };
  }
}

async function resetPassword(email) {
  if (!auth) return { success: false, error: 'خدمة المصادقة غير جاهزة' };
  try {
    await auth.sendPasswordResetEmail(email.trim());
    return { success: true };
  } catch (error) {
    return { success: false, error: _mapAuthError(error) };
  }
}

async function signOut() {
  if (auth) await auth.signOut();
  return { success: true };
}

const getCurrentUser = () => (auth ? auth.currentUser : null);
const onAuthChange = (cb) => (auth ? auth.onAuthStateChanged(cb) : () => {});

function _mapAuthError(error) {
  const map = {
    'auth/email-already-in-use':    'البريد الإلكتروني مسجل مسبقاً، سجل دخولك بدلاً من ذلك',
    'auth/invalid-email':           'صيغة البريد الإلكتروني غير صحيحة',
    'auth/user-disabled':           'هذا الحساب موقوف',
    'auth/user-not-found':          'لا يوجد حساب مسجل بهذا البريد الإلكتروني',
    'auth/wrong-password':          'كلمة المرور غير صحيحة',
    'auth/weak-password':           'كلمة المرور قصيرة جداً (6 أحرف على الأقل)',
    'auth/invalid-credential':      'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'auth/popup-closed-by-user':    'تم إغلاق نافذة تسجيل الدخول بـ Google',
    'auth/cancelled-popup-request': 'تم إلغاء الطلب',
    'auth/popup-blocked':           'المتصفح حظر النافذة المنبثقة، يرجى السماح بها',
    'auth/unauthorized-domain':     'النطاق غير مضاف في إعدادات Firebase Authorized Domains',
    'auth/network-request-failed':  'تحقق من اتصالك بالإنترنت'
  };
  return map[error.code] || error.message || 'خطأ في المصادقة';
}

window.MJ = Object.freeze({
  auth,
  api,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signOut,
  getCurrentUser,
  onAuthChange,
  getPublicConfig: () => api('getPublicConfig'),
  getProfile: () => api('getProfile'),
  spendCoins: (format) => api('spendCoins', { format }),
  dailyCheckin: () => api('dailyCheckin'),
  applyReferralCode: (code) => api('applyReferralCode', { code }),
  createPaymentOrder: (packageId, paymentMethod, couponCode) =>
    api('createPaymentOrder', { packageId, paymentMethod, couponCode }),
  cancelPaymentOrder: (code, orderId) => api('cancelPaymentOrder', { code, orderId }),
  redeemCode: (code) => api('redeemCode', { code }),
  requestCancelAccountRefund: (reason) => api('requestCancelAccountRefund', { reason })
});
