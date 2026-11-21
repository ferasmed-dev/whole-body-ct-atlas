// Geometry helpers of the «Mediastino y pleura» module: everything that places a lesion on the real masks of
// s0591 (lungs per side, pleural surface, aorta split into ascending / arch / descending, pulmonary trunk,
// compartment limits). Pure functions over the Anatomy helper; results are memoised in A.cache.
// No user-visible text here: the module file holds the content.

export const SIDE_LUNG = {
  R: ['lung_upper_lobe_right', 'lung_middle_lobe_right', 'lung_lower_lobe_right'],
  L: ['lung_upper_lobe_left', 'lung_lower_lobe_left'],
};
export const BONES = k => /^(vertebrae_|rib_|sternum|costal_cartilages|clavicula|scapula|humerus)/.test(k);

/* phase-dependent HU (teaching values; the study is portal venous, 'arterial' is simulated) */
export const HU = {
  ao: { sin: 40, arterial: 320, portal: 235, tardia: 130 },        // aortic lumen
  heart: { sin: 40, arterial: 250, portal: 150, tardia: 125 },     // cardiac blood / pulmonary trunk
  falseLumen: { sin: 40, arterial: 185, portal: 200, tardia: 140 },
  flap: { sin: 48, arterial: 70, portal: 70, tardia: 70 },
  imh: { sin: 68, arterial: 48, portal: 48, tardia: 48 },          // intramural haematoma: denser than blood unenhanced
  tumour: { sin: 38, arterial: 55, portal: 68, tardia: 62 },
  lymph: { sin: 40, arterial: 52, portal: 60, tardia: 58 },
  thyroid: { sin: 100, arterial: 160, portal: 120, tardia: 110 },
  pleura: { sin: 35, arterial: 70, portal: 92, tardia: 80 },       // enhancing pleura / pleural tumour
  wall: { sin: 35, arterial: 60, portal: 75, tardia: 70 },         // gastric / cyst wall
  liver: { sin: 55, arterial: 70, portal: 101, tardia: 85 },
  spleen: { sin: 45, arterial: 120, portal: 129, tardia: 100 },
  fluid: 10, blood: 55, fat: -95, air: -1000, calc: 900, sclerotic: 1100, thrombus: 38,
};
export const MR = {
  fluid: { t1: 0.12, t2: 0.96, stir: 0.92 },
  soft: { t1: 0.4, t2: 0.6, stir: 0.55 },
  solid: { t1: 0.38, t2: 0.5, stir: 0.45 },
  fat: { t1: 0.92, t2: 0.75, stir: 0.05 },
  air: { t1: 0.02, t2: 0.02, stir: 0.02 },
  calc: { t1: 0.04, t2: 0.04, stir: 0.04 },
  blood: { t1: 0.6, t2: 0.55, stir: 0.5 },
  thyroid: { t1: 0.5, t2: 0.62, stir: 0.55 },
};

export const vox = (A, mm) => mm / A.sp[0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function idsOf(A, keys) { return new Set([].concat(keys).filter(k => A.has(k)).map(k => A.id(k))); }
export function unionBox(A, keys) {
  const ck = 'ub:' + [].concat(keys).join(','); if (A.cache.has(ck)) return A.cache.get(ck);
  let b = null;
  for (const k of [].concat(keys)) { if (!A.has(k)) continue; const s = A.s(k).bbox; b = b ? [Math.min(b[0], s[0]), Math.max(b[1], s[1]), Math.min(b[2], s[2]), Math.max(b[3], s[3]), Math.min(b[4], s[4]), Math.max(b[5], s[5])] : s.slice(); }
  A.cache.set(ck, b); return b;
}
/** Deterministic smooth noise in [-1, 1] (for nodular / irregular outlines drawn with cols). */
export function noise3(z, y, x, s = 0.25, seed = 3) {
  const h = (a, b, c) => { let n = (a * 374761393 + b * 668265263 + c * 1440662683 + seed * 2246822519) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1; };
  const X = x * s, Y = y * s, Z = z * s, xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z), fx = X - xi, fy = Y - yi, fz = Z - zi;
  const sm = t => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * sm(t);
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy), fz);
}

