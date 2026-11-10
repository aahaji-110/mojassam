/**
 * مجسمات (Mojassamat) - 3D Geometry Engine, Arabic Text Extruder, Surface Wrapper,
 * Primitives, Keychain/Tag Builder, 3D QR, Converter & Print Checker
 * ================================================================================
 */

window.MJEngine = (function () {
  /* ──────────────────────────────────────────────────────────────
     1. High-Precision Contour Tracer (Canvas -> Polygons with Holes -> THREE.Shape / SVG)
     Works for:
       - All 48 Arabic Fonts (100% native RTL HarfBuzz shaping via Canvas2D)
       - PNG / JPG / WEBP -> SVG & 3D Extrusion
     ────────────────────────────────────────────────────────────── */
  function traceCanvasToShapes(canvas, threshold = 128, simplifyEps = 0.65) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h).data;

    // Binary grid (1 = inside foreground, 0 = background) with 1px zero border
    const gw = w + 2;
    const gh = h + 2;
    const grid = new Uint8Array(gw * gh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = img[idx + 3];
        if (alpha >= threshold) {
          grid[(y + 1) * gw + (x + 1)] = 1;
        }
      }
    }

    // Extract directed boundary edges between 1 and 0 pixels
    // Every pixel (x,y) occupies [x, x+1] x [y, y+1]
    // Keep interior (1) on the right/left consistently so outer loops & holes have opposite signed areas
    const nextMap = new Map();
    const keyOf = (x, y) => (x << 16) | y;

    function addEdge(x1, y1, x2, y2) {
      const k1 = keyOf(x1, y1);
      let arr = nextMap.get(k1);
      if (!arr) {
        arr = [];
        nextMap.set(k1, arr);
      }
      arr.push({ x: x2, y: y2, used: false });
    }

    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const c = grid[y * gw + x];
        if (!c) continue;
        // Top neighbor
        if (grid[(y - 1) * gw + x] === 0) addEdge(x, y, x + 1, y);
        // Right neighbor
        if (grid[y * gw + (x + 1)] === 0) addEdge(x + 1, y, x + 1, y + 1);
        // Bottom neighbor
        if (grid[(y + 1) * gw + x] === 0) addEdge(x + 1, y + 1, x, y + 1);
        // Left neighbor
        if (grid[y * gw + (x - 1)] === 0) addEdge(x, y + 1, x, y);
      }
    }

    const rawLoops = [];
    for (const [startKey, edges] of nextMap.entries()) {
      for (const firstEdge of edges) {
        if (firstEdge.used) continue;
        firstEdge.used = true;
        const sx = startKey >> 16;
        const sy = startKey & 0xffff;
        const pts = [{ x: sx, y: sy }];
        let cx = firstEdge.x;
        let cy = firstEdge.y;

        let guard = 0;
        while ((cx !== sx || cy !== sy) && guard++ < 100000) {
          pts.push({ x: cx, y: cy });
          const k = keyOf(cx, cy);
          const list = nextMap.get(k);
          if (!list) break;
          let chosen = null;
          for (const cand of list) {
            if (!cand.used) {
              chosen = cand;
              break;
            }
          }
          if (!chosen) break;
          chosen.used = true;
          cx = chosen.x;
          cy = chosen.y;
        }
        if (pts.length >= 4) {
          rawLoops.push(pts);
        }
      }
    }

    // Smooth & simplify loops
    const loops = [];
    for (const raw of rawLoops) {
      const smoothed = smoothLoop(raw, 2);
      const simp = simplifyLoop(smoothed, simplifyEps);
      if (simp.length >= 3) {
        const area = signedArea(simp);
        if (Math.abs(area) >= 6) {
          loops.push({ pts: simp, area });
        }
      }
    }

    return loops;
  }

  function smoothLoop(pts, iterations = 1) {
    let cur = pts;
    for (let it = 0; it < iterations; it++) {
      const n = cur.length;
      const next = new Array(n);
      for (let i = 0; i < n; i++) {
        const p0 = cur[(i - 1 + n) % n];
        const p1 = cur[i];
        const p2 = cur[(i + 1) % n];
        next[i] = {
          x: p0.x * 0.2 + p1.x * 0.6 + p2.x * 0.2,
          y: p0.y * 0.2 + p1.y * 0.6 + p2.x * 0.2
        };
      }
      cur = next;
    }
    return cur;
  }

  function simplifyLoop(pts, eps) {
    if (pts.length <= 6) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = out[out.length - 1];
      const cur = pts[i];
      const next = pts[i + 1];
      const dx1 = cur.x - prev.x;
      const dy1 = cur.y - prev.y;
      const dx2 = next.x - prev.x;
      const dy2 = next.y - prev.y;
      const len = Math.hypot(dx2, dy2) || 1;
      const dist = Math.abs(dx1 * dy2 - dy1 * dx2) / len;
      if (dist > eps || Math.hypot(dx1, dy1) > 4.5) {
        out.push(cur);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function signedArea(pts) {
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return a * 0.5;
  }

  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function loopsToThreeShapes(loops, scale = 0.25, centerX = 0, centerY = 0) {
    // In screen coords (Y down), outer loops of filled regions have positive signedArea, holes have negative signedArea
    const outers = [];
    const holes = [];

    for (const l of loops) {
      // Flip Y for 3D space (Y up in 2D shape before rotating onto XZ bed)
      const mapped = l.pts.map((p) => new THREE.Vector2((p.x - centerX) * scale, -(p.y - centerY) * scale));
      if (l.area > 0) {
        outers.push({ pts2d: l.pts, vecs: mapped, area: Math.abs(l.area), holes: [] });
      } else {
        holes.push({ pts2d: l.pts, vecs: mapped, area: Math.abs(l.area) });
      }
    }

    // Sort outers smallest-first so each hole attaches to its immediate smallest containing outer contour
    outers.sort((a, b) => a.area - b.area);

    for (const h of holes) {
      const testPt = h.pts2d[0];
      for (const o of outers) {
        if (o.area > h.area && pointInPolygon(testPt, o.pts2d)) {
          const path = new THREE.Path(h.vecs);
          o.holes.push(path);
          break;
        }
      }
    }

    return outers.map((o) => {
      const shape = new THREE.Shape(o.vecs);
      shape.holes = o.holes;
      return shape;
    });
  }

  function loopsToSVG(loops, width, height) {
    let d = '';
    for (const l of loops) {
      const pts = l.pts;
      if (!pts.length) continue;
      d += `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `;
      for (let i = 1; i < pts.length; i++) {
        d += `L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} `;
      }
      d += 'Z ';
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">
  <path d="${d.trim()}" fill="#10b981" fill-rule="evenodd"/>
</svg>`;
  }

  /* ──────────────────────────────────────────────────────────────
     2. Arabic 3D Text Generator (Supports all 48 Arabic Fonts!)
     ────────────────────────────────────────────────────────────── */
  async function createArabicTextGeometry(options = {}) {
    const {
      text = 'مجسمات',
      fontFamily = 'Cairo',
      sizeMm = 28,
      depthMm = 5,
      bevel = false
    } = options;

    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([
          document.fonts.load(`bold 120px "${fontFamily}"`),
          new Promise((r) => setTimeout(r, 900))
        ]);
      }
    } catch (e) {}

    const fontPx = 130;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontPx}px "${fontFamily}", "Cairo", sans-serif`;

    const lines = String(text || 'مجسمات').split('\n').filter(Boolean);
    if (!lines.length) lines.push('مجسمات');

    let maxW = 200;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    }

    const pad = 70;
    const lineHeight = fontPx * 1.32;
    canvas.width = Math.min(2600, Math.ceil(maxW + pad * 2));
    canvas.height = Math.min(1800, Math.ceil(lines.length * lineHeight + pad * 2));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontPx}px "${fontFamily}", "Cairo", sans-serif`;

    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
    });

    const loops = traceCanvasToShapes(canvas, 115, 0.55);
    const scaleFactor = sizeMm / fontPx;
    const shapes = loopsToThreeShapes(loops, scaleFactor, canvas.width / 2, canvas.height / 2);

    if (!shapes.length) {
      return new THREE.BoxGeometry(sizeMm, depthMm, sizeMm * 0.4);
    }

    const extrudeSettings = {
      depth: depthMm,
      bevelEnabled: !!bevel,
      bevelThickness: bevel ? 0.5 : 0,
      bevelSize: bevel ? 0.4 : 0,
      bevelSegments: bevel ? 2 : 1,
      curveSegments: 6
    };

    const geom = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    // Rotate so text lies flat on the XZ build plate (Y is height)
    geom.rotateX(-Math.PI / 2);
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    geom.translate(-cx, -bb.min.y, -cz);
    geom.computeVertexNormals();
    return geom;
  }

  /* ──────────────────────────────────────────────────────────────
     3. Surface Wrapping & Sticking ("لصق على سطح المجسم")
        Wraps any 3D Text or Primitive onto:
        - Cylinder surface (يلتف حول الأسطوانة)
        - Sphere surface (يلتف على الكرة)
        - Any face of a target Mesh (Top, Bottom, Front, Back, Right, Left)
        - Raycast surface projection (يتشكل على تضاريس سطح المجسم بالضبط)
        Supports both:
        - Emboss (بروز / قطعة مدمجة)
        - Engrave (حفر داخل المجسم)
     ────────────────────────────────────────────────────────────── */
  function stickMeshToTarget(sourceMesh, targetMesh, face = 'front', mode = 'emboss') {
    if (!sourceMesh || !targetMesh) return;

    // Ensure world matrices are fresh
    targetMesh.updateMatrixWorld(true);
    const targetBox = new THREE.Box3().setFromObject(targetMesh);
    const targetSize = new THREE.Vector3();
    const targetCenter = new THREE.Vector3();
    targetBox.getSize(targetSize);
    targetBox.getCenter(targetCenter);

    // Clone base geometry if not stored yet so user can re-wrap to different faces cleanly
    if (!sourceMesh.userData.originalGeometry) {
      sourceMesh.userData.originalGeometry = sourceMesh.geometry.clone();
    }
    const baseGeom = sourceMesh.userData.originalGeometry.clone();

    // Subdivide geometry along X/Z so it bends smoothly on curved surfaces
    baseGeom.computeBoundingBox();
    const srcBb = baseGeom.boundingBox;
    const srcW = Math.max(1, srcBb.max.x - srcBb.min.x);
    const srcH = Math.max(1, srcBb.max.y - srcBb.min.y);
    const srcD = Math.max(1, srcBb.max.z - srcBb.min.z);

    // Detect if target is cylindrical or spherical or custom mesh
    const targetType = targetMesh.userData.primitiveType || '';
    const isCylinder = targetType === 'cylinder' || targetType === 'cone' || targetType === 'truncated_cone' || face === 'cylinder_wrap';
    const isSphere = targetType === 'sphere' || face === 'sphere_wrap';

    const embedOffset = mode === 'engrave' ? -srcH * 0.72 : -0.35; // Engrave sinks into surface

    if (isCylinder && (face === 'front' || face === 'back' || face === 'right' || face === 'left' || face === 'cylinder_wrap')) {
      // Cylindrical wrap around the vertical axis of targetMesh!
      const radius = Math.max(targetSize.x, targetSize.z) / 2;
      const pos = baseGeom.attributes.position;
      const angleOffset =
        face === 'back' ? Math.PI :
        face === 'right' ? Math.PI / 2 :
        face === 'left' ? -Math.PI / 2 : 0;

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i); // extrusion thickness (height off bed)
        const vz = pos.getZ(i); // vertical along cylinder height

        const theta = (vx / Math.max(10, radius)) + angleOffset;
        const r = radius + vy + embedOffset;
        const nx = Math.sin(theta) * r;
        const nz = Math.cos(theta) * r;
        const ny = -vz; // upright text on side of cylinder
        pos.setXYZ(i, nx, ny, nz);
      }
      pos.needsUpdate = true;
      baseGeom.computeVertexNormals();
      sourceMesh.geometry.dispose();
      sourceMesh.geometry = baseGeom;
      sourceMesh.rotation.set(0, 0, 0);
      sourceMesh.scale.set(1, 1, 1);
      sourceMesh.position.copy(targetCenter);
    } else if (isSphere) {
      // Spherical wrap
      const radius = Math.max(targetSize.x, targetSize.y, targetSize.z) / 2;
      const pos = baseGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const lon = vx / Math.max(10, radius);
        const lat = -vz / Math.max(10, radius);
        const r = radius + vy + embedOffset;
        const nx = r * Math.cos(lat) * Math.sin(lon);
        const ny = r * Math.sin(lat);
        const nz = r * Math.cos(lat) * Math.cos(lon);
        pos.setXYZ(i, nx, ny, nz);
      }
      pos.needsUpdate = true;
      baseGeom.computeVertexNormals();
      sourceMesh.geometry.dispose();
      sourceMesh.geometry = baseGeom;
      sourceMesh.rotation.set(0, 0, 0);
      sourceMesh.scale.set(1, 1, 1);
      sourceMesh.position.copy(targetCenter);
    } else {
      // Raycast projection onto arbitrary target mesh surface along chosen direction!
      const raycaster = new THREE.Raycaster();
      const pos = baseGeom.attributes.position;

      // Orient and project according to chosen side
      let dir = new THREE.Vector3(0, -1, 0);
      let right = new THREE.Vector3(1, 0, 0);
      let up = new THREE.Vector3(0, 0, -1);
      let startOrigin = targetCenter.clone();

      if (face === 'top') {
        dir.set(0, -1, 0);
        right.set(1, 0, 0);
        up.set(0, 0, 1);
        startOrigin.y = targetBox.max.y + 50;
      } else if (face === 'bottom') {
        dir.set(0, 1, 0);
        right.set(1, 0, 0);
        up.set(0, 0, -1);
        startOrigin.y = targetBox.min.y - 50;
      } else if (face === 'front') {
        dir.set(0, 0, -1);
        right.set(1, 0, 0);
        up.set(0, -1, 0);
        startOrigin.z = targetBox.max.z + 50;
      } else if (face === 'back') {
        dir.set(0, 0, 1);
        right.set(-1, 0, 0);
        up.set(0, -1, 0);
        startOrigin.z = targetBox.min.z - 50;
      } else if (face === 'right') {
        dir.set(-1, 0, 0);
        right.set(0, 0, -1);
        up.set(0, -1, 0);
        startOrigin.x = targetBox.max.x + 50;
      } else if (face === 'left') {
        dir.set(1, 0, 0);
        right.set(0, 0, 1);
        up.set(0, -1, 0);
        startOrigin.x = targetBox.min.x - 50;
      }

      const outward = dir.clone().negate();

      // Sample surface hits on a 2D grid for fast conforming
      const gridN = 15;
      const surfaceOffsetGrid = [];
      for (let gy = 0; gy <= gridN; gy++) {
        surfaceOffsetGrid[gy] = [];
        const vFrac = (gy / gridN) - 0.5;
        for (let gx = 0; gx <= gridN; gx++) {
          const uFrac = (gx / gridN) - 0.5;
          const rayStart = startOrigin.clone()
            .addScaledVector(right, uFrac * srcW)
            .addScaledVector(up, vFrac * srcD);
          raycaster.set(rayStart, dir);
          const hits = raycaster.intersectObject(targetMesh, true);
          if (hits.length > 0) {
            surfaceOffsetGrid[gy][gx] = hits[0].point.clone();
          } else {
            // Fallback plane on bounding box face
            const fallbackPt = startOrigin.clone()
              .addScaledVector(dir, 50)
              .addScaledVector(right, uFrac * srcW)
              .addScaledVector(up, vFrac * srcD);
            surfaceOffsetGrid[gy][gx] = fallbackPt;
          }
        }
      }

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);

        const u = Math.min(1, Math.max(0, (vx / srcW) + 0.5)) * gridN;
        const v = Math.min(1, Math.max(0, (vz / srcD) + 0.5)) * gridN;
        const ix = Math.min(gridN - 1, Math.floor(u));
        const iy = Math.min(gridN - 1, Math.floor(v));
        const fx = u - ix;
        const fy = v - iy;

        const p00 = surfaceOffsetGrid[iy][ix];
        const p10 = surfaceOffsetGrid[iy][ix + 1];
        const p01 = surfaceOffsetGrid[iy + 1][ix];
        const p11 = surfaceOffsetGrid[iy + 1][ix + 1];

        const surfPt = new THREE.Vector3()
          .addScaledVector(p00, (1 - fx) * (1 - fy))
          .addScaledVector(p10, fx * (1 - fy))
          .addScaledVector(p01, (1 - fx) * fy)
          .addScaledVector(p11, fx * fy);

        const finalPt = surfPt.addScaledVector(outward, vy + embedOffset);
        pos.setXYZ(i, finalPt.x - targetCenter.x, finalPt.y - targetCenter.y, finalPt.z - targetCenter.z);
      }

      pos.needsUpdate = true;
      baseGeom.computeVertexNormals();
      sourceMesh.geometry.dispose();
      sourceMesh.geometry = baseGeom;
      sourceMesh.rotation.set(0, 0, 0);
      sourceMesh.scale.set(1, 1, 1);
      sourceMesh.position.copy(targetCenter);
    }

    // Apply visual style for Emboss vs Engrave
    sourceMesh.userData.stickMode = mode;
    sourceMesh.userData.stuckTo = targetMesh.uuid;
    if (mode === 'engrave') {
      sourceMesh.material = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.85,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
    }
  }

  /* ──────────────────────────────────────────────────────────────
     4. All 15 Primitives & Calibration Models Builder
     ────────────────────────────────────────────────────────────── */
  function mergeBufferGeometries(geoms) {
    let totalVerts = 0;
    const nonIndexed = geoms.map((g) => {
      const ni = g.index ? g.toNonIndexed() : g.clone();
      ni.computeVertexNormals();
      totalVerts += ni.attributes.position.count;
      return ni;
    });

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    let offset = 0;

    for (const g of nonIndexed) {
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      positions.set(p, offset);
      normals.set(n, offset);
      offset += p.length;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    return merged;
  }

  function createPrimitiveGeometry(typeId) {
    let geom;
    switch (typeId) {
      case 'cube':
        geom = new THREE.BoxGeometry(30, 30, 30);
        break;
      case 'sphere':
        geom = new THREE.SphereGeometry(18, 40, 32);
        break;
      case 'cylinder':
        geom = new THREE.CylinderGeometry(15, 15, 35, 48);
        break;
      case 'cone':
        geom = new THREE.ConeGeometry(18, 36, 48);
        break;
      case 'truncated_cone':
        geom = new THREE.CylinderGeometry(9, 18, 32, 48);
        break;
      case 'torus':
        geom = new THREE.TorusGeometry(18, 6, 28, 56);
        geom.rotateX(Math.PI / 2);
        break;
      case 'pyramid':
        geom = new THREE.ConeGeometry(22, 32, 4);
        geom.rotateY(Math.PI / 4);
        break;
      case 'prism':
        geom = new THREE.CylinderGeometry(18, 18, 32, 3);
        break;
      case 'disc':
        geom = new THREE.CylinderGeometry(25, 25, 3, 56);
        break;
      case 'block20xy':
        // Standard 20x20x20 XYZ Calibration Cube with stepped notches
        geom = mergeBufferGeometries([
          new THREE.BoxGeometry(20, 20, 20),
          (() => { const g = new THREE.BoxGeometry(22, 8, 8); g.translate(0, 2, 0); return g; })()
        ]);
        break;
      case '3dbenchy': {
        // Stylized 3DBenchy Test Boat (Hull + Deck + Cabin + Roof + Chimney)
        // CC BY-ND attribution note shown in UI
        const hullBottom = new THREE.CylinderGeometry(14, 9, 10, 4);
        hullBottom.rotateY(Math.PI / 4);
        hullBottom.scale(1.8, 1, 0.9);
        hullBottom.translate(0, 5, 0);

        const hullTop = new THREE.CylinderGeometry(16, 14, 8, 4);
        hullTop.rotateY(Math.PI / 4);
        hullTop.scale(1.9, 1, 0.95);
        hullTop.translate(2, 13, 0);

        const cabin = new THREE.BoxGeometry(16, 14, 15);
        cabin.translate(2, 23, 0);

        const roof = new THREE.BoxGeometry(20, 3, 18);
        roof.translate(2, 31, 0);

        const chimney = new THREE.CylinderGeometry(3.2, 2.6, 10, 24);
        chimney.rotateZ(-0.35);
        chimney.translate(8, 36, 0);

        geom = mergeBufferGeometries([hullBottom, hullTop, cabin, roof, chimney]);
        break;
      }
      case 'complex': {
        // All-in-one Complex Printer Torture Test (Base + Towers + Bridge + Dome + Cone)
        const base = new THREE.BoxGeometry(60, 4, 40);
        base.translate(0, 2, 0);
        const t1 = new THREE.CylinderGeometry(4, 4, 28, 24);
        t1.translate(-20, 16, -10);
        const t2 = new THREE.CylinderGeometry(4, 4, 28, 24);
        t2.translate(20, 16, -10);
        const bridge = new THREE.BoxGeometry(44, 3, 8);
        bridge.translate(0, 29, -10);
        const dome = new THREE.SphereGeometry(10, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.translate(-12, 4, 8);
        const spike = new THREE.ConeGeometry(7, 25, 24);
        spike.translate(14, 16.5, 8);
        geom = mergeBufferGeometries([base, t1, t2, bridge, dome, spike]);
        break;
      }
      case 'overhang': {
        // Progressive Overhang Test Arch (30°, 45°, 60°, 70°)
        const parts = [];
        const base = new THREE.BoxGeometry(50, 4, 18);
        base.translate(0, 2, 0);
        parts.push(base);
        for (let i = 0; i < 6; i++) {
          const seg = new THREE.BoxGeometry(10, 8, 16);
          seg.rotateZ(-i * 0.18);
          seg.translate(-15 + i * 6.5, 6 + i * 5.2, 0);
          parts.push(seg);
        }
        geom = mergeBufferGeometries(parts);
        break;
      }
      case 'square_columns_z': {
        // Tall Z-axis wobble & retraction test columns
        const base = new THREE.BoxGeometry(40, 3, 40);
        base.translate(0, 1.5, 0);
        const c1 = new THREE.BoxGeometry(6, 65, 6);
        c1.translate(-12, 34, -12);
        const c2 = new THREE.BoxGeometry(6, 65, 6);
        c2.translate(12, 34, -12);
        const c3 = new THREE.BoxGeometry(6, 65, 6);
        c3.translate(-12, 34, 12);
        const c4 = new THREE.BoxGeometry(6, 65, 6);
        c4.translate(12, 34, 12);
        geom = mergeBufferGeometries([base, c1, c2, c3, c4]);
        break;
      }
      case 'square_prism_z': {
        // Tall tapered Z-axis pyramid prism
        geom = new THREE.CylinderGeometry(2, 14, 75, 4);
        geom.rotateY(Math.PI / 4);
        break;
      }
      default:
        geom = new THREE.BoxGeometry(25, 25, 25);
    }

    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    geom.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geom.computeVertexNormals();
    return geom;
  }

  /* ──────────────────────────────────────────────────────────────
     5. Keychain, Charger Tag & Bag Tag 3D Generator (Multi-Color Group)
     ────────────────────────────────────────────────────────────── */
  async function createKeychainGroup(opts = {}) {
    const {
      text = 'علي',
      fontFamily = 'Cairo',
      template = window.MJCatalog.KEYCHAIN_TEMPLATES[0],
      baseThickness = 3.2,
      textHeight = 2.0,
      customBaseColor = null,
      customTextColor = null
    } = opts;

    const baseColorHex = customBaseColor || template.baseColor || '#1e293b';
    const textColorHex = customTextColor || template.textColor || '#10b981';
    const scaleMult = template.scale || 1.0;

    // 1. Build 3D Arabic Text
    const textGeom = await createArabicTextGeometry({
      text,
      fontFamily,
      sizeMm: 16 * scaleMult,
      depthMm: template.engrave ? baseThickness * 0.65 : textHeight
    });
    textGeom.computeBoundingBox();
    const tbb = textGeom.boundingBox;
    const textW = Math.max(24, (tbb.max.x - tbb.min.x));
    const textD = Math.max(14, (tbb.max.z - tbb.min.z));

    const padX = 16 * scaleMult;
    const padZ = 10 * scaleMult;
    const plateW = textW + padX;
    const plateD = Math.max(24 * scaleMult, textD + padZ);

    // 2. Build Base Shape with Hole / Clip
    const shape = new THREE.Shape();
    const hw = plateW / 2;
    const hd = plateD / 2;

    if (template.shape === 'circle') {
      const r = Math.max(hw, hd) * 0.85;
      shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    } else if (template.shape === 'hexagon') {
      const r = Math.max(hw, hd) * 0.9;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r * 0.75;
        if (i === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      }
      shape.closePath();
    } else if (template.shape === 'heart') {
      const s = Math.max(hw, hd) * 0.05;
      shape.moveTo(0, -10 * s);
      shape.bezierCurveTo(12 * s, -2 * s, 22 * s, 8 * s, 0, 18 * s);
      shape.bezierCurveTo(-22 * s, 8 * s, -12 * s, -2 * s, 0, -10 * s);
    } else if (template.shape === 'shield') {
      shape.moveTo(-hw, hd);
      shape.lineTo(hw, hd);
      shape.lineTo(hw, -hd * 0.2);
      shape.quadraticCurveTo(0, -hd * 1.35, 0, -hd * 1.35);
      shape.quadraticCurveTo(-hw, -hd * 0.2, -hw, -hd * 0.2);
      shape.closePath();
    } else {
      // Rounded capsule / rectangle / luggage tag
      const r = template.shape === 'capsule' ? hd * 0.95 : Math.min(8, hd * 0.45);
      shape.moveTo(-hw + r, -hd);
      shape.lineTo(hw - r, -hd);
      shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
      shape.lineTo(hw, hd - r);
      shape.quadraticCurveTo(hw, hd, hw - r, hd);
      shape.lineTo(-hw + r, hd);
      shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
      shape.lineTo(-hw, -hd + r);
      shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    }

    // Add Keychain Ring / Charger Cable Slot / Luggage Slot
    let ringGeom = null;
    if (template.holePos === 'right') {
      // Side keyring tab with hole
      const tabShape = new THREE.Shape();
      tabShape.absarc(hw + 4, 0, 7, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(hw + 4, 0, 3.2, 0, Math.PI * 2, true);
      tabShape.holes.push(hole);
      ringGeom = new THREE.ExtrudeGeometry(tabShape, { depth: baseThickness, bevelEnabled: false, curveSegments: 24 });
      ringGeom.rotateX(-Math.PI / 2);
    } else if (template.holePos === 'top') {
      const tabShape = new THREE.Shape();
      tabShape.absarc(0, hd + 4, 7, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, hd + 4, 3.2, 0, Math.PI * 2, true);
      tabShape.holes.push(hole);
      ringGeom = new THREE.ExtrudeGeometry(tabShape, { depth: baseThickness, bevelEnabled: false, curveSegments: 24 });
      ringGeom.rotateX(-Math.PI / 2);
    } else if (template.holePos === 'slot') {
      // Luggage strap slot inside plate
      const slot = new THREE.Path();
      slot.moveTo(hw - 7, -hd * 0.45);
      slot.lineTo(hw - 3, -hd * 0.45);
      slot.lineTo(hw - 3, hd * 0.45);
      slot.lineTo(hw - 7, hd * 0.45);
      slot.closePath();
      shape.holes.push(slot);
    } else if (template.holePos === 'cable_hole' || template.holePos === 'cable_clip') {
      // Charger C-clip / USB cable collar (fits 3.8mm standard iPhone/Type-C cable)
      const clipShape = new THREE.Shape();
      const cx = hw + 6;
      if (template.holePos === 'cable_clip') {
        // Open C-clip so user can snap it directly onto the charger cable!
        clipShape.absarc(cx, 0, 6.2, 0.45, Math.PI * 2 - 0.45, false);
        clipShape.absarc(cx, 0, 2.3, Math.PI * 2 - 0.45, 0.45, true);
        clipShape.closePath();
      } else {
        clipShape.absarc(cx, 0, 6.2, 0, Math.PI * 2, false);
        const h = new THREE.Path();
        h.absarc(cx, 0, 2.5, 0, Math.PI * 2, true);
        clipShape.holes.push(h);
      }
      ringGeom = new THREE.ExtrudeGeometry(clipShape, { depth: baseThickness + 2.5, bevelEnabled: false, curveSegments: 28 });
      ringGeom.rotateX(-Math.PI / 2);
    }

    let baseGeom = new THREE.ExtrudeGeometry(shape, {
      depth: baseThickness,
      bevelEnabled: false,
      curveSegments: 24
    });
    baseGeom.rotateX(-Math.PI / 2);

    if (ringGeom) {
      baseGeom = mergeBufferGeometries([baseGeom, ringGeom]);
    }

    const group = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: baseColorHex, roughness: 0.35, metalness: 0.1 });
    const textMat = new THREE.MeshStandardMaterial({ color: textColorHex, roughness: 0.25, metalness: 0.15 });

    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.name = 'قاعدة الميدالية';
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const textMesh = new THREE.Mesh(textGeom, textMat);
    textMesh.name = 'نص الميدالية (' + text + ')';
    textMesh.position.y = template.engrave ? baseThickness - 1.1 : baseThickness - 0.2;
    textMesh.castShadow = true;
    group.add(textMesh);

    group.userData.isMultiColorGroup = true;
    return group;
  }

  /* ──────────────────────────────────────────────────────────────
     6. 3D QR Code Generator (Link, WhatsApp, Wi-Fi, Text)
     ────────────────────────────────────────────────────────────── */
  function buildQRPayload(opts) {
    const type = opts.type || 'url';
    if (type === 'whatsapp') {
      const phone = String(opts.primary || '').replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(opts.secondary || '');
      return `https://wa.me/${phone}${msg ? '?text=' + msg : ''}`;
    }
    if (type === 'wifi') {
      const ssid = String(opts.primary || 'MyWiFi');
      const pass = String(opts.secondary || '');
      return `WIFI:T:WPA;S:${ssid};P:${pass};;`;
    }
    return String(opts.primary || 'https://mjar.netlify.app');
  }

  function create3DQRGroup(opts = {}) {
    const payload = buildQRPayload(opts);
    const sizeMm = Math.max(20, Number(opts.sizeMm || 50));
    const baseThickness = Math.max(1, Number(opts.baseThickness || 3));
    const moduleHeight = Math.max(0.6, Number(opts.moduleHeight || 1.8));
    const baseColor = opts.baseColor || '#ffffff';
    const moduleColor = opts.moduleColor || '#111827';

    // Use qrcode-generator if loaded, otherwise deterministic fallback matrix
    let count = 25;
    let isDarkFn = (r, c) => ((r * c + r + c) % 3 === 0);

    if (typeof window.qrcode === 'function') {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(payload);
        qr.make();
        count = qr.getModuleCount();
        isDarkFn = (r, c) => qr.isDark(r, c);
      } catch (e) {}
    }

    const margin = 3; // mm quiet zone
    const innerSize = sizeMm - margin * 2;
    const cell = innerSize / count;

    // Base plate
    const baseGeom = new THREE.BoxGeometry(sizeMm, baseThickness, sizeMm);
    baseGeom.translate(0, baseThickness / 2, 0);

    // Modules merged into one mesh for color separation
    const boxes = [];
    const start = -innerSize / 2 + cell / 2;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (isDarkFn(r, c)) {
          const b = new THREE.BoxGeometry(cell * 1.01, moduleHeight, cell * 1.01);
          b.translate(start + c * cell, baseThickness + moduleHeight / 2, start + r * cell);
          boxes.push(b);
        }
      }
    }

    const modGeom = boxes.length ? mergeBufferGeometries(boxes) : new THREE.BoxGeometry(2, moduleHeight, 2);
    // Restore module height position after mergeBufferGeometries centers Y=0
    modGeom.translate(0, baseThickness, 0);

    const group = new THREE.Group();
    const baseMesh = new THREE.Mesh(
      baseGeom,
      new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.35 })
    );
    baseMesh.name = 'قاعدة QR';

    const modMesh = new THREE.Mesh(
      modGeom,
      new THREE.MeshStandardMaterial({ color: moduleColor, roughness: 0.25 })
    );
    modMesh.name = 'وحدات QR البارزة';

    group.add(baseMesh);
    group.add(modMesh);
    group.userData.isMultiColorGroup = true;
    return group;
  }

  /* ──────────────────────────────────────────────────────────────
     7. Print Check & Slicer Advisor ("✔ فحص الطباعة الشامل")
     ────────────────────────────────────────────────────────────── */
  function analyzePrintability(meshes, printer) {
    if (!meshes || !meshes.length) {
      return {
        valid: false,
        empty: true
      };
    }

    const totalBox = new THREE.Box3();
    let totalTriangles = 0;
    let overhangTriangles = 0;
    const overhangDirs = { front: 0, back: 0, right: 0, left: 0 };
    let baseContactAreaMm2 = 0;
    let totalVolumeMm3 = 0;

    meshes.forEach((m) => {
      m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m);
      totalBox.union(b);

      m.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const g = child.geometry;
        const pos = g.attributes.position;
        if (!pos) return;
        const idx = g.index;
        const triCount = idx ? idx.count / 3 : pos.count / 3;
        totalTriangles += triCount;

        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();
        const cb = new THREE.Vector3();
        const ab = new THREE.Vector3();

        for (let i = 0; i < triCount; i++) {
          const i0 = idx ? idx.getX(i * 3) : i * 3;
          const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;

          vA.fromBufferAttribute(pos, i0).applyMatrix4(child.matrixWorld);
          vB.fromBufferAttribute(pos, i1).applyMatrix4(child.matrixWorld);
          vC.fromBufferAttribute(pos, i2).applyMatrix4(child.matrixWorld);

          cb.subVectors(vC, vB);
          ab.subVectors(vA, vB);
          cb.cross(ab);
          const area = cb.length() * 0.5;
          cb.normalize();

          // Signed volume contribution
          totalVolumeMm3 += vA.dot(vB.clone().cross(vC)) / 6.0;

          const minY = Math.min(vA.y, vB.y, vC.y);
          const maxY = Math.max(vA.y, vB.y, vC.y);

          // Check contact with build plate (Y near 0)
          if (maxY < 0.8 && cb.y < -0.7) {
            baseContactAreaMm2 += area;
          }

          // Overhang check: downward facing normal > 45 deg (cb.y < -0.5) above bed (minY > 1.5mm)
          if (minY > 1.8 && cb.y < -0.52) {
            overhangTriangles++;
            if (Math.abs(cb.z) >= Math.abs(cb.x)) {
              if (cb.z > 0) overhangDirs.front++;
              else overhangDirs.back++;
            } else {
              if (cb.x > 0) overhangDirs.right++;
              else overhangDirs.left++;
            }
          }
        }
      });
    });

    const size = new THREE.Vector3();
    totalBox.getSize(size);
    const volCm3 = Math.max(0.5, Math.abs(totalVolumeMm3) / 1000);

    const fitsWidth = size.x <= printer.w;
    const fitsDepth = size.z <= printer.d;
    const fitsHeight = size.y <= printer.h;
    const fitsPlate = fitsWidth && fitsDepth && fitsHeight;
    const isFloating = totalBox.min.y > 0.5;

    const overhangRatio = totalTriangles > 0 ? overhangTriangles / totalTriangles : 0;
    const needsSupport = overhangRatio > 0.025 || overhangTriangles > 45;

    const dirLabels = [];
    if (overhangDirs.front > 12) dirLabels.push('الجهة الأمامية');
    if (overhangDirs.back > 12) dirLabels.push('الجهة الخلفية');
    if (overhangDirs.right > 12) dirLabels.push('الجهة اليمنى');
    if (overhangDirs.left > 12) dirLabels.push('الجهة اليسرى');

    const footprintMm2 = size.x * size.z;
    const slenderness = size.y / Math.max(1, Math.min(size.x, size.z));
    const needsBrim = slenderness > 1.8 || baseContactAreaMm2 < footprintMm2 * 0.15;

    // Recommended slicer parameters
    const layerHeight = size.y < 15 ? '0.16 مم (دقة عالية للتفاصيل)' : '0.20 مم (قياسي متوازن)';
    const infill = size.y > 80 ? '20% (نمط Gyroid للقوة)' : '15% (نمط Grid أو Gyroid)';
    const wallCount = '3 جدران (1.2 مم)';
    const printSpeed = slenderness > 2.2
      ? '80 - 120 مم/ث (تخفيف السرعة لثبات الارتفاع)'
      : '150 - 220 مم/ث (سرعة قياسية لطابعات الجيل الحديث)';

    // Estimate Filament Grams (15% infill + walls ~ 38% solid density, PLA 1.24g/cm3)
    const filamentGrams = Math.max(2, Math.round(volCm3 * 0.42 * 1.24));
    const estMinutes = Math.max(8, Math.round(filamentGrams * 2.6));

    return {
      valid: true,
      printerName: printer.name,
      dimensions: {
        x: size.x.toFixed(1),
        y: size.y.toFixed(1),
        z: size.z.toFixed(1)
      },
      fitsPlate,
      isFloating,
      needsSupport,
      supportWhere: dirLabels.length ? dirLabels.join(' و ') : 'الأجزاء البارزة العلوية',
      supportType: overhangRatio > 0.08 ? 'Tree Supports (دعامات شجرية - سهلة الإزالة)' : 'Normal / Tree Auto (دعامات تلقائية)',
      needsBrim,
      brimAdvice: needsBrim
        ? 'نعم، يُنصح بتفعيل حافة تثبيت (Brim بعرض 5-6 مم) لمنع انفصال المجسم عن اللوحة'
        : 'لا يحتاج Brim (قاعدة الارتكاز ممتازة على لوحة البناء)',
      layerHeight,
      infill,
      wallCount,
      printSpeed,
      temps: 'PLA: فوهة 210°C / لوحة 60°C | PETG: فوهة 240°C / لوحة 75°C',
      filamentGrams,
      estTimeText: estMinutes >= 60
        ? `${Math.floor(estMinutes / 60)} ساعة و ${estMinutes % 60} دقيقة`
        : `${estMinutes} دقيقة`
    };
  }

  /* ──────────────────────────────────────────────────────────────
     8. File Exporters: STL, OBJ, 3MF (with Multi-Color!), SVG
     ────────────────────────────────────────────────────────────── */
  function exportToSTL(meshes) {
    let out = 'solid mojassamat\n';
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    meshes.forEach((root) => {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const pos = g.attributes.position;
        const idx = g.index;
        const count = idx ? idx.count / 3 : pos.count / 3;
        for (let i = 0; i < count; i++) {
          const i0 = idx ? idx.getX(i * 3) : i * 3;
          const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
          vA.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
          vB.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
          vC.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
          cb.subVectors(vC, vB);
          ab.subVectors(vA, vB);
          cb.cross(ab).normalize();
          // Convert Three.js Y-up to Slicer Z-up
          out += `facet normal ${cb.x.toFixed(5)} ${(-cb.z).toFixed(5)} ${cb.y.toFixed(5)}\n  outer loop\n`;
          out += `    vertex ${vA.x.toFixed(4)} ${(-vA.z).toFixed(4)} ${vA.y.toFixed(4)}\n`;
          out += `    vertex ${vB.x.toFixed(4)} ${(-vB.z).toFixed(4)} ${vB.y.toFixed(4)}\n`;
          out += `    vertex ${vC.x.toFixed(4)} ${(-vC.z).toFixed(4)} ${vC.y.toFixed(4)}\n`;
          out += `  endloop\nendfacet\n`;
        }
      });
    });
    out += 'endsolid mojassamat\n';
    return new Blob([out], { type: 'model/stl' });
  }

  function exportToOBJ(meshes) {
    let out = '# Mojassamat 3D Studio OBJ Export\n';
    let vOffset = 1;
    const v = new THREE.Vector3();

    meshes.forEach((root, rIdx) => {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        out += `o object_${rIdx + 1}_${(m.name || 'mesh').replace(/\s+/g, '_')}\n`;
        const g = m.geometry;
        const pos = g.attributes.position;
        const idx = g.index;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          out += `v ${v.x.toFixed(4)} ${(-v.z).toFixed(4)} ${v.y.toFixed(4)}\n`;
        }
        if (idx) {
          for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i) + vOffset;
            const b = idx.getX(i + 1) + vOffset;
            const c = idx.getX(i + 2) + vOffset;
            out += `f ${a} ${b} ${c}\n`;
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            out += `f ${vOffset + i} ${vOffset + i + 1} ${vOffset + i + 2}\n`;
          }
        }
        vOffset += pos.count;
      });
    });
    return new Blob([out], { type: 'text/plain;charset=utf-8' });
  }

  async function exportTo3MF(meshes) {
    // Package valid 3MF (ZIP archive with 3D/3dmodel.model + [Content_Types].xml + _rels/.rels)
    // Uses JSZip if loaded
    let objectsXml = '';
    let buildItemsXml = '';
    let objId = 1;
    const v = new THREE.Vector3();

    meshes.forEach((root) => {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const pos = g.attributes.position;
        const idx = g.index;
        let vertsXml = '';
        let trisXml = '';
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          vertsXml += `<vertex x="${v.x.toFixed(4)}" y="${(-v.z).toFixed(4)}" z="${v.y.toFixed(4)}" />`;
        }
        if (idx) {
          for (let i = 0; i < idx.count; i += 3) {
            trisXml += `<triangle v1="${idx.getX(i)}" v2="${idx.getX(i + 1)}" v3="${idx.getX(i + 2)}" />`;
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            trisXml += `<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}" />`;
          }
        }
        objectsXml += `
        <object id="${objId}" name="${(m.name || 'Model').replace(/[<>&"]/g, '')}" type="model">
          <mesh>
            <vertices>${vertsXml}</vertices>
            <triangles>${trisXml}</triangles>
          </mesh>
        </object>`;
        buildItemsXml += `<item objectid="${objId}" />`;
        objId++;
      });
    });

    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="ar-SA" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Mojassamat 3D Studio</metadata>
  <resources>${objectsXml}
  </resources>
  <build>${buildItemsXml}</build>
