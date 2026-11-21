// Pathology engine (pure, no DOM). Turns a list of lesion "primitives" into a small patch of the
// volume (HU + labels + optional pseudo-MR signal) that the viewer lays over the real CT.
// Shared by the viewer (src/ui.js, src/modui.js) and the tests.
//
// Coordinates are voxels [z, y, x] in display orientation (see core.js); sizes are in mm.
// A patch covers one box of the volume: { box:[z0,z1,y0,y1,x0,x1], n:[nz,ny,nx], hu, lab, set, mr, marks }.

import { index3 } from './core.js';

export const LESION_ID = 250;                // pseudo-label for simulated lesions (hover name, exam clicks)
export const PHASES = ['sin', 'arterial', 'portal', 'tardia'];
export const MODALITIES = ['ct', 'rx', 't1', 't2', 'stir'];

/* ---------------- small helpers ---------------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Deterministic 3D value noise in [-1, 1] (hash + trilinear interpolation). */
export function makeNoise(seed = 1) {
  const h = (x, y, z) => {
    let n = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
    n = (n ^ (n >>> 13)) * 1274126177 | 0;
    return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
  };
  const sm = t => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy), fz);
  };
}

/** HU of a value that may depend on the contrast phase: number or {sin, arterial, portal, tardia}. */
export function phaseValue(v, phase) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'number') return v;
  if (v[phase] !== undefined) return v[phase];
  return v.portal !== undefined ? v.portal : Object.values(v)[0];
}

/* ---------------- contrast phases (simulated on the portal-venous study) ---------------- */
// Target mean HU per structure family in each phase. Teaching values, always labelled "simulación".
// The study is portal venous, so 'portal' means "as acquired" (no shift).
const PHASE_TARGETS = {
  sin:      { artery: 40, vein: 40, portal: 40, heart: 40, liver: 55, spleen: 45, kidney: 30, pancreas: 40, adrenal: 25, bowel: 35, thyroid: 100 },
  arterial: { artery: 320, vein: 90, portal: 130, heart: 250, liver: 70, spleen: 120, kidney: 180, pancreas: 120, adrenal: 60, bowel: 80, thyroid: 160 },
  tardia:   { artery: 130, vein: 125, portal: 120, heart: 125, liver: 85, spleen: 100, kidney: 150, pancreas: 70, adrenal: 50, bowel: 60, thyroid: 110 },
};
/** Which phase family a structure belongs to (null = unaffected by contrast). */
export function phaseFamily(key) {
  if (/^(aorta|brachiocephalic_trunk|common_carotid|subclavian_artery|iliac_artery)/.test(key)) return 'artery';
  if (key === 'portal_vein_and_splenic_vein') return 'portal';
  if (/^(inferior_vena_cava|superior_vena_cava|brachiocephalic_vein|iliac_vena|pulmonary_vein)/.test(key)) return 'vein';
  if (key === 'heart' || key === 'atrial_appendage_left') return 'heart';
  if (key === 'liver') return 'liver';
  if (key === 'spleen') return 'spleen';
  if (key === 'kidney_left' || key === 'kidney_right') return 'kidney';
  if (key === 'pancreas') return 'pancreas';
  if (key.startsWith('adrenal_gland')) return 'adrenal';
  if (/^(stomach|duodenum|small_bowel|colon|esophagus)$/.test(key)) return 'bowel';
  if (key === 'thyroid_gland') return 'thyroid';
  return null;
}
/**
 * Per-label HU shift that turns the acquired portal phase into another phase.
 * means: Float64Array(256) of the acquired mean HU per label (see labelMeans).
 */
export function phaseShift(structures, means, phase, out = new Int16Array(256)) {
  out.fill(0);
  if (phase === 'portal' || !PHASE_TARGETS[phase]) return out;
  for (const s of structures) {
    const f = phaseFamily(s.key); if (!f) continue;
    const m = means[s.id]; if (!Number.isFinite(m)) continue;
    out[s.id] = Math.round(PHASE_TARGETS[phase][f] - m);
  }
  return out;
}
/** Mean HU per label over the whole volume. */
export function labelMeans(vol, lab) {
  const sum = new Float64Array(256), n = new Float64Array(256);
  for (let i = 0; i < lab.length; i++) { const l = lab[i]; if (l) { sum[l] += vol[i]; n[l]++; } }
  for (let l = 0; l < 256; l++) sum[l] = n[l] ? sum[l] / n[l] : NaN;
  return sum;
}

/* ---------------- pseudo-MR (simulation from CT density + anatomy) ---------------- */
// Signals in 0..1. Crude by design: it teaches contrasts (fat, fluid, oedema, marrow), not MR physics.
const MR_FLUID = new Set(['urinary_bladder', 'gallbladder', 'kidney_cyst_right']);
export function mrClass(key) {
  if (!key) return 'none';
  if (MR_FLUID.has(key)) return 'fluid';
  if (key === 'spinal_cord') return 'cord';
  if (key === 'brain') return 'brain';
  if (/^(vertebrae_|sacrum|hip_|femur|humerus|sternum|rib_|clavicula|scapula|skull)/.test(key)) return 'bone';
  if (/^(aorta|brachiocephalic|common_carotid|subclavian|iliac_|inferior_vena|superior_vena|portal_vein|pulmonary_vein|heart|atrial)/.test(key)) return 'vessel';
  if (/^lung_|trachea/.test(key)) return 'air';
  if (key === 'liver' || key === 'spleen' || key === 'pancreas' || key.startsWith('kidney') || key.startsWith('adrenal')) return 'organ';
  if (/^(autochthon|iliopsoas|gluteus)/.test(key)) return 'muscle';
  return 'soft';
}
const MR_TABLE = {        // [T1, T2, STIR]
  air:    [0.02, 0.02, 0.02],
  fat:    [0.92, 0.75, 0.05],
  fluid:  [0.12, 0.98, 0.95],
  cord:   [0.45, 0.82, 0.70],      // cord + surrounding CSF read as bright on T2
  brain:  [0.50, 0.55, 0.45],
  marrow: [0.72, 0.50, 0.12],      // adult fatty marrow: bright T1, dark STIR
  cortex: [0.03, 0.03, 0.03],
  vessel: [0.10, 0.10, 0.10],      // flow void
  organ:  [0.48, 0.40, 0.35],
  muscle: [0.38, 0.25, 0.20],
  soft:   [0.42, 0.45, 0.35],
};
/** Pseudo-MR signal (0..1) of a voxel. seq: 't1' | 't2' | 'stir'. cls from mrClass(). */
export function mrSignal(seq, hu, cls) {
  const k = seq === 't1' ? 0 : seq === 't2' ? 1 : 2;
  if (hu < -400) return MR_TABLE.air[k];
  if (cls === 'bone') { const m = MR_TABLE.marrow[k], c = MR_TABLE.cortex[k]; return hu <= 400 ? m : hu >= 900 ? c : m + (c - m) * (hu - 400) / 500; }
  if (cls === 'air') return hu < -200 ? MR_TABLE.air[k] : MR_TABLE.soft[k];
  if (cls === 'none' || cls === 'soft') {         // continuous fat → soft tissue → dense ramp (no speckle at thresholds)
    const f = MR_TABLE.fat[k], s = MR_TABLE.soft[k], c = MR_TABLE.cortex[k];
    if (hu <= -70) return f;
    if (hu < 10) return f + (s - f) * (hu + 70) / 80;
    if (hu <= 150) return s;
    if (hu < 500) return s + (c - s) * (hu - 150) / 350;
    return c;
  }
  return (MR_TABLE[cls] || MR_TABLE.soft)[k];
}

