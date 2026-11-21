// Geometry helpers for the urinario module (no DOM): renal sinus / collecting system, cortex vs medulla,
// ureter course, bladder wall and the approximate prostate, all found from the s0591 masks.
// Everything is cached in A.cache (keys start with 'uri:') so a patch rebuild stays fast.
import { distanceInside, distanceOutside, makeNoise } from '../../src/pathology.js';

export const KID = { R: 'kidney_right', L: 'kidney_left' };
export const MED = { R: 1, L: -1 };            // +x points to the patient's left: towards the midline from the right kidney
export const PSOAS = { R: 'iliopsoas_right', L: 'iliopsoas_left' };
export const IART = { R: 'iliac_artery_right', L: 'iliac_artery_left' };
export const IVEN = { R: 'iliac_vena_right', L: 'iliac_vena_left' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NZ = makeNoise(5);

/* ---------- 2D convex hull (slice outline of the kidney → renal sinus) ---------- */
function hull2(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function inHull(h, y, x) {
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; if ((b[0] - a[0]) * (x - a[1]) - (b[1] - a[1]) * (y - a[0]) < 0) return false; }
  return true;
}

/**
 * Kidney model on a padded local grid: K = 1 parenchyma, 2 renal sinus (unlabelled voxels inside the slice hull);
 * depth = distance (voxels) inside parenchyma+sinus from the outer surface; dout = distance to the parenchyma.
 * pelvis = sinus centroid over the hilum slices; upj = pelvi-ureteric junction (medial edge of the sinus, lower hilum).
 */
export function kmodel(A, side) {
  const key = KID[side], ck = 'uri:km:' + key; if (A.cache.has(ck)) return A.cache.get(ck);
  const id = A.id(key), bb = A.s(key).bbox, [Z, Y, X] = A.dims, PAD = 14;
  const b = [Math.max(0, bb[0] - PAD), Math.min(Z - 1, bb[1] + PAD), Math.max(0, bb[2] - PAD), Math.min(Y - 1, bb[3] + PAD), Math.max(0, bb[4] - PAD), Math.min(X - 1, bb[5] + PAD)];
  const nz = b[1] - b[0] + 1, ny = b[3] - b[2] + 1, nx = b[5] - b[4] + 1, N = nz * ny * nx;
  const K = new Uint8Array(N), orig = new Uint8Array(N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = (k * ny + j) * nx + i, l = A.at(b[0] + k, b[2] + j, b[4] + i); orig[p] = l; if (l === id) K[p] = 1;
  }
  const cyst = A.has('kidney_cyst_right') ? A.id('kidney_cyst_right') : -1;
  const sinN = new Float64Array(nz);
  for (let k = 0; k < nz; k++) {
    const pts = []; let j0 = 1e9, j1 = -1, i0 = 1e9, i1 = -1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (K[(k * ny + j) * nx + i] === 1) { pts.push([j, i]); if (j < j0) j0 = j; if (j > j1) j1 = j; if (i < i0) i0 = i; if (i > i1) i1 = i; }
    if (pts.length < 20) continue;
    const h = hull2(pts);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const p = (k * ny + j) * nx + i; if (K[p] || !inHull(h, j, i)) continue; if (orig[p] === 0) { K[p] = 2; sinN[k]++; } else if (orig[p] === cyst) K[p] = 3; }
  }
  const l1 = new Uint8Array(N), lk = new Uint8Array(N);
  for (let p = 0; p < N; p++) { l1[p] = K[p] === 1 || K[p] === 2 ? 1 : 0; lk[p] = K[p] === 1 ? 1 : 0; }
  const depth = distanceInside({ n: [nz, ny, nx], lab: l1 }, 1), dout = distanceOutside({ n: [nz, ny, nx], lab: lk }, new Set([1]));
  // hilum: slices where the sinus is at least 40 % of its largest area
  let mx = 0; for (let k = 0; k < nz; k++) mx = Math.max(mx, sinN[k]);
  let s = [0, 0, 0], n = 0, hz0 = 1e9, hz1 = -1;
  for (let k = 0; k < nz; k++) if (sinN[k] >= 0.4 * mx) {
    hz0 = Math.min(hz0, k); hz1 = Math.max(hz1, k);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (K[(k * ny + j) * nx + i] === 2) { s[0] += k; s[1] += j; s[2] += i; n++; }
  }
  const pelvis = n ? [b[0] + s[0] / n, b[2] + s[1] / n, b[4] + s[2] / n].map(Math.round) : A.s(key).bbox.filter((_, i) => i % 2 === 0).map((v, i) => Math.round((v + A.s(key).bbox[i * 2 + 1]) / 2));
  const kU = Math.round((pelvis[0] - b[0] + hz1) / 2);
  let upj = null, best = -1e9;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (K[(kU * ny + j) * nx + i] === 2) { const sc = MED[side] * i - Math.abs(j - (pelvis[1] - b[2])) * 0.3; if (sc > best) { best = sc; upj = [b[0] + kU, b[2] + j, b[4] + i + MED[side] * 2]; } }
  if (!upj) upj = [pelvis[0] + 4, pelvis[1], pelvis[2] + MED[side] * 6];
  // lower-pole calyx: lowest sinus voxel touching the parenchyma
  let calyx = null;
  for (let k = nz - 1; k >= 0 && !calyx; k--) for (let j = 0; j < ny && !calyx; j++) for (let i = 0; i < nx; i++) { const p = (k * ny + j) * nx + i; if (K[p] === 2 && dout[p] <= 1.5) { calyx = [b[0] + k, b[2] + j, b[4] + i]; break; } }
  const m = {
    side, key, id, b, n: [nz, ny, nx], K, depth, dout, orig, pelvis, upj, calyx: calyx || pelvis, hil: [b[0] + hz0, b[0] + hz1],
    box: [b[0], b[1], b[2], b[3], b[4], b[5]],
    idx: (z, y, x) => (z < b[0] || z > b[1] || y < b[2] || y > b[3] || x < b[4] || x > b[5] ? -1 : ((z - b[0]) * ny + (y - b[2])) * nx + (x - b[4])),
  };
  A.cache.set(ck, m); return m;
}
/** 'cortex' | 'medulla' | 'sinus' | null for one voxel of the kidney model (pyramids broken by columns of cortex). */
export function kclass(m, p, z, y, x) {
  const k = m.K[p]; if (k === 2) return 'sinus'; if (k !== 1) return null;
  if (m.depth[p] <= 3.4) return 'cortex';
  return NZ(x * 0.24, y * 0.24, z * 0.24) > -0.3 ? 'medulla' : 'cortex';
}
/** Kidney appearance per contrast phase (corticomedullary differentiation in the arterial phase). Label kept. */
export function kidneyPaint(A, side, phase, over) {
  const m = kmodel(A, side);
  return { t: 'cols', box: m.box, label: 'keep', fn: (z, y, x, cur) => {
    const p = m.idx(z, y, x); if (p < 0 || m.K[p] !== 1 || cur.orig !== m.id) return null;
    const c = kclass(m, p, z, y, x);
    if (over) { const r = over(z, y, x, p, c, cur); if (r) return r; }
    if (phase === 'arterial' && c === 'medulla') return { hu: cur.hu - Math.round(95 * clamp((m.depth[p] - 3.4) / 1.6, 0, 1)), label: 'keep' };
    if (phase === 'arterial') return { hu: cur.hu + 25, label: 'keep' };
    return null;
  } };
}
/** Point on the kidney outline: slice at fraction f of its height, ray from the slice centroid along dir [dy, dx]. */
export function kSurface(A, side, f, dir) {
  const key = KID[side], b = A.s(key).bbox, id = A.id(key), z = Math.round(b[0] + (b[1] - b[0]) * f), c = A.centroidAt(key, z);
  const L = Math.hypot(dir[0], dir[1]) || 1, d = [dir[0] / L, dir[1] / L]; let last = [z, Math.round(c.y), Math.round(c.x)];
  for (let s = 0; s < 90; s++) { const yy = Math.round(c.y + d[0] * s * 0.5), xx = Math.round(c.x + d[1] * s * 0.5); if (A.at(z, yy, xx) === id) last = [z, yy, xx]; }
  return last;
}
/** Centre of a lesion of radius rmm on the kidney surface, sunk by `sink` of its radius into the parenchyma. */
export function kLesionCentre(A, side, f, dir, rmm, sink = 0.45) {
  const s = kSurface(A, side, f, dir), L = Math.hypot(dir[0], dir[1]) || 1, rv = rmm / A.sp[0];
  return [s[0], Math.round(s[1] - dir[0] / L * rv * sink), Math.round(s[2] - dir[1] / L * rv * sink)];
}

