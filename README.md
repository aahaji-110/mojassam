# مُجسَّم | Mojassam

بداية جديدة: الموقع مبني على أساسين فقط:

- **تسجيل الدخول بحساب Google** عبر Firebase Auth → `public/js/firebase-config.js`
- **قاعدة البيانات** (Netlify Database / PostgreSQL) عبر Netlify Function → `netlify/functions/api.mjs`

## الهيكلة

```
mojassam/
├── public/
│   ├── index.html
│   └── js/firebase-config.js   # Firebase Auth (Google) + API client  → window.MJ
├── netlify/functions/api.mjs   # API: login, getProfile, updateProfile, isAdmin
├── netlify.toml
└── package.json
```

## النشر

https://mjar.netlify.app

التصميم القديم محفوظ في الفرع `backup-old-design-2026-11-10`.