/* ---------------- digitally reconstructed radiograph (simulated plain film) ---------------- */
/** Linear attenuation proxy (per mm) for a HU value; bone weighted up as at diagnostic energies. */
export const mu = hu => (hu <= -1000 ? 0 : hu < 0 ? 0.02 * (1 + hu / 1000) : 0.02 * (1 + 1.6 * hu / 1000));
/**
 * Project the volume along one axis. plane 'coronal' = AP film (sum over y), 'sagittal' = lateral film (sum over x).
 * Returns Float32Array of line integrals laid out like the plane image (w*h, row-major).
 */
export function projectVolume(vol, dims, sp, plane) {
  const [Z, Y, X] = dims, YX = Y * X;
  if (plane === 'coronal') {
    const out = new Float32Array(X * Z);
    for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) { const b = z * YX + y * X, o = z * X; for (let x = 0; x < X; x++) out[o + x] += mu(vol[b + x]); }
    for (let i = 0; i < out.length; i++) out[i] *= sp[1];
    return out;
  }
  if (plane === 'sagittal') {
    const out = new Float32Array(Y * Z);
    for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) { const b = z * YX + y * X; let s = 0; for (let x = 0; x < X; x++) s += mu(vol[b + x]); out[z * Y + y] = s * sp[2]; }
    return out;
  }
  throw new Error('projection only for coronal or sagittal');
}
/** Add a patch's change to a base projection (returns a new array). */
export function projectPatch(base, vol, dims, sp, plane, patch) {
  const out = Float32Array.from(base);
  if (!patch) return out;
  const [z0, , y0, , x0] = patch.box, [nz, ny, nx] = patch.n;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = (k * ny + j) * nx + i; if (!patch.set[p]) continue;
    const z = z0 + k, y = y0 + j, x = x0 + i, d = mu(patch.hu[p]) - mu(vol[index3(dims, z, y, x)]);
    if (plane === 'coronal') out[z * dims[2] + x] += d * sp[1]; else out[z * dims[1] + y] += d * sp[2];
  }
  return out;
}
/** Film grey level (0..255) for a line integral: bone white, air black. lo/hi set the film latitude, g the contrast. */
export const filmGrey = (s, lo = 2.5, hi = 9, g = 0.85) => Math.round(255 * clamp((s - lo) / (hi - lo), 0, 1) ** g);
/** Film latitude from the projection itself: 5th and 99.5th percentile of the body (line integral > 0.5). */
export function filmStats(proj) {
  const v = []; for (let i = 0; i < proj.length; i += 3) if (proj[i] > 0.5) v.push(proj[i]);
  if (v.length < 10) return { lo: 2.5, hi: 9 };
  v.sort((a, b) => a - b);
  return { lo: v[Math.floor(0.05 * (v.length - 1))], hi: v[Math.floor(0.995 * (v.length - 1))] };
}
/**
 * Projection → film image (Uint8 grey, w*h): mild unsharp masking (edge enhancement as on a real radiograph),
 * then the latitude window with a contrast curve that keeps soft tissue grey and bone white.
 */
