// Geometry helpers for the lung-parenchyma module: lobes, hila, subpleural depth, lobule cells, collapse.
// Pure (no DOM). Everything is placed from the real lobe masks of case s0591; the hila, bronchi and pleura
// are not segmented, so their positions are estimated here (and the entities that rely on them say so).
import { makeNoise } from '../../src/pathology.js';

export const LOBE = { RUL: 'lung_upper_lobe_right', RML: 'lung_middle_lobe_right', RLL: 'lung_lower_lobe_right', LUL: 'lung_upper_lobe_left', LLL: 'lung_lower_lobe_left' };
export const LOBES = Object.values(LOBE);
export const SIDE = { R: [LOBE.RUL, LOBE.RML, LOBE.RLL], L: [LOBE.LUL, LOBE.LLL] };
/** Origin of each lobar bronchus (approximate: the hila are not segmented). [z, y, x] voxels. */
export const HILUM = { RUL: [254, 108, 110], RML: [270, 100, 110], RLL: [268, 118, 112], LUL: [266, 106, 166], LLL: [272, 122, 166] };
/** Main hilum of each lung (for "central / perihilar"). */
export const HIL = { R: [262, 112, 114], L: [266, 110, 164] };
/** Where each lobe collapses to (RUL superomedial, RML against the right heart border, lower lobes posteromedial). */
export const SINK = { RUL: [206, 98, 121], RML: [290, 74, 117], RLL: [334, 140, 104], LUL: [238, 78, 160], LLL: [318, 150, 170] };
/** Lobe that takes up the space a collapsed lobe leaves. */
export const NEIGH = { RUL: 'RLL', RML: 'RLL', RLL: 'RUL', LUL: 'LLL', LLL: 'LUL' };

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
const NZ = makeNoise(23);
/** Smooth noise in [-1, 1]; f = spatial frequency (1/voxel), o = offset to decorrelate uses. */
export const nz = (z, y, x, f = 0.12, o = 0) => NZ(x * f + o, y * f + o * 0.7, z * f);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const hashU = (a, b, c, s = 0) => {
  let n = (a * 374761393 + b * 668265263 + c * 1274126177 + s * 144269504) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Union bounding box of structures (+ pad voxels), clamped to the volume. */
export function lbox(A, keys, pad = 0) {
  let b = null;
  for (const k of [].concat(keys)) { const s = A.s(k).bbox; b = b ? [Math.min(b[0], s[0]), Math.max(b[1], s[1]), Math.min(b[2], s[2]), Math.max(b[3], s[3]), Math.min(b[4], s[4]), Math.max(b[5], s[5])] : s.slice(); }
  return clampBox(A, [b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad, b[4] - pad, b[5] + pad]);
}
export function clampBox(A, b) {
  const [Z, Y, X] = A.dims;
  return [Math.max(0, Math.round(b[0])), Math.min(Z - 1, Math.round(b[1])), Math.max(0, Math.round(b[2])), Math.min(Y - 1, Math.round(b[3])), Math.max(0, Math.round(b[4])), Math.min(X - 1, Math.round(b[5]))];
}
export const idSet = (A, keys) => new Set([].concat(keys).map(k => A.id(k)));

/**
 * Subpleural depth: in-plane (axial) distance in voxels from every lung voxel to the nearest non-lung voxel
 * (chest wall, mediastinum, diaphragm). Fissures do not count (all lobes are lung). Computed once, cached.
 */
export function lungDepth(A) {
  const ck = 'pul:depth'; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = lbox(A, LOBES, 1), [, Y, X] = A.dims, nz_ = b[1] - b[0] + 1, ny = b[3] - b[2] + 1, nx = b[5] - b[4] + 1;
  const isL = new Uint8Array(256); for (const k of LOBES) isL[A.id(k)] = 1;
  const d = new Float32Array(nz_ * ny * nx), S2 = Math.SQRT2;
  for (let k = 0; k < nz_; k++) {
    const o = k * ny * nx, z = b[0] + k;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[o + j * nx + i] = isL[A.lab[(z * Y + b[2] + j) * X + b[4] + i]] ? 1e4 : 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = o + j * nx + i; let v = d[p]; if (!v) continue;
      if (i > 0) v = Math.min(v, d[p - 1] + 1);
      if (j > 0) { v = Math.min(v, d[p - nx] + 1); if (i > 0) v = Math.min(v, d[p - nx - 1] + S2); if (i < nx - 1) v = Math.min(v, d[p - nx + 1] + S2); }
      d[p] = v;
    }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const p = o + j * nx + i; let v = d[p]; if (!v) continue;
      if (i < nx - 1) v = Math.min(v, d[p + 1] + 1);
      if (j < ny - 1) { v = Math.min(v, d[p + nx] + 1); if (i < nx - 1) v = Math.min(v, d[p + nx + 1] + S2); if (i > 0) v = Math.min(v, d[p + nx - 1] + S2); }
      d[p] = v;
    }
  }
  const r = { b, ny, nx, d, mm(z, y, x) { if (z < b[0] || z > b[1] || y < b[2] || y > b[3] || x < b[4] || x > b[5]) return 0; return d[((z - b[0]) * ny + y - b[2]) * nx + x - b[4]] * A.sp[0]; } };
  A.cache.set(ck, r); return r;
}

