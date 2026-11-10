/**
 * مجسمات (Mojassamat) - Main 3D Studio Controller
 * ================================================
 */

window.MJApp = (function () {
  let scene, camera, renderer, orbit, transformControl;
  let platesGroup, objectsGroup;
  let sceneObjects = []; // Array of top-level Mesh or Group objects on build plates
  let selectedObject = null;

  let currentPrinter = window.MJCatalog.PRINTERS[0]; // 260x260x300
  let plateCount = 1;
  let plateCenters = [{ x: 0, z: 0 }];

  let isPreviewMode = false;
  let interactiveSurfacePick = false;
  let currentLang = 'ar';
  let authTab = 'login';
  let currentKeychainCat = 'keychain';
  let currentQRType = 'url';
  let converterSelectedFile = null;

  let userProfile = null;
  let siteSettings = {};
  let packagesList = [];
  let activePaymentOrder = null;

  // Undo / Redo History Stack
  const undoStack = [];
  const redoStack = [];

  /* ──────────────────────────────────────────────────────────────
     1. Initialization & Three.js Workspace Setup
     ────────────────────────────────────────────────────────────── */
  function init() {
    window.MJCatalog.loadAllArabicFonts();
    populatePrinterSelect();
    populateArabicFontSelects();
    populatePrimitivesMenu();
    renderKeychainGallery();

    initThreeScene();
    rebuildBuildPlates(1);
    setupViewportInteraction();
    setupKeyboardShortcuts();

    // Load public config & packages from backend
    loadBackendConfig();

    // Listen to Firebase Auth state
    if (window.MJ && window.MJ.onAuthChange) {
      window.MJ.onAuthChange(async (fbUser) => {
        if (fbUser) {
          const res = await window.MJ.getProfile();
          if (res.success && res.data) {
            applyUserSession(res.data);
          }
        } else {
          userProfile = null;
          updateUserTopBar();
        }
      });
    }
  }

  function initThreeScene() {
    const container = document.getElementById('three-canvas-wrap');
    const w = container.clientWidth || window.innerWidth - 320;
    const h = container.clientHeight || window.innerHeight - 140;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d3037); // Dark studio viewport background

    camera = new THREE.PerspectiveCamera(42, w / h, 1, 8000);
    camera.position.set(0, 270, 340);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x1f242d, 0.85);
    scene.add(hemi);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight1.position.set(180, 380, 240);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90caf9, 0.35);
    dirLight2.position.set(-200, 220, -180);
    scene.add(dirLight2);

    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2 + 0.15;
    orbit.target.set(0, 20, 0);

    transformControl = new THREE.TransformControls(camera, renderer.domElement);
    transformControl.setSize(0.85);
    transformControl.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
      if (!e.value) {
        saveUndoSnapshot();
        updateInspectorValues();
      }
    });
    transformControl.addEventListener('change', () => {
      if (selectedObject) updateInspectorValues();
    });
    scene.add(transformControl);

    platesGroup = new THREE.Group();
    objectsGroup = new THREE.Group();
    scene.add(platesGroup);
    scene.add(objectsGroup);

    window.addEventListener('resize', onWindowResize);
    animate();
  }

  function onWindowResize() {
    const container = document.getElementById('three-canvas-wrap');
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    if (orbit) orbit.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  /* ──────────────────────────────────────────────────────────────
     2. Textured PEI Build Plates (Always Square Grid Layout!)
     ────────────────────────────────────────────────────────────── */
  function createPlateTexture(wMm, dMm, titleText, plateNumberStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Dark Textured PEI metallic charcoal surface
    ctx.fillStyle = '#383b42';
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle PEI texture grain
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 1800; i++) {
      ctx.fillRect((i * 73) % 1024, (i * 137) % 1024, 2, 2);
    }

    // Outer border
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 988, 988);

    // Fine 10mm grid lines
    const cellsX = Math.max(10, Math.round(wMm / 10));
    const cellsZ = Math.max(10, Math.round(dMm / 10));
    const stepX = 960 / cellsX;
    const stepZ = 960 / cellsZ;

    for (let i = 0; i <= cellsX; i++) {
      const px = 32 + i * stepX;
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = i % 5 === 0 ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(px, 32);
      ctx.lineTo(px, 992);
      ctx.stroke();
    }

    for (let j = 0; j <= cellsZ; j++) {
      const pz = 32 + j * stepZ;
      ctx.strokeStyle = j % 5 === 0 ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = j % 5 === 0 ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(32, pz);
      ctx.lineTo(992, pz);
      ctx.stroke();
    }

    // Top-left plate title
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(titleText || 'Mojassamat Textured PEI Plate', 48, 82);

    // Top-right green plate index ("01", "02"...)
    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(plateNumberStr, 976, 86);

    // Bottom center brand bar & warning hot surface badges
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOJASSAMAT 3D • مجسمات', 512, 972);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚠ Warning hot surface', 48, 972);
    ctx.textAlign = 'right';
    ctx.fillText('⚠ Warning hot surface', 976, 972);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  function rebuildBuildPlates(count) {
    plateCount = Math.max(1, Math.min(16, count));
    document.getElementById('plates-count-label').textContent = String(plateCount).padStart(2, '0');

    while (platesGroup.children.length > 0) {
      platesGroup.remove(platesGroup.children[0]);
    }

    const w = currentPrinter.w;
    const d = currentPrinter.d;
    const h = currentPrinter.h;
    const gap = 45;

    // ALWAYS distribute build plates in a SQUARE grid (cols = ceil(sqrt(plateCount)))
    const cols = Math.ceil(Math.sqrt(plateCount));
    const rows = Math.ceil(plateCount / cols);

    plateCenters = [];

    for (let i = 0; i < plateCount; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = (c - (cols - 1) / 2) * (w + gap);
      const cz = (r - (rows - 1) / 2) * (d + gap);
      plateCenters.push({ x: cx, z: cz });

      const plateNumStr = String(i + 1).padStart(2, '0');
      const tex = createPlateTexture(w, d, currentPrinter.plateLabel, plateNumStr);

      // PEI Bed Base
      const bedGeom = new THREE.BoxGeometry(w, 4, d);
      const bedMats = [
        new THREE.MeshStandardMaterial({ color: 0x22252a }),
        new THREE.MeshStandardMaterial({ color: 0x22252a }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.15 }),
        new THREE.MeshStandardMaterial({ color: 0x181a1e }),
        new THREE.MeshStandardMaterial({ color: 0x22252a }),
        new THREE.MeshStandardMaterial({ color: 0x22252a })
      ];
      const bedMesh = new THREE.Mesh(bedGeom, bedMats);
      bedMesh.position.set(cx, -2, cz);
      bedMesh.receiveShadow = true;
      platesGroup.add(bedMesh);

      // RGB Origin Axes Indicator at front-left corner of Plate 01
      if (i === 0) {
        const originX = cx - w / 2 + 4;
        const originZ = cz + d / 2 - 4;
        const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(originX, 0.5, originZ), 32, 0xef4444, 6, 4);
        const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(originX, 0.5, originZ), 32, 0x22c55e, 6, 4);
        const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(originX, 0.5, originZ), 32, 0x3b82f6, 6, 4);
        platesGroup.add(xArrow, yArrow, zArrow);
      }

      // Faint wireframe volume box showing max print height
      const volGeom = new THREE.BoxGeometry(w, h, d);
      const volEdges = new THREE.EdgesGeometry(volGeom);
      const volLine = new THREE.LineSegments(
        volEdges,
        new THREE.LineBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.22 })
      );
      volLine.position.set(cx, h / 2, cz);
      platesGroup.add(volLine);
    }
  }

  function addBuildPlate() {
    rebuildBuildPlates(plateCount + 1);
    showToast(`تمت إضافة لوحة بناء #${String(plateCount).padStart(2, '0')} (توزيع مربع)`);
  }

  function removeBuildPlate() {
    if (plateCount <= 1) {
      showToast('لا يمكن حذف اللوحة الأساسية 01', true);
      return;
    }
    rebuildBuildPlates(plateCount - 1);
    // Reassign any objects on removed plate to plate 0
    sceneObjects.forEach((obj) => {
      if ((obj.userData.plateIndex || 0) >= plateCount) {
        moveObjectToPlate(obj, plateCount - 1);
      }
    });
    showToast(`تم تقليص عدد اللوحات إلى ${String(plateCount).padStart(2, '0')}`);
  }

  function moveObjectToPlate(obj, plateIndex) {
    if (!plateCenters[plateIndex]) {
      rebuildBuildPlates(plateIndex + 1);
    }
    const center = plateCenters[plateIndex];
    obj.userData.plateIndex = plateIndex;
    obj.position.x = center.x;
    obj.position.z = center.z;
    snapObjectToBed(obj);
  }

  /* ──────────────────────────────────────────────────────────────
     3. Adding, Selecting & Managing Objects in the 3D Scene
     ────────────────────────────────────────────────────────────── */
  function registerSceneObject(obj, name = 'مجسم 3D', targetPlateIdx = 0) {
    saveUndoSnapshot();
    obj.name = name;
    obj.userData.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    obj.userData.plateIndex = targetPlateIdx;

    if (targetPlateIdx >= plateCount) {
      rebuildBuildPlates(targetPlateIdx + 1);
    }

    // Check if object is larger than current plate or if plate already crowded -> auto distribute if needed
    const center = plateCenters[targetPlateIdx] || { x: 0, z: 0 };
    obj.position.set(center.x, 0, center.z);
    objectsGroup.add(obj);
    sceneObjects.push(obj);

    snapObjectToBed(obj);
    selectObject(obj);
    refreshObjectsListUI();
    updateQuickPrintSummary();
  }

  function selectObject(obj) {
    selectedObject = obj;
    if (!obj || isPreviewMode) {
      transformControl.detach();
    } else {
      transformControl.attach(obj);
    }
    refreshObjectsListUI();
    updateInspectorValues();
  }

  function snapObjectToBed(obj) {
    if (!obj) return;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
      obj.position.y -= box.min.y;
      obj.updateMatrixWorld(true);
    }
  }

  function snapSelectedToBed() {
    if (!selectedObject) {
      showToast('اختر مجسماً أولاً لتثبيته بالمغناطيس على اللوحة', true);
      return;
    }
    saveUndoSnapshot();
    snapObjectToBed(selectedObject);
    updateInspectorValues();
    showToast('🧲 تم إلصاق المجسم على سطح لوحة البناء تماماً');
  }

  function updateInspectorValues() {
    const noSel = document.getElementById('no-selection-msg');
    const insp = document.getElementById('selected-inspector');

    if (!selectedObject) {
      noSel.classList.remove('hidden');
      insp.classList.add('hidden');
      return;
    }

    noSel.classList.add('hidden');
    insp.classList.remove('hidden');

    document.getElementById('selected-obj-name').textContent = selectedObject.name || 'مجسم';
    const pIdx = (selectedObject.userData.plateIndex || 0) + 1;
    document.getElementById('selected-obj-plate-tag').textContent = `لوحة ${String(pIdx).padStart(2, '0')}`;

    selectedObject.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(selectedObject);
    const size = new THREE.Vector3();
    box.getSize(size);

    document.getElementById('insp-dim-x').textContent = size.x.toFixed(1) + ' مم';
    document.getElementById('insp-dim-z').textContent = size.z.toFixed(1) + ' مم';
    document.getElementById('insp-dim-y').textContent = size.y.toFixed(1) + ' مم';

    // Sync scale popover inputs
    const dxInput = document.getElementById('dim-x-mm');
    const dzInput = document.getElementById('dim-z-mm');
    const dyInput = document.getElementById('dim-y-mm');
    if (dxInput) dxInput.value = size.x.toFixed(1);
    if (dzInput) dzInput.value = size.z.toFixed(1);
    if (dyInput) dyInput.value = size.y.toFixed(1);

    // Sync rotation popover inputs (0 to 360 deg)
    const rx = ((THREE.MathUtils.radToDeg(selectedObject.rotation.x) % 360) + 360) % 360;
    const ry = ((THREE.MathUtils.radToDeg(selectedObject.rotation.y) % 360) + 360) % 360;
    const rz = ((THREE.MathUtils.radToDeg(selectedObject.rotation.z) % 360) + 360) % 360;

    setRotUI('x', Math.round(rx));
    setRotUI('y', Math.round(ry));
    setRotUI('z', Math.round(rz));
  }

  function setRotUI(axis, deg) {
    const valEl = document.getElementById(`rot-${axis}-val`);
    const slEl = document.getElementById(`rot-${axis}-slider`);
    const numEl = document.getElementById(`rot-${axis}-num`);
    if (valEl) valEl.textContent = `${deg}°`;
    if (slEl) slEl.value = deg;
    if (numEl) numEl.value = deg;
  }

  function applyRotationInput(axis, degVal) {
    if (!selectedObject) return;
    const deg = Math.max(0, Math.min(360, Number(degVal || 0)));
    setRotUI(axis, deg);
    selectedObject.rotation[axis] = THREE.MathUtils.degToRad(deg);
    snapObjectToBed(selectedObject);
    updateInspectorValues();
  }

  function quickRotate(axis, deltaDeg) {
    if (!selectedObject) return;
    saveUndoSnapshot();
    const cur = ((THREE.MathUtils.radToDeg(selectedObject.rotation[axis]) % 360) + 360) % 360;
    const next = (Math.round(cur) + deltaDeg) % 360;
    applyRotationInput(axis, next);
  }

  function resetRotation() {
    if (!selectedObject) return;
    saveUndoSnapshot();
    selectedObject.rotation.set(0, 0, 0);
    snapObjectToBed(selectedObject);
    updateInspectorValues();
  }

  function applyDimensionMm(axis, newMm) {
    if (!selectedObject) return;
    const targetMm = Math.max(0.5, Number(newMm || 10));
    selectedObject.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(selectedObject);
    const size = new THREE.Vector3();
    box.getSize(size);
    const curMm = Math.max(0.1, size[axis]);
    const ratio = targetMm / curMm;

    saveUndoSnapshot();
    const locked = document.getElementById('scale-uniform-lock')?.checked;
    if (locked) {
      selectedObject.scale.multiplyScalar(ratio);
    } else {
      selectedObject.scale[axis] *= ratio;
    }
    snapObjectToBed(selectedObject);
    updateInspectorValues();
  }

  function applyUniformPercent(pct) {
    if (!selectedObject) return;
    const p = Math.max(10, Math.min(500, Number(pct || 100)));
    document.getElementById('scale-pct-label').textContent = `${p}%`;
    document.getElementById('scale-pct-slider').value = p;
    const mult = p / 100;
    selectedObject.scale.set(mult, mult, mult);
    snapObjectToBed(selectedObject);
    updateInspectorValues();
  }

  function toggleTransformPopover(mode) {
    const pop = document.getElementById('transform-popover');
    const rotSec = document.getElementById('popover-rotate-section');
    const scaleSec = document.getElementById('popover-scale-section');
    const title = document.getElementById('transform-popover-title');

    pop.classList.remove('hidden');
    if (mode === 'rotate') {
      rotSec.classList.remove('hidden');
      scaleSec.classList.add('hidden');
      title.innerHTML = '<i class="fa-solid fa-arrows-spin"></i><span>تدوير المجسم (0° - 360°)</span>';
      if (transformControl) transformControl.setMode('rotate');
    } else {
      rotSec.classList.add('hidden');
      scaleSec.classList.remove('hidden');
      title.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>تكبير وتصغير المجسم (الطول والعرض والارتفاع)</span>';
      if (transformControl) transformControl.setMode('scale');
    }
    updateInspectorValues();
  }

  function closeTransformPopover() {
    document.getElementById('transform-popover').classList.add('hidden');
    if (transformControl) transformControl.setMode('translate');
  }

  function setSelectedColor(hex) {
    if (!selectedObject) return;
    saveUndoSnapshot();
    document.getElementById('obj-color-picker').value = hex;
    selectedObject.traverse((m) => {
      if (m.isMesh && m.material) {
        m.material = m.material.clone();
        m.material.color.set(hex);
      }
    });
    refreshObjectsListUI();
  }

  function duplicateSelected() {
    if (!selectedObject) return;
    const clone = selectedObject.clone(true);
    clone.position.x += 25;
    clone.position.z += 25;
    registerSceneObject(clone, selectedObject.name + ' (نسخة)', selectedObject.userData.plateIndex || 0);
    showToast('تم تكرار المجسم');
  }

  function deleteSelected() {
    if (!selectedObject) return;
    saveUndoSnapshot();
    transformControl.detach();
    objectsGroup.remove(selectedObject);
    sceneObjects = sceneObjects.filter((o) => o !== selectedObject);
    selectedObject = sceneObjects[sceneObjects.length - 1] || null;
    if (selectedObject && !isPreviewMode) transformControl.attach(selectedObject);
    refreshObjectsListUI();
    updateInspectorValues();
    updateQuickPrintSummary();
  }

  /* ──────────────────────────────────────────────────────────────
     4. Eye Preview Button ("زر العين للمعاينة والعودة للتحرير")
     ────────────────────────────────────────────────────────────── */
  function toggleEyePreview() {
    isPreviewMode = !isPreviewMode;
    const btn = document.getElementById('btn-eye-preview');
    const pill = document.getElementById('mode-indicator-text');

    if (isPreviewMode) {
      btn.classList.add('active');
      transformControl.detach();
      closeTransformPopover();
      pill.textContent = '👁 وضع المعاينة النهائية (اضغط العين مجدداً للعودة للتحرير)';
      showToast('👁 وضع المعاينة: يتم عرض المجسم وتعديلاته النهائية بدون محاور التحرير');
    } else {
      btn.classList.remove('active');
      if (selectedObject) transformControl.attach(selectedObject);
      pill.textContent = 'وضع التحرير (Prepare)';
      showToast('تمت العودة لوضع التحرير');
    }
  }

  /* ──────────────────────────────────────────────────────────────
     5. New Project Confirmation ("زر جديد") & Undo / Redo (Ctrl+Z)
     ────────────────────────────────────────────────────────────── */
  function confirmNewWorkspace() {
    if (sceneObjects.length > 0) {
      const ok = window.confirm('هل أنت متأكد من البدء من جديد؟ سيتم مسح جميع المجسمات الحالية وفتح لوحة بناء جديدة.');
      if (!ok) return;
    }
    saveUndoSnapshot();
    transformControl.detach();
    while (objectsGroup.children.length > 0) {
      objectsGroup.remove(objectsGroup.children[0]);
    }
    sceneObjects = [];
    selectedObject = null;
    rebuildBuildPlates(1);
    refreshObjectsListUI();
    updateInspectorValues();
    updateQuickPrintSummary();
    showToast('تم فتح لوحة بناء جديدة بالكامل');
  }

  function captureState() {
    return sceneObjects.map((o) => ({
      ref: o,
      pos: o.position.clone(),
      rot: o.rotation.clone(),
      scale: o.scale.clone(),
      plateIndex: o.userData.plateIndex || 0
    }));
  }

  function saveUndoSnapshot() {
    undoStack.push(captureState());
    if (undoStack.length > 35) undoStack.shift();
    redoStack.length = 0;
  }

  function restoreState(snapshot) {
    if (!snapshot) return;
    transformControl.detach();
    while (objectsGroup.children.length > 0) {
      objectsGroup.remove(objectsGroup.children[0]);
    }
    sceneObjects = [];
    snapshot.forEach((item) => {
      const obj = item.ref;
      obj.position.copy(item.pos);
      obj.rotation.copy(item.rot);
      obj.scale.copy(item.scale);
      obj.userData.plateIndex = item.plateIndex;
      objectsGroup.add(obj);
      sceneObjects.push(obj);
    });
    selectedObject = sceneObjects[sceneObjects.length - 1] || null;
    if (selectedObject && !isPreviewMode) transformControl.attach(selectedObject);
    refreshObjectsListUI();
    updateInspectorValues();
  }

  function undo() {
    if (!undoStack.length) {
      showToast('لا توجد خطوات سابقة للتراجع عنها', true);
      return;
    }
    redoStack.push(captureState());
    const prev = undoStack.pop();
    restoreState(prev);
    showToast('↶ تم التراجع عن آخر تعديل (Ctrl+Z)');
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(captureState());
    const next = redoStack.pop();
    restoreState(next);
    showToast('↷ تمت الإعادة (Ctrl+Y)');
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' && selectedObject) {
        deleteSelected();
      }
    });
  }

  /* ──────────────────────────────────────────────────────────────
     6. Uploading STL / OBJ / 3MF / SVG + Auto Multi-Plate Allocation
     ────────────────────────────────────────────────────────────── */
  async function handleFilesUpload(fileList) {
    if (!fileList || !fileList.length) return;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        showToast(`جاري قراءة وفحص الملف: ${file.name}...`);
        const loaded = await window.MJLoaders.loadModelFile(file);

        // Determine if current plate is full or if multiple files need separate plates
        let targetPlate = 0;
        if (sceneObjects.length > 0 && i > 0) {
          targetPlate = Math.min(15, sceneObjects.length);
        }

        // Check if object exceeds single plate dimensions -> auto open extra plates in square grid!
        const box = new THREE.Box3().setFromObject(loaded);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x > currentPrinter.w || size.z > currentPrinter.d) {
          const neededCols = Math.ceil(size.x / currentPrinter.w);
          const neededRows = Math.ceil(size.z / currentPrinter.d);
          const neededPlates = Math.max(plateCount, neededCols * neededRows);
          if (neededPlates > plateCount) {
            rebuildBuildPlates(neededPlates);
            showToast(`المجسم كبير (${size.x.toFixed(0)}×${size.z.toFixed(0)} مم)؛ تم فتح ${neededPlates} لوحات بناء بتوزيع مربع تلقائياً!`);
          }
        }

        registerSceneObject(loaded, file.name, targetPlate);
        showToast(`تم رفع "${file.name}" بنجاح!`);
      } catch (err) {
        showToast(err.message || 'تعذر قراءة الملف', true);
      }
    }
    document.getElementById('file-upload-input').value = '';
  }

  /* ──────────────────────────────────────────────────────────────
     7. Arabic 3D Text (48 Fonts) & Primitives Menu
     ────────────────────────────────────────────────────────────── */
  function populateArabicFontSelects() {
    const fonts = window.MJCatalog.ARABIC_FONTS;
    const html = fonts
      .map((f) => `<option value="${f.name}" style="font-family:'${f.name}',sans-serif">${f.label}</option>`)
      .join('');
    document.getElementById('ar-font-select').innerHTML = html;
    document.getElementById('kc-font-select').innerHTML = html;
  }

  function updateArabicTextPreview() {
    const txt = document.getElementById('ar-text-input').value || 'مجسمات';
    const font = document.getElementById('ar-font-select').value || 'Cairo';
    const box = document.getElementById('ar-font-preview-box');
    box.style.fontFamily = `"${font}", "Cairo", sans-serif`;
    box.textContent = txt;
  }

  async function addArabicTextToScene() {
    const text = document.getElementById('ar-text-input').value.trim() || 'مجسمات';
    const fontFamily = document.getElementById('ar-font-select').value || 'Cairo';
    const sizeMm = Number(document.getElementById('ar-text-size').value || 28);
    const depthMm = Number(document.getElementById('ar-text-depth').value || 4);
    const color = document.getElementById('ar-text-color').value || '#10b981';
    const mode = document.querySelector('input[name="ar-text-mode"]:checked')?.value || 'standalone';

    const btn = document.getElementById('ar-text-submit-btn');
    btn.disabled = true;
    btn.textContent = 'جاري تشكيل الحروف العربية ثلاثية الأبعاد...';

    try {
      const targetBefore = selectedObject;
      const geom = await window.MJEngine.createArabicTextGeometry({
        text,
        fontFamily,
        sizeMm,
        depthMm
      });
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.12 })
      );
      mesh.userData.isArabicText = true;
      mesh.userData.originalGeometry = geom.clone();

      registerSceneObject(mesh, `نص: ${text}`, targetBefore ? targetBefore.userData.plateIndex || 0 : 0);
      closeModal('arabic-text-modal');

      if ((mode === 'emboss' || mode === 'engrave') && targetBefore) {
        window.MJEngine.stickMeshToTarget(mesh, targetBefore, 'front', mode);
        showToast(mode === 'engrave'
          ? 'تم حفر النص العربي على سطح المجسم! يمكنك تغيير الجهة من زر (لصق / حفر بالسطح)'
          : 'تم لصق وتشكيل النص العربي على سطح المجسم!');
      } else {
        showToast(`تمت إضافة النص العربي "${text}" بخط ${fontFamily}`);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'إضافة النص الثلاثي الأبعاد الآن';
    }
  }

  function populatePrimitivesMenu() {
    const basicEl = document.getElementById('primitive-list-basic');
    const calibEl = document.getElementById('primitive-list-calib');
    const list = window.MJCatalog.PRIMITIVES;

    basicEl.innerHTML = list
      .filter((p) => p.group === 'basic')
      .map((p) => `
        <div class="primitive-item" onclick="MJApp.addPrimitive('${p.id}')">
          <i class="fa-solid ${p.icon}"></i>
          <span>${p.nameEn} — ${p.nameAr.split('(')[0]}</span>
        </div>
      `).join('');

    calibEl.innerHTML = list
      .filter((p) => p.group === 'calib')
      .map((p) => `
        <div class="primitive-item" onclick="MJApp.addPrimitive('${p.id}')">
          <i class="fa-solid ${p.icon}"></i>
          <span>${p.nameEn}</span>
        </div>
      `).join('');
  }

  function togglePrimitiveMenu() {
    document.getElementById('primitive-menu').classList.toggle('hidden');
  }

  function addPrimitive(typeId) {
    document.getElementById('primitive-menu').classList.add('hidden');
    const mode = document.getElementById('primitive-add-mode').value || 'part';
    const prevTarget = selectedObject;

    const item = window.MJCatalog.PRIMITIVES.find((p) => p.id === typeId);
    const geom = window.MJEngine.createPrimitiveGeometry(typeId);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: '#00c853', roughness: 0.35, metalness: 0.1 })
    );
    mesh.userData.primitiveType = typeId;
    mesh.userData.originalGeometry = geom.clone();

    registerSceneObject(mesh, item ? item.nameAr : typeId, prevTarget ? prevTarget.userData.plateIndex || 0 : 0);

    if ((mode === 'emboss' || mode === 'engrave') && prevTarget) {
      window.MJEngine.stickMeshToTarget(mesh, prevTarget, 'top', mode);
      showToast(mode === 'engrave' ? 'تم حفر الشكل داخل المجسم!' : 'تم لصق الشكل على المجسم!');
    } else {
      showToast(`تمت إضافة ${item ? item.nameEn : typeId} إلى لوحة البناء`);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     8. Stick / Wrap onto Target Surface ("لصق وتشكيل على سطح المجسم أو حفر")
     ────────────────────────────────────────────────────────────── */
  let lastStickFace = 'front';

  function openStickSurfaceModal() {
    if (sceneObjects.length < 2) {
      showToast('أضف مجسماً أساسياً ثم أضف نصاً عربياً أو شكلاً للصقه أو حفره على سطحه!', true);
      return;
    }
    const srcSel = document.getElementById('stick-source-select');
    const tgtSel = document.getElementById('stick-target-select');

    srcSel.innerHTML = sceneObjects
      .map((o, idx) => `<option value="${idx}" ${o === selectedObject ? 'selected' : ''}>${o.name} (#${idx + 1})</option>`)
      .join('');

    const defaultTargetIdx = sceneObjects.findIndex((o) => o !== selectedObject);
    tgtSel.innerHTML = sceneObjects
      .map((o, idx) => `<option value="${idx}" ${idx === defaultTargetIdx ? 'selected' : ''}>${o.name} (#${idx + 1})</option>`)
      .join('');

    openModal('stick-surface-modal');
  }

  function getStickCustomOpts(extra = {}) {
    const offsetU = Number(document.getElementById('stick-offset-u')?.value || 0) / 100;
    const offsetV = Number(document.getElementById('stick-offset-v')?.value || 0) / 100;
    const scalePct = Number(document.getElementById('stick-scale-pct')?.value || 80) / 100;
    const depthMm = Number(document.getElementById('stick-depth-mm')?.value || 2.2);

    const uValEl = document.getElementById('stick-u-val');
    const vValEl = document.getElementById('stick-v-val');
    const scValEl = document.getElementById('stick-scale-val');
    const dpValEl = document.getElementById('stick-depth-val');
    if (uValEl) uValEl.textContent = `${Math.round(offsetU * 100)}%`;
    if (vValEl) vValEl.textContent = `${Math.round(offsetV * 100)}%`;
    if (scValEl) scValEl.textContent = `${Math.round(scalePct * 100)}%`;
    if (dpValEl) dpValEl.textContent = `${depthMm.toFixed(1)} مم`;

    return {
      offsetU,
      offsetV,
      scalePct,
      depthMm,
      ...extra
    };
  }

  function resetStickSliders() {
    const uEl = document.getElementById('stick-offset-u');
    const vEl = document.getElementById('stick-offset-v');
    const scEl = document.getElementById('stick-scale-pct');
    const dpEl = document.getElementById('stick-depth-mm');
    if (uEl) uEl.value = 0;
    if (vEl) vEl.value = 0;
    if (scEl) scEl.value = 80;
    if (dpEl) dpEl.value = 2.2;
    previewStickSliders();
  }

  function previewStickSliders() {
    const opts = getStickCustomOpts();
    const srcIdx = Number(document.getElementById('stick-source-select')?.value || 0);
    const tgtIdx = Number(document.getElementById('stick-target-select')?.value || 0);
    const mode = document.querySelector('input[name="stick-op-mode"]:checked')?.value || 'emboss';
    const srcObj = sceneObjects[srcIdx];
    const tgtObj = sceneObjects[tgtIdx];
    if (!srcObj || !tgtObj || srcObj === tgtObj) return;
    window.MJEngine.stickMeshToTarget(srcObj, tgtObj, lastStickFace || 'front', mode, opts);
    updateInspectorValues();
  }

  function executeStickToSurface(face) {
    lastStickFace = face || 'front';
    const srcIdx = Number(document.getElementById('stick-source-select').value || 0);
    const tgtIdx = Number(document.getElementById('stick-target-select').value || 0);
    const mode = document.querySelector('input[name="stick-op-mode"]:checked')?.value || 'emboss';

    const srcObj = sceneObjects[srcIdx];
    const tgtObj = sceneObjects[tgtIdx];
    if (!srcObj || !tgtObj || srcObj === tgtObj) {
      showToast('يرجى اختيار قطعتين مختلفتين (النص/الشكل والمجسم الهدف)', true);
      return;
    }

    saveUndoSnapshot();
    const opts = getStickCustomOpts();
    window.MJEngine.stickMeshToTarget(srcObj, tgtObj, face, mode, opts);
    selectObject(srcObj);
    showToast(mode === 'engrave'
      ? `تم حفر "${srcObj.name}" داخل معدن/جسم "${tgtObj.name}" (${face}) بنجاح!`
      : `تم لصق وتشكيل "${srcObj.name}" ليأخذ تطعجات وانحناءات "${tgtObj.name}" (${face})!`);
  }

  function startInteractiveSurfacePick() {
    closeModal('stick-surface-modal');
    interactiveSurfacePick = true;
    document.getElementById('surface-pick-banner').classList.remove('hidden');
    showToast('انقر الآن بالماوس في المكان الذي تريده بالضبط على المجسم الأساسي للصق أو الحفر فيه مباشرة!');
  }

  function cancelSurfacePick() {
    interactiveSurfacePick = false;
    document.getElementById('surface-pick-banner').classList.add('hidden');
  }

  /* ──────────────────────────────────────────────────────────────
     9. Keychain, Charger Tag & Bag Tag Maker (Contour 3-Layer, Rim, Bubble & Monogram)
     ────────────────────────────────────────────────────────────── */
  function setKeychainCategory(cat) {
    currentKeychainCat = cat;
    ['keychain', 'charger', 'bag'].forEach((c) => {
      const btn = document.getElementById(`kc-tab-${c}`);
      if (c === cat) {
        btn.className = 'py-1.5 rounded-lg font-bold bg-pink-600 text-white';
      } else {
        btn.className = 'py-1.5 rounded-lg font-bold text-gray-300 hover:text-white';
      }
    });
    renderKeychainGallery();
  }

  function renderKeychainGallery() {
    const grid = document.getElementById('kc-templates-grid');
    if (!grid) return;
    const name = document.getElementById('kc-name-input')?.value || 'فيصل';
    const font = document.getElementById('kc-font-select')?.value || 'Cairo';
    const templates = window.MJCatalog.KEYCHAIN_TEMPLATES.filter((t) => t.category === currentKeychainCat);
    const safeName = window.MJSecurity.sanitizeText(name);
    const firstChar = window.MJSecurity.sanitizeText((name.trim()[0] || 'N').toUpperCase());

    grid.innerHTML = templates.map((t) => {
      const midCol = t.midColor || '#111827';
      let badgeLabel = '3 طبقات كنتور';
      let previewHtml = '';

      if (t.style === 'contour_3layer') {
        badgeLabel = '3 طبقات (مثل فيصل)';
        previewHtml = `
          <div class="py-3 px-2 rounded-2xl text-center my-1 flex items-center justify-center relative overflow-hidden bg-[#141619] border border-white/10">
            <span class="w-3.5 h-3.5 rounded-full border-2 mr-1 inline-block shrink-0" style="border-color:${t.baseColor}; background:#141619"></span>
            <span style="
              font-family:'${font}',sans-serif;
              font-size:21px;
              font-weight:900;
              color:${t.textColor};
              -webkit-text-stroke: 2.5px ${midCol};
              paint-order: stroke fill;
              filter: drop-shadow(0 0 0 ${t.baseColor}) drop-shadow(0 0 4px ${t.baseColor});
              background:${t.baseColor};
              padding: 2px 12px;
              border-radius: 999px;
            ">${safeName}</span>
          </div>
        `;
      } else if (t.style === 'contour_rim') {
        badgeLabel = 'إطار بارز (مثل علي)';
        previewHtml = `
          <div class="py-3 px-2 rounded-2xl text-center my-1 flex items-center justify-center bg-[#141619] border border-white/10">
            <span class="w-3.5 h-3.5 rounded-full border-2 mr-1 inline-block shrink-0" style="border-color:${midCol}"></span>
            <span style="
              font-family:'${font}',sans-serif;
              font-size:22px;
              font-weight:900;
              color:${t.baseColor};
              -webkit-text-stroke: 2.2px ${midCol};
              paint-order: stroke fill;
            ">${safeName}</span>
          </div>
        `;
      } else if (t.style === 'contour_bubble') {
        badgeLabel = 'فقاعي مجسم (Bubble)';
        previewHtml = `
          <div class="py-3 px-2 rounded-2xl text-center my-1 flex items-center justify-center bg-[#141619] border border-white/10">
            <span class="w-4 h-4 rounded-full border-4 mr-1 inline-block shrink-0" style="border-color:${t.baseColor}"></span>
            <span style="
              font-family:'${font}',sans-serif;
              font-size:20px;
              font-weight:900;
              color:${t.textColor};
              background:${t.baseColor};
              padding: 3px 14px;
              border-radius: 999px;
              box-shadow: 0 3px 0 rgba(0,0,0,0.45);
            ">${safeName}</span>
          </div>
        `;
      } else {
        badgeLabel = 'حرف كبير + اسم';
        previewHtml = `
          <div class="py-2.5 px-2 rounded-2xl text-center my-1 flex items-center justify-center relative bg-[#141619] border border-white/10 h-16">
            <span style="font-size:40px; font-weight:900; color:${t.baseColor}; opacity:0.92; line-height:1;">${firstChar}</span>
            <span class="absolute px-2.5 py-0.5 rounded-full shadow" style="
              background:${midCol};
              color:${t.textColor};
              font-family:'${font}',sans-serif;
              font-size:14px;
              font-weight:900;
            ">${safeName}</span>
          </div>
        `;
      }

      return `
        <div onclick="MJApp.buildKeychainFromTemplate('${t.id}')"
             class="bg-[#1b1d21] hover:bg-[#282c34] border border-[#383d47] hover:border-pink-500 rounded-xl p-3 cursor-pointer transition flex flex-col justify-between">
          <div class="flex items-center justify-between text-[10px] text-gray-300 mb-1 gap-1">
            <span class="font-bold truncate">${t.nameAr}</span>
            <span class="px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300 whitespace-nowrap">${badgeLabel}</span>
          </div>
          ${previewHtml}
          <div class="mt-1.5 flex items-center justify-between text-[10px]">
            <div class="flex items-center gap-1">
              <span class="w-3 h-3 rounded-full inline-block border border-white/30" style="background:${t.baseColor}"></span>
              <span class="w-3 h-3 rounded-full inline-block border border-white/30" style="background:${midCol}"></span>
              <span class="w-3 h-3 rounded-full inline-block border border-white/30" style="background:${t.textColor}"></span>
            </div>
            <span class="text-emerald-400 font-bold flex items-center gap-1">
              <i class="fa-solid fa-plus-circle"></i>
              <span>توليد 3D</span>
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function buildKeychainFromTemplate(templateId) {
    const template = window.MJCatalog.KEYCHAIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    // Sync color pickers to the selected template's signature colors if user clicks directly
    const text = document.getElementById('kc-name-input').value.trim() || 'فيصل';
    const fontFamily = document.getElementById('kc-font-select').value || 'Cairo';
    const baseThickness = Number(document.getElementById('kc-base-thick').value || 3.4);
    const textHeight = Number(document.getElementById('kc-text-height').value || 2.2);

    const customBaseColor = template.baseColor || document.getElementById('kc-base-color').value;
    const customMidColor = template.midColor || document.getElementById('kc-mid-color')?.value || '#111827';
    const customTextColor = template.textColor || document.getElementById('kc-text-color').value;

    document.getElementById('kc-base-color').value = customBaseColor;
    if (document.getElementById('kc-mid-color')) document.getElementById('kc-mid-color').value = customMidColor;
    document.getElementById('kc-text-color').value = customTextColor;

    showToast('جاري نحت الميدالية الكنتورية ثلاثية الأبعاد بطبقاتها وحلقة التعليق...');
    const grp = await window.MJEngine.createKeychainGroup({
      text,
      fontFamily,
      template,
      baseThickness,
      textHeight,
      customBaseColor,
      customMidColor,
      customTextColor
    });

    registerSceneObject(grp, `${template.nameAr} (${text})`, 0);
    closeModal('keychain-modal');
    showToast(`تم إنشاء "${template.nameAr}" بالاسم (${text})! يمكنك فصل كل طبقة ولون في لوحة مستقلة بزر (فصل الألوان)`);
  }

  /* ──────────────────────────────────────────────────────────────
     10. Universal File Converter (PNG/JPG <-> SVG <-> STL/OBJ/3MF)
     ────────────────────────────────────────────────────────────── */
  function handleConverterFileSelect(file) {
    if (!file) return;
    converterSelectedFile = file;
    document.getElementById('conv-file-label').innerHTML =
      `<span class="text-emerald-400 font-bold">الملف المحدد: ${window.MJSecurity.sanitizeText(file.name)} (${(file.size / 1024).toFixed(1)} KB)</span>`;
  }

  async function runFileConversion(addToScene = false) {
    if (!converterSelectedFile) {
      showToast('اختر ملفاً أولاً لتحويل صيغته', true);
      return;
    }
    const check = await window.MJSecurity.validateFile(converterSelectedFile);
    if (!check.valid) {
      showToast(check.reason, true);
      return;
    }

    const srcExt = check.ext;
    const targetFmt = document.getElementById('conv-target-format').value || 'svg';
    const depthMm = Number(document.getElementById('conv-extrude-depth').value || 4);
    const threshold = Number(document.getElementById('conv-threshold').value || 135);
    const baseName = converterSelectedFile.name.replace(/\.[^.]+$/, '');

    try {
      showToast(`جاري تحويل ${srcExt.toUpperCase()} إلى ${targetFmt.toUpperCase()}...`);

      // Case A: Image (PNG/JPG/WEBP) -> SVG or 3D
      if (['png', 'jpg', 'jpeg', 'webp'].includes(srcExt)) {
        const { svgString, shapes } = await window.MJEngine.imageFileToSVGAndShapes(converterSelectedFile, threshold);

        if (targetFmt === 'svg' && !addToScene) {
          downloadBlob(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`);
          showToast('تم تحويل الصورة إلى ملف فيكتور SVG وتنزيله بنجاح!');
          return;
        }

        if (!shapes.length) {
          showToast('لم يتم العثور على حواف واضحة في الصورة؛ جرب تحريك مؤشر الحساسية (Threshold)', true);
          return;
        }

        const geom = new THREE.ExtrudeGeometry(shapes, { depth: depthMm, bevelEnabled: false, curveSegments: 6 });
        geom.rotateX(-Math.PI / 2);
        window.MJLoaders.centerAndGroundGeometry(geom);
        const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.35 }));

        if (addToScene) {
          registerSceneObject(mesh, `محول من صورة: ${baseName}`, 0);
          closeModal('converter-modal');
          showToast('تم تحويل الصورة إلى مجسم ثلاثي الأبعاد وإضافته للوحة البناء!');
          return;
        }

        await exportObjectList([mesh], targetFmt, baseName);
        return;
      }

      // Case B: 3D/SVG File -> Any Target Format
      const loadedObj = await window.MJLoaders.loadModelFile(converterSelectedFile);
      if (addToScene) {
        registerSceneObject(loadedObj, converterSelectedFile.name, 0);
        closeModal('converter-modal');
        showToast('تمت إضافة المجسم المحول إلى لوحة البناء!');
        return;
      }

      await exportObjectList([loadedObj], targetFmt, baseName);
    } catch (err) {
      showToast(err.message || 'فشل التحويل', true);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     11. 3D QR Code Maker (URL, WhatsApp, Wi-Fi, Text)
     ────────────────────────────────────────────────────────────── */
  function setQRType(type) {
    currentQRType = type;
    ['url', 'whatsapp', 'wifi', 'text'].forEach((t) => {
      const btn = document.getElementById(`qr-type-${t}`);
      btn.className = t === type
        ? 'py-1.5 rounded-lg font-bold bg-purple-600 text-white'
        : 'py-1.5 rounded-lg font-bold text-gray-300';
    });

    const pLabel = document.getElementById('qr-primary-label');
    const pInput = document.getElementById('qr-primary-input');
    const sWrap = document.getElementById('qr-secondary-wrap');
    const sLabel = document.getElementById('qr-secondary-label');

    if (type === 'url') {
      pLabel.textContent = 'الرابط (URL):';
      pInput.placeholder = 'https://...';
      sWrap.classList.add('hidden');
    } else if (type === 'whatsapp') {
      pLabel.textContent = 'رقم الواتساب (مع مفتاح الدولة مثل 9665...):';
      pInput.placeholder = '966500000000';
      pInput.value = '';
      sWrap.classList.remove('hidden');
      sLabel.textContent = 'الرسالة التلقائية (اختياري):';
    } else if (type === 'wifi') {
      pLabel.textContent = 'اسم شبكة الواي فاي (SSID):';
      pInput.placeholder = 'Home_WiFi';
      pInput.value = '';
      sWrap.classList.remove('hidden');
      sLabel.textContent = 'كلمة مرور الشبكة (Password):';
    } else {
      pLabel.textContent = 'النص الحر:';
      pInput.placeholder = 'اكتب أي نص...';
      sWrap.classList.add('hidden');
    }
  }

  function generate3DQR() {
    const primary = document.getElementById('qr-primary-input').value.trim();
    const secondary = document.getElementById('qr-secondary-input').value.trim();
    const sizeMm = Number(document.getElementById('qr-size-mm').value || 50);
    const moduleHeight = Number(document.getElementById('qr-module-height').value || 1.8);
    const baseThickness = Number(document.getElementById('qr-base-thick').value || 3.0);
    const baseColor = document.getElementById('qr-base-color').value || '#ffffff';
    const moduleColor = document.getElementById('qr-module-color').value || '#111827';

    const qrGroup = window.MJEngine.create3DQRGroup({
      type: currentQRType,
      primary,
      secondary,
      sizeMm,
      moduleHeight,
      baseThickness,
      baseColor,
      moduleColor
    });

    registerSceneObject(qrGroup, `باركود QR 3D (${currentQRType})`, 0);
    closeModal('qr-modal');
    showToast('تم إنشاء مجسم QR ثلاثي الأبعاد! يمكنك فصل ألوان القاعدة والباركود بزر (فصل الألوان)');
  }

  /* ──────────────────────────────────────────────────────────────
     12. Split Colors to Separate Build Plates ("زر فصل الألوان")
     ────────────────────────────────────────────────────────────── */
  function splitColorsToPlates() {
    if (!sceneObjects.length) {
      showToast('لا توجد مجسمات في المشهد لفصل ألوانها', true);
      return;
    }

    // Collect all individual meshes grouped by their material hex color
    const colorMap = new Map();
    sceneObjects.forEach((root) => {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const hex = m.material && m.material.color ? '#' + m.material.color.getHexString() : '#10b981';
        if (!colorMap.has(hex)) colorMap.set(hex, []);
        colorMap.get(hex).push(m);
      });
    });

    if (colorMap.size <= 1) {
      showToast('المشهد يحتوي على لون واحد فقط حالياً. أضف ميدالية أو QR أو غيّر ألوان القطع لفصلها!', true);
      return;
    }

    saveUndoSnapshot();
    transformControl.detach();

    const newObjects = [];
    let plateIdx = 0;
    rebuildBuildPlates(colorMap.size);

    for (const [hex, meshes] of colorMap.entries()) {
      meshes.forEach((m) => {
        const clonedGeom = m.geometry.clone();
        const clonedMesh = new THREE.Mesh(
          clonedGeom,
          new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35, metalness: 0.1 })
        );
        clonedMesh.name = `${m.name || 'قطعة'} (لون ${hex})`;
        clonedMesh.userData.plateIndex = plateIdx;
        newObjects.push({ mesh: clonedMesh, plateIdx });
      });
      plateIdx++;
    }

    while (objectsGroup.children.length > 0) {
      objectsGroup.remove(objectsGroup.children[0]);
    }
    sceneObjects = [];

    newObjects.forEach(({ mesh, plateIdx: pIdx }) => {
      const c = plateCenters[pIdx] || { x: 0, z: 0 };
      mesh.position.set(c.x, 0, c.z);
      objectsGroup.add(mesh);
      sceneObjects.push(mesh);
      snapObjectToBed(mesh);
    });

    selectedObject = sceneObjects[0] || null;
    if (selectedObject && !isPreviewMode) transformControl.attach(selectedObject);
    refreshObjectsListUI();
    updateInspectorValues();
    showToast(`🎨 تم فصل ${colorMap.size} ألوان وتوزيع كل لون في لوحة بناء مستقلة بتوزيع مربع!`);
  }

  /* ──────────────────────────────────────────────────────────────
     13. Print Check & Slicer Settings Advisor ("✔ فحص الطباعة الشامل")
     ────────────────────────────────────────────────────────────── */
  function updateQuickPrintSummary() {
    const rep = window.MJEngine.analyzePrintability(sceneObjects, currentPrinter);
    const supEl = document.getElementById('quick-support-txt');
    const estEl = document.getElementById('quick-est-txt');
    if (!rep || rep.empty) {
      supEl.textContent = 'لا توجد مجسمات';
      estEl.textContent = '—';
      return;
    }
    supEl.innerHTML = rep.needsSupport
      ? `<span class="text-amber-400 font-bold">يحتاج دعامات (${rep.supportWhere})</span>`
      : `<span class="text-emerald-400 font-bold">لا يحتاج دعامات ✔</span>`;
    estEl.textContent = `${rep.filamentGrams} جم • ~${rep.estTimeText}`;
  }

  function runPrintCheck() {
    const rep = window.MJEngine.analyzePrintability(sceneObjects, currentPrinter);
    const body = document.getElementById('print-check-body');

    if (!rep || rep.empty) {
      body.innerHTML = `<div class="bg-[#1b1d21] p-4 rounded-xl text-center text-gray-400">أضف أو ارفع مجسماً أولاً لفحصه وإظهار نصائح الطباعة.</div>`;
      openModal('print-check-modal');
      return;
    }

    body.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div class="bg-[#1b1d21] border border-[#383d47] rounded-xl p-3">
          <div class="text-gray-400 text-[11px]">الطابعة المحددة</div>
          <div class="font-extrabold text-white mt-0.5">${rep.printerName}</div>
        </div>
        <div class="bg-[#1b1d21] border border-[#383d47] rounded-xl p-3">
          <div class="text-gray-400 text-[11px]">الأبعاد الكلية</div>
          <div class="font-extrabold text-emerald-400 mt-0.5">${rep.dimensions.x} × ${rep.dimensions.z} × ${rep.dimensions.y} مم</div>
        </div>
        <div class="bg-[#1b1d21] border border-[#383d47] rounded-xl p-3">
          <div class="text-gray-400 text-[11px]">الوزن والوقت التقريبي</div>
          <div class="font-extrabold text-amber-400 mt-0.5">${rep.filamentGrams} جم (${rep.estTimeText})</div>
        </div>
      </div>

      <div class="bg-[#1b1d21] border ${rep.fitsPlate ? 'border-emerald-500/40' : 'border-rose-500/50'} rounded-xl p-3.5 space-y-2">
        <div class="font-extrabold text-sm ${rep.fitsPlate ? 'text-emerald-400' : 'text-rose-400'}">
          ${rep.fitsPlate ? '✔ المجسم مناسب تماماً لأبعاد لوحة البناء' : '⚠ تنبيه: المجسم أكبر من لوحة بناء واحدة (استخدم + لإضافة لوحات أو صغّر الحجم)'}
        </div>
        <div>• <strong>الدعامات (Supports):</strong> ${rep.needsSupport
          ? `<span class="text-amber-300 font-bold">نعم، المجسم يحتاج دعامات في (${rep.supportWhere}) — النوع المقترح: ${rep.supportType}</span>`
          : `<span class="text-emerald-300 font-bold">لا يحتاج إلى دعامات (زوايا الميل آمنة أقل من 45°)</span>`}
        </div>
        <div>• <strong>حافة التثبيت (Brim):</strong> ${rep.brimAdvice}</div>
        ${rep.isFloating ? `<div class="text-rose-400 font-bold">• ⚠ المجسم مرتفع عن اللوحة! اضغط زر المغناطيس 🧲 لتثبيته على السطح قبل التصدير.</div>` : ''}
      </div>

      <div class="bg-[#1b1d21] border border-[#383d47] rounded-xl p-3.5 space-y-1.5">
        <div class="font-extrabold text-emerald-400 mb-1">إعدادات السلايسر الموصى بها لطباعة مثالية:</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>• <strong>ارتفاع الطبقة (Layer Height):</strong> ${rep.layerHeight}</div>
          <div>• <strong>نسبة الحشو (Infill):</strong> ${rep.infill}</div>
          <div>• <strong>عدد الجدران (Walls):</strong> ${rep.wallCount}</div>
          <div>• <strong>سرعة الطباعة المقترحة:</strong> ${rep.printSpeed}</div>
        </div>
        <div class="pt-1 text-gray-300">• <strong>درجات الحرارة:</strong> ${rep.temps}</div>
      </div>
    `;
    openModal('print-check-modal');
    updateQuickPrintSummary();
  }

  /* ──────────────────────────────────────────────────────────────
     14. Exporting Files (STL, 3MF, OBJ, SVG) + Coin Deduction (2 Coins)
     ────────────────────────────────────────────────────────────── */
  async function exportScene(format) {
    if (!sceneObjects.length) {
      showToast('لا توجد مجسمات في لوحة البناء لتصديرها!', true);
      return;
    }

    const user = window.MJ.getCurrentUser();
    if (!user) {
      closeModal('export-modal');
      openModal('auth-modal');
      showToast('سجّل دخولك أولاً لتحصل على 6 كوينز مجانية وتصدّر ملفاتك!', true);
      return;
    }

    const spendRes = await window.MJ.spendCoins(format.toUpperCase());
    if (!spendRes.success) {
      closeModal('export-modal');
      if (spendRes.needTopup) {
        openModal('pricing-modal');
      }
      showToast(spendRes.error || 'رصيد الكوينز غير كافٍ', true);
      return;
    }

    userProfile = spendRes.data;
    updateUserTopBar();

    await exportObjectList(sceneObjects, format, 'mojassamat_model');
    closeModal('export-modal');
    showToast(`تم تصدير الملف بصيغة ${format.toUpperCase()} بنجاح! (الرصيد المتبقي: ${userProfile.coins} كوينز)`);
  }

  async function exportObjectList(objs, format, baseName) {
    const fmt = format.toLowerCase();
    if (fmt === 'stl') {
      const blob = window.MJEngine.exportToSTL(objs);
      downloadBlob(blob, `${baseName}.stl`);
    } else if (fmt === 'obj') {
      const blob = window.MJEngine.exportToOBJ(objs);
      downloadBlob(blob, `${baseName}.obj`);
    } else if (fmt === '3mf') {
      const blob = await window.MJEngine.exportTo3MF(objs);
      downloadBlob(blob, `${baseName}.3mf`);
    } else if (fmt === 'svg') {
      const blob = window.MJEngine.exportToSVGProjection(objs);
      downloadBlob(blob, `${baseName}.svg`);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  /* ──────────────────────────────────────────────────────────────
     15. Viewport Raycast Selection & Interactive Surface Stick
     ────────────────────────────────────────────────────────────── */
  function setupViewportInteraction() {
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0, downY = 0;

    dom.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    dom.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(objectsGroup.children, true);

      if (hits.length > 0) {
        let hitObj = hits[0].object;
        while (hitObj.parent && hitObj.parent !== objectsGroup) {
          hitObj = hitObj.parent;
        }

        // If Interactive Surface Pick is active, stick selectedObject onto hitObj at the EXACT clicked point & normal!
        if (interactiveSurfacePick && selectedObject && hitObj !== selectedObject) {
          const n = hits[0].face ? hits[0].face.normal.clone() : new THREE.Vector3(0, 0, 1);
          n.transformDirection(hits[0].object.matrixWorld);
          let face = 'front';
          if (Math.abs(n.y) > Math.abs(n.x) && Math.abs(n.y) > Math.abs(n.z)) {
            face = n.y > 0 ? 'top' : 'bottom';
          } else if (Math.abs(n.x) > Math.abs(n.z)) {
            face = n.x > 0 ? 'right' : 'left';
          } else {
            face = n.z > 0 ? 'front' : 'back';
          }
          lastStickFace = face;
          const mode = document.querySelector('input[name="stick-op-mode"]:checked')?.value || 'emboss';
          const opts = getStickCustomOpts({ anchorPoint: hits[0].point.clone() });
          saveUndoSnapshot();
          window.MJEngine.stickMeshToTarget(selectedObject, hitObj, face, mode, opts);
          cancelSurfacePick();
          updateInspectorValues();
          showToast(mode === 'engrave'
            ? `تم حفر "${selectedObject.name}" في الموضع المحدد داخل "${hitObj.name}" (${face})!`
            : `تم لصق "${selectedObject.name}" في الموضع المحدد ليأخذ تطعجات "${hitObj.name}" (${face})!`);
          return;
        }

        selectObject(hitObj);
      }
    });
  }

  function setCameraView(view) {
    const dist = 340;
    orbit.target.set(0, 20, 0);
    if (view === 'top') camera.position.set(0, dist * 1.2, 0.01);
    else if (view === 'front') camera.position.set(0, 40, dist);
    else if (view === 'side') camera.position.set(dist, 40, 0);
    else camera.position.set(0, 260, 330);
    orbit.update();
  }

  function populatePrinterSelect() {
    const sel = document.getElementById('printer-select');
    sel.innerHTML = window.MJCatalog.PRINTERS.map(
      (p) => `<option value="${p.id}">${p.name} (${p.w}×${p.d}×${p.h} مم)</option>`
    ).join('');
  }

  function changePrinter(printerId) {
    const found = window.MJCatalog.PRINTERS.find((p) => p.id === printerId);
    if (!found) return;
    currentPrinter = found;
    document.getElementById('plate-size-badge').textContent = `${found.w}×${found.d}×${found.h}`;
    document.getElementById('printer-plate-label').textContent = found.plateLabel;
    rebuildBuildPlates(plateCount);
    updateQuickPrintSummary();
    showToast(`تم تغيير لوحة البناء إلى ${found.name}`);
  }

  function refreshObjectsListUI() {
    const listEl = document.getElementById('objects-list');
    document.getElementById('objects-count-badge').textContent = String(sceneObjects.length);

    if (!sceneObjects.length) {
      listEl.innerHTML = `<div class="text-[11px] text-gray-500 text-center py-4">لا توجد مجسمات بعد — ارفع ملفاً أو أضف نصاً عربياً أو شكلاً</div>`;
      return;
    }

    listEl.innerHTML = sceneObjects.map((obj, idx) => {
      const isSel = obj === selectedObject;
      let hex = '#10b981';
      obj.traverse((m) => {
        if (m.isMesh && m.material && m.material.color) hex = '#' + m.material.color.getHexString();
      });
      const pNum = String((obj.userData.plateIndex || 0) + 1).padStart(2, '0');
      return `
        <div onclick="MJApp.selectObjectByIndex(${idx})"
             class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer border text-xs transition ${
               isSel ? 'bg-emerald-950/50 border-emerald-500 text-white' : 'bg-[#1b1d21] border-[#323640] text-gray-300 hover:border-gray-500'
             }">
          <div class="flex items-center gap-2 truncate">
            <span class="w-3 h-3 rounded-full inline-block border border-white/30" style="background:${hex}"></span>
            <span class="font-semibold truncate">${window.MJSecurity.sanitizeText(obj.name || 'مجسم')}</span>
          </div>
          <span class="text-[10px] font-mono text-emerald-400">P${pNum}</span>
        </div>
      `;
    }).join('');
  }

  function selectObjectByIndex(idx) {
    if (sceneObjects[idx]) selectObject(sceneObjects[idx]);
  }

  /* ──────────────────────────────────────────────────────────────
     16. Backend Config, Auth, Loyalty, Pricing, Payments & Legal
     ────────────────────────────────────────────────────────────── */
  async function loadBackendConfig() {
    const res = await window.MJ.getPublicConfig();
    if (res && res.success && res.data) {
      siteSettings = res.data.settings || {};
      packagesList = res.data.packages || [];
      applyPublicSettingsUI();
      renderPackagesUI();
    }
  }

  function applyPublicSettingsUI() {
    if (siteSettings.announcementAr) {
      document.getElementById('announcement-text').textContent =
        currentLang === 'ar' ? siteSettings.announcementAr : (siteSettings.announcementEn || siteSettings.announcementAr);
    }
    if (siteSettings.contactEmail) {
      document.getElementById('footer-email-text').textContent = siteSettings.contactEmail;
      document.getElementById('footer-email-link').href = `mailto:${siteSettings.contactEmail}`;
    }
    if (siteSettings.whatsappNumber) {
      document.getElementById('footer-wa-link').href = `https://wa.me/${siteSettings.whatsappNumber.replace(/[^0-9]/g, '')}`;
    }
    if (siteSettings.freelanceDocNumber) {
      document.getElementById('footer-freelance-doc').textContent = `(وثيقة عمل حر: ${siteSettings.freelanceDocNumber})`;
    }
  }

  function applyUserSession(data) {
    userProfile = data.profile;
    if (data.settings) siteSettings = data.settings;
    if (data.packages) packagesList = data.packages;

    updateUserTopBar();
    renderPackagesUI();

    if (data.referrals) {
      document.getElementById('ref-month-count').textContent = data.referrals.thisMonth;
      document.getElementById('ref-total-count').textContent = data.referrals.total;
    }
  }

  function updateUserTopBar() {
    const guestBtn = document.getElementById('top-login-btn');
    const userBox = document.getElementById('top-user-info');

    if (!userProfile) {
      guestBtn.classList.remove('hidden');
      userBox.classList.add('hidden');
      return;
    }

    guestBtn.classList.add('hidden');
    userBox.classList.remove('hidden');
    document.getElementById('top-user-name').textContent = userProfile.displayName || 'مستخدم';
    document.getElementById('top-user-coins').textContent = userProfile.coins ?? 0;

    const planNames = { free: 'باقة مجانية', daily: 'اشتراك يومي', weekly: 'اشتراك أسبوعي', monthly: 'اشتراك شهري', yearly: 'اشتراك سنوي' };
    document.getElementById('top-user-plan').textContent = planNames[userProfile.plan] || userProfile.plan;

    const av = document.getElementById('top-user-avatar');
    if (userProfile.photoURL) {
      av.src = userProfile.photoURL;
      av.classList.remove('hidden');
    } else {
      av.classList.add('hidden');
    }

    document.getElementById('loyalty-streak-days').textContent = userProfile.streakDays || 0;
    document.getElementById('my-referral-code-box').value = userProfile.referralCode || '';
    document.getElementById('acc-email').textContent = userProfile.email || '';
    document.getElementById('acc-coins').textContent = userProfile.coins ?? 0;
    document.getElementById('acc-plan').textContent = planNames[userProfile.plan] || 'مجانية';

    // Strict No-Refund-If-Used UI update
    const usedStatusEl = document.getElementById('acc-used-status');
    const refundBtnEl = document.getElementById('acc-refund-btn');
    const hasUsed = Number(userProfile.exportsCount || 0) > 0;
    if (usedStatusEl) {
      usedStatusEl.textContent = hasUsed
        ? `تم استخدام الرصيد (${userProfile.exportsCount} عمليات تصدير) — الاسترداد غير متاح`
        : 'لم يتم استخدام الرصيد بعد — مؤهل للاسترداد';
      usedStatusEl.className = hasUsed ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold';
    }
    if (refundBtnEl) {
      if (hasUsed) {
        refundBtnEl.disabled = true;
        refundBtnEl.className = 'w-full bg-gray-700 text-gray-400 font-bold py-2 rounded-lg cursor-not-allowed';
        refundBtnEl.textContent = 'لا يمكن إلغاء الحساب وإرجاع المبلغ (تم استخدام الرصيد)';
      } else {
        refundBtnEl.disabled = false;
        refundBtnEl.className = 'w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg transition';
        refundBtnEl.textContent = 'طلب إلغاء الحساب وإعادة المبلغ';
      }
    }
  }

  function switchAuthTab(tab) {
    authTab = tab;
    const isReg = tab === 'register';
    document.getElementById('auth-tab-login').className = !isReg ? 'py-1.5 rounded-lg font-bold bg-emerald-600 text-white' : 'py-1.5 rounded-lg font-bold text-gray-300';
    document.getElementById('auth-tab-register').className = isReg ? 'py-1.5 rounded-lg font-bold bg-emerald-600 text-white' : 'py-1.5 rounded-lg font-bold text-gray-300';
    document.getElementById('auth-name-wrap').classList.toggle('hidden', !isReg);
    document.getElementById('auth-ref-wrap').classList.toggle('hidden', !isReg);
  }

  async function handleGoogleLogin() {
    document.getElementById('auth-error-msg').textContent = '';
    const r = await window.MJ.signInWithGoogle();
    if (!r.success) {
      document.getElementById('auth-error-msg').textContent = r.error;
      return;
    }
    if (r.data) applyUserSession(r.data);
    closeModal('auth-modal');
    showToast('مرحباً بك في منصة مجسمات! تم تسجيل الدخول بنجاح');
  }

  async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    const ref = document.getElementById('auth-ref-code').value;
    const errEl = document.getElementById('auth-error-msg');
    errEl.textContent = '';

    const r = authTab === 'register'
      ? await window.MJ.signUpWithEmail(email, pass, name, ref)
      : await window.MJ.signInWithEmail(email, pass);

    if (!r.success) {
      errEl.textContent = r.error;
      return;
    }
    if (r.data) applyUserSession(r.data);
    closeModal('auth-modal');
    showToast(authTab === 'register' ? '🎁 تم إنشاء حسابك وإضافة 6 كوينز مجانية لرصيدك!' : 'تم تسجيل الدخول بنجاح');
  }

  async function handleLogout() {
    await window.MJ.signOut();
    userProfile = null;
    updateUserTopBar();
    showToast('تم تسجيل الخروج');
  }

  function renderPackagesUI() {
    const subGrid = document.getElementById('packages-sub-grid');
    const coinGrid = document.getElementById('packages-coins-grid');
    if (!subGrid || !coinGrid) return;

    const subs = packagesList.filter((p) => p.category === 'subscription');
    const coins = packagesList.filter((p) => p.category !== 'subscription');

    const renderCard = (p) => {
      const priceVal = p.priceUsd !== undefined ? p.priceUsd : p.priceSar;
      const validityText = p.noExpiry || p.category === 'coins'
        ? '<div class="text-[11px] text-emerald-400 font-bold">✓ بدون تاريخ انتهاء الصلاحية</div>'
        : `<div class="text-[11px] text-sky-300 font-bold">↻ تتجدد ${p.plan === 'yearly' ? 'سنوياً (365 يوم)' : 'شهرياً (30 يوم)'}</div>`;
      return `
        <div class="bg-[#1b1d21] border ${p.popular ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-[#383d47]'} rounded-xl p-4 flex flex-col justify-between relative">
          ${p.badgeAr ? `<span class="absolute -top-2.5 left-3 bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">${p.badgeAr}</span>` : ''}
          <div>
            <div class="font-extrabold text-white text-sm mt-1">${p.nameAr}</div>
            <div class="text-2xl font-extrabold text-emerald-400 my-2">$${priceVal} <span class="text-xs font-normal text-gray-400">دولار</span></div>
            <div class="text-xs text-amber-300 font-bold mb-1"><i class="fa-solid fa-coins ml-1"></i>${p.coins} كوينز (${Math.floor(p.coins / 2)} عملية تصدير)</div>
            ${validityText}
          </div>
          <button onclick="MJApp.buyPackage('${p.id}')" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2 rounded-lg text-xs transition">
            ${p.category === 'subscription' ? 'اشترك الآن' : 'اشحن الرصيد الآن'} ($${priceVal})
          </button>
        </div>
      `;
    };

    subGrid.innerHTML = subs.map(renderCard).join('');
    coinGrid.innerHTML = coins.map(renderCard).join('');
  }

  async function buyPackage(packageId) {
    if (!window.MJ.getCurrentUser()) {
      closeModal('pricing-modal');
      openModal('auth-modal');
      showToast('سجّل دخولك أولاً لشراء الباقة واستلام كود الشحن تلقائياً على إيميلك', true);
      return;
    }

    const method = document.querySelector('input[name="pay-method"]:checked')?.value || 'mada_visa';
    const coupon = document.getElementById('checkout-coupon').value.trim();

    if (method === 'paypal' && siteSettings.paypalPaymentLink) {
      window.open(siteSettings.paypalPaymentLink, '_blank');
    } else if (siteSettings.moyasarPaymentLink) {
      window.open(siteSettings.moyasarPaymentLink, '_blank');
    }

    const res = await window.MJ.createPaymentOrder(packageId, method, coupon);
    if (!res.success) {
      showToast(res.error || 'تعذر إنشاء طلب الدفع', true);
      return;
    }

    activePaymentOrder = res.data;
    const box = document.getElementById('active-order-box');
    const det = document.getElementById('active-order-details');
    const amt = res.data.amountUsd !== undefined ? res.data.amountUsd : res.data.amountSar;
    box.classList.remove('hidden');
    det.innerHTML = `
      <div>• الباقة: <strong>${res.data.packageName}</strong> (${res.data.coins} كوينز) — المبلغ: <strong>$${amt} دولار</strong></div>
      <div>• تم توليد وإرسال كود الشحن تلقائياً إلى بريدك: <strong class="text-emerald-300">${res.data.email}</strong></div>
      <div class="mt-2 p-2.5 bg-[#16181c] border border-emerald-500/40 rounded-lg flex items-center justify-between">
        <span>كود الشحن التلقائي الصادر لك: <strong class="font-mono text-emerald-400 text-sm">${res.data.activationCode}</strong></span>
        <button onclick="MJApp.quickRedeemGenerated('${res.data.activationCode}')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded font-bold">
          تفعيل الكود الآن
        </button>
      </div>
    `;
    showToast('تم توليد كود الشحن تلقائياً وإرساله لبريدك الإلكتروني!');
  }

  function quickRedeemGenerated(code) {
    document.getElementById('redeem-code-input').value = code;
    closeModal('pricing-modal');
    openModal('redeem-modal');
  }

  async function cancelCurrentPaymentOrder() {
    if (!activePaymentOrder) return;
    await window.MJ.cancelPaymentOrder(activePaymentOrder.activationCode, activePaymentOrder.orderId);
    document.getElementById('active-order-box').classList.add('hidden');
    activePaymentOrder = null;
    showToast('تم إلغاء عملية الدفع وإبطال كود التفعيل بنجاح');
  }

  async function submitRedeemCode() {
    const code = document.getElementById('redeem-code-input').value.trim();
    if (!code) {
      showToast('أدخل كود التفعيل أولاً', true);
      return;
    }
    const res = await window.MJ.redeemCode(code);
    if (!res.success) {
      showToast(res.error || 'الكود غير صالح', true);
      return;
    }
    userProfile = res.data.profile;
    updateUserTopBar();
    closeModal('redeem-modal');
    document.getElementById('active-order-box')?.classList.add('hidden');
    showToast(`🎉 تم تفعيل الكود بنجاح وإضافة ${res.data.coinsAdded} كوينز لحسابك!`);
  }

  async function claimDailyCheckin() {
    if (!window.MJ.getCurrentUser()) {
      closeModal('loyalty-modal');
      openModal('auth-modal');
      showToast('سجّل دخولك أولاً لاستلام مكافأة الدخول اليومي!', true);
      return;
    }
    const res = await window.MJ.dailyCheckin();
    if (!res.success) {
      showToast(res.error, true);
      return;
    }
    userProfile = res.data.profile;
    updateUserTopBar();
    showToast(res.data.isSevenDayBonus
      ? `🔥 مبروك! أكملت 7 أيام متتالية وحصلت على +${res.data.reward} كوينز!`
      : `🎁 حصلت على +${res.data.reward} كوينز مكافأة الدخول اليومي! (اليوم ${res.data.streakDays})`);
  }

  function copyReferralLink() {
    if (!userProfile || !userProfile.referralCode) {
      showToast('سجّل دخولك أولاً للحصول على كود الدعوة الخاص بك', true);
      return;
    }
    const link = `${window.location.origin}/?ref=${userProfile.referralCode}`;
    navigator.clipboard.writeText(link);
    showToast(`تم نسخ رابط الدعوة (${link})! شاركه مع أصدقائك واحصل على 5 كوينز + 20% من مشترياتهم`);
  }

  async function requestCancelAndRefund() {
    if (userProfile && Number(userProfile.exportsCount || 0) > 0) {
      showToast('عذراً، لا يمكن إلغاء الحساب وإرجاع المبلغ لأنه تم استخدام الرصيد بالفعل.', true);
      return;
    }
    const ok = window.confirm('هل أنت متأكد من رغبتك في تقديم طلب إلغاء الحساب واسترداد المبلغ؟ (متاح فقط في حال عدم استخدام الرصيد)');
    if (!ok) return;
    const res = await window.MJ.requestCancelAccountRefund('طلب استرداد مباشر من المستخدم');
    if (res.success) {
      closeModal('account-modal');
      showToast(res.message);
    } else {
      showToast(res.error || 'لا يمكن إلغاء الحساب وإرجاع المبلغ إذا تم استخدام الرصيد', true);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     17. Language Switcher (AR / EN) & Legal Modals
     ────────────────────────────────────────────────────────────── */
  function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.getElementById('lang-label').textContent = currentLang === 'ar' ? 'EN' : 'عربي';

    const dict = window.MJCatalog.I18N[currentLang];
    document.getElementById('brand-title').textContent = dict.siteName;
    document.getElementById('brand-sub').textContent = dict.siteSub;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    applyPublicSettingsUI();
  }

  function openLegalModal(section) {
    const title = document.getElementById('legal-modal-title');
    const content = document.getElementById('legal-modal-content');
    const email = siteSettings.contactEmail || 'aahaji.110@gmail.com';
    const docNum = siteSettings.freelanceDocNumber || 'FL-76849201';

    if (section === 'services') {
      title.textContent = 'خدمات منصة مجسمات وموثوقية الموقع';
      content.innerHTML = `
        <p><strong>منصة مجسمات (Mojassamat)</strong> هي المنصة العربية الأولى المتخصصة في تصميم وتحرير وفحص المجسمات ثلاثية الأبعاد والكتابة بالخطوط العربية المتصلة قبل الطباعة.</p>
        <ul class="list-disc list-inside space-y-1">
          <li>تحرير ملفات STL و OBJ و 3MF و SVG مباشرة عبر المتصفح.</li>
          <li>الكتابة بأكثر من 48 خطاً عربياً متصلاً مع إمكانية اللصق البارز بالتطعجات أو الحفر الغائر داخل نفس المجسم.</li>
          <li>صانع الميداليات الكنتورية المفرغة (3 طبقات وإطار بارز ومونوغرام) وتاق الشاحن وتاق الحقائب والأكواد ثلاثية الأبعاد QR.</li>
          <li>محول الصيغ الشامل من الصور PNG/JPG إلى SVG وإلى مجسمات 3D، وفصل الألوان.</li>
          <li>المنصة موثقة رسمياً في المملكة العربية السعودية بموجب وثيقة العمل الحر رقم <strong>${docNum}</strong>.</li>
        </ul>
      `;
    } else if (section === 'terms') {
      title.textContent = 'اتفاقية وشروط الاستخدام وسياسة استرداد المبلغ';
      content.innerHTML = `
        <p><strong>1. الملكية وحماية الموقع:</strong> جميع البرمجيات والتصاميم والواجهات محمية بموجب أنظمة الملكية الفكرية والتجارة الإلكترونية في المملكة العربية السعودية.</p>
        <p><strong>2. نظام الباقات والكوينز:</strong> يحصل كل مستخدم جديد على 6 كوينز مجانية عند التسجيل، وتكلفة كل عملية تصدير هي 2 كوينز. باقات الرصيد (10 كوينز بـ 3$، 30 كوينز بـ 8$، 50 كوينز بـ 10$) تبقى بدون تاريخ انتهاء، وباقات الاشتراك تتجدد شهرياً (100 كوينز بـ 20$) أو سنوياً (500 كوينز بـ 80$).</p>
        <p><strong>3. سياسة إلغاء الحساب وإعادة المبلغ (Refund Policy):</strong> يحق للمشترك طلب إلغاء الحساب واسترداد المبلغ المدفوع طالما لم يتم استخدام الرصيد. <strong>لا يمكن إلغاء الحساب وإرجاع المبلغ إذا تم استخدام الرصيد.</strong></p>
        <p><strong>4. الاستخدام المشروع:</strong> يمنع رفع أي مجسمات محظورة قانونياً أو محمية بحقوق الغير دون إذن، ويحق للإدارة إيقاف الحساب المخالف فوراً.</p>
      `;
    } else {
      title.textContent = 'سياسة الخصوصية وحماية البيانات';
      content.innerHTML = `
        <p>تلتزم منصة مجسمات بحماية بيانات المستخدمين وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL):</p>
        <ul class="list-disc list-inside space-y-1">
          <li>جميع ملفات المجسمات المرفوعة (STL, OBJ, 3MF, SVG, PNG) تتم معالجتها هندسياً داخل متصفحك ولا يتم نشرها أو مشاركتها مع أي طرف ثالث.</li>
          <li>تتم عمليات الدفع عبر بوابات مشفرة ومعتمدة (مدى، Apple Pay، Visa، ميسر، PayPal) ويتم توليد وإرسال كود الشحن تلقائياً للبريد الإلكتروني فور الدفع.</li>
          <li>للتواصل المباشر مع إدارة المنصة: <strong>${email}</strong></li>
        </ul>
      `;
    }
    openModal('legal-modal');
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  }

  let toastTimer = null;
  function showToast(msg, isError = false) {
    const box = document.getElementById('toast-box');
    if (!box) return;
    box.className = `fixed bottom-5 right-5 px-4 py-3 rounded-xl shadow-2xl text-xs font-extrabold z-50 flex items-center gap-2 border ${
      isError ? 'bg-rose-950 border-rose-500 text-rose-200' : 'bg-[#23262b] border-emerald-500 text-white'
    }`;
    box.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation text-rose-400' : 'fa-circle-check text-emerald-400'}"></i><span>${window.MJSecurity.sanitizeText(msg)}</span>`;
    box.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.add('hidden'), 4200);
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    openModal,
    closeModal,
    confirmNewWorkspace,
    undo,
    redo,
    handleFilesUpload,
    updateArabicTextPreview,
    addArabicTextToScene,
    togglePrimitiveMenu,
    addPrimitive,
    openStickSurfaceModal,
    executeStickToSurface,
    previewStickSliders,
    resetStickSliders,
    startInteractiveSurfacePick,
    cancelSurfacePick,
    setKeychainCategory,
    renderKeychainGallery,
    buildKeychainFromTemplate,
    handleConverterFileSelect,
    runFileConversion,
    setQRType,
    generate3DQR,
    snapSelectedToBed,
    toggleTransformPopover,
    closeTransformPopover,
    applyRotationInput,
    quickRotate,
    resetRotation,
    applyDimensionMm,
    applyUniformPercent,
    toggleEyePreview,
    runPrintCheck,
    addBuildPlate,
    removeBuildPlate,
    splitColorsToPlates,
    exportScene,
    changePrinter,
    setSelectedColor,
    duplicateSelected,
    deleteSelected,
    selectObjectByIndex,
    setCameraView,
    switchAuthTab,
    handleGoogleLogin,
    handleEmailAuth,
    handleLogout,
    buyPackage,
    quickRedeemGenerated,
    cancelCurrentPaymentOrder,
    submitRedeemCode,
    claimDailyCheckin,
    copyReferralLink,
    requestCancelAndRefund,
    toggleLanguage,
    openLegalModal
  };
})();