export function filmImage(proj, w, h, stats, out = new Uint8Array(w * h)) {
  const r = 6, tmp = new Float32Array(w * h), blur = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += proj[o + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[o + x] = s / (2 * r + 1); s += proj[o + Math.min(w - 1, x + r + 1)] - proj[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { blur[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  for (let i = 0; i < w * h; i++) { const e = proj[i] + 0.9 * (proj[i] - blur[i]); out[i] = proj[i] < 0.05 ? 0 : filmGrey(e, stats.lo, stats.hi, 1.7); }
  return out;
}

/* ---------------- anatomy context ---------------- */
/**
 * Geometry helpers over the label map, cached. Everything a module needs to put a lesion "at its real site".
 */
export class Anatomy {
  constructor(atlas, lab, dims, sp = [1.5, 1.5, 1.5]) {
    this.atlas = atlas; this.lab = lab; this.dims = dims; this.sp = sp;
    this.byKey = Object.fromEntries(atlas.structures.map(s => [s.key, s]));
    this.byId = Object.fromEntries(atlas.structures.map(s => [s.id, s]));
    this.cache = new Map();
  }
  s(key) { const s = this.byKey[key]; if (!s) throw new Error('unknown structure ' + key); return s; }
  has(key) { return !!this.byKey[key]; }
  id(key) { return this.s(key).id; }
  at(z, y, x) { return this.lab[index3(this.dims, z, y, x)]; }
  mm2vox(mm) { return mm / this.sp[0]; }
  /** Vertebral level label of an axial slice (from atlas.levels). */
  levelAt(z) { return this.atlas.levels[clamp(Math.round(z), 0, this.dims[0] - 1)] || null; }

  /** Spinal-canal (cord mask) extent at slice z: { y0, y1, xc } or null. */
  cordAt(z) {
    const key = 'cord:' + z; if (this.cache.has(key)) return this.cache.get(key);
    const id = this.id('spinal_cord'), [, Y, X] = this.dims, b = z * Y * X;
    let y0 = Infinity, y1 = -1, sx = 0, n = 0;
    for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) if (this.lab[b + y * X + x] === id) { if (y < y0) y0 = y; if (y > y1) y1 = y; sx += x; n++; }
    const r = n ? { y0, y1, xc: sx / n, n } : null;
    this.cache.set(key, r); return r;
  }

  /**
   * Vertebra geometry. body = vertebra voxels anterior to the canal (for C1: the anterior arch).
   * Returns { key, id, level, body:{z0,z1,y0,y1,x0,x1,c}, canal:{z,y0,y1,xc,ap}, ped:{R,L}, arch:{c}, cols }
   * cols: Map "y,x" -> [zTop, zBottom] of the body per column (for per-column warps such as a wedge).
   */
  vertebra(key) {
    const ck = 'v:' + key; if (this.cache.has(ck)) return this.cache.get(ck);
    const s = this.s(key), id = s.id, [z0, z1, y0, y1, x0, x1] = s.bbox, [, Y, X] = this.dims;
    let b = { z0: Infinity, z1: -1, y0: Infinity, y1: -1, x0: Infinity, x1: -1 }, sz = 0, sy = 0, sx = 0, n = 0;
    const cols = new Map(), pedR = [0, 0, 0, 0], pedL = [0, 0, 0, 0], arch = [0, 0, 0, 0];
    for (let z = z0; z <= z1; z++) {
      const c = this.cordAt(z); if (!c) continue;
      const half = Math.max(3, (c.n / Math.max(1, c.y1 - c.y0 + 1)) / 2);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (this.lab[(z * Y + y) * X + x] !== id) continue;
        if (y < c.y0 - 1) {
          b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
          sz += z; sy += y; sx += x; n++;
          const k = y + ',' + x, cz = cols.get(k);
          if (!cz) cols.set(k, [z, z]); else { if (z < cz[0]) cz[0] = z; if (z > cz[1]) cz[1] = z; }
        } else if (y <= c.y1 + 1) {
          const p = x < c.xc - half ? pedR : x > c.xc + half ? pedL : null;
          if (p) { p[0] += z; p[1] += y; p[2] += x; p[3]++; }
        } else { arch[0] += z; arch[1] += y; arch[2] += x; arch[3]++; }
      }
    }
    if (!n) throw new Error('no vertebral body found for ' + key);
    const avg = p => (p[3] ? [p[0] / p[3], p[1] / p[3], p[2] / p[3]].map(Math.round) : null);
    b.c = [sz / n, sy / n, sx / n].map(Math.round);
    const cz = b.c[0], cc = this.cordAt(cz) || this.cordAt(Math.round((z0 + z1) / 2));
    // canal AP diameter at mid-body: from the body's posterior wall to the arch, along the canal centre
    let archY = null;
    if (cc) for (let y = cc.y1 + 1; y <= y1; y++) if (this.at(cz, y, Math.round(cc.xc)) === id) { archY = y; break; }
    const canal = cc ? { z: cz, y0: b.y1 + 1, y1: archY !== null ? archY - 1 : cc.y1, xc: cc.xc } : null;
    if (canal) canal.ap = (canal.y1 - canal.y0 + 1) * this.sp[1];
    const r = { key, id, level: key.replace('vertebrae_', ''), body: b, canal, ped: { R: avg(pedR), L: avg(pedL) }, arch: { c: avg(arch) }, cols, voxels: n };
    this.cache.set(ck, r); return r;
  }

  /**
   * Intervertebral disc between two vertebrae (upper = cranial). Found per column: the gap between the bottom
   * of the upper body and the top of the lower body (works with the lordotic tilt). Returns
   * { cols: Map "y,x" -> [zFrom, zTo], c:[z,y,x], h (mean height, voxels), y0,y1,x0,x1,z0,z1 } or null.
   */
  disc(upperKey, lowerKey) {
    const ck = 'd:' + upperKey + ':' + lowerKey; if (this.cache.has(ck)) return this.cache.get(ck);
    const U = this.vertebra(upperKey), L = this.vertebra(lowerKey), cols = new Map();
    let sz = 0, sy = 0, sx = 0, n = 0, hs = 0, nc = 0, bb = { y0: Infinity, y1: -1, x0: Infinity, x1: -1, z0: Infinity, z1: -1 };
    for (const [k, u] of U.cols) {
      const l = L.cols.get(k); if (!l) continue;
      const a = u[1] + 1, b = l[0] - 1; if (b < a || b - a > 20) continue;
      const [y, x] = k.split(',').map(Number);
      cols.set(k, [a, b]); hs += b - a + 1; nc++;
      for (let z = a; z <= b; z++) { sz += z; sy += y; sx += x; n++; }
      bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y); bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, a); bb.z1 = Math.max(bb.z1, b);
    }
    const r = n ? { cols, c: [sz / n, sy / n, sx / n].map(Math.round), h: hs / nc, ...bb, upper: U, lower: L } : null;
    this.cache.set(ck, r); return r;
  }

  /** Centroid [y, x] and area (voxels) of a structure on axial slice z, or null. Cached (centrelines of vessels, organs). */
  centroidAt(key, z) {
    const ck = 'ca:' + key + ':' + z; if (this.cache.has(ck)) return this.cache.get(ck);
    const s = this.s(key), id = s.id, [, Y, X] = this.dims, b = s.bbox; let sy = 0, sx = 0, n = 0;
    if (z >= b[0] && z <= b[1]) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (this.lab[(z * Y + y) * X + x] === id) { sy += y; sx += x; n++; }
    const r = n ? { y: sy / n, x: sx / n, n } : null; this.cache.set(ck, r); return r;
  }
  /** Voxels of a structure on one axial slice, as [y, x] pairs (for placing things on a real outline). */
  sliceVoxels(key, z) {
    const s = this.s(key), id = s.id, [, Y, X] = this.dims, b = s.bbox, out = [];
    if (z >= b[0] && z <= b[1]) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (this.lab[(z * Y + y) * X + x] === id) out.push([y, x]);
    return out;
  }
  /** Extreme voxel of a structure along a direction ('anterior'|'posterior'|'right'|'left'|'superior'|'inferior'), optionally on slice z. */
  extreme(key, dir, z) {
    const s = this.s(key), id = s.id, [, Y, X] = this.dims, b = s.bbox;
    const z0 = z === undefined ? b[0] : z, z1 = z === undefined ? b[1] : z; let best = null, bv = Infinity;
    const score = { anterior: (zz, y) => y, posterior: (zz, y) => -y, right: (zz, y, x) => x, left: (zz, y, x) => -x, superior: zz => zz, inferior: zz => -zz }[dir];
    for (let zz = z0; zz <= z1; zz++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++)
      if (this.lab[(zz * Y + y) * X + x] === id) { const v = score(zz, y, x); if (v < bv) { bv = v; best = [zz, y, x]; } }
    return best;
  }

  /** Structures of one kind in craniocaudal order, e.g. vertebrae C1..S1. */
  vertebraKeys() {
    const order = k => { const m = /^vertebrae_([CTLS])(\d+)$/.exec(k); return m ? { C: 0, T: 10, L: 30, S: 40 }[m[1]] + (+m[2]) : 999; };
    return this.atlas.structures.map(s => s.key).filter(k => k.startsWith('vertebrae_')).sort((a, b) => order(a) - order(b));
  }
  /** The vertebra just below (caudal to) a vertebra key, or null. */
  below(key) { const v = this.vertebraKeys(), i = v.indexOf(key); return i >= 0 && i < v.length - 1 ? v[i + 1] : null; }
  above(key) { const v = this.vertebraKeys(), i = v.indexOf(key); return i > 0 ? v[i - 1] : null; }
}

