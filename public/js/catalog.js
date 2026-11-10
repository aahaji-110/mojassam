/**
 * مجسمات (Mojassamat) - Fonts, Printers, Primitives, Keychain Templates & i18n
 * ==============================================================================
 */

window.MJCatalog = (function () {
  // 1. 48 Arabic Fonts from Google Fonts
  const ARABIC_FONTS = [
    { name: 'Cairo', label: 'القاهرة (Cairo) - عصري متوازن' },
    { name: 'Tajawal', label: 'تجوال (Tajawal) - هندسي ناعم' },
    { name: 'Almarai', label: 'المراعي (Almarai) - واضح للطباعة' },
    { name: 'Amiri', label: 'أميري (Amiri) - نسخ كلاسيكي' },
    { name: 'Changa', label: 'تشانغا (Changa) - عريض بارز' },
    { name: 'El Messiri', label: 'المسيري (El Messiri) - زخرفي أنيق' },
    { name: 'Reem Kufi', label: 'ريم كوفي (Reem Kufi) - كوفي حديث' },
    { name: 'Reem Kufi Fun', label: 'ريم كوفي مرح (Reem Kufi Fun)' },
    { name: 'Reem Kufi Ink', label: 'ريم كوفي حبر (Reem Kufi Ink)' },
    { name: 'Aref Ruqaa', label: 'عارف رقعة (Aref Ruqaa) - خط الرقعة' },
    { name: 'Aref Ruqaa Ink', label: 'عارف رقعة حبر (Aref Ruqaa Ink)' },
    { name: 'Lalezar', label: 'لاليزار (Lalezar) - سميك جداً للميداليات' },
    { name: 'Lemonada', label: 'ليمونادة (Lemonada) - مرح وانسيابي' },
    { name: 'Rakkas', label: 'رقّاص (Rakkas) - ديواني جريء' },
    { name: 'Mirza', label: 'ميرزا (Mirza) - فارسي تقليدي' },
    { name: 'Katibeh', label: 'كتيبة (Katibeh) - عناوين تراثية' },
    { name: 'Jomhuria', label: 'جمهورية (Jomhuria) - عريض كلاسيكي' },
    { name: 'Kufam', label: 'كوفام (Kufam) - كوفي هندسي' },
    { name: 'Readex Pro', label: 'ريدكس برو (Readex Pro)' },
    { name: 'IBM Plex Sans Arabic', label: 'آي بي إم عربي (IBM Plex Arabic)' },
    { name: 'Noto Kufi Arabic', label: 'نوتو كوفي (Noto Kufi Arabic)' },
    { name: 'Noto Naskh Arabic', label: 'نوتو نسخ (Noto Naskh Arabic)' },
    { name: 'Noto Sans Arabic', label: 'نوتو سانس (Noto Sans Arabic)' },
    { name: 'Noto Nastaliq Urdu', label: 'نستعليق (Noto Nastaliq)' },
    { name: 'Marhey', label: 'مرحي (Marhey) - طفولي وإبداعي' },
    { name: 'Alexandria', label: 'الإسكندرية (Alexandria) - هندسي صلب' },
    { name: 'Alkalami', label: 'القلمي (Alkalami) - خط مغربي/سوداني' },
    { name: 'Amiri Quran', label: 'أميري قرآن (Amiri Quran)' },
    { name: 'Baloo Bhaijaan 2', label: 'بالو بيجان (Baloo Bhaijaan 2) - دائري ممتاز للـ 3D' },
    { name: 'Beiruti', label: 'بيروتي (Beiruti)' },
    { name: 'Badeen Display', label: 'بدين ديسبلاي (Badeen Display) - ضخم' },
    { name: 'Blaka', label: 'بلاكا (Blaka) - ثلاثي حاد' },
    { name: 'Blaka Hollow', label: 'بلاكا مفرغ (Blaka Hollow)' },
    { name: 'Fustat', label: 'الفسطاط (Fustat)' },
    { name: 'Gulzar', label: 'غلزار (Gulzar) - تعليق' },
    { name: 'Handjet', label: 'هاندجت (Handjet) - بكسل رقمي' },
    { name: 'Harmattan', label: 'هرمتان (Harmattan)' },
    { name: 'Karantina', label: 'كرنتينا (Karantina)' },
    { name: 'Lateef', label: 'لطيف (Lateef)' },
    { name: 'Mada', label: 'مدى (Mada)' },
    { name: 'Markazi Text', label: 'مركزي (Markazi Text)' },
    { name: 'Oi', label: 'أوي عريض (Oi)' },
    { name: 'Playpen Sans Arabic', label: 'بلاي بن عربي (Playpen Sans Arabic)' },
    { name: 'Qahiri', label: 'قاهري كوفي مربع (Qahiri)' },
    { name: 'Rubik', label: 'روبيك (Rubik)' },
    { name: 'Scheherazade New', label: 'شهرزاد (Scheherazade New)' },
    { name: 'Vazirmatn', label: 'وزير متن (Vazirmatn)' },
    { name: 'Vibes', label: 'فايبز (Vibes)' },
    { name: 'Zain', label: 'زين (Zain)' }
  ];

  // Load Google Fonts dynamically in batches so all 48 fonts work smoothly
  function loadAllArabicFonts() {
    const chunkSize = 10;
    for (let i = 0; i < ARABIC_FONTS.length; i += chunkSize) {
      const slice = ARABIC_FONTS.slice(i, i + chunkSize);
      const families = slice.map((f) => `family=${encodeURIComponent(f.name)}:wght@400;700`).join('&');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
    }
  }

  // 2. 3D Printers & Build Plates
  const PRINTERS = [
    { id: 'creality_hi', brand: 'Creality', name: 'Creality Hi (Textured PEI)', w: 260, d: 260, h: 300, plateLabel: 'Creality Textured PEI Plate' },
    { id: 'creality_k1', brand: 'Creality', name: 'Creality K1 / K1C', w: 220, d: 220, h: 250, plateLabel: 'Creality K1 PEI Plate' },
    { id: 'creality_k1_max', brand: 'Creality', name: 'Creality K1 Max', w: 300, d: 300, h: 300, plateLabel: 'Creality K1 Max 300×300' },
    { id: 'creality_k2_plus', brand: 'Creality', name: 'Creality K2 Plus', w: 350, d: 350, h: 350, plateLabel: 'Creality K2 Plus 350×350' },
    { id: 'ender3_v3', brand: 'Creality', name: 'Ender-3 V3 / V3 KE / SE', w: 220, d: 220, h: 250, plateLabel: 'Ender-3 V3 PEI Plate' },
    { id: 'cr10_se', brand: 'Creality', name: 'Creality CR-10 Max / SE', w: 300, d: 300, h: 400, plateLabel: 'Creality CR-10 Plate' },
    { id: 'bambu_x1c', brand: 'Bambu Lab', name: 'Bambu Lab X1C / P1S / P1P', w: 256, d: 256, h: 256, plateLabel: 'Bambu Textured PEI Plate' },
    { id: 'bambu_a1', brand: 'Bambu Lab', name: 'Bambu Lab A1', w: 256, d: 256, h: 256, plateLabel: 'Bambu A1 PEI Plate' },
    { id: 'bambu_a1_mini', brand: 'Bambu Lab', name: 'Bambu Lab A1 Mini', w: 180, d: 180, h: 180, plateLabel: 'Bambu A1 Mini 180×180' },
    { id: 'prusa_mk4', brand: 'Prusa', name: 'Prusa MK4 / MK3S+', w: 250, d: 210, h: 220, plateLabel: 'Prusa Satin Powder-coated' },
    { id: 'prusa_xl', brand: 'Prusa', name: 'Prusa XL', w: 360, d: 360, h: 360, plateLabel: 'Prusa XL Modular Bed' },
    { id: 'anycubic_kobra3', brand: 'Anycubic', name: 'Anycubic Kobra 3', w: 250, d: 250, h: 260, plateLabel: 'Anycubic Kobra PEI Plate' },
    { id: 'anycubic_kobra2_max', brand: 'Anycubic', name: 'Anycubic Kobra 2 Max', w: 420, d: 420, h: 500, plateLabel: 'Anycubic Kobra Max 420×420' },
    { id: 'elegoo_neptune4', brand: 'Elegoo', name: 'Elegoo Neptune 4 / Pro', w: 225, d: 225, h: 265, plateLabel: 'Elegoo Neptune PEI' },
    { id: 'elegoo_neptune4_max', brand: 'Elegoo', name: 'Elegoo Neptune 4 Max', w: 420, d: 420, h: 480, plateLabel: 'Elegoo Neptune Max 420×420' },
    { id: 'voron_24_350', brand: 'Voron', name: 'Voron 2.4 (350mm)', w: 350, d: 350, h: 350, plateLabel: 'Voron 2.4 PEI Sheet' }
  ];

  // 3. Exact 15 Primitives & Calibration Models from User's Uploaded Image
  const PRIMITIVES = [
    { id: 'cube', group: 'basic', nameEn: 'Cube', nameAr: 'مكعب (Cube)', icon: 'fa-cube' },
    { id: 'sphere', group: 'basic', nameEn: 'Sphere', nameAr: 'كرة (Sphere)', icon: 'fa-circle' },
    { id: 'cylinder', group: 'basic', nameEn: 'Cylinder', nameAr: 'أسطوانة (Cylinder)', icon: 'fa-database' },
    { id: 'cone', group: 'basic', nameEn: 'Cone', nameAr: 'مخروط (Cone)', icon: 'fa-caret-up' },
    { id: 'truncated_cone', group: 'basic', nameEn: 'Truncated Cone', nameAr: 'مخروط مقطوع (Truncated Cone)', icon: 'fa-glass-water' },
    { id: 'torus', group: 'basic', nameEn: 'Torus', nameAr: 'حلقة دائرية (Torus)', icon: 'fa-ring' },
    { id: 'pyramid', group: 'basic', nameEn: 'Pyramid', nameAr: 'هرم (Pyramid)', icon: 'fa-mountain' },
    { id: 'prism', group: 'basic', nameEn: 'Prism', nameAr: 'منشور (Prism)', icon: 'fa-play' },
    { id: 'disc', group: 'basic', nameEn: 'Disc', nameAr: 'قرص مسطح (Disc)', icon: 'fa-compact-disc' },
    // Divider group 2
    { id: 'block20xy', group: 'calib', nameEn: 'Block20XY', nameAr: 'مكعب معايرة (Block20XY)', icon: 'fa-vector-square' },
    { id: '3dbenchy', group: 'calib', nameEn: '3DBenchy', nameAr: 'قارب اختبار (3DBenchy)', icon: 'fa-ship' },
    { id: 'complex', group: 'calib', nameEn: 'Complex', nameAr: 'نموذج اختبار شامل (Complex)', icon: 'fa-city' },
    { id: 'overhang', group: 'calib', nameEn: 'Overhang', nameAr: 'اختبار البروز والدعامات (Overhang)', icon: 'fa-archway' },
    { id: 'square_columns_z', group: 'calib', nameEn: 'Square columns Z axis', nameAr: 'أعمدة مربعة محور Z', icon: 'fa-bars-staggered' },
    { id: 'square_prism_z', group: 'calib', nameEn: 'Square prism Z axis', nameAr: 'منشور هرمي محور Z', icon: 'fa-monument' }
  ];

  // 4. Keychain, Charger Tag & Bag Tag Templates
  const KEYCHAIN_TEMPLATES = [
    // Category: keychain (ميدالية مفاتيح)
    { id: 'kc_capsule', category: 'keychain', nameAr: 'كبسولة كلاسيكية', nameEn: 'Classic Capsule', shape: 'capsule', border: true, holePos: 'right', baseColor: '#1e293b', textColor: '#10b981' },
    { id: 'kc_rounded_rect', category: 'keychain', nameAr: 'مستطيل بحواف ناعمة', nameEn: 'Rounded Plate', shape: 'rounded_rect', border: true, holePos: 'right', baseColor: '#0f172a', textColor: '#38bdf8' },
    { id: 'kc_cloud', category: 'keychain', nameAr: 'سحابة الاسم البارزة', nameEn: 'Name Cloud', shape: 'cloud', border: false, holePos: 'right', baseColor: '#ffffff', textColor: '#ec4899' },
    { id: 'kc_shield', category: 'keychain', nameAr: 'درع ملكي', nameEn: 'Royal Shield', shape: 'shield', border: true, holePos: 'top', baseColor: '#18181b', textColor: '#f59e0b' },
    { id: 'kc_hex', category: 'keychain', nameAr: 'سداسي هندسي', nameEn: 'Hexagon Tag', shape: 'hexagon', border: true, holePos: 'right', baseColor: '#111827', textColor: '#22c55e' },
    { id: 'kc_heart', category: 'keychain', nameAr: 'ميدالية القلب', nameEn: 'Heart Keychain', shape: 'heart', border: false, holePos: 'top', baseColor: '#be123c', textColor: '#ffffff' },
    { id: 'kc_circle', category: 'keychain', nameAr: 'قرص دائري مزدوج', nameEn: 'Circle Coin', shape: 'circle', border: true, holePos: 'top', baseColor: '#1e1b4b', textColor: '#a78bfa' },
    { id: 'kc_car_plate', category: 'keychain', nameAr: 'لوحة مميزة عريضة', nameEn: 'Wide Plate', shape: 'wide_plate', border: true, holePos: 'right', baseColor: '#ffffff', textColor: '#111827' },
    { id: 'kc_engrave_bar', category: 'keychain', nameAr: 'سبيكة محفورة (حفر)', nameEn: 'Engraved Bar', shape: 'rounded_rect', border: false, engrave: true, holePos: 'right', baseColor: '#d97706', textColor: '#1f2937' },
    { id: 'kc_floating', category: 'keychain', nameAr: 'خط حر متصل', nameEn: 'Floating Script', shape: 'strip', border: false, holePos: 'right', baseColor: '#065f46', textColor: '#34d399' },

    // Category: charger (تاق شاحن / سلك)
    { id: 'ch_clip_c', category: 'charger', nameAr: 'كلبس سلك شاحن (تركيب مباشر)', nameEn: 'Cable Snap Clip', shape: 'charger_clip', border: false, holePos: 'cable_clip', baseColor: '#1e293b', textColor: '#10b981' },
    { id: 'ch_ring_usb', category: 'charger', nameAr: 'حلقة كابل تايب سي / آيفون', nameEn: 'USB Cable Ring', shape: 'charger_ring', border: true, holePos: 'cable_hole', baseColor: '#0f172a', textColor: '#f43f5e' },
    { id: 'ch_sleeve', category: 'charger', nameAr: 'طوق سلك شاحن أسطواني', nameEn: 'Cable Sleeve Tag', shape: 'charger_sleeve', border: false, holePos: 'cable_clip', baseColor: '#312e81', textColor: '#fbbf24' },
    { id: 'ch_flag', category: 'charger', nameAr: 'راية سلك الشاحن بالاسم', nameEn: 'Cable Flag Tag', shape: 'charger_flag', border: true, holePos: 'cable_hole', baseColor: '#064e3b', textColor: '#ffffff' },
    { id: 'ch_dual', category: 'charger', nameAr: 'تاق شاحن مزدوج الحماية', nameEn: 'Dual Cable Guard', shape: 'charger_clip', border: true, holePos: 'cable_clip', baseColor: '#27272a', textColor: '#38bdf8' },
    { id: 'ch_engrave', category: 'charger', nameAr: 'تاق شاحن محفور', nameEn: 'Engraved Cable Tag', shape: 'charger_ring', border: false, engrave: true, holePos: 'cable_hole', baseColor: '#10b981', textColor: '#0f172a' },

    // Category: bag (تاق شنطة / حقيبة سفر)
    { id: 'bg_luggage', category: 'bag', nameAr: 'بطاقة حقيبة سفر احترافية', nameEn: 'Luggage Name Tag', shape: 'luggage_tag', border: true, holePos: 'slot', baseColor: '#0f172a', textColor: '#10b981' },
    { id: 'bg_school', category: 'bag', nameAr: 'تاق شنطة مدرسية', nameEn: 'School Backpack Tag', shape: 'capsule', border: true, scale: 1.25, holePos: 'right', baseColor: '#1d4ed8', textColor: '#ffffff' },
    { id: 'bg_badge', category: 'bag', nameAr: 'وسام حقيبة دائري', nameEn: 'Round Bag Badge', shape: 'circle', border: true, scale: 1.25, holePos: 'top', baseColor: '#7c2d12', textColor: '#fed7aa' },
    { id: 'bg_shield', category: 'bag', nameAr: 'تاق شنطة رياضية (درع)', nameEn: 'Sports Bag Shield', shape: 'shield', border: true, scale: 1.25, holePos: 'top', baseColor: '#111827', textColor: '#ef4444' },
    { id: 'bg_vip', category: 'bag', nameAr: 'بطاقة VIP محفورة للشنطة', nameEn: 'VIP Engraved Bag Tag', shape: 'luggage_tag', border: true, engrave: true, holePos: 'slot', baseColor: '#eab308', textColor: '#18181b' },
    { id: 'bg_kids', category: 'bag', nameAr: 'تاق شنطة أطفال (سحابة)', nameEn: 'Kids Cloud Bag Tag', shape: 'cloud', border: false, scale: 1.2, holePos: 'right', baseColor: '#8b5cf6', textColor: '#ffffff' }
  ];

  // 5. Translations (AR / EN)
  const I18N = {
    ar: {
      siteName: 'مجسمات',
      siteSub: 'استوديو التصميم والطباعة ثلاثية الأبعاد',
      newBtn: 'جديد',
      uploadBtn: 'رفع مجسم',
      arabicTextBtn: 'نص عربي',
      addShapeBtn: 'إضافة مجسم',
      stickSurfaceBtn: 'لصق على السطح',
      keychainBtn: 'صانع الميداليات والتاق',
      converterBtn: 'تحويل الصيغ',
      qrBtn: 'صانع QR 3D',
      magnetBtn: 'مغناطيس اللوحة',
      previewBtn: 'معاينة',
      rotateBtn: 'تدوير 360°',
      scaleBtn: 'الأبعاد والتحجيم',
      checkBtn: 'فحص الطباعة ✔',
      splitColorsBtn: 'فصل الألوان',
      exportBtn: 'تصدير الملف',
      loyaltyBtn: 'الولاء والمكافآت',
      topupBtn: 'شحن الرصيد',
      redeemBtn: 'تفعيل كود',
      adminBtn: 'لوحة التحكم',
      loginBtn: 'تسجيل الدخول'
    },
    en: {
      siteName: 'Mojassamat',
      siteSub: '3D Design & Slicer Studio',
      newBtn: 'New',
      uploadBtn: 'Upload 3D/SVG',
      arabicTextBtn: 'Arabic Text',
      addShapeBtn: 'Add Shape',
      stickSurfaceBtn: 'Stick to Surface',
      keychainBtn: 'Keychain & Tag Maker',
      converterBtn: 'File Converter',
      qrBtn: '3D QR Maker',
      magnetBtn: 'Magnet to Bed',
      previewBtn: 'Preview',
      rotateBtn: 'Rotate 360°',
      scaleBtn: 'Scale & Size',
      checkBtn: 'Print Check ✔',
      splitColorsBtn: 'Split Colors',
      exportBtn: 'Export File',
      loyaltyBtn: 'Rewards & Loyalty',
      topupBtn: 'Buy Coins',
      redeemBtn: 'Redeem Code',
      adminBtn: 'Admin Panel',
      loginBtn: 'Sign In'
    }
  };

  return {
    ARABIC_FONTS,
    PRINTERS,
    PRIMITIVES,
    KEYCHAIN_TEMPLATES,
    I18N,
    loadAllArabicFonts
  };
})();
