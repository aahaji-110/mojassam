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

  // 1b. English Cursive & Calligraphy Fonts for Dual-Name 3D Sculptures ("مجسم الأسماء")
  const ENGLISH_SCRIPT_FONTS = [
    { name: 'Great Vibes', label: 'Great Vibes (مخطوطة كلاسيكية فاخرة - نفس الصورة ⭐)' },
    { name: 'Dancing Script', label: 'Dancing Script (خط متصل انسيابي)' },
    { name: 'Pacifico', label: 'Pacifico (خط متصل سميك ممتاز للطباعة 3D)' },
    { name: 'Sacramento', label: 'Sacramento (توقيع يدوي ناعم)' },
    { name: 'Satisfy', label: 'Satisfy (خط كاليغرافي متصل)' },
    { name: 'Kaushan Script', label: 'Kaushan Script (خط فرشاة بارز)' },
    { name: 'Lobster', label: 'Lobster (خط متصل عريض وقوي)' },
    { name: 'Allura', label: 'Allura (مخطوطة ملكية أنيقة)' },
    { name: 'Alex Brush', label: 'Alex Brush (خط ديواني إنجليزي)' },
    { name: 'Courgette', label: 'Courgette (مائل متصل متوازن)' }
  ];

  // Load Google Fonts dynamically in batches so all 48 Arabic fonts + 10 English script fonts work smoothly
  function loadAllArabicFonts() {
    const allFonts = [...ARABIC_FONTS, ...ENGLISH_SCRIPT_FONTS];
    const chunkSize = 10;
    for (let i = 0; i < allFonts.length; i += chunkSize) {
      const slice = allFonts.slice(i, i + chunkSize);
      const families = slice.map((f) => `family=${encodeURIComponent(f.name)}:wght@400;700`).join('&');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
    }
  }

  // 2. 3D Printers & Build Plates
  const PRINTERS = [
    { id: 'std_260', brand: 'Mojassamat', name: 'لوحة بناء قياسية (260×260×300 مم)', w: 260, d: 260, h: 300, plateLabel: 'Mojassamat Textured PEI Plate' },
    { id: 'k1_220', brand: 'Standard', name: 'K1 / K1C (220×220×250 مم)', w: 220, d: 220, h: 250, plateLabel: 'Textured PEI Plate 220×220' },
    { id: 'k1_max_300', brand: 'Standard', name: 'K1 Max (300×300×300 مم)', w: 300, d: 300, h: 300, plateLabel: 'Textured PEI Plate 300×300' },
    { id: 'k2_plus_350', brand: 'Standard', name: 'K2 Plus (350×350×350 مم)', w: 350, d: 350, h: 350, plateLabel: 'Textured PEI Plate 350×350' },
    { id: 'ender3_v3', brand: 'Standard', name: 'Ender-3 V3 / KE / SE (220×220×250 مم)', w: 220, d: 220, h: 250, plateLabel: 'Ender-3 V3 PEI Plate' },
    { id: 'cr10_se', brand: 'Standard', name: 'CR-10 Max / SE (300×300×400 مم)', w: 300, d: 300, h: 400, plateLabel: 'Large PEI Plate 300×300' },
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

  // 4. Keychain, Charger Tag & Bag Tag Templates (Modeled after real 3D-printed contour & monogram keychains!)
  const KEYCHAIN_TEMPLATES = [
    // Category: keychain (ميداليات مفاتيح احترافية بحواف الحروف)
    { id: 'kc_faisal_3layer', category: 'keychain', nameAr: 'ميدالية 3 طبقات بحواف الاسم (ستايل فيصل)', nameEn: '3-Layer Contour Keychain', style: 'contour_3layer', holePos: 'left', baseColor: '#dc2626', midColor: '#111827', textColor: '#facc15' },
    { id: 'kc_ali_rim', category: 'keychain', nameAr: 'ميدالية مخطوطة بحافة بارزة (ستايل علي)', nameEn: 'Script Rim Contour', style: 'contour_rim', holePos: 'right', baseColor: '#ffffff', midColor: '#ffffff', textColor: '#38bdf8' },
    { id: 'kc_purple_bubble', category: 'keychain', nameAr: 'ميدالية ببل مجسمة حول الحروف (ستايل Name)', nameEn: 'Bubble Outline Keychain', style: 'contour_bubble', holePos: 'left', baseColor: '#7c3aed', midColor: '#6d28d9', textColor: '#ffffff' },
    { id: 'kc_monogram_n', category: 'keychain', nameAr: 'ميدالية الحرف الكبير مع الاسم (ستايل الحرف البارز)', nameEn: 'Big Letter + Name Overlay', style: 'monogram_overlay', holePos: 'top', baseColor: '#8b5cf6', midColor: '#ffffff', textColor: '#1e293b' },
    { id: 'kc_gold_3layer', category: 'keychain', nameAr: 'ميدالية ملكية 3 طبقات (أسود وذهبي وأبيض)', nameEn: 'Royal Gold 3-Layer', style: 'contour_3layer', holePos: 'right', baseColor: '#18181b', midColor: '#eab308', textColor: '#ffffff' },
    { id: 'kc_neon_bubble', category: 'keychain', nameAr: 'ميدالية نيون بحواف الحروف (كربوني وأخضر)', nameEn: 'Neon Contour Bubble', style: 'contour_bubble', holePos: 'right', baseColor: '#0f172a', midColor: '#10b981', textColor: '#00e676' },
    { id: 'kc_pink_3layer', category: 'keychain', nameAr: 'ميدالية وردية 3 طبقات بحواف الاسم', nameEn: 'Pink 3-Layer Contour', style: 'contour_3layer', holePos: 'left', baseColor: '#db2777', midColor: '#ffffff', textColor: '#fce7f3' },
    { id: 'kc_cyan_rim', category: 'keychain', nameAr: 'ميدالية بحافة مزدوجة (كحلي وسماوي)', nameEn: 'Navy & Cyan Rim', style: 'contour_rim', holePos: 'right', baseColor: '#0f172a', midColor: '#38bdf8', textColor: '#e0f2fe' },
    { id: 'kc_engrave_bubble', category: 'keychain', nameAr: 'ميدالية ببل محفورة بالاسم (حفر غائر)', nameEn: 'Engraved Bubble Keychain', style: 'contour_bubble', engrave: true, holePos: 'right', baseColor: '#f59e0b', midColor: '#d97706', textColor: '#111827' },
    { id: 'kc_emerald_3layer', category: 'keychain', nameAr: 'ميدالية زمردية 3 طبقات فاخرة', nameEn: 'Emerald 3-Layer', style: 'contour_3layer', holePos: 'right', baseColor: '#064e3b', midColor: '#10b981', textColor: '#ffffff' },
    { id: 'kc_monogram_gold', category: 'keychain', nameAr: 'ميدالية الحرف الملكي الذهبي مع الاسم', nameEn: 'Gold Monogram + Name', style: 'monogram_overlay', holePos: 'top', baseColor: '#d97706', midColor: '#18181b', textColor: '#ffffff' },
    { id: 'kc_capsule', category: 'keychain', nameAr: 'كبسولة كلاسيكية بإطار بارز', nameEn: 'Classic Framed Capsule', style: 'capsule', border: true, holePos: 'right', baseColor: '#1e293b', midColor: '#10b981', textColor: '#10b981' },

    // Category: charger (تاق شاحن / سلك بحواف الحروف وكلبس مباشر)
    { id: 'ch_contour_clip', category: 'charger', nameAr: 'تاق شاحن بحواف الاسم (كلبس سلك مباشر)', nameEn: 'Contour Cable Clip', style: 'contour_bubble', holePos: 'cable_clip', baseColor: '#7c3aed', midColor: '#ffffff', textColor: '#ffffff' },
    { id: 'ch_3layer_clip', category: 'charger', nameAr: 'تاق شاحن 3 طبقات (ستايل فيصل للسلك)', nameEn: '3-Layer Cable Clip', style: 'contour_3layer', holePos: 'cable_clip', baseColor: '#dc2626', midColor: '#111827', textColor: '#facc15' },
    { id: 'ch_rim_ring', category: 'charger', nameAr: 'تاق شاحن مخطوطة بحلقة كابل (ستايل علي)', nameEn: 'Rim Script Cable Ring', style: 'contour_rim', holePos: 'cable_hole', baseColor: '#ffffff', midColor: '#ffffff', textColor: '#0284c7' },
    { id: 'ch_neon_clip', category: 'charger', nameAr: 'كلبس شاحن نيون بارز بالاسم', nameEn: 'Neon Charger Clip', style: 'contour_bubble', holePos: 'cable_clip', baseColor: '#0f172a', midColor: '#10b981', textColor: '#00e676' },
    { id: 'ch_monogram_clip', category: 'charger', nameAr: 'تاق شاحن بالحرف الكبير والاسم', nameEn: 'Monogram Charger Tag', style: 'monogram_overlay', holePos: 'cable_clip', baseColor: '#2563eb', midColor: '#ffffff', textColor: '#0f172a' },
    { id: 'ch_engrave_clip', category: 'charger', nameAr: 'تاق شاحن ببل محفور', nameEn: 'Engraved Cable Clip', style: 'contour_bubble', engrave: true, holePos: 'cable_clip', baseColor: '#10b981', midColor: '#065f46', textColor: '#0f172a' },

    // Category: bag (تاق شنطة / حقيبة سفر بحواف الحروف)
    { id: 'bg_3layer_tag', category: 'bag', nameAr: 'تاق شنطة 3 طبقات بحواف الاسم (ستايل فيصل)', nameEn: '3-Layer Bag Contour Tag', style: 'contour_3layer', scale: 1.25, holePos: 'left', baseColor: '#dc2626', midColor: '#111827', textColor: '#facc15' },
    { id: 'bg_bubble_tag', category: 'bag', nameAr: 'تاق شنطة ببل عريض (ستايل Name)', nameEn: 'Bubble Bag Name Tag', style: 'contour_bubble', scale: 1.25, holePos: 'left', baseColor: '#7c3aed', midColor: '#ffffff', textColor: '#ffffff' },
    { id: 'bg_monogram_tag', category: 'bag', nameAr: 'تاق شنطة بالحرف الكبير والاسم (ستايل N)', nameEn: 'Monogram Bag Tag', style: 'monogram_overlay', scale: 1.25, holePos: 'top', baseColor: '#8b5cf6', midColor: '#ffffff', textColor: '#1e293b' },
    { id: 'bg_rim_tag', category: 'bag', nameAr: 'تاق شنطة مخطوطة بحافة بارزة (ستايل علي)', nameEn: 'Script Rim Bag Tag', style: 'contour_rim', scale: 1.25, holePos: 'right', baseColor: '#ffffff', midColor: '#ffffff', textColor: '#0284c7' },
    { id: 'bg_luggage', category: 'bag', nameAr: 'بطاقة حقيبة سفر احترافية بفتحة حزام', nameEn: 'Luggage Strap Tag', style: 'luggage_tag', border: true, scale: 1.2, holePos: 'slot', baseColor: '#0f172a', midColor: '#10b981', textColor: '#10b981' },
    { id: 'bg_vip_gold', category: 'bag', nameAr: 'تاق شنطة ملكي 3 طبقات (ذهبي وأسود)', nameEn: 'VIP Gold 3-Layer Bag Tag', style: 'contour_3layer', scale: 1.25, holePos: 'right', baseColor: '#18181b', midColor: '#eab308', textColor: '#ffffff' }
  ];

  // 5. Translations (AR / EN)
  const I18N = {
    ar: {
      siteName: 'مجسمات',
      siteSub: 'استوديو التصميم والطباعة ثلاثية الأبعاد',
      newBtn: 'جديد',
      uploadBtn: 'رفع مجسم',
      arabicTextBtn: 'نص عربي',
      dualNameBtn: 'مجسم الأسماء',
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
      dualNameBtn: 'Name Sculpture',
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
    ENGLISH_SCRIPT_FONTS,
    PRINTERS,
    PRIMITIVES,
    KEYCHAIN_TEMPLATES,
    I18N,
    loadAllArabicFonts
  };
})();