/* ---------------- patch building ---------------- */
function boxOf(prims, anat) {
  let z0 = Infinity, z1 = -1, y0 = Infinity, y1 = -1, x0 = Infinity, x1 = -1;
  const add = (b) => { z0 = Math.min(z0, b[0]); z1 = Math.max(z1, b[1]); y0 = Math.min(y0, b[2]); y1 = Math.max(y1, b[3]); x0 = Math.min(x0, b[4]); x1 = Math.max(x1, b[5]); };
  for (const p of prims) { const b = primBox(p, anat); if (b) add(b); }
  if (z1 < 0) return null;
  const [Z, Y, X] = anat.dims;
  return [Math.max(0, z0), Math.min(Z - 1, z1), Math.max(0, y0), Math.min(Y - 1, y1), Math.max(0, x0), Math.min(X - 1, x1)];
}
function structBox(keys, anat, padVox = 0) {
  let b = null;
  for (const k of [].concat(keys)) {
    const s = anat.s(k).bbox;
    b = b ? [Math.min(b[0], s[0]), Math.max(b[1], s[1]), Math.min(b[2], s[2]), Math.max(b[3], s[3]), Math.min(b[4], s[4]), Math.max(b[5], s[5])] : s.slice();
  }
  return b && [b[0] - padVox, b[1] + padVox, b[2] - padVox, b[3] + padVox, b[4] - padVox, b[5] + padVox].map(Math.round);
}
function radiusVox(r, anat) { const a = Array.isArray(r) ? r : [r, r, r]; return a.map(v => v / anat.sp[0]); }
function primBox(p, anat) {
  const pad = 2;
  switch (p.t) {
    case 'blob': {
      const r = radiusVox(p.r, anat), e = (p.edge || 0) / anat.sp[0], irr = 1 + (p.irregular || 0) * 0.6 + (p.spic || 0) * 0.9, c = p.c;
      return [c[0] - r[0] * irr - e - pad, c[0] + r[0] * irr + e + pad, c[1] - r[1] * irr - e - pad, c[1] + r[1] * irr + e + pad, c[2] - r[2] * irr - e - pad, c[2] + r[2] * irr + e + pad].map(Math.round);
    }
    case 'fill': return p.region ? primBox({ t: 'blob', ...p.region }, anat) : structBox(p.s, anat);
    case 'shell': return structBox(p.s, anat, Math.ceil(p.d1 / anat.sp[0]) + 2);
    case 'layer': return structBox(p.s, anat);
    case 'rind': return structBox(p.s, anat, 1);
    case 'dilate': {
      const s = anat.s(p.s).bbox, sc = typeof p.scale === 'function' ? 2.5 : Math.max(1, p.scale), pad = Math.ceil(Math.max(s[3] - s[2], s[5] - s[4]) * (sc - 1) / 2) + 2;
      const z0 = p.z ? p.z[0] : s[0], z1 = p.z ? p.z[1] : s[1];
      return [z0, z1, s[2] - pad, s[3] + pad, s[4] - pad, s[5] + pad];
    }
    case 'warp': return p.box ? p.box.map(Math.round) : structBox(p.s, anat, 2);
    case 'cols': return p.box.map(Math.round);
    case 'plane': return structBox(p.s, anat, 1);
    case 'tube': {
      const r = Math.max(...[].concat(p.r)) / anat.sp[0] + pad + (p.wall ? p.wall.w / anat.sp[0] : 0);
      const zs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]), xs = p.pts.map(q => q[2]);
      return [Math.min(...zs) - r, Math.max(...zs) + r, Math.min(...ys) - r, Math.max(...ys) + r, Math.min(...xs) - r, Math.max(...xs) + r].map(Math.round);
    }
    case 'mark': return null;
    default: throw new Error('unknown primitive ' + p.t);
  }
}

/** Resolve a label option: 'lesion' (default) | 'keep' | 0 | structure key. */
function labelFor(opt, anat) {
  if (opt === undefined || opt === 'lesion') return LESION_ID;
  if (opt === 'keep') return -1;
  if (opt === 0 || opt === 'none') return 0;
  return anat.id(opt);
}
const MR_KEYS = ['t1', 't2', 'stir'];