/* ---------- ureter (not segmented): UPJ → anterior psoas → over the iliac vessels → posterolateral bladder ---------- */
function anteriorEdge(A, key, z, x) { const id = A.id(key), [, Y] = A.dims; for (let y = 0; y < Y; y++) if (A.at(z, y, x) === id) return y; return null; }
export function ureter(A, side) {
  const ck = 'uri:ur:' + side; if (A.cache.has(ck)) return A.cache.get(ck);
  const m = kmodel(A, side), med = MED[side], pts = [m.upj];
  const zCross = Math.min(A.dims[0] - 30, A.s(IART[side]).bbox[0] + 50);
  for (let z = m.upj[0] + 10; z < zCross - 8; z += 10) {
    const c = A.centroidAt(PSOAS[side], z); if (!c) continue;
    const x = Math.round(c.x + med * 3), y0 = anteriorEdge(A, PSOAS[side], z, x); if (y0 !== null) pts.push([z, y0 - 3, x]);
  }
  const ia = A.centroidAt(IART[side], zCross);
  if (ia) { const x = Math.round(ia.x), y0 = anteriorEdge(A, IART[side], zCross, x); pts.push([zCross, (y0 !== null ? y0 : Math.round(ia.y)) - 3, x]); }
  const iCross = pts.length - 1;
  // bladder: posterolateral wall a few slices below its dome, then the ureterovesical junction lower down
  const bb = A.s('urinary_bladder').bbox, bl = A.id('urinary_bladder');
  const wall = z => { let best = null, bs = -1e9; for (const [y, x] of A.sliceVoxels('urinary_bladder', z)) { const s = y - med * x * 0.9; if (s > bs) { bs = s; best = [z, y, x]; } } return best; };
  const zP = bb[0] + 6, wP = wall(zP);
  if (wP) pts.push([zP - 4, wP[1] + 6, wP[2] - med * 8]);
  const zU = Math.min(bb[1] - 6, bb[0] + 16), uvj = wall(zU) || [zU, bb[3] - 4, Math.round((bb[4] + bb[5]) / 2)];
  pts.push([uvj[0], uvj[1] + 2, uvj[2] - med * 2]);
  void bl;
  const r = { pts, iCross, uvj, zCross };
  A.cache.set(ck, r); return r;
}
/** Structures a ureter / renal-vein tube must not overwrite. */
export function tubeOutside(A, extra = []) {
  return ['aorta', 'inferior_vena_cava', 'iliopsoas_left', 'iliopsoas_right', 'iliac_artery_left', 'iliac_artery_right', 'iliac_vena_left', 'iliac_vena_right',
    'hip_left', 'hip_right', 'sacrum', 'colon', 'small_bowel', 'duodenum', 'kidney_left', 'kidney_right', ...A.vertebraKeys(), ...extra].filter(k => A.has(k));
}
/** Split a polyline at index i (point i belongs to both halves). */
export const splitAt = (pts, i) => [pts.slice(0, i + 1), pts.slice(i)];