/** 2D chamfer distance (1, √2) inside a w×h mask: 0 outside, ≥ 1 inside (the rectangle border counts as outside). */
export function chamfer2D(m, w, h, borderIn = false) {
  const d = new Float32Array(w * h), S = Math.SQRT2, INF = 1e6, OUT = borderIn ? INF : 0;
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? INF : 0;
  const g = (y, x) => (y < 0 || x < 0 || y >= h || x >= w ? OUT : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], g(y, x - 1) + 1, g(y - 1, x) + 1, g(y - 1, x - 1) + S, g(y - 1, x + 1) + S); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], g(y, x + 1) + 1, g(y + 1, x) + 1, g(y + 1, x + 1) + S, g(y + 1, x - 1) + S); }
  return d;
}
function pca2(vs) {
  let my = 0, mx = 0; for (const [y, x] of vs) { my += y; mx += x; } my /= vs.length; mx /= vs.length;
  let syy = 0, sxx = 0, sxy = 0; for (const [y, x] of vs) { syy += (y - my) ** 2; sxx += (x - mx) ** 2; sxy += (y - my) * (x - mx); }
  syy /= vs.length; sxx /= vs.length; sxy /= vs.length;
  const tr = syy + sxx, det = syy * sxx - sxy * sxy, q = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + q, l2 = tr / 2 - q;
  let ay = l1 - sxx, ax = sxy; if (Math.abs(ay) + Math.abs(ax) < 1e-9) { ay = syy >= sxx ? 1 : 0; ax = syy >= sxx ? 0 : 1; }
  const n = Math.hypot(ay, ax); return { cy: my, cx: mx, major: [ay / n, ax / n], l1, l2, minorD: 4 * Math.sqrt(Math.max(0, l2)), majorD: 4 * Math.sqrt(l1) };
}
function maskOf(vs, extra) {
  let y0 = Infinity, y1 = -1, x0 = Infinity, x1 = -1;
  for (const [y, x] of vs) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
  for (const [y, x] of vs) m[(y - y0) * w + x - x0] = 1;
  const d = chamfer2D(m, w, h), p = pca2(vs);
  const r = { n: vs.length, y0, y1, x0, x1, w, h, m, d, cy: p.cy, cx: p.cx, r: Math.sqrt(vs.length / Math.PI), major: p.major, minorD: p.minorD, majorD: p.majorD, elong: Math.sqrt(p.l1 / Math.max(1e-6, p.l2)), ...extra };
  r.has = (y, x) => y >= y0 && y <= y1 && x >= x0 && x <= x1 && m[(y - y0) * w + x - x0] === 1;
  r.dist = (y, x) => (y >= y0 && y <= y1 && x >= x0 && x <= x1 ? d[(y - y0) * w + x - x0] : 0);
  return r;
}

/**
 * Per-slice region of a set of structures (optionally filtered by pred(z,y,x)): mask, 2D distance to the edge,
 * centroid, per-column (x) anterior-most / posterior-most y. Cached by name.
 */
export function region(A, name, keys, z, pred) {
  const ck = 'rg:' + name + ':' + z; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = unionBox(A, keys); let r = null;
  if (b && z >= b[0] && z <= b[1]) {
    const ids = idsOf(A, keys), vs = [];
    for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (ids.has(A.at(z, y, x)) && (!pred || pred(z, y, x))) vs.push([y, x]);
    if (vs.length) {
      r = maskOf(vs, { z });
      const cmin = new Int16Array(r.w).fill(-1), cmax = new Int16Array(r.w).fill(-1);
      for (const [y, x] of vs) { const i = x - r.x0; if (cmin[i] < 0 || y < cmin[i]) cmin[i] = y; if (y > cmax[i]) cmax[i] = y; }
      r.colMin = x => (x >= r.x0 && x <= r.x1 ? cmin[x - r.x0] : -1);
      r.colMax = x => (x >= r.x0 && x <= r.x1 ? cmax[x - r.x0] : -1);
    }
  }
  A.cache.set(ck, r); return r;
}
export const lungSlice = (A, side, z) => region(A, 'lung' + side, SIDE_LUNG[side], z);

