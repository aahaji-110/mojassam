/**
 * مُجسَّم - Firebase Configuration & Initialization
 * =====================================================
 * Firebase v10+ (compat mode) – Auth, Firestore
 * 
 * Global namespace: window.MJ
 */

/* ──────────────────────────────────────────────
   1. Firebase Configuration & Dynamic Loader
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
   2. Initialize Firebase Safely
   ────────────────────────────────────────────── */
let auth = null;
let db = null;
let googleProvider = null;

try {
  if (typeof firebase !== 'undefined') {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db   = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();

    // Use Firestore persistence for offline support
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('[MJ] Firestore persistence unavailable – multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('[MJ] Firestore persistence not supported in this browser.');
      }
    });

    // Set language to Arabic for auth emails
    auth.languageCode = 'ar';
  }
} catch (err) {
  console.warn('[MJ] Firebase running in fallback/local mode:', err.message);
}

/* ──────────────────────────────────────────────
   3. Helper Functions
   ────────────────────────────────────────────── */

/**
 * Sign up a new user with email & password.
 * Creates a Firestore profile document under /users/{uid}.
 */
async function signUp(email, password, displayName = '') {
  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;

    // Update display name if provided
    if (displayName) {
      await user.updateProfile({ displayName });
    }

    // Create Firestore user profile
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: displayName || '',
      role: 'user',
      credits: 0,
      subscription: {
        plan: 'free',
        expiryDate: null
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, user };
  } catch (error) {
    console.error('[MJ] signUp error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

/**
 * Sign in an existing user.
 */
async function signIn(email, password) {
  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const user = credential.user;

    // Update last login timestamp
    await db.collection('users').doc(user.uid).update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, user };
  } catch (error) {
    console.error('[MJ] signIn error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

/**
 * Sign out the current user.
 */
async function signOut() {
  try {
    await auth.signOut();
    return { success: true };
  } catch (error) {
    console.error('[MJ] signOut error:', error.code);
    return { success: false, error: error.message };
  }
}

/**
 * Send a password-reset email.
 */
async function resetPassword(email) {
  try {
    await auth.sendPasswordResetEmail(email);
    return { success: true };
  } catch (error) {
    console.error('[MJ] resetPassword error:', error.code);
    return { success: false, error: _mapAuthError(error) };
  }
}

/**
 * Get the currently signed-in user (synchronous snapshot).
 */
function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Subscribe to auth-state changes.
 * @param {Function} callback – receives (user | null)
 * @returns {Function} unsubscribe
 */
function onAuthChange(callback) {
  return auth.onAuthStateChanged(callback);
}

/* ──────────────────────────────────────────────
   4. Firestore User Profile Helpers
   ────────────────────────────────────────────── */

/**
 * Get a user profile from Firestore.
 */
async function getUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { success: false, error: 'المستخدم غير موجود' };
    return { success: true, data: doc.data() };
  } catch (error) {
    console.error('[MJ] getUserProfile error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update fields on a user profile.
 */
async function updateUserProfile(uid, data) {
  try {
    // Never allow role or uid to be changed via this helper
    const sanitized = { ...data };
    delete sanitized.uid;
    delete sanitized.role;
    sanitized.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection('users').doc(uid).update(sanitized);
    return { success: true };
  } catch (error) {
    console.error('[MJ] updateUserProfile error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check whether a user has the 'admin' role.
 */
async function isAdmin(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return false;
    return doc.data().role === 'admin';
  } catch (error) {
    console.error('[MJ] isAdmin error:', error);
    return false;
  }
}

/* ──────────────────────────────────────────────
   5. Credits System
   ────────────────────────────────────────────── */

/**
 * Add credits to a user's balance (atomic increment).
 */
async function addCredits(uid, amount) {
  try {
    if (typeof amount !== 'number' || amount <= 0) {
      return { success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' };
    }
    await db.collection('users').doc(uid).update({
      credits: firebase.firestore.FieldValue.increment(amount),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Log the transaction
    await db.collection('transactions').add({
      uid,
      type: 'credit',
      amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('[MJ] addCredits error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deduct credits from a user's balance (atomic decrement).
 * Checks balance before deducting.
 */
async function deductCredits(uid, amount) {
  try {
    if (typeof amount !== 'number' || amount <= 0) {
      return { success: false, error: 'المبلغ يجب أن يكون رقماً موجباً' };
    }

    // Read current balance first
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { success: false, error: 'المستخدم غير موجود' };

    const currentCredits = doc.data().credits || 0;
    if (currentCredits < amount) {
      return { success: false, error: 'رصيد غير كافٍ' };
    }

    await db.collection('users').doc(uid).update({
      credits: firebase.firestore.FieldValue.increment(-amount),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Log the transaction
    await db.collection('transactions').add({
      uid,
      type: 'debit',
      amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('[MJ] deductCredits error:', error);
    return { success: false, error: error.message };
  }
}

/* ──────────────────────────────────────────────
   6. Subscription Management
   ────────────────────────────────────────────── */

/**
 * Get a user's subscription details.
 */
async function getSubscription(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { success: false, error: 'المستخدم غير موجود' };

    const subscription = doc.data().subscription || { plan: 'free', expiryDate: null };

    // Check if subscription has expired
    if (subscription.expiryDate) {
      const expiry = subscription.expiryDate.toDate ? subscription.expiryDate.toDate() : new Date(subscription.expiryDate);
      if (expiry < new Date()) {
        subscription.expired = true;
      } else {
        subscription.expired = false;
      }
    }

    return { success: true, data: subscription };
  } catch (error) {
    console.error('[MJ] getSubscription error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Set a user's subscription plan and expiry date.
 */
async function setSubscription(uid, plan, expiryDate) {
  try {
    const expiry = expiryDate instanceof Date
      ? firebase.firestore.Timestamp.fromDate(expiryDate)
      : expiryDate;

    await db.collection('users').doc(uid).update({
      subscription: {
        plan,
        expiryDate: expiry,
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Log subscription change
    await db.collection('transactions').add({
      uid,
      type: 'subscription',
      plan,
      expiryDate: expiry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('[MJ] setSubscription error:', error);
    return { success: false, error: error.message };
  }
}

/* ──────────────────────────────────────────────
   7. Admin-Only Functions
   ────────────────────────────────────────────── */

/**
 * Fetch all users (admin only – enforced by Firestore rules).
 */
async function getAllUsers() {
  try {
    const current = getCurrentUser();
    if (!current) return { success: false, error: 'يجب تسجيل الدخول' };

    const admin = await isAdmin(current.uid);
    if (!admin) return { success: false, error: 'غير مصرح لك بهذا الإجراء' };

    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = [];
    snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));
    return { success: true, data: users };
  } catch (error) {
    console.error('[MJ] getAllUsers error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch all payment transactions (admin only).
 */
async function getAllPayments() {
  try {
    const current = getCurrentUser();
    if (!current) return { success: false, error: 'يجب تسجيل الدخول' };

    const admin = await isAdmin(current.uid);
    if (!admin) return { success: false, error: 'غير مصرح لك بهذا الإجراء' };

    const snapshot = await db.collection('transactions').orderBy('createdAt', 'desc').get();
    const payments = [];
    snapshot.forEach((doc) => payments.push({ id: doc.id, ...doc.data() }));
    return { success: true, data: payments };
  } catch (error) {
    console.error('[MJ] getAllPayments error:', error);
    return { success: false, error: error.message };
  }
}

/* ──────────────────────────────────────────────
   8. Error Mapping (Arabic)
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
   9. Global Namespace Export
   ────────────────────────────────────────────── */

window.MJ = Object.freeze({
  // Core Firebase references
  auth,
  db,
  googleProvider,

  // Auth functions
  signUp,
  signIn,
  signOut,
  resetPassword,
  getCurrentUser,
  onAuthChange,

  // User profile
  getUserProfile,
  updateUserProfile,
  isAdmin,

  // Credits
  addCredits,
  deductCredits,

  // Subscriptions
  getSubscription,
  setSubscription,

  // Admin
  getAllUsers,
  getAllPayments
});

console.log('[MJ] Firebase initialized ✓');