/** Point of the bladder wall at slice z: posterior + lateral on `side` ('R' / 'L'), and the slice centroid. */
export function bladderWall(A, side, z, lat = 0.7) {
  const med = MED[side]; let best = null, bs = -1e9;
  for (const [y, x] of A.sliceVoxels('urinary_bladder', z)) { const s = y - med * x * lat; if (s > bs) { bs = s; best = [z, y, x]; } }
  const c = A.centroidAt('urinary_bladder', z);
  return { wall: best, c: c ? [z, Math.round(c.y), Math.round(c.x)] : best };
}

/** Excretory-phase contrast in the collecting systems, ureters and bladder (urografía / fase excretora). */
export function excretory(A, sides, { hu = 1800, bladder = 40, skip = [], ureterR = 2.4 } = {}) {
  const out = [];
  for (const side of sides) {
    if (skip.includes(side)) continue;
    const m = kmodel(A, side), u = ureter(A, side), [py, px] = [m.pelvis[1], m.pelvis[2]];
    out.push({ t: 'cols', box: m.box, label: 'keep', fn: (z, y, x) => {
      const p = m.idx(z, y, x); if (p < 0 || m.K[p] !== 2) return null;
      const dp = Math.hypot((z - m.pelvis[0]) * 0.7, y - py, x - px);
      return m.dout[p] <= 1.8 || dp < 5 ? { hu, label: 'keep', mr: { t1: 0.1, t2: 0.95, stir: 0.9 } } : null;
    } });
    out.push({ t: 'tube', pts: [m.pelvis, ...u.pts], r: ureterR, hu, label: 'keep', outside: tubeOutside(A), mr: { t1: 0.1, t2: 0.95, stir: 0.9 } });
  }
  if (bladder) out.push({ t: 'layer', s: 'urinary_bladder', depth: bladder, hu: Math.round(hu * 0.55), label: 'keep' });
  return out;
}