/** Per-(y,x) column: top (min z) and bottom (max z) of a set of structures within an optional z range. */
export function colsZ(A, name, keys, zr) {
  const ck = 'cz:' + name; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = unionBox(A, keys), ids = idsOf(A, keys), z0 = zr ? Math.max(b[0], zr[0]) : b[0], z1 = zr ? Math.min(b[1], zr[1]) : b[1];
  const w = b[5] - b[4] + 1, h = b[3] - b[2] + 1, top = new Int16Array(w * h).fill(-1), bot = new Int16Array(w * h).fill(-1);
  for (let z = z0; z <= z1; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (ids.has(A.at(z, y, x))) {
    const i = (y - b[2]) * w + x - b[4]; if (top[i] < 0) top[i] = z; bot[i] = z;
  }
  let minTop = Infinity, minBot = Infinity, best = null; for (let i = 0; i < top.length; i++) { if (top[i] >= 0 && top[i] < minTop) minTop = top[i]; if (bot[i] >= 0 && bot[i] < minBot) { minBot = bot[i]; best = i; } }
  const r = { y0: b[2], x0: b[4], w, h, minTop, minBot, z0: b[0], z1: b[1],
    top: (y, x) => (y >= b[2] && y <= b[3] && x >= b[4] && x <= b[5] ? top[(y - b[2]) * w + x - b[4]] : -1),
    bot: (y, x) => (y >= b[2] && y <= b[3] && x >= b[4] && x <= b[5] ? bot[(y - b[2]) * w + x - b[4]] : -1),
    highestBot: best === null ? null : [minBot, b[2] + Math.floor(best / w), b[4] + best % w] };
  A.cache.set(ck, r); return r;
}

/** Lung surface voxel of one side on slice z, furthest along direction dir = [dy, dx] from the slice centroid. */
export function surfacePoint(A, side, z, dir) {
  const r = lungSlice(A, side, z); if (!r) return null;
  let best = null, bv = -Infinity;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const d = r.dist(y, x); if (!d || d > 1.5) continue;
    const v = (y - r.cy) * dir[0] + (x - r.cx) * dir[1]; if (v > bv) { bv = v; best = [z, y, x]; }
  }
  return best;
}

/* ---------------- aorta: ascending / arch / descending on each slice ---------------- */
function components(vs) {
  const K = (y, x) => y * 1024 + x, set = new Set(vs.map(([y, x]) => K(y, x))), seen = new Set(), out = [];
  for (const [y0, x0] of vs) {
    const k0 = K(y0, x0); if (seen.has(k0)) continue;
    const st = [[y0, x0]], c = []; seen.add(k0);
    while (st.length) {
      const [y, x] = st.pop(); c.push([y, x]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = K(y + dy, x + dx); if ((dy || dx) && set.has(k) && !seen.has(k)) { seen.add(k); st.push([y + dy, x + dx]); } }
    }
    out.push(c);
  }
  return out;
}
/** Aortic levels of this patient: top of the arch, first slice where ascending and descending separate, root, bifurcation. */
export function aoLevels(A) {
  if (A.cache.has('aoLv')) return A.cache.get('aoLv');
  const b = A.s('aorta').bbox; let zSplit = null, zRoot = null;
  for (let z = b[0]; z <= Math.min(b[1], b[0] + 120); z++) {
    const cs = components(A.sliceVoxels('aorta', z)).filter(c => c.length >= 12);
    if (cs.length >= 2) { if (zSplit === null) zSplit = z; zRoot = z; } else if (zSplit !== null && z > zSplit + 8) break;
  }
  const r = { zTop: b[0], zSplit: zSplit || b[0] + 20, zRoot: zRoot || b[0] + 60, zBif: b[1], zHiatus: A.has('esophagus') ? A.s('esophagus').bbox[1] : b[0] + 100 };
  A.cache.set('aoLv', r); return r;
}
/** Aorta on slice z split into { asc, arch, desc } components (each: mask, 2D distance, centroid, radius, axes). */
export function aoSlice(A, z) {
  const ck = 'ao:' + z; if (A.cache.has(ck)) return A.cache.get(ck);
  const L = aoLevels(A), cs = components(A.sliceVoxels('aorta', z)).filter(c => c.length >= 12).sort((a, b) => b.length - a.length).map(c => maskOf(c));
  const r = {};
  if (cs.length >= 2) { const two = cs.slice(0, 2).sort((a, b) => a.cy - b.cy); r.asc = two[0]; r.desc = two[1]; }
  else if (cs.length === 1) { if (z < L.zSplit) r.arch = cs[0]; else r.desc = cs[0]; }
  A.cache.set(ck, r); return r;
}
/** The aortic component (part = 'asc' | 'desc' | 'arch') containing voxel (y, x) at z, or null. */
export function aoPartAt(A, z, y, x) { const s = aoSlice(A, z); for (const k of ['asc', 'arch', 'desc']) if (s[k] && s[k].has(y, x)) return [k, s[k]]; return null; }
export const eqDiam = (A, c) => 2 * c.r * A.sp[0];

