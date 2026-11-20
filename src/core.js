// Pure functions (no DOM). Shared by the viewer (src/ui.js) and the tests (tests/*.test.js).
//
// Volume layout: Int16 HU and Uint8 labels, C order [z][y][x] in DISPLAY orientation:
//   z = 0 most superior -> caudal; y = 0 most anterior -> posterior; x = 0 patient RIGHT -> patient left
// (radiological convention: the patient's right appears on the left of the screen).

/** Window presets: centre / width in Hounsfield units (standard radiology values). */
export const WINDOWS = {
  soft:        { c: 40,   w: 400 },
  mediastinum: { c: 50,   w: 350 },
  lung:        { c: -600, w: 1500 },
  bone:        { c: 400,  w: 1800 },
  brain:       { c: 40,   w: 80 },
  liver:       { c: 70,   w: 170 },
  vascular:    { c: 150,  w: 600 },
};

export const PLANES = ['axial', 'coronal', 'sagittal'];

/** Undo the byte shuffle written by tools/build.py (all low bytes, then all high bytes). */
export function unshuffleInt16(bytes, n) {
  if (bytes.length !== 2 * n) throw new Error(`expected ${2 * n} bytes, got ${bytes.length}`);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = ((bytes[i] | (bytes[n + i] << 8)) << 16) >> 16;
  return out;
}