/** Lowest (most caudal) lung voxel of one side per (y, x) column, -1 when none. Cached. */
export function lungBase(A, side) {
  const ck = 'pul:base:' + side; if (A.cache.has(ck)) return A.cache.get(ck);
  const [, Y, X] = A.dims, b = lbox(A, SIDE[side]), ids = new Uint8Array(256), out = new Int16Array(Y * X).fill(-1);
  for (const k of SIDE[side]) ids[A.id(k)] = 1;
  for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (ids[A.lab[(z * Y + y) * X + x]]) out[y * X + x] = z;
  A.cache.set(ck, out); return out;
}

/**
 * Secondary-lobule cells (jittered-grid Voronoi, "Worley"): returns [d1, d2] = distance (voxels) to the nearest
 * and second-nearest cell centre. d2 - d1 small = on a septum; d1 small = centre of the lobule.
 */
const W = [0, 0, 0];
export function cells(z, y, x, s, seed = 1) {
  const fz = Math.floor(z / s), fy = Math.floor(y / s), fx = Math.floor(x / s); let d1 = 1e9, d2 = 1e9, id = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cz = fz + a, cy = fy + b, cx = fx + c, h = hashU(cz, cy, cx, seed), h2 = hashU(cx, cz, cy, seed + 7), h3 = hashU(cy, cx, cz, seed + 13);
    const pz = (cz + 0.5 + (h - 0.5) * 0.8) * s, py = (cy + 0.5 + (h2 - 0.5) * 0.8) * s, px = (cx + 0.5 + (h3 - 0.5) * 0.8) * s;
    const d = (z - pz) ** 2 + (y - py) ** 2 + (x - px) ** 2;
    if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) d2 = d;
  }
  W[0] = Math.sqrt(d1); W[1] = Math.sqrt(d2); W[2] = id; return W;
}

/** Read the current HU of a box during the patch build (a 'cols' that records and changes nothing). */
export function probe(A, box) {
  const b = clampBox(A, box), [z0, z1, y0, y1, x0, x1] = b, ny = y1 - y0 + 1, nx = x1 - x0 + 1, arr = new Int16Array((z1 - z0 + 1) * ny * nx).fill(-1000);
  return {
    box: b,
    prim: { t: 'cols', box: b, label: 'keep', fn: (z, y, x, cur) => { arr[((z - z0) * ny + (y - y0)) * nx + (x - x0)] = cur.hu; return null; } },
    get(z, y, x) { z = Math.round(z); y = Math.round(y); x = Math.round(x); return z < z0 || z > z1 || y < y0 || y > y1 || x < x0 || x > x1 ? -1000 : arr[((z - z0) * ny + (y - y0)) * nx + (x - x0)]; },
  };
}