/* ---------------- pulmonary trunk and main arteries (inside the 'heart' mask above the chambers) ---------------- */
/** Predicates for the pulmonary trunk / right / left main pulmonary artery, estimated in the heart mask. */
export function paPred(A, branch) {
  const L = aoLevels(A), zs = L.zSplit;
  return (z, y, x) => {
    if (z < zs - 2 || z > zs + 20) return false;
    const s = aoSlice(A, z), asc = s.asc || s.arch; if (!asc) return false;
    const tr = trachea(A, z), yT = tr ? tr.y0 : asc.cy + asc.r * 1.6;
    if (branch === 'trunk') return x > asc.cx + asc.r * 0.55 && y < yT - 2;
    if (branch === 'rpa') return x < asc.cx + asc.r * 0.3 && y > asc.cy + asc.r * 0.7 && y < yT + 10 && z >= zs + 2;
    return x > asc.cx + asc.r * 1.1 && y >= yT - 2 && z <= zs + 14;                       // lpa
  };
}
export const paSlice = (A, branch, z) => region(A, 'pa:' + branch, ['heart'], z, paPred(A, branch));
/** Short-axis diameter (mm) of the pulmonary trunk where it is best seen. */
export function paTrunk(A) {
  if (A.cache.has('paT')) return A.cache.get('paT');
  const zs = aoLevels(A).zSplit; let best = null;
  for (let z = zs + 6; z <= zs + 16; z++) { const r = paSlice(A, 'trunk', z); if (r && (!best || r.n > best.n)) best = r; }
  const out = best ? { z: best.z, c: [best.z, Math.round(best.cy), Math.round(best.cx)], d: best.minorD * A.sp[0], r: best } : null;
  A.cache.set('paT', out); return out;
}

/* ---------------- compartments (classic limits, as in the syllabus) ---------------- */
export function trachea(A, z) { return region(A, 'trachea', ['trachea'], z); }
/** Anterior / middle / posterior limits on slice z: yA (anterior tracheal wall, or posterior heart / IVC), yP (1 cm behind the anterior vertebral border). */
export function limits(A, z) {
  const ck = 'lim:' + z; if (A.cache.has(ck)) return A.cache.get(ck);
  const c = A.cordAt(z) || A.cordAt(z + 3) || A.cordAt(z - 3), xc = c ? Math.round(c.xc) : 137;
  let yV = null; for (let y = 40; y < A.dims[1]; y++) { const l = A.at(z, y, xc); if (l && A.byId[l].key.startsWith('vertebrae_')) { yV = y; break; } }
  const tr = trachea(A, z); let yA = tr ? tr.y0 : null, by = 'trachea';
  if (yA === null) {
    const h = region(A, 'heartMid', ['heart', 'inferior_vena_cava'], z, (zz, y, x) => Math.abs(x - xc) <= 22);
    if (h) { yA = h.y1 + 1; by = 'heart'; }
  }
  const yP = yV !== null ? yV + Math.round(10 / A.sp[1]) : null;
  if (yA !== null && yP !== null && yA > yP - 2) yA = yP - 2;
  const r = { xc, yV, yA, yP, by }; A.cache.set(ck, r); return r;
}
/** 'anterior' | 'medio' | 'posterior' for a voxel, or null outside the thorax limits. */
export function compartment(A, z, y) {
  const l = limits(A, z); if (l.yA === null || l.yP === null) return null;
  return y < l.yA ? 'anterior' : y < l.yP ? 'medio' : 'posterior';
}