/**
 * Build a patch from primitives.
 * src: { vol, lab } base arrays; opts: { phase, shift (Int16Array(256)), seed }.
 * Primitives are applied in order; each one reads the patch as left by the previous ones.
 */
export function buildPatch(prims, anat, src, opts = {}) {
  prims = (prims || []).filter(Boolean);
  const marks = prims.filter(p => p.t === 'mark');
  const box = boxOf(prims, anat);
  if (!box) return marks.length ? { box: null, n: [0, 0, 0], marks } : null;
  const [z0, z1, y0, y1, x0, x1] = box, nz = z1 - z0 + 1, ny = y1 - y0 + 1, nx = x1 - x0 + 1, N = nz * ny * nx;
  const hu = new Int16Array(N), lab = new Uint8Array(N), set = new Uint8Array(N), orig = new Uint8Array(N);
  const mr = { t1: new Uint8Array(N).fill(255), t2: new Uint8Array(N).fill(255), stir: new Uint8Array(N).fill(255) };
  const shift = opts.shift, [, Y, X] = anat.dims, src_hu = i => src.vol[i] + (shift ? shift[src.lab[i]] : 0);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const g = ((z0 + k) * Y + y0 + j) * X + x0, p = (k * ny + j) * nx;
    for (let i = 0; i < nx; i++) { const l = src.lab[g + i]; lab[p + i] = orig[p + i] = l; hu[p + i] = src.vol[g + i] + (shift ? shift[l] : 0); }
  }
  const P = { box, n: [nz, ny, nx], hu, lab, set, mr, marks, orig, anat, phase: opts.phase || 'portal', noise: makeNoise(opts.seed || 7), hasMR: false };
  for (const p of prims) if (p.t !== 'mark') PRIM[p.t](P, p, anat);
  // CT-like grain on simulated tissue so flat lesions don't look pasted on (real image noise here is ~10–20 HU).
  const grain = opts.grain === undefined ? 12 : opts.grain;
  if (grain) for (let k = 0, p = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const g = ((z0 + k) * Y + y0 + j) * X + x0;
    for (let i = 0; i < nx; i++, p++) {
      if (!P.set[p]) continue;
      const v = P.hu[p], src = src_hu(g + i);
      if (v === src || v < -900 || v > 1500) continue;
      let h = Math.imul((g + i) ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
      let h2 = Math.imul(h ^ 0x85ebca6b, 3266489917); h2 ^= h2 >>> 16;
      const n = (((h >>> 0) / 4294967296) + ((h2 >>> 0) / 4294967296) - 1) * 1.73;      // ≈ unit variance, triangular
      P.hu[p] = Math.round(v + n * grain);
    }
  }
  delete P.anat; delete P.noise;
  return P;
}
const pidx = (P, z, y, x) => ((z - P.box[0]) * P.n[1] + (y - P.box[2])) * P.n[2] + (x - P.box[4]);
const inBox = (P, z, y, x) => z >= P.box[0] && z <= P.box[1] && y >= P.box[2] && y <= P.box[3] && x >= P.box[4] && x <= P.box[5];

function idSet(keys, anat) { return keys ? new Set([].concat(keys).map(k => (k === 'lesion' ? LESION_ID : k === 0 || k === 'none' ? 0 : anat.id(k)))) : null; }
/** Write one voxel: blend alpha (0..1) toward hu, set label and MR overrides. */
function put(P, p, hu, a, lbl, mrv) {
  if (a <= 0) return;
  P.hu[p] = a >= 1 ? hu : Math.round(P.hu[p] + (hu - P.hu[p]) * a);
  if (lbl >= 0 && a >= 0.5) P.lab[p] = lbl;
  if (mrv) for (const k of MR_KEYS) if (mrv[k] !== undefined) {
    const cur = P.mr[k][p], v = Math.round(clamp(mrv[k], 0, 1) * 254);
    P.mr[k][p] = cur === 255 || a >= 1 ? (a >= 0.5 ? v : cur) : Math.round(cur + (v - cur) * a);
    P.hasMR = true;
  }
  P.set[p] = 1;
}
function allowed(P, p, within, outside) {
  const l = P.orig[p];
  if (within && !within.has(l) && !within.has(P.lab[p])) return false;
  if (outside && (outside.has(l) || outside.has(P.lab[p]))) return false;
  return true;
}