/** Perirenal fat stranding (and a thickened Gerota fascia) around one kidney: only fat voxels change. */
export function perirenal(A, side, { w = 10, gerota = true, amount = 1 } = {}) {
  const m = kmodel(A, side);
  return { t: 'cols', box: m.box, label: 'keep', fn: (z, y, x, cur) => {
    const p = m.idx(z, y, x); if (p < 0 || m.K[p] || cur.orig !== 0 || cur.hu > -20) return null;
    const d = m.dout[p]; if (d < 1 || d > w + 1.5) return null;
    if (gerota && d > w - 0.2 && d <= w + 1.2) return { hu: 25, label: 'keep', mr: { t1: 0.35, t2: 0.45, stir: 0.4 } };
    const nn = NZ(x * 0.45 + 3, y * 0.45, z * 0.45);
    return nn > 0.05 ? { hu: cur.hu + Math.round(70 * amount * (1 - d / (w + 2))), label: 'keep', mr: { t1: 0.5, t2: 0.7, stir: 0.6 } } : null;
  } };
}

/* ---------- prostate (mask empty; the study ends at mid-bladder, above the gland) ---------- */
/**
 * Stand-in ellipsoid prostate at the bottom of the study, against the posterior bladder base (it indents the bladder:
 * the bigger the gland, the bigger the impression). d = [D1 craniocaudal, D2 transverse, D3 AP] in mm.
 * Returns { c:[z,y,x], r:[rz, rx, ry] } in voxels.
 */