/* ---------------- interfaces between lobes (fissures) ---------------- */
export function fissure(A, aKeys, bKeys, name) {
  const ck = 'fis:' + name; if (A.cache.has(ck)) return A.cache.get(ck);
  const ia = idsOf(A, aKeys), ib = idsOf(A, bKeys), b = unionBox(A, aKeys), set = new Set(), col = new Map();
  let z0 = Infinity, z1 = -1, y0 = Infinity, y1 = -1, x0 = Infinity, x1 = -1, sz = 0, sy = 0, sx = 0, n = 0;
  const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) {
    if (!ia.has(A.at(z, y, x))) continue;
    if (!nb.some(([a, c, d]) => ib.has(A.at(z + a, y + c, x + d)))) continue;
    set.add((z * 1024 + y) * 1024 + x); n++; sz += z; sy += y; sx += x;
    z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    const k = y * 1024 + x, cz = col.get(k); col.set(k, cz ? [cz[0] + z, cz[1] + 1] : [z, 1]);
  }
  const r = n ? { n, box: [z0, z1, y0, y1, x0, x1], c: [sz / n, sy / n, sx / n].map(Math.round), has: (z, y, x) => set.has((z * 1024 + y) * 1024 + x),
    colZ: (y, x) => { const v = col.get(y * 1024 + x); return v ? v[0] / v[1] : null; } } : null;
  A.cache.set(ck, r); return r;
}

/* ---------------- primitive builders shared by several entities ---------------- */
const inBoxClamp = (A, b) => [clamp(b[0], 0, A.dims[0] - 1), clamp(b[1], 0, A.dims[0] - 1), clamp(b[2], 0, A.dims[1] - 1), clamp(b[3], 0, A.dims[1] - 1), clamp(b[4], 0, A.dims[2] - 1), clamp(b[5], 0, A.dims[2] - 1)].map(Math.round);

/**
 * Pleural effusion on one side. mode: 'supine' (dependent posterior layer, the CT), 'upright' (fluid fills the
 * deepest recesses first and climbs the lateral wall: meniscus, the standing film), 'subpulm' (layer under the lung
 * base, following the dome). h: height of the fluid column (mm); d: maximum thickness of the supine layer (mm).
 */
export function effusion(A, side, o) {
  const keys = SIDE_LUNG[side], ids = idsOf(A, keys), b = unionBox(A, keys), H = vox(A, o.h), zBase = b[1];
  const hu = o.hu === undefined ? HU.fluid : o.hu, mr = o.mr || MR.fluid, mode = o.mode || 'supine';
  if (mode === 'subpulm') {
    const D = diaCols(A, side), C = D.C, T = vox(A, o.d || 15);
    return { t: 'cols', box: inBoxClamp(A, [D.dome[0] - T - 1, zBase, b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
      if (!ids.has(cur.orig) || !D.has(y, x)) return null; const bt = C.bot(y, x); return bt >= 0 && z > bt - T ? { hu, mr } : null; } };
  }
  const zTop = Math.max(b[0], Math.round(zBase - H - (mode === 'upright' ? H * 0.35 : 0) - 2)), D = vox(A, o.d || 30);
  return { t: 'cols', box: inBoxClamp(A, [zTop, zBase, b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig)) return null;
    const r = lungSlice(A, side, z); if (!r) return null;
    if (mode === 'supine') {
      const f = clamp((z - (zBase - H)) / Math.max(1, H), 0, 1), depth = D * Math.sqrt(f), post = r.colMax(x);
      if (post < 0 || post - y >= depth) return null;
      return { hu: o.huDeep !== undefined && post - y < depth * 0.35 ? o.huDeep : hu, mr };
    }
    const lat = side === 'R' ? (r.x1 - x) / Math.max(1, r.x1 - r.x0) : (x - r.x0) / Math.max(1, r.x1 - r.x0);
    const rise = H * 0.35 * clamp(lat, 0, 1) ** 3;
    return z >= zBase - H - rise ? { hu, mr } : null;
  } };
}

/**
 * Pneumothorax on one side: air in the pleural space. mode 'ct' (supine: anterior, non-dependent) or 'rx'
 * (standing: apical and lateral, the lung collapses towards the hilum). d: width of the air space (mm).
 */