/** Base64 text -> bytes (fallback transport for hosts that refuse binary files). */
export function base64ToBytes(text) {
  const bin = atob(text.trim());
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export const isGzip = u8 => u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;

/** Grey-level lookup table for HU -1024..3071 (index = HU + 1024). */
export function buildLUT(c, w, out = new Uint8Array(4096)) {
  const lo = c - w / 2, k = 255 / Math.max(1, w);
  for (let i = 0; i < 4096; i++) {
    const g = (i - 1024 - lo) * k;
    out[i] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
  }
  return out;
}

/** Size of a plane's image (pixels and mm per pixel) and its number of slices. dims=[Z,Y,X], sp=[sz,sy,sx]. */
export function planeInfo(plane, dims, sp) {
  const [Z, Y, X] = dims;
  if (plane === 'axial') return { w: X, h: Y, pw: sp[2], ph: sp[1], n: Z };
  if (plane === 'coronal') return { w: X, h: Z, pw: sp[2], ph: sp[0], n: Y };
  if (plane === 'sagittal') return { w: Y, h: Z, pw: sp[1], ph: sp[0], n: X };
  throw new Error('unknown plane ' + plane);
}

/** Slice index of a plane at the crosshair. */
export const sliceOf = (plane, cur) => plane === 'axial' ? cur.z : plane === 'coronal' ? cur.y : cur.x;

/** Return a copy of the crosshair with the plane's slice set to v (clamped). */
export function withSlice(plane, cur, v, dims) {
  const n = planeInfo(plane, dims, [1, 1, 1]).n;
  v = Math.max(0, Math.min(n - 1, Math.round(v)));
  return plane === 'axial' ? { ...cur, z: v } : plane === 'coronal' ? { ...cur, y: v } : { ...cur, x: v };
}

/** Image pixel (u,v) of a plane -> voxel coordinates. */
export function voxelAt(plane, u, v, cur) {
  if (plane === 'axial') return { z: cur.z, y: v, x: u };
  if (plane === 'coronal') return { z: v, y: cur.y, x: u };
  return { z: v, y: u, x: cur.x };
}

/** Voxel -> image pixel (u,v) of a plane (inverse of voxelAt). */
export function pixelOf(plane, p) {
  if (plane === 'axial') return { u: p.x, v: p.y };
  if (plane === 'coronal') return { u: p.x, v: p.z };
  return { u: p.y, v: p.z };
}

export const index3 = (dims, z, y, x) => (z * dims[1] + y) * dims[2] + x;

/** Copy one slice of the volume and label map into flat arrays (w*h, row-major). */
export function extractSlice(plane, vol, lab, dims, cur, hu, lb) {
  const [, Y, X] = dims, YX = Y * X, { w, h } = planeInfo(plane, dims, [1, 1, 1]);
  let p = 0;
  if (plane === 'axial') {
    const b = cur.z * YX;
    for (let v = 0; v < h; v++) { const r = b + v * X; for (let u = 0; u < w; u++, p++) { hu[p] = vol[r + u]; lb[p] = lab[r + u]; } }
  } else if (plane === 'coronal') {
    const b = cur.y * X;
    for (let v = 0; v < h; v++) { const r = v * YX + b; for (let u = 0; u < w; u++, p++) { hu[p] = vol[r + u]; lb[p] = lab[r + u]; } }
  } else {
    for (let v = 0; v < h; v++) { const r = v * YX + cur.x; for (let u = 0; u < w; u++, p++) { hu[p] = vol[r + u * X]; lb[p] = lab[r + u * X]; } }
  }
  return { w, h };
}

/**
 * Label candidates of one slice: pixel count, centroid and an anchor pixel that belongs to the
 * structure (the structure pixel closest to the centroid, so curved organs get an anchor on themselves).
 */
export function sliceLabels(lb, w, h, minPixels = 14) {
  const cnt = new Float64Array(256), su = new Float64Array(256), sv = new Float64Array(256);
  for (let v = 0, p = 0; v < h; v++) for (let u = 0; u < w; u++, p++) { const l = lb[p]; if (l) { cnt[l]++; su[l] += u; sv[l] += v; } }
  const out = [], byL = {};
  for (let l = 1; l < 256; l++) if (cnt[l] >= minPixels) { const c = { l, n: cnt[l], cu: su[l] / cnt[l], cv: sv[l] / cnt[l], best: Infinity, au: 0, av: 0 }; out.push(c); byL[l] = c; }
  for (let v = 0, p = 0; v < h; v++) for (let u = 0; u < w; u++, p++) {
    const c = byL[lb[p]]; if (!c) continue;
    const d = (u - c.cu) ** 2 + (v - c.cv) ** 2; if (d < c.best) { c.best = d; c.au = u; c.av = v; }
  }
  return out;
}

/**
 * Stack labels in one column without overlap. items: [{ay}] (desired y); returns the same items with y set,
 * sorted top->bottom, each at least `lh` apart, kept inside [top, bottom] when they fit.
 */
export function layoutColumn(items, top, bottom, lh) {
  const a = [...items].sort((p, q) => p.ay - q.ay);
  for (let i = 0; i < a.length; i++) a[i].y = Math.max(a[i].ay, i ? a[i - 1].y + lh : top);
  for (let i = a.length - 1; i >= 0; i--) a[i].y = Math.min(a[i].y, i < a.length - 1 ? a[i + 1].y - lh : bottom);
  if (a.length && a[0].y < top) { const shift = top - a[0].y; for (const o of a) o.y += shift; }   // too many to fit: keep top edge
  return a;
}

/** Vertebral range a structure spans, e.g. "T11 → L2". levels = per-axial-slice labels from atlas.json. */
export function levelRange(levels, bbox) {
  const clean = x => (x && x.includes('–') ? x.split('–')[0] : x);
  const a = clean(levels[bbox[0]]), b = clean(levels[bbox[1]]);
  if (!a && !b) return '';
  return (a || '…') + (a !== b ? ' → ' + (b || '…') : '');
}

/** Lower-case, accent-free text for search. */
export const normalize = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Structures matching a search query (Spanish or English name or label). */
export function searchStructures(structs, q) {
  q = normalize(q.trim());
  if (!q) return structs.slice();
  return structs.filter(s => normalize([s.es, s.en, s.short, s.short_en, s.key.replace(/_/g, ' ')].join(' ')).includes(q));
}

/** Voxel of a structure nearest to its stored centre that really belongs to it. */
export function nearestVoxel(lab, dims, s) {
  let [z, y, x] = s.center;
  if (lab[index3(dims, z, y, x)] === s.id) return { z, y, x };
  let best = Infinity, b = null;
  const [z0, z1, y0, y1, x0, x1] = s.bbox;
  for (let zz = z0; zz <= z1; zz++) {
    if ((zz - z) ** 2 > best) continue;
    for (let yy = y0; yy <= y1; yy++) {
      const base = (zz * dims[1] + yy) * dims[2];
      for (let xx = x0; xx <= x1; xx++) {
        if (lab[base + xx] !== s.id) continue;
        const d = (zz - z) ** 2 + (yy - y) ** 2 + (xx - x) ** 2;
        if (d < best) { best = d; b = { z: zz, y: yy, x: xx }; }
      }
    }
  }
  return b || { z, y, x };
}

/** Read deep-link parameters (teacher links). Unknown values are ignored. */
export function parseParams(search, atlas) {
  const q = new URLSearchParams(search), out = {};
  const view = q.get('view'); if (view && [...PLANES, 'triple'].includes(view)) out.view = view;
  const lang = q.get('lang'); if (lang === 'es' || lang === 'en') out.lang = lang;
  const w = q.get('w'); if (w && WINDOWS[w]) out.window = w;
  const lv = q.get('level'); if (lv && atlas && atlas.keylevels.some(k => k.id === lv)) out.level = lv;
  const s = q.get('s'); if (s && atlas && atlas.structures.some(x => x.key === s)) out.structure = s;
  const z = q.get('z'); if (z !== null && /^\d+$/.test(z) && atlas && +z >= 1 && +z <= atlas.dims[0]) out.z = +z - 1;
  const lab = q.get('labels'); if (['all', 'hover', 'none'].includes(lab)) out.labels = lab;
  if (q.get('iso') === '1') out.iso = true;
  return out;
}

/** Build a deep link for the current state (inverse of parseParams). */
export function buildParams(st) {
  const q = new URLSearchParams();
  if (st.view && st.view !== 'axial') q.set('view', st.view);
  if (st.level) q.set('level', st.level); else if (st.z !== undefined) q.set('z', String(st.z + 1));
  if (st.structure) q.set('s', st.structure);
  if (st.window && st.window !== 'soft') q.set('w', st.window);
  if (st.labels && st.labels !== 'all') q.set('labels', st.labels);
  if (st.iso) q.set('iso', '1');
  if (st.lang) q.set('lang', st.lang);
  const s = q.toString();
  return s ? '?' + s : '';
}