const PRIM = {
  /** Ellipsoid lesion with optional soft edge, lobulation, spiculation, rim, necrotic core and calcification. */
  blob(P, o, anat) {
    const r = radiusVox(o.r, anat), e = Math.max(0.001, (o.edge || 0) / anat.sp[0]), c = o.c, ph = P.phase;
    const hu = phaseValue(o.hu, ph), rim = o.rim && { w: o.rim.w / anat.sp[0], hu: phaseValue(o.rim.hu, ph) };
    const core = o.core && { f: o.core.f, hu: phaseValue(o.core.hu, ph) }, calc = o.calc, lbl = labelFor(o.label, anat);
    const within = idSet(o.within, anat), outside = idSet(o.outside, anat), irr = o.irregular || 0, spic = o.spic || 0, tex = o.texture || 0;
    const nz = P.noise, sc = 0.18, b = primBox(o, anat);
    for (let z = Math.max(b[0], P.box[0]); z <= Math.min(b[1], P.box[1]); z++)
      for (let y = Math.max(b[2], P.box[2]); y <= Math.min(b[3], P.box[3]); y++)
        for (let x = Math.max(b[4], P.box[4]); x <= Math.min(b[5], P.box[5]); x++) {
          const dz = (z - c[0]) / r[0], dy = (y - c[1]) / r[1], dx = (x - c[2]) / r[2];
          let d = Math.sqrt(dz * dz + dy * dy + dx * dx);                    // 1 = nominal surface
          if (irr) d /= 1 + irr * 0.45 * nz(x * sc, y * sc, z * sc);
          if (spic) { const sp = nz(x * 0.55 + 9, y * 0.55, z * 0.55); d /= 1 + spic * Math.max(0, sp) ** 2 * 1.6; }
          const rmin = Math.min(r[0], r[1], r[2]), outMM = (d - 1) * rmin;       // distance outside the surface, voxels
          let a = outMM <= 0 ? 1 : outMM >= e ? 0 : 1 - outMM / e;
          if (a <= 0) continue;
          const p = pidx(P, z, y, x); if (!allowed(P, p, within, outside)) continue;
          let v = hu;
          if (rim && (1 - d) * rmin < rim.w) v = rim.hu;
          if (core && d < core.f) v = core.hu;
          if (calc) {
            const pat = calc.pattern || 'central';
            const on = pat === 'central' ? d < (calc.f || 0.35) : pat === 'diffuse' ? nz(x * 0.9, y * 0.9, z * 0.9) > 0.35
              : pat === 'laminar' ? Math.abs(Math.sin(d * 9)) > 0.85 && d < 0.9 : pat === 'popcorn' ? nz(x * 0.5 + 3, y * 0.5, z * 0.5) > 0.42
              : pat === 'peripheral' ? d > 0.82 && d <= 1 : pat === 'eccentric' ? (dx > 0.3 && d < 0.6) : false;
            if (on) v = calc.hu || 600;
          }
          if (tex) v += tex * nz(x * 0.7 + 5, y * 0.7, z * 0.7);
          put(P, p, v, a, lbl, o.mr);
        }
  },
  /** Change every voxel of a structure (optionally limited to a region): set hu, add delta or scale around 0. */
  fill(P, o, anat) {
    const ids = idSet(o.s, anat), lbl = o.label === undefined ? -1 : labelFor(o.label, anat), ph = P.phase, tex = o.texture || 0;
    const reg = o.region && { c: o.region.c, r: radiusVox(o.region.r, anat) };
    const huRange = o.huRange;      // only voxels whose current HU is in [lo, hi]
    for (let k = 0; k < P.n[0]; k++) for (let j = 0; j < P.n[1]; j++) for (let i = 0; i < P.n[2]; i++) {
      const p = (k * P.n[1] + j) * P.n[2] + i; if (!ids.has(P.lab[p])) continue;
      const z = P.box[0] + k, y = P.box[2] + j, x = P.box[4] + i;
      if (reg) { const d = ((z - reg.c[0]) / reg.r[0]) ** 2 + ((y - reg.c[1]) / reg.r[1]) ** 2 + ((x - reg.c[2]) / reg.r[2]) ** 2; if (d > 1) continue; }
      if (huRange && (P.hu[p] < huRange[0] || P.hu[p] > huRange[1])) continue;
      let v = o.hu !== undefined ? phaseValue(o.hu, ph) : o.scale !== undefined ? P.hu[p] * o.scale : P.hu[p] + (o.delta || 0);
      if (tex) v += tex * P.noise(x * 0.6, y * 0.6, z * 0.6);
      put(P, p, v, 1, lbl, o.mr);
    }
  },
  /** Band of tissue outside a structure, between d0 and d1 mm from its surface (wall thickening, effusion, collar). */
  shell(P, o, anat) {
    const ids = idSet(o.s, anat), dist = distanceOutside(P, ids, anat), lbl = labelFor(o.label, anat), hu = phaseValue(o.hu, P.phase);
    const within = idSet(o.within, anat), outside = idSet(o.outside, anat), d0 = o.d0 || 0, d1 = o.d1, sp = anat.sp[0];
    const keep = o.side;    // optional predicate (z,y,x) => bool, e.g. only the dependent half
    for (let p = 0; p < dist.length; p++) {
      const d = dist[p] * sp; if (d <= d0 || d > d1) continue;
      if (!allowed(P, p, within, outside)) continue;
      if (keep) { const k = Math.floor(p / (P.n[1] * P.n[2])), j = Math.floor(p / P.n[2]) % P.n[1], i = p % P.n[2]; if (!keep(P.box[0] + k, P.box[2] + j, P.box[4] + i)) continue; }
      put(P, p, hu, 1, lbl, o.mr);
    }
  },
  /**
   * Layer inside a structure, per (z, x) column: the deepest `depth` mm (from: 'posterior', default — supine dependent
   * fluid) or the most anterior `depth` mm (from: 'anterior' — non-dependent air, e.g. pneumothorax). zRange limits slices.
   */
  layer(P, o, anat) {
    const ids = idSet(o.s, anat), lbl = labelFor(o.label, anat), hu = phaseValue(o.hu, P.phase), dv = o.depth / anat.sp[1];
    const [nz, ny, nx] = P.n, ant = o.from === 'anterior', zr = o.zRange;
    for (let k = 0; k < nz; k++) {
      if (zr && (P.box[0] + k < zr[0] || P.box[0] + k > zr[1])) continue;
      for (let i = 0; i < nx; i++) {
        let edge = -1;
        if (ant) { for (let j = 0; j < ny; j++) if (ids.has(P.lab[(k * ny + j) * nx + i])) { edge = j; break; } }
        else for (let j = ny - 1; j >= 0; j--) if (ids.has(P.lab[(k * ny + j) * nx + i])) { edge = j; break; }
        if (edge < 0) continue;
        for (let s = 0; s < dv; s++) { const j = ant ? edge + s : edge - s; if (j < 0 || j >= ny) break; const p = (k * ny + j) * nx + i; if (ids.has(P.lab[p])) put(P, p, hu, 1, lbl, o.mr); }
      }
    }
  },
  /** Band INSIDE a structure between d0 and d1 mm from its surface (subpleural rim, vessel-wall crescent, cyst wall). */
  rind(P, o, anat) {
    const id = anat.id(o.s), d = distanceInside(P, id), lbl = o.label === undefined ? -1 : labelFor(o.label, anat), sp = anat.sp[0], d0 = o.d0 || 0, d1 = o.d1;
    const keep = o.side, hu = o.hu !== undefined ? phaseValue(o.hu, P.phase) : null;
    for (let p = 0; p < d.length; p++) {
      if (!d[p]) continue; const mmv = (d[p] - 0.5) * sp; if (mmv < d0 || mmv > d1) continue;
      if (keep) { const k = Math.floor(p / (P.n[1] * P.n[2])), j = Math.floor(p / P.n[2]) % P.n[1], i = p % P.n[2]; if (!keep(P.box[0] + k, P.box[2] + j, P.box[4] + i)) continue; }
      put(P, p, hu !== null ? hu : P.hu[p] + (o.delta || 0), 1, lbl, o.mr);
    }
  },
  /**
   * Radial dilation (scale > 1) or shrinkage (< 1) of a structure around its per-slice centroid: aneurysm, splenomegaly,
   * dilated duct. scale: number or fn(z). Optional z:[z0,z1] limits it; tissue left behind on shrinkage gets `fill`.
   */
  dilate(P, o, anat) {
    const key = o.s, id = anat.id(key), b = primBox(o, anat), snapHU = P.hu.slice(), snapLab = P.lab.slice();
    const fill = o.fill || { hu: 40, label: 0 }, flbl = labelFor(fill.label === undefined ? 0 : fill.label, anat), fhu = phaseValue(fill.hu, P.phase);
    const lbl = o.label === undefined ? id : labelFor(o.label, anat);
    for (let z = Math.max(b[0], P.box[0]); z <= Math.min(b[1], P.box[1]); z++) {
      const c = anat.centroidAt(key, z); if (!c) continue;
      const sc = typeof o.scale === 'function' ? o.scale(z) : o.scale; if (!sc || sc === 1) continue;
      for (let y = Math.max(b[2], P.box[2]); y <= Math.min(b[3], P.box[3]); y++) for (let x = Math.max(b[4], P.box[4]); x <= Math.min(b[5], P.box[5]); x++) {
        const sy = Math.round(c.y + (y - c.y) / sc), sx = Math.round(c.x + (x - c.x) / sc), p = pidx(P, z, y, x);
        if (inBox(P, z, sy, sx) && snapLab[pidx(P, z, sy, sx)] === id) put(P, p, snapHU[pidx(P, z, sy, sx)], 1, lbl, o.mr);
        else if (snapLab[p] === id) put(P, p, fhu, 1, flbl, fill.mr);
      }
    }
  },
  /**
   * Geometric warp: every output voxel inside `box` (default: the structure's box) whose source (map(z,y,x))
   * lies in the structure takes the source's HU and label; output voxels of the structure that no longer
   * receive it get `fill`. map returns [z,y,x] (fractional ok) or null for "unchanged".
   */
  warp(P, o, anat) {
    const id = anat.id(o.s), b = primBox(o, anat), snap = { hu: P.hu.slice(), lab: P.lab.slice(), mr: o.keepMR ? null : null };
    const fill = o.fill || { hu: 40, label: 0 }, flbl = labelFor(fill.label === undefined ? 0 : fill.label, anat), fhu = phaseValue(fill.hu, P.phase);
    for (let z = Math.max(b[0], P.box[0]); z <= Math.min(b[1], P.box[1]); z++)
      for (let y = Math.max(b[2], P.box[2]); y <= Math.min(b[3], P.box[3]); y++)
        for (let x = Math.max(b[4], P.box[4]); x <= Math.min(b[5], P.box[5]); x++) {
          const p = pidx(P, z, y, x), m = o.map(z, y, x);
          if (m === null || m === undefined) continue;
          const sz = Math.round(m[0]), sy = Math.round(m[1]), sx = Math.round(m[2]);
          const ok = inBox(P, sz, sy, sx) && snap.lab[pidx(P, sz, sy, sx)] === id;
          if (ok) { const q = pidx(P, sz, sy, sx); put(P, p, snap.hu[q], 1, id, o.mr); }
          else if (snap.lab[p] === id) put(P, p, fhu, 1, flbl, fill.mr);
        }
  },
  /** Per-voxel function over a box: fn(z, y, x, cur) -> null | { hu, label?, a?, mr? }. The escape hatch. */
  cols(P, o, anat) {
    const b = o.box.map(Math.round), lblDefault = labelFor(o.label, anat);
    for (let z = Math.max(b[0], P.box[0]); z <= Math.min(b[1], P.box[1]); z++)
      for (let y = Math.max(b[2], P.box[2]); y <= Math.min(b[3], P.box[3]); y++)
        for (let x = Math.max(b[4], P.box[4]); x <= Math.min(b[5], P.box[5]); x++) {
          const p = pidx(P, z, y, x), r = o.fn(z, y, x, { hu: P.hu[p], lab: P.lab[p], orig: P.orig[p] });
          if (!r) continue;
          put(P, p, r.hu, r.a === undefined ? 1 : r.a, r.label === undefined ? lblDefault : labelFor(r.label, anat), r.mr);
        }
  },
  /** Fracture line: a slab of thickness w mm through a structure, along a plane (point p, normal n), jagged. */
  plane(P, o, anat) {
    const id = anat.id(o.s), n = o.n, len = Math.hypot(...n), nn = n.map(v => v / len), w = o.w / anat.sp[0] / 2, jag = (o.jag || 0) / anat.sp[0];
    const lbl = labelFor(o.label === undefined ? 'lesion' : o.label, anat), hu = phaseValue(o.hu === undefined ? 60 : o.hu, P.phase);
    const lim = o.limit;   // optional predicate (z,y,x) => bool restricting where the line runs
    for (let p = 0; p < P.lab.length; p++) {
      if (P.lab[p] !== id) continue;
      const k = Math.floor(p / (P.n[1] * P.n[2])), j = Math.floor(p / P.n[2]) % P.n[1], i = p % P.n[2];
      const z = P.box[0] + k, y = P.box[2] + j, x = P.box[4] + i;
      if (lim && !lim(z, y, x)) continue;
      let d = (z - o.p[0]) * nn[0] + (y - o.p[1]) * nn[1] + (x - o.p[2]) * nn[2];
      if (jag) d += jag * P.noise(x * 0.5 + 11, y * 0.5, z * 0.5);
      if (Math.abs(d) <= w) put(P, p, hu, 1, lbl, o.mr);
    }
  },
  /** Polyline tube (duct, vessel, needle track), optional wall. r: mm or per-point mm. */
  tube(P, o, anat) {
    const pts = o.pts, rr = [].concat(o.r).map(v => v / anat.sp[0]), lbl = labelFor(o.label, anat), hu = phaseValue(o.hu, P.phase);
    const wall = o.wall && { w: o.wall.w / anat.sp[0], hu: phaseValue(o.wall.hu, P.phase) }, within = idSet(o.within, anat), outside = idSet(o.outside, anat);
    const b = primBox(o, anat);
    for (let z = Math.max(b[0], P.box[0]); z <= Math.min(b[1], P.box[1]); z++)
      for (let y = Math.max(b[2], P.box[2]); y <= Math.min(b[3], P.box[3]); y++)
        for (let x = Math.max(b[4], P.box[4]); x <= Math.min(b[5], P.box[5]); x++) {
          let best = Infinity, rad = rr[0];
          for (let s = 0; s < pts.length - 1; s++) {
            const a = pts[s], c = pts[s + 1], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2 || 1;
            const t = clamp(((z - a[0]) * v[0] + (y - a[1]) * v[1] + (x - a[2]) * v[2]) / L2, 0, 1);
            const d = Math.hypot(z - a[0] - t * v[0], y - a[1] - t * v[1], x - a[2] - t * v[2]);
            if (d < best) { best = d; rad = rr.length > 1 ? rr[s] + (rr[Math.min(s + 1, rr.length - 1)] - rr[s]) * t : rr[0]; }
          }
          const p = pidx(P, z, y, x);
          if (best <= rad) { if (allowed(P, p, within, outside)) put(P, p, hu, 1, lbl, o.mr); }
          else if (wall && best <= rad + wall.w) { if (allowed(P, p, within, outside)) put(P, p, wall.hu, 1, lbl, o.wallMr); }
        }
  },
};