export function pneumo(A, side, o) {
  const keys = SIDE_LUNG[side], ids = idsOf(A, keys), b = unionBox(A, keys), D = vox(A, o.d), zA = b[0], zB = b[1];
  return { t: 'cols', box: b.slice(), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig)) return null;
    const r = lungSlice(A, side, z); if (!r) return null;
    const f = clamp((z - zA) / Math.max(1, zB - zA), 0, 1), ant = r.colMin(x), dd = r.dist(y, x);
    const Dant = o.mode === 'rx' ? D * 0.15 : D * (0.75 + 0.25 * (1 - f)), Dc = o.mode === 'rx' ? D * (0.55 + 0.9 * (1 - f)) : D * (o.collapse ? 0.45 : 0.18);
    const a = ant >= 0 ? y - ant : 99;
    if (a < Dant || dd < Dc) return { hu: HU.air, mr: MR.air };
    if (a < Dant + 1.3 || dd < Dc + 1.3) return { hu: -260, label: 'keep' };           // visceral pleural line
    return o.collapse ? { hu: cur.hu + o.collapse, label: 'keep' } : null;              // collapsed lung, denser
  } };
}

/** Shift the mediastinal structures by up to dmm along x (dir +1 = towards the patient's left), tapered between z0 and z1. */
export function shiftMediastinum(A, dir, dmm, z0, z1) {
  const keys = ['heart', 'aorta', 'trachea', 'esophagus', 'superior_vena_cava', 'brachiocephalic_vein_left', 'brachiocephalic_vein_right', 'pulmonary_vein', 'atrial_appendage_left', 'brachiocephalic_trunk', 'inferior_vena_cava', 'common_carotid_artery_left', 'common_carotid_artery_right'].filter(k => A.has(k));
  const D = vox(A, dmm), sh = z => (z < z0 || z > z1 ? 0 : D * Math.sin(Math.PI * (z - z0) / (z1 - z0)) ** 0.6);
  const order = keys.map(k => { const s = A.s(k).bbox; return [k, (s[4] + s[5]) / 2]; }).sort((a, b) => dir > 0 ? b[1] - a[1] : a[1] - b[1]);
  const pad = Math.ceil(D) + 2;
  return order.map(([k]) => {
    const s = A.s(k).bbox, box = inBoxClamp(A, [Math.max(s[0], z0), Math.min(s[1], z1), s[2], s[3], s[4] - pad, s[5] + pad]);
    if (box[0] > box[1]) return null;
    return { t: 'warp', s: k, box, fill: { hu: HU.air, label: 'lesion' }, map: (z, y, x) => { const d = sh(z); return d < 0.5 ? null : [z, y, x - dir * d]; } };
  }).filter(Boolean);
}

/**
 * Pleural-based lens on one side: lung voxels within T·√(1−(s/R)²) of the pleural surface, s = distance from the seed
 * (a surface voxel). Encapsulated effusion, empyema (enhancing rim), pleural nodules and plaques.
 * o: { core, rim, rimW (mm), mr, rimMr, label, nodular }
 */
export function lens(A, side, seed, Rmm, Tmm, o = {}) {
  const ids = idsOf(A, SIDE_LUNG[side]), R = vox(A, Rmm), T = vox(A, Tmm), rw = vox(A, o.rimW || 2.2), [sz, sy, sx] = seed;
  return { t: 'cols', box: inBoxClamp(A, [sz - R - 1, sz + R + 1, sy - R - T - 2, sy + R + T + 2, sx - R - T - 2, sx + R + T + 2]), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig)) return null;
    const s = Math.hypot(z - sz, y - sy, x - sx); if (s > R) return null;
    let t = T * Math.sqrt(1 - (s / R) ** 2); if (o.nodular) t *= 1 + o.nodular * noise3(z, y, x, 0.3, 5);
    const r = lungSlice(A, side, z); if (!r) return null; const dd = r.dist(y, x);
    if (!dd || dd > t + 0.5) return null;
    if (o.rim !== undefined && (dd <= rw || dd > t + 0.5 - rw)) return { hu: o.rim, mr: o.rimMr || MR.soft, label: o.label };
    return { hu: o.core, mr: o.mr || MR.fluid, label: o.label };
  } };
}