export function prostateGeom(A, d) {
  const r = d.map(v => v / 2 / A.sp[0]), zLast = A.dims[0] - 1, zc = Math.round(zLast - r[0] - 1);
  const c = A.centroidAt('urinary_bladder', zc) || A.centroidAt('urinary_bladder', A.s('urinary_bladder').bbox[1]);
  let yPost = -1; for (const [y, x] of A.sliceVoxels('urinary_bladder', zc)) if (Math.abs(x - c.x) < 8 && y > yPost) yPost = y;
  if (yPost < 0) yPost = Math.round(c.y + 20);
  return { c: [zc, Math.round(yPost + r[2] * 0.4), Math.round(c.x)], r: [r[0], r[1], r[2]] };
}
/** Volume (cc) of the ellipsoid as the syllabus measures it: 0.5 × D1 × D2 × D3 (cm). */
export const prostateVolume = d => 0.5 * d[0] * d[1] * d[2] / 1000;
/**
 * Prostate voxels with zonal anatomy for the pseudo-MR. opts: { d:[D1,D2,D3] mm, lesion:{side, mm}, calc, label, lesionLabel }.
 * Zones (normalised coords u craniocaudal, v AP (+ posterior), w transverse): anterior fibromuscular stroma, transition
 * zone (anterior-central; grows with the volume: HBP), central zone (cranial-posterior), peripheral zone (posterior-lateral rim).
 */
export function prostate(A, o) {
  const g = prostateGeom(A, o.d), [zc, yc, xc] = g.c, [rz, rx, ry] = g.r;
  const box = [zc - rz - 2, zc + rz + 2, yc - ry - 2, yc + ry + 2, xc - rx - 2, xc + rx + 2].map(Math.round);
  const vol = prostateVolume(o.d), t = clamp((vol - 20) / 40, 0, 1), hbp = t > 0;    // > 20 cc: enlarged transition zone
  const tz = [0.5 + 0.34 * t, 0.46 + 0.36 * t, 0.4 + 0.32 * t];                       // TZ radii (u, w, v) as a fraction of the gland
  const bones = new Set(['hip_left', 'hip_right', 'sacrum', 'femur_left', 'femur_right', 'colon'].filter(k => A.has(k)).map(k => A.id(k)));
  const les = o.lesion && { u: 0.1, v: 0.66, w: (o.lesion.side === 'R' ? -1 : 1) * 0.42, r: o.lesion.mm / 2 / A.sp[0] };
  const lbl = o.label === undefined ? 'lesion' : o.label;
  return { t: 'cols', box, label: lbl, fn: (z, y, x, cur) => {
    if (bones.has(cur.orig)) return null;
    const u = (z - zc) / rz, v = (y - yc) / ry, w = (x - xc) / rx, d = Math.hypot(u, v, w); if (d > 1) return null;
    const n = NZ(x * 0.5 + 7, y * 0.5, z * 0.5), hu = 42 + Math.round(8 * n);
    if (les && Math.hypot((u - les.u) * rz, (v - les.v) * ry, (w - les.w) * rx) < les.r * (1 + 0.25 * n))
      return { hu: 45 + Math.round(6 * n), label: o.lesionLabel || 'lesion', mr: { t1: 0.36, t2: 0.2, stir: 0.4 } };
    if (d > 0.93) return { hu, label: lbl, mr: { t1: 0.34, t2: 0.16, stir: 0.18 } };                                       // capsule
    const dz = Math.hypot(u / tz[0], w / tz[1], (v + 0.12) / tz[2]);
    if (o.calc && Math.abs(dz - 1) < 0.08 && n > 0.2) return { hu: 520, label: lbl, mr: { t1: 0.05, t2: 0.05, stir: 0.05 } }; // surgical capsule
    if (v < -0.64) return { hu, label: lbl, mr: { t1: 0.32, t2: 0.12, stir: 0.12 } };                                       // anterior fibromuscular stroma
    if (dz < 1) {                                                                                                          // transition zone
      const t2 = hbp ? 0.26 + 0.34 * Math.max(0, NZ(x * 0.32, y * 0.32, z * 0.32 + 4)) : 0.3;
      return { hu: hu + (hbp ? Math.round(6 * n) : 0), label: lbl, mr: { t1: 0.38, t2, stir: 0.3 } };
    }
    if (u < -0.3 && v > -0.1 && v < 0.5 && !hbp) return { hu, label: lbl, mr: { t1: 0.38, t2: 0.36, stir: 0.3 } };        // central zone
    return { hu, label: lbl, mr: { t1: 0.38, t2: 0.86 - 0.12 * t, stir: 0.75 } };                                          // peripheral zone
  } };
}