/** Distance (voxels) from every voxel of label id to the nearest voxel that is NOT id (0 outside the structure). */
export function distanceInside(P, id) { return chamfer(P, p => P.lab[p] !== id); }
/** Chamfer (3-4-5) distance in voxels from every patch voxel to the nearest voxel with a label in ids (0 inside). */
export function distanceOutside(P, ids) { return chamfer(P, p => ids.has(P.lab[p])); }
function chamfer(P, isSeed) {
  const [nz, ny, nx] = P.n, N = nz * ny * nx, INF = 1e9, d = new Float32Array(N);
  for (let p = 0; p < N; p++) d[p] = isSeed(p) ? 0 : INF;
  const a = 1, b = Math.SQRT2, c = Math.sqrt(3);
  const offs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const m = Math.abs(dz) + Math.abs(dy) + Math.abs(dx); if (!m) continue;
    offs.push([dz, dy, dx, m === 1 ? a : m === 2 ? b : c]);
  }
  const fwd = offs.filter(([dz, dy, dx]) => dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0))));
  const bwd = offs.filter(o => !fwd.includes(o));
  const pass = (list, k0, k1, kd, j0, j1, jd, i0, i1, id) => {
    for (let k = k0; k !== k1; k += kd) for (let j = j0; j !== j1; j += jd) for (let i = i0; i !== i1; i += id) {
      const p = (k * ny + j) * nx + i; let v = d[p]; if (v === 0) continue;
      for (const [dz, dy, dx, w] of list) {
        const kk = k + dz, jj = j + dy, ii = i + dx;
        if (kk < 0 || kk >= nz || jj < 0 || jj >= ny || ii < 0 || ii >= nx) continue;
        const q = d[(kk * ny + jj) * nx + ii] + w; if (q < v) v = q;
      }
      d[p] = v;
    }
  };
  pass(fwd, 0, nz, 1, 0, ny, 1, 0, nx, 1);
  pass(bwd, nz - 1, -1, -1, ny - 1, -1, -1, nx - 1, -1, -1);
  return d;
}