/** Pleural thickening as a band on the inner side of the lung surface: lobewise (includes fissures and mediastinal pleura) or per side. */
export function pleuralRind(A, side, o) {
  const keys = SIDE_LUNG[side], ids = idsOf(A, keys), b = unionBox(A, keys), zr = o.zr || [b[0], b[1]];
  return { t: 'cols', box: inBoxClamp(A, [zr[0], zr[1], b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig)) return null;
    const r = o.lobewise ? region(A, 'lobe:' + A.byId[cur.orig].key, [A.byId[cur.orig].key], z) : lungSlice(A, side, z); if (!r) return null;
    const dd = r.dist(y, x), t = typeof o.t === 'function' ? o.t(z, y, x, r) : vox(A, o.t);
    return dd && dd <= t ? { hu: o.hu, mr: o.mr || MR.soft, label: o.label } : null;
  } };
}

/** Raise a hemidiaphragm (or fill the costophrenic angle): lung voxels within h mm of the lung base become the organ below. */
export function raiseBase(A, side, hmm, o = {}) {
  const keys = SIDE_LUNG[side], ids = idsOf(A, keys), b = unionBox(A, keys), D = diaCols(A, side), C = D.C, H = vox(A, hmm);
  return { t: 'cols', box: inBoxClamp(A, [D.dome[0] - H - 1, b[1], b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig) || !D.has(y, x)) return null; const bt = C.bot(y, x); if (bt < 0) return null;
    const h = o.lateral ? H * clamp(o.lateral(z, y, x), 0, 1) : H; if (z <= bt - h) return null;
    const below = A.at(bt + 1, y, x), bk = below ? A.byId[below].key : '';
    const hu = o.hu !== undefined ? o.hu : bk === 'liver' ? HU.liver : bk === 'spleen' ? HU.spleen : bk === 'stomach' ? HU.wall : bk === 'heart' ? HU.heart : 40;
    return { hu, label: o.label, mr: o.mr || MR.solid };
  } };
}

/** Pick n lung-surface points of one side spread over the given slices and directions. */
export function surfacePoints(A, side, zs, dirs) {
  const out = [];
  zs.forEach((z, i) => { const p = surfacePoint(A, side, z, dirs[i % dirs.length]); if (p) out.push(p); });
  return out;
}

