/**
 * مُجسَّم - Security Module
 * ==========================
 * Rate limiting, sanitization, CSRF, session monitoring,
 * password validation, activity logging, bot detection.
 *
 * Global namespace: window.MJSec
 * Depends on: window.MJ (firebase-config.js)
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────
     1. Rate Limiting (Login Attempts)
     ────────────────────────────────────────────── */

  const _rateLimits = {};  // key → { attempts: [], blocked: false, unblockAt: null }

  const RATE_LIMIT_MAX   = 5;           // max attempts
  const RATE_LIMIT_WINDOW = 60 * 1000;  // 1 minute window (ms)
  const RATE_LIMIT_BLOCK  = 5 * 60 * 1000; // 5-minute block after exceeding

  /**
   * Check whether an action is rate-limited.
   * @param {string} key – identifier (e.g. email or IP placeholder)
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number|null }}
   */
  function checkRateLimit(key) {
    const now = Date.now();

    if (!_rateLimits[key]) {
      _rateLimits[key] = { attempts: [], blocked: false, unblockAt: null };
    }

    const entry = _rateLimits[key];

    // If currently blocked, check if block has expired
    if (entry.blocked) {
      if (now >= entry.unblockAt) {
        entry.blocked = false;
        entry.unblockAt = null;
        entry.attempts = [];
      } else {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: entry.unblockAt - now
        };
      }
    }

    // Purge attempts outside the window
    entry.attempts = entry.attempts.filter((t) => now - t < RATE_LIMIT_WINDOW);

    if (entry.attempts.length >= RATE_LIMIT_MAX) {
      entry.blocked = true;
      entry.unblockAt = now + RATE_LIMIT_BLOCK;
      _logSuspiciousActivity('rate_limit_exceeded', { key });
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: RATE_LIMIT_BLOCK
      };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX - entry.attempts.length,
      retryAfterMs: null
    };
  }

  /**
   * Record an attempt for rate limiting.
   */
  function recordAttempt(key) {
    if (!_rateLimits[key]) {
      _rateLimits[key] = { attempts: [], blocked: false, unblockAt: null };
    }
    _rateLimits[key].attempts.push(Date.now());
  }

  /**
   * Reset rate limit for a key (e.g. after successful login).
   */
  function resetRateLimit(key) {
    delete _rateLimits[key];
  }

  /* ──────────────────────────────────────────────
     2. Input Sanitization (XSS Prevention)
     ────────────────────────────────────────────── */

  const _entityMap = {
    '&':  '&amp;',
    '<':  '&lt;',
    '>':  '&gt;',
    '"':  '&quot;',
    "'":  '&#x27;',
    '/':  '&#x2F;',
    '`':  '&#96;'
  };

  /**
   * Escape HTML entities to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`/]/g, (ch) => _entityMap[ch]);
  }

  /**
   * Strip all HTML tags from a string.
   * @param {string} str
   * @returns {string}
   */
  function stripTags(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Sanitize an object's string values recursively.
   */
  function sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return sanitizeHTML(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(obj)) {
        clean[sanitizeHTML(k)] = sanitizeObject(v);
      }
      return clean;
    }
    return obj;
  }

  /**
   * Validate & sanitize an email address.
   */
  function sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    const trimmed = email.trim().toLowerCase();
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return re.test(trimmed) ? trimmed : '';
  }

  /* ──────────────────────────────────────────────
     3. CSRF Token Generation & Validation
     ────────────────────────────────────────────── */

  const CSRF_STORAGE_KEY = '_mj_csrf';

  /**
   * Generate a cryptographically random CSRF token and store it.
   * @returns {string} token
   */
  function generateCSRFToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
    return token;
  }

  /**
   * Validate a given CSRF token against the stored one.
   * @param {string} token
   * @returns {boolean}
   */
  function validateCSRFToken(token) {
    const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (!stored || !token) return false;

    // Constant-time comparison
    if (stored.length !== token.length) return false;
    let result = 0;
    for (let i = 0; i < stored.length; i++) {
      result |= stored.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Get the current CSRF token (generate if absent).
   */
  function getCSRFToken() {
    return sessionStorage.getItem(CSRF_STORAGE_KEY) || generateCSRFToken();
  }

  /**
   * Inject a hidden CSRF field into a form element.
   */
  function injectCSRFField(formElement) {
    if (!(formElement instanceof HTMLFormElement)) return;
    let field = formElement.querySelector('input[name="_csrf"]');
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = '_csrf';
      formElement.appendChild(field);
    }
    field.value = getCSRFToken();
  }

  /* ──────────────────────────────────────────────
     4. Session Monitoring (Auto-Logout)
     ────────────────────────────────────────────── */

  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  let _sessionTimer = null;
  let _sessionActive = false;

  const _activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

  /**
   * Start session monitoring. Auto-logs out after 30 min inactivity.
   * @param {Function} [onTimeout] – optional callback before logout
   */
  function startSessionMonitor(onTimeout) {
    if (_sessionActive) return;
    _sessionActive = true;

    function _resetTimer() {
      if (_sessionTimer) clearTimeout(_sessionTimer);
      _sessionTimer = setTimeout(async () => {
        console.warn('[MJSec] Session expired – auto logout');
        _logSuspiciousActivity('session_timeout', { reason: 'inactivity' });
        if (typeof onTimeout === 'function') onTimeout();
        if (window.MJ && window.MJ.signOut) await window.MJ.signOut();
        _sessionActive = false;
        _removeActivityListeners();
      }, SESSION_TIMEOUT);
    }

    function _onActivity() {
      _resetTimer();
    }

    function _removeActivityListeners() {
      _activityEvents.forEach((evt) =>
        document.removeEventListener(evt, _onActivity, { passive: true })
      );
    }

    _activityEvents.forEach((evt) =>
      document.addEventListener(evt, _onActivity, { passive: true })
    );

    _resetTimer();
  }

  /**
   * Stop session monitoring.
   */
  function stopSessionMonitor() {
    if (_sessionTimer) {
      clearTimeout(_sessionTimer);
      _sessionTimer = null;
    }
    _sessionActive = false;
    _activityEvents.forEach((evt) =>
      document.removeEventListener(evt, () => {}, { passive: true })
    );
  }

  /* ──────────────────────────────────────────────
     5. Password Strength Validator
     ────────────────────────────────────────────── */

  /**
   * Validate password strength.
   * @param {string} password
   * @returns {{ valid: boolean, score: number, errors: string[] }}
   */
  function validatePassword(password) {
    const errors = [];
    let score = 0;

    if (!password || typeof password !== 'string') {
      return { valid: false, score: 0, errors: ['كلمة المرور مطلوبة'] };
    }

    // Min 8 characters
    if (password.length >= 8)  { score += 1; } else { errors.push('يجب أن تكون 8 أحرف على الأقل'); }
    if (password.length >= 12) { score += 1; }

    // At least 1 uppercase letter
    if (/[A-Z]/.test(password)) { score += 1; } else { errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل'); }

    // At least 1 number
    if (/[0-9]/.test(password)) { score += 1; } else { errors.push('يجب أن تحتوي على رقم واحد على الأقل'); }

    // At least 1 special character (bonus)
    if (/[^A-Za-z0-9]/.test(password)) { score += 1; }

    // At least 1 lowercase letter (bonus)
    if (/[a-z]/.test(password)) { score += 1; }

    // Penalize common patterns
    const common = ['password', '12345678', 'qwerty', 'admin', 'letmein', '123456789'];
    if (common.some((c) => password.toLowerCase().includes(c))) {
      score = Math.max(0, score - 2);
      errors.push('كلمة المرور شائعة جداً');
    }

    // Strength label
    let strength = 'ضعيفة';
    if (score >= 5)      strength = 'قوية جداً';
    else if (score >= 4) strength = 'قوية';
    else if (score >= 3) strength = 'متوسطة';

    return {
      valid: errors.length === 0,
      score,
      strength,
      errors
    };
  }

  /* ──────────────────────────────────────────────
     6. Activity Logger (Suspicious Activity)
     ────────────────────────────────────────────── */

  /**
   * Log suspicious activity to Firestore collection `security_logs`.
   * @param {string} type – event type
   * @param {Object} details – additional metadata
   */
  async function _logSuspiciousActivity(type, details = {}) {
    try {
      if (!window.MJ || !window.MJ.db) return;

      const user = window.MJ.getCurrentUser ? window.MJ.getCurrentUser() : null;

      await window.MJ.db.collection('security_logs').add({
        type,
        details,
        uid: user ? user.uid : null,
        userAgent: navigator.userAgent,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        url: window.location.href
      });
    } catch (e) {
      // Silently fail – don't break app flow for logging
      console.error('[MJSec] Failed to log activity:', e);
    }
  }

  /**
   * Public wrapper to manually log suspicious events.
   */
  function logActivity(type, details) {
    return _logSuspiciousActivity(type, details);
  }

  /* ──────────────────────────────────────────────
     7. Bot Detection (Honeypot + Behavior Analysis)
     ────────────────────────────────────────────── */

  const _botState = {
    formLoadTime: null,
    keystrokes: 0,
    mouseMoves: 0,
    honeypotTriggered: false
  };

  /**
   * Initialize bot detection for a form.
   * Adds a hidden honeypot field and starts behavior tracking.
   * @param {HTMLFormElement} formElement
   */
  function initBotDetection(formElement) {
    if (!(formElement instanceof HTMLFormElement)) return;

    _botState.formLoadTime = Date.now();
    _botState.keystrokes = 0;
    _botState.mouseMoves = 0;
    _botState.honeypotTriggered = false;

    // Create honeypot field (invisible to humans, filled by bots)
    let honeypot = formElement.querySelector('input[name="mj_hp_field"]');
    if (!honeypot) {
      honeypot = document.createElement('input');
      honeypot.type = 'text';
      honeypot.name = 'mj_hp_field';
      honeypot.tabIndex = -1;
      honeypot.autocomplete = 'off';
      honeypot.setAttribute('aria-hidden', 'true');
      honeypot.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;width:0;height:0;' +
        'opacity:0;overflow:hidden;pointer-events:none;';
      formElement.appendChild(honeypot);
    }

    // Monitor honeypot
    honeypot.addEventListener('input', () => {
      _botState.honeypotTriggered = true;
    });

    // Track keystrokes inside form
    formElement.addEventListener('keydown', () => {
      _botState.keystrokes++;
    }, { passive: true });

    // Track mouse movements
    formElement.addEventListener('mousemove', () => {
      _botState.mouseMoves++;
    }, { passive: true });
  }

  /**
   * Evaluate if the current form submission looks like a bot.
   * @returns {{ isBot: boolean, reasons: string[], confidence: number }}
   */
  function detectBot() {
    const reasons = [];
    let suspicion = 0;

    // 1. Honeypot filled
    if (_botState.honeypotTriggered) {
      reasons.push('honeypot_triggered');
      suspicion += 50;
    }

    // 2. Form submitted too quickly (< 2 seconds)
    if (_botState.formLoadTime) {
      const elapsed = Date.now() - _botState.formLoadTime;
      if (elapsed < 2000) {
        reasons.push('too_fast_submission');
        suspicion += 30;
      }
    }

    // 3. No keystrokes detected (copy-paste bot or direct submit)
    if (_botState.keystrokes === 0) {
      reasons.push('no_keystrokes');
      suspicion += 15;
    }

    // 4. No mouse movement detected
    if (_botState.mouseMoves === 0) {
      reasons.push('no_mouse_movement');
      suspicion += 10;
    }

    const isBot = suspicion >= 30;

    if (isBot) {
      _logSuspiciousActivity('bot_detected', { reasons, suspicion });
    }

    return {
      isBot,
      reasons,
      confidence: Math.min(suspicion, 100)
    };
  }

  /* ──────────────────────────────────────────────
     8. Secure Login Wrapper
     ────────────────────────────────────────────── */

  /**
   * Secured sign-in wrapper that enforces rate-limiting and bot detection.
   * @param {string} email
   * @param {string} password
   * @param {HTMLFormElement} [formElement] – optional for bot check
   */
  async function secureSignIn(email, password, formElement) {
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return { success: false, error: 'البريد الإلكتروني غير صالح' };
    }

    // Rate limit check
    const rateCheck = checkRateLimit(sanitizedEmail);
    if (!rateCheck.allowed) {
      const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
      return {
        success: false,
        error: `تم تجاوز عدد المحاولات المسموح. حاول بعد ${waitSec} ثانية`,
        retryAfterMs: rateCheck.retryAfterMs
      };
    }

    // Bot detection (if form provided)
    if (formElement) {
      const botResult = detectBot();
      if (botResult.isBot) {
        return { success: false, error: 'تم رصد نشاط مشبوه. حاول مجدداً' };
      }
    }

    // Record attempt
    recordAttempt(sanitizedEmail);

    // Attempt sign-in via MJ
    if (!window.MJ || !window.MJ.signIn) {
      return { success: false, error: 'خطأ في تهيئة النظام' };
    }

    const result = await window.MJ.signIn(sanitizedEmail, password);

    if (result.success) {
      resetRateLimit(sanitizedEmail);
      startSessionMonitor();
    }

    return result;
  }

  /* ──────────────────────────────────────────────
     9. Global Namespace Export
     ────────────────────────────────────────────── */

  window.MJSec = Object.freeze({
    // Rate limiting
    checkRateLimit,
    recordAttempt,
    resetRateLimit,

    // Input sanitization
    sanitizeHTML,
    stripTags,
    sanitizeObject,
    sanitizeEmail,

    // CSRF
    generateCSRFToken,
    validateCSRFToken,
    getCSRFToken,
    injectCSRFField,

    // Session monitoring
    startSessionMonitor,
    stopSessionMonitor,

    // Password validation
    validatePassword,

    // Activity logging
    logActivity,

    // Bot detection
    initBotDetection,
    detectBot,

    // Secure wrappers
    secureSignIn
  });

  console.log('[MJSec] Security module loaded ✓');
})();
