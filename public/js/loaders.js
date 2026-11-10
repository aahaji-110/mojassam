/**
 * مجسمات (Mojassamat) - Universal 3D & 2D File Importer (STL, OBJ, 3MF, SVG)
 * ============================================================================
 * Parses Binary/ASCII STL, Wavefront OBJ, 3MF (with colors & multiple parts),
 * and SVG vector files directly into Three.js Meshes/Groups.
 */

window.MJLoaders = (function () {
  /* ── 1. STL Parser (Binary & ASCII) ── */
  function parseSTL(buffer) {
    const view = new DataView(buffer);
    const isAscii = checkSTLIsAscii(buffer);
    if (isAscii) {
      return parseSTLString(new TextDecoder('utf-8').decode(buffer));
    }
    const faces = view.getUint32(80, true);
    const positions = new Float32Array(faces * 9);
    const normals = new Float32Array(faces * 9);
    let offset = 84;
    for (let i = 0; i < faces; i++) {
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      offset += 12;
      for (let v = 0; v < 3; v++) {
        const vx = view.getFloat32(offset, true);
        const vy = view.getFloat32(offset + 4, true);
        const vz = view.getFloat32(offset + 8, true);
        offset += 12;
        const idx = i * 9 + v * 3;
        // Convert Slicer Z-up to Three.js Y-up
        positions[idx] = vx;
        positions[idx + 1] = vz;
        positions[idx + 2] = -vy;
        normals[idx] = nx;
        normals[idx + 1] = nz;
        normals[idx + 2] = -ny;
      }
      offset += 2; // attribute byte count
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    centerAndGroundGeometry(geom);
    return geom;
  }

  function checkSTLIsAscii(buffer) {
    if (buffer.byteLength < 84) return true;
    const view = new DataView(buffer);
    const faces = view.getUint32(80, true);
    const expected = 84 + faces * 50;
    if (expected === buffer.byteLength) return false;
    const head = new TextDecoder('utf-8').decode(buffer.slice(0, Math.min(256, buffer.byteLength)));
    return head.trimStart().toLowerCase().startsWith('solid') && head.includes('facet');
  }

  function parseSTLString(text) {
    const verts = [];
    const re = /vertex\s+([\d.+\-eE]+)\s+([\d.+\-eE]+)\s+([\d.+\-eE]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const vx = parseFloat(m[1]);
      const vy = parseFloat(m[2]);
      const vz = parseFloat(m[3]);
      verts.push(vx, vz, -vy);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.computeVertexNormals();
    centerAndGroundGeometry(geom);
    return geom;
  }

  /* ── 2. OBJ Parser ── */
  function parseOBJ(text) {
    const rawV = [];
    const outVerts = [];
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\s+/);
      if (parts[0] === 'v' && parts.length >= 4) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        rawV.push([x, y, z]);
      } else if (parts[0] === 'f' && parts.length >= 4) {
        const idxs = parts.slice(1).map((tok) => {
          const i = parseInt(tok.split('/')[0], 10);
          return i < 0 ? rawV.length + i : i - 1;
        });
        for (let i = 1; i < idxs.length - 1; i++) {
          const a = rawV[idxs[0]];
          const b = rawV[idxs[i]];
          const c = rawV[idxs[i + 1]];
          if (a && b && c) {
            outVerts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          }
        }
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(outVerts, 3));
    geom.computeVertexNormals();
    centerAndGroundGeometry(geom);
    return geom;
  }

  /* ── 3. 3MF Parser (ZIP + XML Model with Multi-Part & Color Support) ── */
  async function parse3MF(buffer) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('مكتبة فك ضغط 3MF غير متوفرة');
    }
    const zip = await window.JSZip.loadAsync(buffer);
    const modelFiles = [];
    zip.forEach((relPath, file) => {
      if (relPath.toLowerCase().endsWith('.model')) {
        modelFiles.push(file);
      }
    });
    if (!modelFiles.length) {
      throw new Error('لم يتم العثور على ملف 3D داخل أرشيف 3MF');
    }

    const palette = ['#10b981', '#38bdf8', '#f59e0b', '#f43f5e', '#a78bfa', '#ffffff'];
    const group = new THREE.Group();
    let partIdx = 0;

    for (const mf of modelFiles) {
      const xmlText = await mf.async('string');
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const meshes = doc.getElementsByTagName('mesh');

      for (let m = 0; m < meshes.length; m++) {
        const meshEl = meshes[m];
        const vEls = meshEl.getElementsByTagName('vertex');
        const tEls = meshEl.getElementsByTagName('triangle');
        if (!vEls.length || !tEls.length) continue;

        const verts = new Float32Array(vEls.length * 3);
        for (let i = 0; i < vEls.length; i++) {
          const vx = parseFloat(vEls[i].getAttribute('x') || '0');
          const vy = parseFloat(vEls[i].getAttribute('y') || '0');
          const vz = parseFloat(vEls[i].getAttribute('z') || '0');
          verts[i * 3] = vx;
          verts[i * 3 + 1] = vz;
          verts[i * 3 + 2] = -vy;
        }

        const indices = new Uint32Array(tEls.length * 3);
        for (let i = 0; i < tEls.length; i++) {
          indices[i * 3] = parseInt(tEls[i].getAttribute('v1') || '0', 10);
          indices[i * 3 + 1] = parseInt(tEls[i].getAttribute('v2') || '0', 10);
          indices[i * 3 + 2] = parseInt(tEls[i].getAttribute('v3') || '0', 10);
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
        geom.computeVertexNormals();

        const color = palette[partIdx % palette.length];
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 })
        );
        mesh.name = `جزء 3MF #${partIdx + 1}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        partIdx++;
      }
    }

    if (group.children.length === 1) {
      const single = group.children[0];
      centerAndGroundGeometry(single.geometry);
      return single;
    }

    // Center group on build plate
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.children.forEach((ch) => {
      ch.geometry.translate(-center.x, -box.min.y, -center.z);
    });
    group.userData.isMultiColorGroup = group.children.length > 1;
    return group;
  }

  /* ── 4. SVG File to 3D Extruded Mesh ── */
  async function parseSVGToMesh(svgText, depthMm = 4) {
    const cleanSvg = window.MJSecurity ? window.MJSecurity.sanitizeSVG(svgText) : svgText;
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 700;
      canvas.height = 700;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 50, 50, 600, 600);

      // Ensure non-transparent pixels become solid alpha for contour tracing
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const fg = a > 50 && lum < 245;
        d[i + 3] = fg ? 255 : 0;
      }
      ctx.putImageData(data, 0, 0);

      const loops = window.MJEngine.traceCanvasToShapes(canvas, 120, 0.65);
      const shapes = window.MJEngine.loopsToThreeShapes(loops, 0.12, canvas.width / 2, canvas.height / 2);

      if (!shapes.length) {
        throw new Error('لم يتم العثور على مسارات مغلقة في ملف SVG');
      }

      const geom = new THREE.ExtrudeGeometry(shapes, {
        depth: depthMm,
        bevelEnabled: false,
        curveSegments: 8
      });
      geom.rotateX(-Math.PI / 2);
      centerAndGroundGeometry(geom);
      return geom;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function centerAndGroundGeometry(geom) {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    geom.translate(-cx, -bb.min.y, -cz);
    geom.computeBoundingBox();
    geom.computeVertexNormals();
  }

  async function loadModelFile(file) {
    if (window.MJSecurity) {
      const check = await window.MJSecurity.validateFile(file);
      if (!check.valid) throw new Error(check.reason);
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'stl') {
      const buf = await file.arrayBuffer();
      const geom = parseSTL(buf);
      return new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.35, metalness: 0.1 })
      );
    }
    if (ext === 'obj') {
      const txt = await file.text();
      const geom = parseOBJ(txt);
      return new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.35, metalness: 0.1 })
      );
    }
    if (ext === '3mf') {
      const buf = await file.arrayBuffer();
      return await parse3MF(buf);
    }
    if (ext === 'svg') {
      const txt = await file.text();
      const geom = await parseSVGToMesh(txt, 4);
      return new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.35, metalness: 0.1 })
      );
    }
    throw new Error('صيغة الملف غير مدعومة');
  }

  return {
    parseSTL,
    parseOBJ,
    parse3MF,
    parseSVGToMesh,
    centerAndGroundGeometry,
    loadModelFile
  };
})();