/* ---------------- diaphragm, outside distance, anchors ---------------- */
const SUBDIA = /^(liver|spleen|stomach|colon|kidney_|adrenal_|small_bowel|duodenum|pancreas)/;
/** Lung columns of one side whose base lies on the diaphragm (organ below, not heart or rib); dome = highest such base. */
export function diaCols(A, side) {
  const ck = 'dia:' + side; if (A.cache.has(ck)) return A.cache.get(ck);
  const C = colsZ(A, 'lung' + side, SIDE_LUNG[side]), hb = A.s('heart').bbox, ok = new Uint8Array(C.w * C.h);
  let dome = null;
  for (let j = 0; j < C.h; j++) for (let i = 0; i < C.w; i++) {
    const y = C.y0 + j, x = C.x0 + i, bt = C.bot(y, x); if (bt < 0) continue;
    let good = null;
    for (let k = 1; k <= 14 && bt + k < A.dims[0]; k++) { const l = A.at(bt + k, y, x); if (!l) continue; const key = A.byId[l].key; good = !key.startsWith('lung') && SUBDIA.test(key); break; }
    if (good === null) good = bt > hb[1] - 6;
    if (good) { ok[j * C.w + i] = 1; if (!dome || bt < dome[0]) dome = [bt, y, x]; }
  }
  const r = { C, dome: dome || C.highestBot, has: (y, x) => y >= C.y0 && y < C.y0 + C.h && x >= C.x0 && x < C.x0 + C.w && ok[(y - C.y0) * C.w + x - C.x0] === 1 };
  A.cache.set(ck, r); return r;
}
/** 2D distance (voxels) on slice z from any voxel to the nearest voxel of the given structures (1e6 if none nearby). */
export function distOut(A, name, keys, z, pad = 16) {
  const ck = 'do:' + name + ':' + z; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = unionBox(A, keys), ids = idsOf(A, keys);
  const y0 = Math.max(0, b[2] - pad), y1 = Math.min(A.dims[1] - 1, b[3] + pad), x0 = Math.max(0, b[4] - pad), x1 = Math.min(A.dims[2] - 1, b[5] + pad), w = x1 - x0 + 1, h = y1 - y0 + 1;
  const m = new Uint8Array(w * h); let any = false;
  if (z >= b[0] && z <= b[1]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (ids.has(A.at(z, y, x))) any = true; else m[(y - y0) * w + x - x0] = 1; }
  const d = any ? chamfer2D(m, w, h, true) : null;
  const r = (y, x) => (d && y >= y0 && y <= y1 && x >= x0 && x <= x1 ? d[(y - y0) * w + x - x0] : 1e6);
  A.cache.set(ck, r); return r;
}
/** First y (scanning from front) of a structure set along column (z, x); -1 if none. last=true: last y. */
export function scanY(A, keys, z, x, last = false, y0 = 0, y1 = A.dims[1] - 1) {
  const ids = idsOf(A, keys); let r = -1;
  for (let y = y0; y <= y1; y++) if (ids.has(A.at(z, y, Math.round(x)))) { r = y; if (!last) break; }
  return r;
}
/** Prevascular point on slice z: between the back of the sternum and the front of the ascending aorta, shifted dx voxels. */
export function prevascular(A, z, dx = 0) {
  const ck = 'pv:' + z + ':' + dx; if (A.cache.has(ck)) return A.cache.get(ck);
  const s = aoSlice(A, z), asc = s.asc || s.arch, x = Math.round(asc ? asc.cx + dx : 145 + dx);
  const yAo = Math.max(0, scanY(A, ['aorta', 'heart', 'superior_vena_cava', 'brachiocephalic_vein_left'], z, x)), ySt = scanY(A, ['sternum', 'costal_cartilages'], z, x, true, 0, yAo > 0 ? yAo : 120);
  const yS = ySt >= 0 ? ySt : yAo - 16, r = { z, y: Math.round((yS + yAo) / 2), x, ySt: yS, yAo, gap: (yAo - yS) * A.sp[1] };
  A.cache.set(ck, r); return r;
}
/** ITMIG prevascular / visceral limit on slice z: anterior edge of the heart and great vessels near the midline. */
export function limitPV(A, z) {
  const ck = 'lpv:' + z; if (A.cache.has(ck)) return A.cache.get(ck);
  const l = limits(A, z), keys = ['heart', 'aorta', 'superior_vena_cava', 'brachiocephalic_vein_left', 'brachiocephalic_vein_right', 'brachiocephalic_trunk', 'common_carotid_artery_left'];
  let yy = Infinity; for (let x = l.xc - 25; x <= l.xc + 25; x += 2) { const y = scanY(A, keys, z, x, false, 0, l.yA || 140); if (y >= 0 && y < yy) yy = y; }
  const r = Number.isFinite(yy) ? yy : null; A.cache.set(ck, r); return r;
}
/** Wedge (triangle based on the pleura, apex to the hilum): lung voxels with in-plane surface distance ≤ T·(1 − s/R). */
export function wedge(A, side, seed, Rmm, Tmm, o = {}) {
  const ids = idsOf(A, o.keys || SIDE_LUNG[side]), R = vox(A, Rmm), T = vox(A, Tmm), [sz, sy, sx] = seed, halo = o.halo ? vox(A, o.halo) : 0;
  return { t: 'cols', box: inBoxClamp(A, [sz - R - halo - 1, sz + R + halo + 1, sy - R - T - halo - 2, sy + R + T + halo + 2, sx - R - T - halo - 2, sx + R + T + halo + 2]), fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig)) return null;
    const s = Math.hypot(z - sz, y - sy, x - sx); if (s > R + halo) return null;
    const r = lungSlice(A, side, z); if (!r) return null; const dd = r.dist(y, x), t = T * (1 - Math.min(1, s / R));
    if (dd && dd <= t + 0.5) return { hu: o.hu, mr: o.mr || MR.solid, label: o.label };
    if (halo && dd && dd <= t + halo && s <= R + halo) return { hu: o.haloHu, mr: MR.soft, label: o.label };
    return null;
  } };
}
/** Compartment of a voxel with the classic limits, using the posterior border of the heart / IVC in that column. */
export function compartmentAt(A, z, y, x) {
  const l = limits(A, z); if (l.yP === null) return null;
  let yA; const tr = trachea(A, z);
  if (tr) yA = tr.y0; else { const yh = scanY(A, ['heart', 'inferior_vena_cava'], z, x, true, 0, l.yP); yA = yh >= 0 ? yh + 1 : l.yA; }
  if (yA === null) return null;
  return y < yA ? 'anterior' : y < l.yP ? 'medio' : 'posterior';
}