/** Soft ellipsoid weight (1 inside, 0 outside, noisy edge). c voxels, r voxels. */
export function ellip(c, r, irr = 0.3, soft = 0.22, o = 3) {
  return (z, y, x) => {
    let e = Math.sqrt(((z - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((x - c[2]) / r[2]) ** 2);
    if (irr) e /= 1 + irr * nz(z, y, x, 0.08, o);
    return 1 - sstep(1 - soft, 1 + soft, e);
  };
}

/**
 * Per-voxel painter over lung lobes: w(z,y,x) -> 0..1 weight; val(cur, w, z, y, x) -> {hu, label} | null.
 */
export function paint(A, keys, w, val, box) {
  const ids = idSet(A, keys);
  // the lobe masks stop a voxel or two short of the pleura: aerated unlabelled voxels touching the lobe count too
  const near = (z, y, x) => ids.has(A.at(z, y, x + 1)) || ids.has(A.at(z, y, x - 1)) || ids.has(A.at(z, y + 1, x)) || ids.has(A.at(z, y - 1, x)) || ids.has(A.at(z, y, x + 2)) || ids.has(A.at(z, y, x - 2)) || ids.has(A.at(z, y + 2, x)) || ids.has(A.at(z, y - 2, x));
  return { t: 'cols', box: box || lbox(A, keys, 2), label: 'keep', fn: (z, y, x, cur) => {
    if (!ids.has(cur.orig) && !(cur.orig === 0 && cur.hu < -200 && near(z, y, x))) return null;
    const a = w(z, y, x); if (!(a > 0.02)) return null;
    return val(cur, a, z, y, x);
  } };
}
/** Consolidation value: replaces the air (vessels vanish), blended at the edge. */
export const consolVal = (hu = 35) => (cur, a, z, y, x) => {
  const t = hu + 10 * nz(z, y, x, 0.5, 9), g = cur.hu < -300 ? cur.hu + 320 : cur.hu;
  const v = a > 0.5 ? lerp(g, t, sstep(0.5, 0.85, a)) : lerp(cur.hu, g, a * 2);
  return { hu: Math.round(v), label: a > 0.45 ? 'lesion' : 'keep' };
};
/** Ground-glass value: raises the attenuation of the aerated lung only (vessels and bronchial walls stay visible). */
export const ggoVal = (delta = 300) => (cur, a, z, y, x) => {
  if (cur.hu > -250) return null;
  return { hu: Math.round(cur.hu + delta * a + 18 * nz(z, y, x, 0.45, 5) * a), label: a > 0.4 ? 'lesion' : 'keep' };
};

/** Random lung voxel of a lobe at depth >= minDepth mm (deterministic from seed). */
export function lungPoint(A, key, seed, minDepth = 6, zf = null) {
  const b = A.s(key).bbox, D = lungDepth(A);
  for (let t = 0; t < 12; t++) {
    const f = zf !== null ? clamp01(zf + (hashU(seed, t, 3) - 0.5) * 0.08) : 0.08 + 0.84 * hashU(seed, t, 1);
    const z = Math.round(b[0] + (b[1] - b[0]) * f), v = A.sliceVoxels(key, z).filter(([y, x]) => D.mm(z, y, x) >= minDepth);
    if (v.length) { const [y, x] = v[Math.floor(hashU(seed, t, 2) * v.length)]; return [z, y, x]; }
  }
  return A.s(key).center.slice();
}

/**
 * Approximate bronchial tree of a lobe (bronchi are not segmented): branches from the lobar bronchus origin to
 * random points deep in the lobe. Returns [{ pts, r }] (r in mm per point). Cached.
 */
export function bronchTree(A, code, n = 5, seed = 1) {
  const ck = 'pul:tree:' + code + ':' + n + ':' + seed; if (A.cache.has(ck)) return A.cache.get(ck);
  const key = LOBE[code], root = HILUM[code], out = [];
  for (let i = 0; i < n; i++) {
    const t = lungPoint(A, key, seed * 31 + i, 9, (i + 0.5) / n * 0.8 + 0.1);
    const v = [t[0] - root[0], t[1] - root[1], t[2] - root[2]], j = (k) => (hashU(i, seed, k) - 0.5) * 6;
    const mid = [root[0] + v[0] * 0.45 + j(1), root[1] + v[1] * 0.45 + j(2), root[2] + v[2] * 0.45 + j(3)];
    out.push({ pts: [root, mid, t], r: [3.6, 2.6, 1.4] });
    const t2 = lungPoint(A, key, seed * 57 + i + 100, 9);
    if (dist(mid, t2) < dist(root, t2) * 0.9) out.push({ pts: [mid, [(mid[0] + t2[0]) / 2 + j(4), (mid[1] + t2[1]) / 2 + j(5), (mid[2] + t2[2]) / 2], t2], r: [2, 1.5, 0.9] });
  }
  A.cache.set(ck, out); return out;
}
/** Tubes for a tree; map(p) transforms each point (e.g. into a collapsed lobe). */
export function treeTubes(tree, opt, map = p => p) {
  return tree.map(br => ({ t: 'tube', pts: br.pts.map(map), r: br.r.map(v => v * (opt.rScale || 1)), hu: opt.hu, within: opt.within, label: opt.label || 'keep', wall: opt.wall }));
}

/**
 * Lobar collapse (atelectasis): the lobe is scaled toward its collapse point and kept inside its own territory;
 * the space it leaves is taken by the neighbouring aerated lung. V = remaining volume fraction (0.1..1).
 * o: { sink, tissue:{sin,portal}, vessel:{sin,portal} | null (vessels not shown), dia: mm diaphragm elevation, label }
 * Returns { prims, map } where map(p) sends an original-lobe point into the collapsed lobe.
 */
export function collapse(A, env, code, V, o = {}) {
  const key = LOBE[code], id = A.id(key), b = A.s(key).bbox, box = clampBox(A, [b[0] - 1, b[1] + 1, b[2] - 1, b[3] + 1, b[4] - 1, b[5] + 1]);
  const s = Math.cbrt(Math.max(0.05, Math.min(1, V))), a = o.sink || SINK[code], pr = probe(A, box), con = env.phase !== 'sin';
  const tissue = o.tissue ? (con ? o.tissue.portal : o.tissue.sin) : (con ? 72 : 38);
  const vessel = o.vessel === null ? null : o.vessel ? (con ? o.vessel.portal : o.vessel.sin) : (con ? 175 : 42);
  const nb = LOBE[o.neighbour || NEIGH[code]], side = key.endsWith('left') ? 'L' : 'R';
  const base = o.dia ? lungBase(A, key.endsWith('left') ? 'L' : 'R') : null, [, , X] = A.dims, dv = (o.dia || 0) / A.sp[0];
  const [Z, Y] = A.dims;
  const prim = { t: 'cols', box, label: 'keep', fn: (z, y, x, cur) => {
    if (cur.orig !== id) return null;
    const sz = Math.round(a[0] + (z - a[0]) / s), sy = Math.round(a[1] + (y - a[1]) / s), sx = Math.round(a[2] + (x - a[2]) / s);
    if (sz >= 0 && sz < Z && sy >= 0 && sy < Y && sx >= 0 && sx < X && A.at(sz, sy, sx) === id) {
      const h = pr.get(sz, sy, sx), v = vessel !== null && h > -520 ? vessel : tissue;
      return { hu: Math.round(v + 7 * nz(z, y, x, 0.5, 2)), label: o.label || 'lesion' };
    }
    if (base && base[y * X + x] >= 0 && z > base[y * X + x] - dv) return { hu: Math.round(62 + 6 * nz(z, y, x, 0.4, 4)), label: 0 };   // raised hemidiaphragm
    return { hu: cur.hu - 25, label: nb };          // the neighbouring lobe over-expands into the space
  } };
  return { prims: [pr.prim, prim], map: p => [a[0] + (p[0] - a[0]) * s, a[1] + (p[1] - a[1]) * s, a[2] + (p[2] - a[2]) * s], s, side };
}

/** A mark (teaching arrow). */
export const mark = (at, es, en, extra = {}) => ({ t: 'mark', at: at.map(Math.round), text: { es, en }, ...extra });
