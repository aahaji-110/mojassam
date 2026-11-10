/**
 * مجسمات (Mojassamat) - Cyber Security Shield & File Sanitizer
 * =============================================================
 * - XSS & Prototype Pollution Guard
 * - Malicious File & SVG Sanitizer (Anti-Virus / Script-Injection Check)
 * - Rate Limiter & Intrusion Logger
 */
(function () {
  'use strict';

  const ALLOWED_EXTENSIONS = new Set(['stl', 'obj', '3mf', 'svg', 'png', 'jpg', 'jpeg', 'webp']);
  const BLOCKED_EXTENSIONS = new Set([
    'exe', 'dll', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'mjs', 'php', 'py', 'rb', 'pl', 'jar', 'msi', 'scr', 'com', 'hta', 'html', 'htm'
  ]);
  const MAX_FILE_SIZE_BYTES = 120 * 1024 * 1024; // 120 MB

  // 1. Freeze critical prototypes against pollution
  try {
    Object.freeze(Object.prototype);
  } catch (e) {}

  // 2. Sanitize plain strings against XSS
  function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // 3. Sanitize SVG content (strips <script>, foreignObject, event handlers, javascript: URIs)
  function sanitizeSVG(svgText) {
    if (typeof svgText !== 'string') return '';
    let clean = svgText
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript\s*:/gi, 'blocked:');
    return clean;
  }

  // 4. Deep File Inspection before loading into 3D/2D engine
  async function validateFile(file) {
    if (!file || !file.name) {
      return { valid: false, reason: 'ملف غير صالح' };
    }
    const nameLower = file.name.toLowerCase();
    const parts = nameLower.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';

    // Check double extensions like model.stl.exe
    for (const p of parts) {
      if (BLOCKED_EXTENSIONS.has(p)) {
        logThreat('blocked_double_extension', { fileName: file.name });
        return { valid: false, reason: 'تم حظر الملف لاحتوائه على امتداد تنفيذي مشبوه!' };
      }
    }

    if (BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
      logThreat('disallowed_file_type', { fileName: file.name, ext });
      return {
        valid: false,
        reason: `صيغة الملف (.${ext}) غير مدعومة أو محظورة أمنياً. الصيغ المسموحة: STL, OBJ, 3MF, SVG, PNG, JPG`
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, reason: 'حجم الملف يتجاوز الحد الأقصى المسموح (120 ميجابايت)' };
    }

    if (file.size === 0) {
      return { valid: false, reason: 'الملف فارغ (0 بايت)' };
    }

    // Check Magic Bytes for executable PE/ELF headers disguised as 3D models
    try {
      const slice = file.slice(0, 64);
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // MZ header (Windows EXE/DLL)
      if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
        logThreat('pe_executable_disguised', { fileName: file.name });
        return { valid: false, reason: 'تحذير أمني: هذا الملف برنامج تنفيذي متخفي وليس مجسماً!' };
      }
      // ELF header (Linux executable)
      if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
        logThreat('elf_executable_disguised', { fileName: file.name });
        return { valid: false, reason: 'تحذير أمني: ملف تنفيذي غير مسموح به!' };
      }
    } catch (e) {}

    return { valid: true, ext };
  }

  // 5. Client-side Rate Limiter
  const buckets = new Map();
  function checkRateLimit(actionKey, maxPerMinute = 25) {
    const now = Date.now();
    const record = buckets.get(actionKey) || { count: 0, resetAt: now + 60000 };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + 60000;
    }
    record.count++;
    buckets.set(actionKey, record);
    if (record.count > maxPerMinute) {
      logThreat('rate_limit_exceeded', { actionKey, count: record.count });
      return false;
    }
    return true;
  }

  function logThreat(type, details = {}) {
    console.warn('[Mojassamat Security Shield]', type, details);
    if (window.MJ && typeof window.MJ.api === 'function') {
      window.MJ.api('logSecurity', { type, details }).catch(() => {});
    }
  }

  // Monitor suspicious URL query injection
  try {
    const rawSearch = decodeURIComponent(window.location.search || '');
    if (/<script|javascript:|onerror=|onload=|UNION\s+SELECT/i.test(rawSearch)) {
      logThreat('url_injection_attempt', { search: rawSearch.slice(0, 200) });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}

  window.MJSecurity = Object.freeze({
    sanitizeText,
    sanitizeSVG,
    validateFile,
    checkRateLimit,
    logThreat
  });
})();
