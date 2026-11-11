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
          y: p0.y * 0.2 + p1.y * 0.6 + p2.y * 0.2
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
     3. Surface Wrapping, Exact Contour Relief & Real Mesh Carving
        ("لصق وتشكيل بنفس تطعجات المجسم أو حفر بنفس المجسم")
        - Subdivides triangles finely so every millimeter of the text/shape
          conforms to the exact outer bumps, steps, grooves, and curves of targetMesh!
        - Auto-scales text/shape to fit the target surface so it never hangs in mid-air.
        - Supports user-chosen placement point (anchorPoint or offsetU / offsetV).
        - In 'engrave' mode, physically carves/indents targetMesh's own surface inward!
     ────────────────────────────────────────────────────────────── */
  function subdivideGeometry(geom, maxEdgeLen = 1.6, maxPasses = 3) {
    let cur = geom.index ? geom.toNonIndexed() : geom.clone();
    for (let pass = 0; pass < maxPasses; pass++) {
      const pos = cur.attributes.position.array;
      const triCount = pos.length / 9;
      if (triCount > 24000) break; // safety cap for performance

      const out = [];
      let splitCount = 0;

      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
        const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
        const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];

        const dab = Math.hypot(bx - ax, by - ay, bz - az);
        const dbc = Math.hypot(cx - bx, cy - by, cz - bz);
        const dca = Math.hypot(ax - cx, ay - cy, az - cz);

        if (dab > maxEdgeLen || dbc > maxEdgeLen || dca > maxEdgeLen) {
          splitCount++;
          // Split along the longest edge
          if (dab >= dbc && dab >= dca) {
            const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
            out.push(ax, ay, az, mx, my, mz, cx, cy, cz);
            out.push(mx, my, mz, bx, by, bz, cx, cy, cz);
          } else if (dbc >= dab && dbc >= dca) {
            const mx = (bx + cx) * 0.5, my = (by + cy) * 0.5, mz = (bz + cz) * 0.5;
            out.push(ax, ay, az, bx, by, bz, mx, my, mz);
            out.push(ax, ay, az, mx, my, mz, cx, cy, cz);
          } else {
            const mx = (cx + ax) * 0.5, my = (cy + ay) * 0.5, mz = (cz + az) * 0.5;
            out.push(ax, ay, az, bx, by, bz, mx, my, mz);
            out.push(mx, my, mz, bx, by, bz, cx, cy, cz);
          }
        } else {
          out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        }
      }

      const nextGeom = new THREE.BufferGeometry();
      nextGeom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      cur = nextGeom;
      if (splitCount === 0) break;
    }
    cur.computeVertexNormals();
    return cur;
  }

  function stickMeshToTarget(sourceMesh, targetMesh, face = 'front', mode = 'emboss', customOpts = {}) {
    if (!sourceMesh || !targetMesh) return;

    // Restore targetMesh original geometry if it was previously carved
    targetMesh.traverse((child) => {
      if (child.isMesh && child.userData.preCarveGeometry) {
        child.geometry.dispose();
        child.geometry = child.userData.preCarveGeometry.clone();
      }
    });

    targetMesh.updateMatrixWorld(true);
    const targetBox = new THREE.Box3().setFromObject(targetMesh);
    const targetSize = new THREE.Vector3();
    const targetCenter = new THREE.Vector3();
    targetBox.getSize(targetSize);
    targetBox.getCenter(targetCenter);

    if (!sourceMesh.userData.originalGeometry) {
      sourceMesh.userData.originalGeometry = sourceMesh.geometry.clone();
    }
    let baseGeom = sourceMesh.userData.originalGeometry.clone();
    baseGeom.computeBoundingBox();
    const origBb = baseGeom.boundingBox;
    const origW = Math.max(1, origBb.max.x - origBb.min.x);
    const origH = Math.max(0.5, origBb.max.y - origBb.min.y);
    const origD = Math.max(1, origBb.max.z - origBb.min.z);

    // Center baseGeom on X and Z, with Y=0 at bottom
    baseGeom.translate(
      -(origBb.min.x + origBb.max.x) / 2,
      -origBb.min.y,
      -(origBb.min.z + origBb.max.z) / 2
    );

    // Determine projection axes (dir = ray direction toward surface, right = U axis, up = V axis)
    let dir = new THREE.Vector3(0, 0, -1);
    let right = new THREE.Vector3(1, 0, 0);
    let up = new THREE.Vector3(0, -1, 0);
    let availW = targetSize.x;
    let availH = targetSize.y;

    if (face === 'top') {
      dir.set(0, -1, 0); right.set(1, 0, 0); up.set(0, 0, 1);
      availW = targetSize.x; availH = targetSize.z;
    } else if (face === 'bottom') {
      dir.set(0, 1, 0); right.set(1, 0, 0); up.set(0, 0, -1);
      availW = targetSize.x; availH = targetSize.z;
    } else if (face === 'front') {
      dir.set(0, 0, -1); right.set(1, 0, 0); up.set(0, -1, 0);
      availW = targetSize.x; availH = targetSize.y;
    } else if (face === 'back') {
      dir.set(0, 0, 1); right.set(-1, 0, 0); up.set(0, -1, 0);
      availW = targetSize.x; availH = targetSize.y;
    } else if (face === 'right') {
      dir.set(-1, 0, 0); right.set(0, 0, -1); up.set(0, -1, 0);
      availW = targetSize.z; availH = targetSize.y;
    } else if (face === 'left') {
      dir.set(1, 0, 0); right.set(0, 0, 1); up.set(0, -1, 0);
      availW = targetSize.z; availH = targetSize.y;
    }

    // Auto-scale source geometry so it NEVER overflows the target face!
    const userScaleMult = Number(customOpts.scalePct || 85) / 100;
    const fitScale = Math.min(
      (availW * userScaleMult) / origW,
      (availH * userScaleMult) / origD
    );
    const depthMm = Number(customOpts.depthMm || Math.min(origH, 2.8));
    baseGeom.scale(fitScale, depthMm / origH, fitScale);

    // Finely subdivide triangles so the geometry bends with every step, bump, groove, and curve!
    const stepMm = Math.max(0.6, Math.min(availW, availH) / 28);
    baseGeom = subdivideGeometry(baseGeom, stepMm, 4);
    baseGeom.computeBoundingBox();

    const offsetU = Number(customOpts.offsetU || 0);
    const offsetV = Number(customOpts.offsetV || 0);

    // If user clicked a specific point on the model, center there; otherwise use face center + offsetU/offsetV
    const anchorCenter = customOpts.anchorPoint
      ? customOpts.anchorPoint.clone()
      : targetCenter.clone().addScaledVector(right, offsetU).addScaledVector(up, -offsetV);

    const outward = dir.clone().negate();
    const rayDistance = Math.max(targetSize.x, targetSize.y, targetSize.z) * 1.5 + 40;
    const rayOriginBase = anchorCenter.clone().addScaledVector(outward, rayDistance);

    const raycaster = new THREE.Raycaster();
    const pos = baseGeom.attributes.position;

    // Cache ray hits on a high-resolution 2D lookup grid across the decal footprint for speed & smoothness
    baseGeom.computeBoundingBox();
    const sbb = baseGeom.boundingBox;
    const spanU = Math.max(1, sbb.max.x - sbb.min.x);
    const spanV = Math.max(1, sbb.max.z - sbb.min.z);
    const gridRes = 48;
    const hitGrid = [];

    // First find fallback surface plane at center in case an edge ray misses
    raycaster.set(rayOriginBase, dir);
    const centerHits = raycaster.intersectObject(targetMesh, true);
    const defaultSurfacePt = centerHits.length > 0
      ? centerHits[0].point.clone()
      : anchorCenter.clone();

    for (let gy = 0; gy <= gridRes; gy++) {
      hitGrid[gy] = [];
      const vz = sbb.min.z + (gy / gridRes) * spanV;
      for (let gx = 0; gx <= gridRes; gx++) {
        const vx = sbb.min.x + (gx / gridRes) * spanU;
        const rStart = rayOriginBase.clone()
          .addScaledVector(right, vx)
          .addScaledVector(up, vz);
        raycaster.set(rStart, dir);
        const hits = raycaster.intersectObject(targetMesh, true);
        if (hits.length > 0) {
          const h = hits[0];
          const wn = h.face
            ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
            : outward.clone();
          hitGrid[gy][gx] = { pt: h.point.clone(), normal: wn, valid: true };
        } else {
          // Clamp to nearest valid point on surface so letters never float in air
          const projDist = defaultSurfacePt.clone().sub(rStart).dot(dir);
          hitGrid[gy][gx] = {
            pt: rStart.clone().addScaledVector(dir, projDist),
            normal: outward.clone(),
            valid: false
          };
        }
      }
    }

    function sampleSurface(vx, vz) {
      const u = Math.min(1, Math.max(0, (vx - sbb.min.x) / spanU)) * gridRes;
      const v = Math.min(1, Math.max(0, (vz - sbb.min.z) / spanV)) * gridRes;
      const ix = Math.min(gridRes - 1, Math.floor(u));
      const iy = Math.min(gridRes - 1, Math.floor(v));
      const fx = u - ix;
      const fy = v - iy;

      const h00 = hitGrid[iy][ix];
      const h10 = hitGrid[iy][ix + 1];
      const h01 = hitGrid[iy + 1][ix];
      const h11 = hitGrid[iy + 1][ix + 1];

      const pt = new THREE.Vector3()
        .addScaledVector(h00.pt, (1 - fx) * (1 - fy))
        .addScaledVector(h10.pt, fx * (1 - fy))
        .addScaledVector(h01.pt, (1 - fx) * fy)
        .addScaledVector(h11.pt, fx * fy);

      const nrm = new THREE.Vector3()
        .addScaledVector(h00.normal, (1 - fx) * (1 - fy))
        .addScaledVector(h10.normal, fx * (1 - fy))
        .addScaledVector(h01.normal, (1 - fx) * fy)
        .addScaledVector(h11.normal, fx * fy)
        .normalize();

      return { pt, normal: nrm };
    }

    if (mode === 'engrave') {
      // REAL MESH CARVING ("حفر بنفس المجسم"):
      // 1. Build a 2D silhouette mask of the sourceMesh on the (U, V) plane
      const maskSize = 180;
      const mask = new Uint8Array(maskSize * maskSize);
      const posArr = pos.array;
      for (let i = 0; i < posArr.length; i += 9) {
        // Rasterize triangle bounding box in (vx, vz) into mask
        const x0 = posArr[i], z0 = posArr[i + 2];
        const x1 = posArr[i + 3], z1 = posArr[i + 5];
        const x2 = posArr[i + 6], z2 = posArr[i + 8];
        const minU = Math.max(0, Math.floor(((Math.min(x0, x1, x2) - sbb.min.x) / spanU) * (maskSize - 1)));
        const maxU = Math.min(maskSize - 1, Math.ceil(((Math.max(x0, x1, x2) - sbb.min.x) / spanU) * (maskSize - 1)));
        const minV = Math.max(0, Math.floor(((Math.min(z0, z1, z2) - sbb.min.z) / spanV) * (maskSize - 1)));
        const maxV = Math.min(maskSize - 1, Math.ceil(((Math.max(z0, z1, z2) - sbb.min.z) / spanV) * (maskSize - 1)));
        for (let py = minV; py <= maxV; py++) {
          const vzTest = sbb.min.z + (py / (maskSize - 1)) * spanV;
          for (let px = minU; px <= maxU; px++) {
            const vxTest = sbb.min.x + (px / (maskSize - 1)) * spanU;
            // Barycentric test in 2D
            const d1 = (vxTest - x1) * (z0 - z1) - (x0 - x1) * (vzTest - z1);
            const d2 = (vxTest - x2) * (z1 - z2) - (x1 - x2) * (vzTest - z2);
            const d3 = (vxTest - x0) * (z2 - z0) - (x2 - x0) * (vzTest - z0);
            const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
            const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
            if (!(hasNeg && hasPos)) {
              mask[py * maskSize + px] = 1;
            }
          }
        }
      }

      // 2. Subdivide targetMesh and indent its surface vertices inward wherever they fall inside the carved silhouette!
      targetMesh.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (!child.userData.preCarveGeometry) {
          child.userData.preCarveGeometry = child.geometry.clone();
        }
        const fineTarget = subdivideGeometry(child.userData.preCarveGeometry, Math.max(1.2, Math.min(availW, availH) / 24), 4);
        const tPos = fineTarget.attributes.position;
        const invMat = child.matrixWorld.clone().invert();
        const vWorld = new THREE.Vector3();

        for (let i = 0; i < tPos.count; i++) {
          vWorld.fromBufferAttribute(tPos, i).applyMatrix4(child.matrixWorld);
          const rel = vWorld.clone().sub(anchorCenter);
          // Only carve vertices on the selected side
          if (rel.dot(outward) < -2) continue;

          const uCoord = rel.dot(right);
          const vCoord = rel.dot(up);
          if (uCoord >= sbb.min.x && uCoord <= sbb.max.x && vCoord >= sbb.min.z && vCoord <= sbb.max.z) {
            const mx = Math.floor(((uCoord - sbb.min.x) / spanU) * (maskSize - 1));
            const my = Math.floor(((vCoord - sbb.min.z) / spanV) * (maskSize - 1));
            if (mask[my * maskSize + mx]) {
              vWorld.addScaledVector(dir, depthMm * 0.85);
              vWorld.applyMatrix4(invMat);
              tPos.setXYZ(i, vWorld.x, vWorld.y, vWorld.z);
            }
          }
        }
        tPos.needsUpdate = true;
        fineTarget.computeVertexNormals();
        child.geometry.dispose();
        child.geometry = fineTarget;
      });
    }

    // 3. Deform every vertex of sourceMesh to follow the exact target surface relief
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i); // 0 at bottom, depthMm at top
      const vz = pos.getZ(i);

      const { pt } = sampleSurface(vx, vz);
      // In emboss mode: bottom sits slightly inside (-0.2mm) for watertight union, top protrudes by +vy along outward direction
      // In engrave mode: recessed inside the carved groove to form crisp inner walls & floor
      const displacement = mode === 'engrave'
        ? (-depthMm * 0.88 + vy * 0.35)
        : (vy - 0.15);

      const finalWorld = pt.clone().addScaledVector(outward, displacement);
      pos.setXYZ(
        i,
        finalWorld.x - targetCenter.x,
        finalWorld.y - targetCenter.y,
        finalWorld.z - targetCenter.z
      );
    }

    pos.needsUpdate = true;
    baseGeom.computeVertexNormals();
    sourceMesh.geometry.dispose();
    sourceMesh.geometry = baseGeom;
    sourceMesh.rotation.set(0, 0, 0);
    sourceMesh.scale.set(1, 1, 1);
    sourceMesh.position.copy(targetCenter);

    sourceMesh.userData.stickMode = mode;
    sourceMesh.userData.stuckTo = targetMesh.uuid;
    sourceMesh.userData.lastStickFace = face;
    sourceMesh.userData.lastStickOpts = { ...customOpts, face, mode };

    if (mode === 'engrave') {
      sourceMesh.material = new THREE.MeshStandardMaterial({
        color: 0x181b20,
        roughness: 0.9,
        metalness: 0.05
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
     5. Keychain, Charger Tag & Bag Tag 3D Generator
        Generates TRUE Contour-Hugging 2-Layer, 3-Layer (Faisal style),
        Script Rim (Ali style), Bubble (Name style), and Monogram (N + Name style) 3D models!
     ────────────────────────────────────────────────────────────── */
  function traceContourTextCanvas(text, fontFamily, strokePx, includeEyeletPos = null, scaleMmPerPx = 0.22, depthMm = 3.0) {
    const fontPx = 135;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontPx}px "${fontFamily}", "Cairo", sans-serif`;

    const m = ctx.measureText(text);
    const pad = 110;
    canvas.width = Math.min(2600, Math.max(420, Math.ceil(m.width + pad * 2.4)));
    canvas.height = 420;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // First draw plain text to find exact ink bounds (leftmost & rightmost painted pixel)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontPx}px "${fontFamily}", "Cairo", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);

    const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (rawData[(y * canvas.width + x) * 4 + 3] > 80) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX >= maxX) {
      minX = cx - 80; maxX = cx + 80; minY = cy - 40; maxY = cy + 40;
    }

    // Re-draw with desired round contour dilation (strokePx) + integrated keyring eyelet!
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontPx}px "${fontFamily}", "Cairo", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (strokePx > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = strokePx;
      ctx.strokeText(text, cx, cy);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);

    // Draw integrated Keyring Eyelet or Charger C-Clip directly connected to the organic text contour!
    const midInkY = (minY + maxY) * 0.5;
    if (includeEyeletPos === 'left' || includeEyeletPos === 'right') {
      const isLeft = includeEyeletPos === 'left';
      const outerR = 32;
      const holeR = 14;
      const ex = isLeft ? (minX - strokePx * 0.45 - 14) : (maxX + strokePx * 0.45 + 14);
      const ey = midInkY;

      // Bridge connecting eyelet smoothly into the contour body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = outerR * 1.45;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(isLeft ? minX + 12 : maxX - 12, ey);
      ctx.stroke();

      // Punch the keyring hole
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(ex, ey, holeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (includeEyeletPos === 'top') {
      const outerR = 32;
      const holeR = 14;
      const ex = cx;
      const ey = minY - strokePx * 0.45 - 16;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = outerR * 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex, minY + 14);
      ctx.stroke();

      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(ex, ey, holeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (includeEyeletPos === 'cable_clip' || includeEyeletPos === 'cable_hole') {
      // Snap-on Charger Cable C-Clip attached to right edge of contour
      const outerR = 34;
      const holeR = 13;
      const ex = maxX + strokePx * 0.45 + 18;
      const ey = midInkY;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = outerR * 1.4;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(maxX - 10, ey);
      ctx.stroke();

      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(ex, ey, holeR, 0, Math.PI * 2);
      ctx.fill();
      if (includeEyeletPos === 'cable_clip') {
        // Open side slot so charger cable snaps in!
        ctx.fillRect(ex, ey - 8, outerR + 6, 16);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    const loops = traceCanvasToShapes(canvas, 115, 0.55);
    const shapes = loopsToThreeShapes(loops, scaleMmPerPx, cx, cy);
    if (!shapes.length) {
      return new THREE.BoxGeometry(30, depthMm, 15);
    }
    const geom = new THREE.ExtrudeGeometry(shapes, {
      depth: depthMm,
      bevelEnabled: false,
      curveSegments: 7
    });
    geom.rotateX(-Math.PI / 2);
    geom.computeBoundingBox();
    geom.translate(0, -geom.boundingBox.min.y, 0);
    geom.computeVertexNormals();
    return geom;
  }

  async function createKeychainGroup(opts = {}) {
    const {
      text = 'فيصل',
      fontFamily = 'Cairo',
      template = window.MJCatalog.KEYCHAIN_TEMPLATES[0],
      baseThickness = 3.2,
      textHeight = 2.0,
      customBaseColor = null,
      customMidColor = null,
      customTextColor = null
    } = opts;

    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([
          document.fonts.load(`bold 135px "${fontFamily}"`),
          new Promise((r) => setTimeout(r, 800))
        ]);
      }
    } catch (e) {}

    const baseColorHex = customBaseColor || template.baseColor || '#dc2626';
    const midColorHex = customMidColor || template.midColor || '#111827';
    const textColorHex = customTextColor || template.textColor || '#facc15';
    const scaleMult = (template.scale || 1.0) * 0.21;
    const style = template.style || 'contour_3layer';
    const holePos = template.holePos || 'left';

    const group = new THREE.Group();

    // STYLE 1: 3-Layer Organic Contour Keychain (Faisal style: Red bubble base + Black stroke outline + Yellow inner letters)
    if (style === 'contour_3layer') {
      const baseGeom = traceContourTextCanvas(text, fontFamily, 54, holePos, scaleMult, baseThickness);
      const midGeom = traceContourTextCanvas(text, fontFamily, 18, null, scaleMult, textHeight * 0.65);
      const topGeom = traceContourTextCanvas(text, fontFamily, 0, null, scaleMult, textHeight * 1.2);

      const baseMesh = new THREE.Mesh(baseGeom, new THREE.MeshStandardMaterial({ color: baseColorHex, roughness: 0.35, metalness: 0.1 }));
      baseMesh.name = 'القاعدة المحيطية (لون 1)';
      group.add(baseMesh);

      const midMesh = new THREE.Mesh(midGeom, new THREE.MeshStandardMaterial({ color: midColorHex, roughness: 0.3, metalness: 0.1 }));
      midMesh.name = 'الإطار الأوسط البارز (لون 2)';
      midMesh.position.y = baseThickness - 0.15;
      group.add(midMesh);

      const topMesh = new THREE.Mesh(topGeom, new THREE.MeshStandardMaterial({ color: textColorHex, roughness: 0.25, metalness: 0.12 }));
      topMesh.name = `حروف الاسم (${text}) (لون 3)`;
      topMesh.position.y = baseThickness - 0.15;
      group.add(topMesh);
    }
    // STYLE 2: Script Rim Contour Keychain (Ali style: Tight white base + raised white border rim + sky blue inner script)
    else if (style === 'contour_rim') {
      const baseGeom = traceContourTextCanvas(text, fontFamily, 30, holePos, scaleMult, baseThickness);
      const rimGeom = traceContourTextCanvas(text, fontFamily, 15, null, scaleMult, textHeight * 0.72);
      const innerGeom = traceContourTextCanvas(text, fontFamily, 0, null, scaleMult, textHeight * 1.15);

      const baseMesh = new THREE.Mesh(baseGeom, new THREE.MeshStandardMaterial({ color: baseColorHex, roughness: 0.3, metalness: 0.1 }));
      baseMesh.name = 'قاعدة المخطوطة';
      group.add(baseMesh);

      const rimMesh = new THREE.Mesh(rimGeom, new THREE.MeshStandardMaterial({ color: midColorHex, roughness: 0.3, metalness: 0.1 }));
      rimMesh.name = 'الحافة البارزة';
      rimMesh.position.y = baseThickness - 0.15;
      group.add(rimMesh);

      const innerMesh = new THREE.Mesh(innerGeom, new THREE.MeshStandardMaterial({ color: textColorHex, roughness: 0.22, metalness: 0.15 }));
      innerMesh.name = `المخطوطة الداخلية (${text})`;
      innerMesh.position.y = baseThickness - 0.15;
      group.add(innerMesh);
    }
    // STYLE 3: Monogram Big Letter + Name Bubble Overlay (N + Name style)
    else if (style === 'monogram_overlay') {
      const firstChar = Array.from(text.trim())[0] || 'M';
      const monoGeom = traceContourTextCanvas(firstChar, fontFamily, 14, 'top', scaleMult * 1.85, baseThickness);
      const bannerGeom = traceContourTextCanvas(text, fontFamily, 38, null, scaleMult * 0.82, textHeight * 0.85);
      const nameGeom = traceContourTextCanvas(text, fontFamily, 0, null, scaleMult * 0.82, textHeight * 1.55);

      const monoMesh = new THREE.Mesh(monoGeom, new THREE.MeshStandardMaterial({ color: baseColorHex, roughness: 0.32, metalness: 0.12 }));
      monoMesh.name = `الحرف الكبير (${firstChar}) (لون 1)`;
      group.add(monoMesh);

      const bannerMesh = new THREE.Mesh(bannerGeom, new THREE.MeshStandardMaterial({ color: midColorHex, roughness: 0.3, metalness: 0.1 }));
      bannerMesh.name = 'سحابة الاسم الوسطى (لون 2)';
      bannerMesh.position.y = baseThickness - 0.2;
      group.add(bannerMesh);

      const nameMesh = new THREE.Mesh(nameGeom, new THREE.MeshStandardMaterial({ color: textColorHex, roughness: 0.25, metalness: 0.15 }));
      nameMesh.name = `الاسم البارز (${text}) (لون 3)`;
      nameMesh.position.y = baseThickness - 0.2;
      group.add(nameMesh);
    }
    // STYLE 4: Organic Bubble Outline Keychain (Purple & White "Name" style)
    else {
      const baseGeom = traceContourTextCanvas(text, fontFamily, 48, holePos, scaleMult, baseThickness);
      const topGeom = traceContourTextCanvas(text, fontFamily, 0, null, scaleMult, textHeight);

      const baseMesh = new THREE.Mesh(baseGeom, new THREE.MeshStandardMaterial({ color: baseColorHex, roughness: 0.35, metalness: 0.1 }));
      baseMesh.name = 'قاعدة الببل المحيطة بالاسم';
      group.add(baseMesh);

      const topMesh = new THREE.Mesh(topGeom, new THREE.MeshStandardMaterial({ color: textColorHex, roughness: 0.25, metalness: 0.15 }));
      topMesh.name = `حروف الاسم (${text})`;
      topMesh.position.y = template.engrave ? baseThickness - textHeight * 0.65 : baseThickness - 0.15;
      group.add(topMesh);
    }

    // Center the whole multi-color group cleanly on the origin
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.children.forEach((ch) => {
      ch.position.x -= center.x;
      ch.position.z -= center.z;
    });

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

  /* ──────────────────────────────────────────────────────────────
     10. Dual-Name 3D Sculpture Maker ("مجسم الأسماء")
         Creates the iconic Arabic Calligraphic Stretched Kashida Name
         in the background + Overlapping English Cursive Script Name in front!
     ────────────────────────────────────────────────────────────── */
  const ARABIC_CONNECTING_AFTER = new Set(Array.from('بتثجحخسشصضطظعغفقكلمنهيئـ'));

  function insertSmartKashida(rawText, kashidaCount = 6) {
    const clean = String(rawText || 'جود').trim();
    if (!clean) return { text: 'جــــــود', hasNativeKashida: true };
    const count = Math.max(0, Math.min(14, Number(kashidaCount || 0)));
    if (count === 0) return { text: clean, hasNativeKashida: true };

    // If user already typed tatweel 'ـ', expand it to match desired kashidaCount
    if (clean.includes('ـ')) {
      const firstIdx = clean.indexOf('ـ');
      const stripped = clean.replace(/ـ+/g, '');
      const pos = Math.min(stripped.length - 1, Math.max(1, firstIdx));
      return {
        text: stripped.slice(0, pos) + 'ـ'.repeat(count) + stripped.slice(pos),
        hasNativeKashida: true
      };
    }

    const chars = Array.from(clean);
    if (chars.length < 2) {
      return { text: clean + 'ـ'.repeat(count), hasNativeKashida: true };
    }

    // Find best connecting character before the last letter (prefer near middle/first half like 'ج' in 'جود')
    let bestIdx = -1;
    const mid = Math.floor((chars.length - 1) / 2);
    for (let offset = 0; offset < chars.length - 1; offset++) {
      const candidates = [mid - offset, mid + offset];
      for (const idx of candidates) {
        if (idx >= 0 && idx < chars.length - 1 && ARABIC_CONNECTING_AFTER.has(chars[idx])) {
          bestIdx = idx;
          break;
        }
      }
      if (bestIdx !== -1) break;
    }

    if (bestIdx !== -1) {
      return {
        text: chars.slice(0, bestIdx + 1).join('') + 'ـ'.repeat(count) + chars.slice(bestIdx + 1).join(''),
        hasNativeKashida: true
      };
    }

    // No standard connecting letter (e.g. 'ورود' or 'رؤى'): insert space for calligraphic swash bridge
    return {
      text: clean,
      hasNativeKashida: false
    };
  }

  function applyCalligraphicCradleWarp(canvas, curveDipPx = 28) {
    if (!curveDipPx || Math.abs(curveDipPx) < 1) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const src = ctx.getImageData(0, 0, w, h);
    const sData = src.data;

    let minX = w, maxX = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (sData[(y * w + x) * 4 + 3] > 60) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    if (minX >= maxX) return;

    const spanX = Math.max(1, maxX - minX);
    const dst = ctx.createImageData(w, h);
    const dData = dst.data;

    for (let x = 0; x < w; x++) {
      let shiftY = 0;
      if (x >= minX && x <= maxX) {
        const u = (x - minX) / spanX; // 0 .. 1
        // Smooth calligraphic cradle curve dipping in the center (sin^1.3 profile)
        shiftY = Math.round(curveDipPx * Math.pow(Math.sin(Math.PI * u), 1.25));
      }
      for (let y = 0; y < h; y++) {
        const sy = y - shiftY;
        if (sy >= 0 && sy < h) {
          const sIdx = (sy * w + x) * 4;
          const dIdx = (y * w + x) * 4;
          dData[dIdx] = sData[sIdx];
          dData[dIdx + 1] = sData[sIdx + 1];
          dData[dIdx + 2] = sData[sIdx + 2];
          dData[dIdx + 3] = sData[sIdx + 3];
        }
      }
    }
    ctx.putImageData(dst, 0, 0);
  }

  function connectAllCanvasIslands(canvas, bridgeWidth = 14) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h).data;

    const step = 2;
    const gw = Math.ceil(w / step);
    const gh = Math.ceil(h / step);
    const mask = new Uint8Array(gw * gh);
    const visited = new Int32Array(gw * gh);

    for (let gy = 0; gy < gh; gy++) {
      const py = Math.min(h - 1, gy * step);
      for (let gx = 0; gx < gw; gx++) {
        const px = Math.min(w - 1, gx * step);
        if (imgData[(py * w + px) * 4 + 3] > 90) {
          mask[gy * gw + gx] = 1;
        }
      }
    }

    const islands = [];
    const queue = new Int32Array(gw * gh);

    for (let i = 0; i < gw * gh; i++) {
      if (!mask[i] || visited[i]) continue;
      const compId = islands.length + 1;
      let head = 0, tail = 0;
      queue[tail++] = i;
      visited[i] = compId;
      let area = 0;
      const boundary = [];

      while (head < tail) {
        const cur = queue[head++];
        area++;
        const cx = cur % gw;
        const cy = (cur / gw) | 0;
        let isBorder = false;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= gh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= gw) continue;
            const nIdx = ny * gw + nx;
            if (!mask[nIdx]) {
              isBorder = true;
            } else if (!visited[nIdx]) {
              visited[nIdx] = compId;
              queue[tail++] = nIdx;
            }
          }
        }
        // Subsample boundary points slightly for ultra-fast nearest-pair search
        if (isBorder && (area % 2 === 0)) {
          boundary.push({ x: cx * step, y: cy * step });
        }
      }

      if (area >= 4 && boundary.length > 0) {
        islands.push({ id: compId, area, boundary, merged: false });
      }
    }

    if (islands.length <= 1) return;

    // Sort islands largest first (islands[0] is the main calligraphic body)
    islands.sort((a, b) => b.area - a.area);
    islands[0].merged = true;
    const mainBoundary = [...islands[0].boundary];

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let stepIter = 1; stepIter < islands.length; stepIter++) {
      let bestIsl = null;
      let bestDistSq = Infinity;
      let bestA = null;
      let bestB = null;

      for (let i = 1; i < islands.length; i++) {
        const isl = islands[i];
        if (isl.merged) continue;
        const bList = isl.boundary;
        for (let aIdx = 0; aIdx < bList.length; aIdx++) {
          const pa = bList[aIdx];
          for (let mIdx = 0; mIdx < mainBoundary.length; mIdx += 2) {
            const pb = mainBoundary[mIdx];
            const dx = pa.x - pb.x;
            const dy = pa.y - pb.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq) {
              bestDistSq = d2;
              bestIsl = isl;
              bestA = pa;
              bestB = pb;
            }
          }
        }
      }

      if (!bestIsl || !bestA || !bestB) break;
      bestIsl.merged = true;

      const isDot = bestIsl.area < 450;
      if (isDot) {
        // Connect Arabic/English dot directly to letter stroke so it never falls off during 3D printing
        ctx.lineWidth = Math.max(8, bridgeWidth * 0.82);
        ctx.beginPath();
        ctx.moveTo(bestA.x, bestA.y);
        ctx.lineTo(bestB.x, bestB.y);
        ctx.stroke();
      } else {
        // Connect disconnected letter (like 'د', 'و', 'ر') with a graceful curved calligraphic swash
        const midX = (bestA.x + bestB.x) * 0.5;
        const midY = Math.max(bestA.y, bestB.y) + Math.min(18, Math.hypot(bestA.x - bestB.x, bestA.y - bestB.y) * 0.22);
        ctx.lineWidth = bridgeWidth;
        ctx.beginPath();
        ctx.moveTo(bestA.x, bestA.y);
        ctx.quadraticCurveTo(midX, midY, bestB.x, bestB.y);
        ctx.stroke();
      }

      for (let k = 0; k < bestIsl.boundary.length; k++) {
        mainBoundary.push(bestIsl.boundary[k]);
      }
    }
    ctx.restore();
  }

  function getCanvasAlphaBounds(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] > 80) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX >= maxX) {
      return { minX: w * 0.25, maxX: w * 0.75, minY: h * 0.3, maxY: h * 0.7, width: w * 0.5, height: h * 0.4 };
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }

  async function buildDualNameCanvases(opts = {}) {
    const {
      arText = 'جود',
      enText = 'Joud',
      arFont = 'Aref Ruqaa',
      enFont = 'Great Vibes',
      kashidaCount = 6,
      curveDip = 26,
      enScalePct = 44,
      enOffsetX = 0,
      enOffsetY = 0
    } = opts;

    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([
          Promise.all([
            document.fonts.load(`bold 150px "${arFont}"`),
            document.fonts.load(`bold 120px "${enFont}"`)
          ]),
          new Promise((r) => setTimeout(r, 750))
        ]);
      }
    } catch (e) {}

    const cw = 1500;
    const ch = 620;

    // 1. Render Stretched Calligraphic Arabic Name
    const arCanvas = document.createElement('canvas');
    arCanvas.width = cw;
    arCanvas.height = ch;
    const arCtx = arCanvas.getContext('2d');

    const { text: stretchedAr, hasNativeKashida } = insertSmartKashida(arText, kashidaCount);
    let arFontPx = 175;
    arCtx.font = `bold ${arFontPx}px "${arFont}", "Amiri", "Cairo", serif`;
    let measuredW = arCtx.measureText(stretchedAr).width;
    if (measuredW > cw * 0.82) {
      arFontPx = Math.max(95, Math.floor(arFontPx * ((cw * 0.82) / measuredW)));
      arCtx.font = `bold ${arFontPx}px "${arFont}", "Amiri", "Cairo", serif`;
    }

    const cx = cw / 2;
    const cy = ch * 0.48;

    arCtx.clearRect(0, 0, cw, ch);
    arCtx.direction = 'rtl';
    arCtx.textAlign = 'center';
    arCtx.textBaseline = 'middle';
    arCtx.lineJoin = 'round';
    arCtx.lineCap = 'round';
    // Reinforce stroke slightly so thin calligraphic necks print strong & solid
    arCtx.strokeStyle = '#ffffff';
    arCtx.lineWidth = Math.max(6, arFontPx * 0.048);
    arCtx.strokeText(stretchedAr, cx, cy);
    arCtx.fillStyle = '#ffffff';
    arCtx.fillText(stretchedAr, cx, cy);

    // If the Arabic name had no connecting letters (e.g. 'ورود'), draw a sweeping calligraphic kashida bar
    if (!hasNativeKashida && kashidaCount > 0) {
      const b0 = getCanvasAlphaBounds(arCanvas);
      arCtx.strokeStyle = '#ffffff';
      arCtx.lineWidth = Math.max(16, arFontPx * 0.11);
      arCtx.beginPath();
      arCtx.moveTo(b0.minX + b0.width * 0.15, cy + arFontPx * 0.12);
      arCtx.lineTo(b0.maxX - b0.width * 0.15, cy + arFontPx * 0.12);
      arCtx.stroke();
    }

    // Apply the signature Calligraphic Cradle Curve Warp (انحناء الكشيدة الانسيابي في الوسط نفس الصورة)
    applyCalligraphicCradleWarp(arCanvas, Number(curveDip));

    // Automatically connect all dots (نقاط) and disconnected letters (د، و، ر) into ONE solid 3D piece
    connectAllCanvasIslands(arCanvas, Math.max(13, Math.round(arFontPx * 0.085)));

    const arBounds = getCanvasAlphaBounds(arCanvas);

    // Find bottom baseline in the center cradle region of the Arabic name so English sits flush on the desk & kashida
    const arData = arCtx.getImageData(0, 0, cw, ch).data;
    const cradleLeft = Math.floor(arBounds.minX + arBounds.width * 0.30);
    const cradleRight = Math.ceil(arBounds.minX + arBounds.width * 0.70);
    let cradleMaxY = cy + 20;
    for (let y = ch - 1; y >= 0; y--) {
      let found = false;
      for (let x = cradleLeft; x <= cradleRight; x += 2) {
        if (arData[(y * cw + x) * 4 + 3] > 90) {
          cradleMaxY = y;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    // 2. Render Overlapping English Cursive Script Name on a Temporary Canvas first, then position into enCanvas
    const tmpEn = document.createElement('canvas');
    tmpEn.width = cw;
    tmpEn.height = ch;
    const tmpCtx = tmpEn.getContext('2d');
    const cleanEn = String(enText || 'Joud').trim() || 'Joud';

    const enFontPx = 150;
    tmpCtx.clearRect(0, 0, cw, ch);
    tmpCtx.direction = 'ltr';
    tmpCtx.textAlign = 'center';
    tmpCtx.textBaseline = 'middle';
    tmpCtx.lineJoin = 'round';
    tmpCtx.lineCap = 'round';
    tmpCtx.font = `bold ${enFontPx}px "${enFont}", "Great Vibes", cursive, sans-serif`;
    // Thicken English cursive hairlines so every script loop is strong & 3D-printable
    tmpCtx.strokeStyle = '#ffffff';
    tmpCtx.lineWidth = 7;
    tmpCtx.strokeText(cleanEn, cw / 2, ch / 2);
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillText(cleanEn, cw / 2, ch / 2);

    // Connect English dots ('i', 'j') & detached capital script letters into one solid English piece
    connectAllCanvasIslands(tmpEn, 11);

    const rawEnBounds = getCanvasAlphaBounds(tmpEn);
    const desiredEnWidth = Math.max(80, arBounds.width * (Number(enScalePct || 44) / 100));
    const enScale = desiredEnWidth / Math.max(1, rawEnBounds.width);
    const targetEnW = rawEnBounds.width * enScale;
    const targetEnH = rawEnBounds.height * enScale;

    const enCanvas = document.createElement('canvas');
    enCanvas.width = cw;
    enCanvas.height = ch;
    const enCtx = enCanvas.getContext('2d');

    // Align English script horizontally in the center cradle and vertically resting on the bottom baseline
    const arCenterX = (arBounds.minX + arBounds.maxX) * 0.5;
    const destX = arCenterX - targetEnW * 0.5 + Number(enOffsetX || 0) * 3;
    const targetBottomY = Math.max(cradleMaxY + 6, arBounds.maxY - 4) - Number(enOffsetY || 0) * 3;
    const destY = targetBottomY - targetEnH;

    enCtx.drawImage(
      tmpEn,
      rawEnBounds.minX,
      rawEnBounds.minY,
      rawEnBounds.width,
      rawEnBounds.height,
      destX,
      destY,
      targetEnW,
      targetEnH
    );

    const enBounds = getCanvasAlphaBounds(enCanvas);
    const totalMinX = Math.min(arBounds.minX, enBounds.minX);
    const totalMaxX = Math.max(arBounds.maxX, enBounds.maxX);
    const totalMinY = Math.min(arBounds.minY, enBounds.minY);
    const totalMaxY = Math.max(arBounds.maxY, enBounds.maxY);

    return {
      arCanvas,
      enCanvas,
      bounds: {
        minX: totalMinX,
        maxX: totalMaxX,
        minY: totalMinY,
        maxY: totalMaxY,
        width: Math.max(1, totalMaxX - totalMinX),
        height: Math.max(1, totalMaxY - totalMinY),
        centerX: (totalMinX + totalMaxX) * 0.5,
        centerY: (totalMinY + totalMaxY) * 0.5
      }
    };
  }

  function tintMaskCanvas(maskCanvas, hexColor) {
    const c = document.createElement('canvas');
    c.width = maskCanvas.width;
    c.height = maskCanvas.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function shadeHexColor(hex, factor = 0.65) {
    const clean = String(hex || '#be123c').replace('#', '');
    const num = parseInt(clean, 16) || 0xbe123c;
    const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)));
    return `rgb(${r}, ${g}, ${b})`;
  }

  async function renderDualNamePreview(previewCanvas, opts = {}) {
    if (!previewCanvas) return;
    const { arCanvas, enCanvas, bounds } = await buildDualNameCanvases(opts);
    const arColor = opts.arColor || '#be123c';
    const enColor = opts.enColor || '#ffffff';

    const pw = previewCanvas.width;
    const ph = previewCanvas.height;
    const ctx = previewCanvas.getContext('2d');

    // Studio photo-booth background with subtle floor reflection like the reference image
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ph);
    bgGrad.addColorStop(0, '#1e2128');
    bgGrad.addColorStop(0.76, '#282c35');
    bgGrad.addColorStop(0.77, '#181a20');
    bgGrad.addColorStop(1, '#121418');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, pw, ph);

    // Desk horizon line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, ph * 0.77);
    ctx.lineTo(pw - 20, ph * 0.77);
    ctx.stroke();

    const padX = 56;
    const padY = 34;
    const scale = Math.min((pw - padX * 2) / bounds.width, (ph * 0.68 - padY) / bounds.height);
    const drawW = bounds.width * scale;
    const drawH = bounds.height * scale;
    const dx = (pw - drawW) * 0.5;
    const dy = ph * 0.77 - drawH;

    // Ground soft shadow on desk
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(pw * 0.5, ph * 0.78, drawW * 0.46, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1. Draw 3D extruded Arabic layer (back depth + front face)
    const arSide = tintMaskCanvas(arCanvas, shadeHexColor(arColor, 0.58));
    const arFront = tintMaskCanvas(arCanvas, arColor);
    const depthStepsAr = 8;
    for (let d = depthStepsAr; d >= 1; d--) {
      ctx.drawImage(
        arSide,
        bounds.minX, bounds.minY, bounds.width, bounds.height,
        dx - d * 0.85, dy - d * 0.55, drawW, drawH
      );
    }
    ctx.drawImage(
      arFront,
      bounds.minX, bounds.minY, bounds.width, bounds.height,
      dx, dy, drawW, drawH
    );

    // 2. Draw 3D extruded English layer in front (with drop shadow onto Arabic kashida)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = -2;
    ctx.shadowOffsetY = 3;
    const enSide = tintMaskCanvas(enCanvas, shadeHexColor(enColor, 0.72));
    for (let d = 5; d >= 1; d--) {
      ctx.drawImage(
        enSide,
        bounds.minX, bounds.minY, bounds.width, bounds.height,
        dx + 2 - d * 0.7, dy + 1 - d * 0.45, drawW, drawH
      );
    }
    ctx.restore();

    const enFront = tintMaskCanvas(enCanvas, enColor);
    ctx.drawImage(
      enFront,
      bounds.minX, bounds.minY, bounds.width, bounds.height,
      dx + 2, dy + 1, drawW, drawH
    );
  }

  async function createDualNameSculpture(opts = {}) {
    const {
      arText = 'جود',
      enText = 'Joud',
      arColor = '#be123c',
      enColor = '#ffffff',
      totalWidthMm = 160,
      arDepthMm = 12,
      enProtrudeMm = 3.5,
      orientation = 'standing'
    } = opts;

    const { arCanvas, enCanvas, bounds } = await buildDualNameCanvases(opts);
    const mmPerPx = Number(totalWidthMm || 160) / Math.max(1, bounds.width);

    const arLoops = traceCanvasToShapes(arCanvas, 115, 0.55);
    const enLoops = traceCanvasToShapes(enCanvas, 115, 0.50);

    const arShapes = loopsToThreeShapes(arLoops, mmPerPx, bounds.centerX, bounds.centerY);
    const enShapes = loopsToThreeShapes(enLoops, mmPerPx, bounds.centerX, bounds.centerY);

    if (!arShapes.length) {
      throw new Error('لم يتم العثور على حروف عربية صالحة لتوليد المجسم');
    }

    const backDepth = Math.max(3, Number(arDepthMm || 12));
    const frontProtrude = Math.max(1.2, Number(enProtrudeMm || 3.5));

    // Arabic base sculpture geometry (from Z = 0 to Z = backDepth)
    const arGeom = new THREE.ExtrudeGeometry(arShapes, {
      depth: backDepth,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.28,
      bevelSegments: 2,
      curveSegments: 7
    });

    // English foreground script geometry: starts embedded inside Arabic mesh (Z = backDepth * 0.35)
    // and protrudes out the front to (Z = backDepth + frontProtrude) so they interlock solidly!
    const embedStart = backDepth * 0.35;
    const enTotalDepth = (backDepth - embedStart) + frontProtrude;
    const enGeom = enShapes.length
      ? new THREE.ExtrudeGeometry(enShapes, {
          depth: enTotalDepth,
          bevelEnabled: true,
          bevelThickness: 0.3,
          bevelSize: 0.22,
          bevelSegments: 2,
          curveSegments: 7
        })
      : new THREE.BoxGeometry(10, 10, enTotalDepth);

    if (enShapes.length) {
      enGeom.translate(0, 0, embedStart);
    }

    if (orientation === 'flat') {
      // Lay flat on build plate (Y is extrusion thickness upward) for zero-support printing & color change
      arGeom.rotateX(-Math.PI / 2);
      enGeom.rotateX(-Math.PI / 2);
    }

    arGeom.computeVertexNormals();
    enGeom.computeVertexNormals();

    const group = new THREE.Group();
    const arMesh = new THREE.Mesh(
      arGeom,
      new THREE.MeshStandardMaterial({ color: arColor, roughness: 0.3, metalness: 0.12 })
    );
    arMesh.name = `الاسم العربي (${arText})`;
    arMesh.castShadow = true;
    arMesh.receiveShadow = true;

    const enMesh = new THREE.Mesh(
      enGeom,
      new THREE.MeshStandardMaterial({ color: enColor, roughness: 0.25, metalness: 0.1 })
    );
    enMesh.name = `الاسم الإنجليزي (${enText})`;
    enMesh.castShadow = true;
    enMesh.receiveShadow = true;

    group.add(arMesh);
    group.add(enMesh);

    // Center the whole dual-name sculpture on X and Z, and ground firmly at Y = 0 on the build plate
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.children.forEach((ch) => {
      ch.geometry.translate(-center.x, -box.min.y, -center.z);
      ch.geometry.computeBoundingBox();
    });

    group.userData.isMultiColorGroup = true;
    return group;
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
    mergeBufferGeometries,
    renderDualNamePreview,
    createDualNameSculpture
  };
})();