/* ---------- renal lesions ---------- */
/** Kidney parenchyma HU per phase (the engine's simulated targets; 'portal' = as acquired, nephrographic). */
export const KHU = { sin: 30, arterial: 180, portal: 160, tardia: 150 };
export const FLUID_MR = { t1: 0.12, t2: 0.97, stir: 0.94 };
export const FAT_MR = { t1: 0.92, t2: 0.75, stir: 0.05 };
export const SOFT_MR = { t1: 0.4, t2: 0.45, stir: 0.4 };
/** Wedge (cone) of parenchyma from the renal sinus to the capsule, towards the kidney surface point s. */
export function wedges(A, side, targets, { half = 0.26, striate = true } = {}) {
  const m = kmodel(A, side), ap = m.pelvis;
  const ax = targets.map(s => { const v = [s[0] - ap[0], s[1] - ap[1], s[2] - ap[2]], L = Math.hypot(...v) || 1; return { v: v.map(q => q / L), L }; });
  return (z, y, x) => {
    const d = [z - ap[0], y - ap[1], x - ap[2]], L = Math.hypot(...d) || 1;
    for (const a of ax) {
      const cos = (d[0] * a.v[0] + d[1] * a.v[1] + d[2] * a.v[2]) / L; if (cos <= 0 || L < a.L * 0.3) continue;
      const ang = Math.acos(Math.min(1, cos)), h = half * (1 + 0.25 * NZ(x * 0.3, y * 0.3, z * 0.3 + 9));
      if (ang > h) continue;
      if (striate && Math.sin(ang * 40 + L * 0.5) > 0.55) return 0.5;            // striations: alternating bands
      return 1;
    }
    return 0;
  };
}
/**
 * Hydronephrosis grade I–IV on one kidney (collecting system from the renal-sinus model): I dilated pelvis,
 * II + calyceal ectasia, III + rounded (blunted) calyces, IV + cortical atrophy. Fluid voxels labelled 'lesion'.
 */