/* ---------------- applying a patch to one slice ---------------- */
/**
 * Overwrite slice arrays (hu, lb, optional mrOut[seq]) where the patch changed voxels.
 * Returns the number of patched pixels in this slice.
 */
export function applyPatch(plane, cur, patch, hu, lb, dims, mrSeq, mrOut) {
  if (!patch || !patch.box) return 0;
  const [z0, z1, y0, y1, x0, x1] = patch.box, [, ny, nx] = patch.n, [, Y, X] = dims;
  const mrArr = mrSeq && patch.hasMR ? patch.mr[mrSeq] : null;
  let count = 0;
  const one = (pp, q) => { if (!patch.set[pp]) return; hu[q] = patch.hu[pp]; lb[q] = patch.lab[pp]; if (mrOut) mrOut[q] = mrArr ? mrArr[pp] : 255; count++; };
  if (plane === 'axial') {
    const z = cur.z; if (z < z0 || z > z1) return 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) one(((z - z0) * ny + (y - y0)) * nx + (x - x0), y * X + x);
  } else if (plane === 'coronal') {
    const y = cur.y; if (y < y0 || y > y1) return 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) one(((z - z0) * ny + (y - y0)) * nx + (x - x0), z * X + x);
  } else {
    const x = cur.x; if (x < x0 || x > x1) return 0;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) one(((z - z0) * ny + (y - y0)) * nx + (x - x0), z * Y + y);
  }
  return count;
}

/** Voxels of the patch carrying a given label (for exam "find the lesion" checks and centring). */
export function patchVoxels(patch, label = LESION_ID) {
  const out = [];
  if (!patch || !patch.box) return out;
  const [nz, ny, nx] = patch.n;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = (k * ny + j) * nx + i; if (patch.set[p] && patch.lab[p] === label) out.push([patch.box[0] + k, patch.box[2] + j, patch.box[4] + i]);
  }
  return out;
}
/** Centre (mean voxel) of the lesion voxels, or null. */
export function lesionCentre(patch) {
  const v = patchVoxels(patch); if (!v.length) return null;
  const s = v.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]], [0, 0, 0]);
  return s.map(t => Math.round(t / v.length));
}