</model>`;

    if (typeof window.JSZip !== 'undefined') {
      const zip = new window.JSZip();
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`);
      zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`);
      zip.folder('3D').file('3dmodel.model', modelXml);
      return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
    }
    return new Blob([modelXml], { type: 'application/xml' });
  }

  function exportToSVGProjection(meshes) {
    // Top-down 2D SVG silhouette projection of the 3D scene
    const box = new THREE.Box3();
    meshes.forEach((m) => box.union(new THREE.Box3().setFromObject(m)));
    const size = new THREE.Vector3();
    box.getSize(size);
    const w = Math.max(50, Math.ceil(size.x + 20));
    const h = Math.max(50, Math.ceil(size.z + 20));
    const ox = -box.min.x + 10;
    const oz = -box.min.z + 10;

    let polys = '';
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();

    meshes.forEach((root) => {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const col = m.material && m.material.color ? '#' + m.material.color.getHexString() : '#10b981';
        const g = m.geometry;
        const pos = g.attributes.position;
        const idx = g.index;
        const count = idx ? idx.count / 3 : pos.count / 3;
        const step = count > 6000 ? Math.ceil(count / 6000) : 1;
        let pathD = '';
        for (let i = 0; i < count; i += step) {
          const i0 = idx ? idx.getX(i * 3) : i * 3;
          const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
          vA.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
          vB.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
          vC.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
          pathD += `M${(vA.x + ox).toFixed(1)},${(vA.z + oz).toFixed(1)}L${(vB.x + ox).toFixed(1)},${(vB.z + oz).toFixed(1)}L${(vC.x + ox).toFixed(1)},${(vC.z + oz).toFixed(1)}Z `;
        }
        polys += `<path d="${pathD}" fill="${col}" stroke="${col}" stroke-width="0.3"/>\n`;
      });
    });

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">
${polys}</svg>`;
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  }

  /* ──────────────────────────────────────────────────────────────
     9. Image (PNG/JPG/WEBP) & SVG -> 3D Mesh / SVG Converter
     ────────────────────────────────────────────────────────────── */
  async function imageFileToSVGAndShapes(file, threshold = 135, invert = false) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });

    const maxDim = 650;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const cw = Math.max(32, Math.round(img.width * scale));
    const ch = Math.max(32, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);

    // Convert luminance/alpha into crisp foreground alpha for contour tracing
    const imgData = ctx.getImageData(0, 0, cw, ch);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let isFg = a > 60 && (invert ? lum > threshold : lum < threshold);
      // Also support transparent PNG stickers where alpha defines the shape
      if (a < 60) isFg = false;
      else if (lum > 245 && !invert) isFg = false;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = isFg ? 255 : 0;
    }
    ctx.putImageData(imgData, 0, 0);

    const loops = traceCanvasToShapes(canvas, 128, 0.7);
    const svgString = loopsToSVG(loops, cw, ch);
    const shapes = loopsToThreeShapes(loops, 80 / Math.max(cw, ch), cw / 2, ch / 2);
    return { svgString, shapes, width: cw, height: ch };
  }

  return {
    traceCanvasToShapes,
    loopsToThreeShapes,
    loopsToSVG,
    createArabicTextGeometry,
    stickMeshToTarget,
    createPrimitiveGeometry,
    createKeychainGroup,
    create3DQRGroup,
    analyzePrintability,
    exportToSTL,
    exportToOBJ,
    exportTo3MF,
    exportToSVGProjection,
    imageFileToSVGAndShapes,
    mergeBufferGeometries
  };
})();