export function hydro(A, side, grade, { hu = 8, label = 'lesion' } = {}) {
  const m = kmodel(A, side), out = [], [pz, py, px] = m.pelvis, med = MED[side];
  const near = (p, k, j, i, r) => {           // a sinus voxel within r voxels (blunted calyces)
    const [nz, ny, nx] = m.n;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      const kk = k + a, jj = j + b, ii = i + c; if (kk < 0 || jj < 0 || ii < 0 || kk >= nz || jj >= ny || ii >= nx) continue;
      if (m.K[(kk * ny + jj) * nx + ii] === 2) return true;
    }
    return false;
  };
  const pr = 4 + 2.2 * grade;                 // pelvis radius inside the sinus, voxels
  out.push({ t: 'cols', box: m.box, label, fn: (z, y, x, cur) => {
    const p = m.idx(z, y, x); if (p < 0) return null; const K = m.K[p];
    if (K === 2) {
      const dp = Math.hypot((z - pz) * 0.8, y - py, x - px);
      if (dp < pr || grade >= 3 || (grade === 2 && (m.dout[p] <= 2.6 || dp < pr * 1.5))) return { hu, mr: FLUID_MR };
      return null;
    }
    if (K !== 1 || cur.orig !== m.id || grade < 3) return null;
    if (grade >= 4 && m.depth[p] > 3.6) return { hu, mr: FLUID_MR };            // cortical atrophy: only a thin rim is left
    const k = Math.floor(p / (m.n[1] * m.n[2])), j = Math.floor(p / m.n[2]) % m.n[1], i = p % m.n[2];
    if (kclass(m, p, z, y, x) === 'medulla' && near(p, k, j, i, 2)) return { hu, mr: FLUID_MR };
    return null;
  } });
  // extrarenal part of the pelvis, at the pelvi-ureteric junction
  const r = 5 + 2.2 * grade;
  out.push({ t: 'blob', c: [m.upj[0] - 2, m.upj[1], m.upj[2] - med * 2], r: [r * 1.2, r * 0.8, r], hu, edge: 1, label, outside: tubeOutside(A, ['liver', 'spleen', 'pancreas', 'stomach']), mr: FLUID_MR });
  return out;
}
/** Ureter polyline from the pelvis down to a stopping point: 'upj' | 'lumbar' | 'iliaco' | 'uvj'. Returns { pts, end }. */
export function ureterTo(A, side, level) {
  const u = ureter(A, side), m = kmodel(A, side), all = [m.upj, ...u.pts.slice(1)];
  const i = level === 'upj' ? 0 : level === 'lumbar' ? Math.min(3, u.iCross - 1) : level === 'iliaco' ? u.iCross : all.length - 1;
  return { pts: all.slice(0, i + 1), end: all[i] };
}
/** Fat stranding around a point (only fat voxels change): periureteral oedema around a stone. */
export function stranding(c, rmm, A, amount = 1) {
  const rv = rmm / A.sp[0], box = [c[0] - rv - 1, c[0] + rv + 1, c[1] - rv - 1, c[1] + rv + 1, c[2] - rv - 1, c[2] + rv + 1].map(Math.round);
  return { t: 'cols', box, label: 'keep', fn: (z, y, x, cur) => {
    if (cur.orig !== 0 || cur.hu > -30 || cur.hu < -200) return null;
    const d = Math.hypot(z - c[0], y - c[1], x - c[2]) / rv; if (d > 1) return null;
    return NZ(x * 0.5, y * 0.5 + 2, z * 0.5) > -0.1 ? { hu: cur.hu + Math.round(75 * amount * (1 - d * 0.7)), label: 'keep', mr: { t1: 0.5, t2: 0.7, stir: 0.65 } } : null;
  } };
}

/** Mean HU of a patch inside a sphere (ROI, voxels), optionally only voxels with a given label. */
export function roi(P, c, rv, label) {
  if (!P || !P.box || !c) return null;
  const [z0, , y0, , x0] = P.box, [nz, ny, nx] = P.n; let s = 0, n = 0;
  for (let z = Math.ceil(c[0] - rv); z <= c[0] + rv; z++) for (let y = Math.ceil(c[1] - rv); y <= c[1] + rv; y++) for (let x = Math.ceil(c[2] - rv); x <= c[2] + rv; x++) {
    if ((z - c[0]) ** 2 + (y - c[1]) ** 2 + (x - c[2]) ** 2 > rv * rv) continue;
    const k = z - z0, j = y - y0, i = x - x0; if (k < 0 || j < 0 || i < 0 || k >= nz || j >= ny || i >= nx) continue;
    const p = (k * ny + j) * nx + i; if (!P.set[p] || (label !== undefined && P.lab[p] !== label)) continue;
    s += P.hu[p]; n++;
  }
  return n ? s / n : null;
}
/** Centroid of a structure (cached). */
export function centroid(A, key) {
  const ck = 'uri:c:' + key; if (A.cache.has(ck)) return A.cache.get(ck);
  const s = A.s(key), b = s.bbox; let sz = 0, sy = 0, sx = 0, n = 0;
  for (let z = b[0]; z <= b[1]; z++) { const c = A.centroidAt(key, z); if (c) { sz += z * c.n; sy += c.y * c.n; sx += c.x * c.n; n += c.n; } }
  const r = [sz / n, sy / n, sx / n].map(Math.round); A.cache.set(ck, r); return r;
}
