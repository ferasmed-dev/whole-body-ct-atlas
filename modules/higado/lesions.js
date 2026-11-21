// Liver lesion patterns per contrast phase (the backbone of the module: the dynamic enhancement pattern),
// plus the cirrhotic liver and portal hypertension. Values are teaching HU, coherent with the engine's
// simulated phases (liver ≈ 55 / 70 / 101 / 85 HU in basal / arterial / portal / delayed).
import { sphere, depth, grid, NZ, NZ2, LIV, PV, SPL, tortuous, confluence, segPlanes, umbilicus, hilum, clamp, rbox, pancParts, outDist } from './geo.js';
import { MR, pv, mark } from './common.js';

const P = (sin, arterial, portal, tardia) => ({ sin, arterial, portal, tardia });
/** HU tables of each lesion (body, rim/capsule, scar…) per phase. */
export const HUT = {
  quiste: { body: P(5, 5, 5, 5) },
  hidatidico: { fluid: P(8, 8, 8, 8), matrix: P(18, 18, 18, 18), wall: P(30, 50, 75, 75) },
  absceso: { pus: P(22, 22, 24, 24), rim: P(35, 80, 120, 105) },
  hemangioma: { base: P(40, 40, 40, 40), pool: P(40, 210, 160, 125) },
  hnf: { body: P(50, 150, 103, 86), scar: P(42, 60, 78, 95) },
  adenoma: { body: P(52, 140, 88, 72), cap: P(50, 75, 105, 115), blood: P(75, 60, 60, 60) },
  hcc: { body: P(48, 135, 82, 66), cap: P(48, 60, 95, 108), nec: P(30, 30, 32, 32) },
  colangio: { body: P(40, 50, 70, 100), rim: P(42, 78, 80, 95) },
  meta: { core: P(38, 48, 55, 62), rim: P(40, 75, 118, 96) },
};
export const HU_OF = (type, ph) => {
  const t = HUT[type]; if (!t) return null;
  const k = type === 'hemangioma' ? 'pool' : type === 'meta' ? 'rim' : type === 'absceso' ? 'rim' : type === 'hidatidico' ? 'wall' : type === 'quiste' ? 'body' : 'body';
  return pv(t[k], ph);
};
const tex = (x, y, z, s = 0.35) => NZ2(x * s, y * s, z * s);

/* ---------------- focal lesions ---------------- */
export function quiste(A, c, r) {
  return [sphere(A, c, r, () => ({ hu: 5, mr: MR.fluid }), { within: [LIV] })];
}
export function hidatidico(A, c, r, ph, { calc = true } = {}) {
  const rv = r / A.sp[0], kids = [];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, e = (i % 2 ? 0.25 : -0.2); kids.push([c[0] + Math.round(rv * 0.5 * e), c[1] + rv * 0.52 * Math.sin(a), c[2] + rv * 0.52 * Math.cos(a), rv * 0.36]); }
  kids.push([c[0], c[1], c[2], rv * 0.3]);
  const H = HUT.hidatidico, wall = pv(H.wall, ph), wallW = 2.2 / A.sp[0];
  return [sphere(A, c, r, (d, z, y, x) => {
    if ((1 - d) * rv < wallW) {
      if (calc && d > 0.9 && NZ(x * 0.4, y * 0.4, z * 0.4) > -0.05) return { hu: 520, mr: MR.calc };
      return { hu: wall, mr: MR.wall };
    }
    for (const k of kids) {
      const dk = Math.hypot(z - k[0], y - k[1], x - k[2]) / k[3];
      if (dk < 1) return Math.abs(1 - dk) * k[3] < 1.1 ? { hu: wall, mr: MR.wall } : { hu: pv(H.fluid, ph), mr: MR.fluid };
    }
    return { hu: pv(H.matrix, ph), mr: { t1: 0.2, t2: 0.8, stir: 0.75 } };
  }, { within: [LIV] })];
}
export function absceso(A, c, r, ph, { gas = false, resp = 1 } = {}) {
  r *= resp; const rv = r / A.sp[0], H = HUT.absceso, rimW = 3.5 / A.sp[0];
  return [sphere(A, c, r, (d, z, y, x) => {
    if (gas && d < 0.8 && (y < c[1] - rv * 0.35 || NZ2(x * 0.7, y * 0.7, z * 0.7) > 0.62)) return { hu: -850, mr: MR.gas };
    if ((1 - d) * rv < rimW) return { hu: pv(H.rim, ph), mr: MR.wall };
    return { hu: pv(H.pus, ph) + 6 * tex(x, y, z, 0.6), mr: MR.pus };
  }, { within: [LIV], irregular: 0.5 })];
}
/** Centripetal nodular fill-in: arterial → peripheral nodules; portal → coalescing; delayed → almost filled. */
export const HEMA_FILL = { sin: 0, arterial: 0.16, portal: 0.5, tardia: 0.9 };
export function hemangioma(A, c, r, ph) {
  const f = HEMA_FILL[ph], H = HUT.hemangioma;
  return [sphere(A, c, r, (d, z, y, x) => {
    const edge = 1 - d, n = NZ(x * 0.32, y * 0.32, z * 0.32);
    let on = false;
    if (ph === 'arterial') on = edge < 0.24 && n > 0.12;
    else if (f > 0) on = edge < f * (1 + 0.45 * n);
    return { hu: on ? pv(H.pool, ph) : pv(H.base, ph), mr: MR.hemangioma };
  }, { within: [LIV], irregular: 0.15 })];
}
export function hnf(A, c, r, ph) {
  const H = HUT.hnf;
  return [sphere(A, c, r, (d, z, y, x) => {
    const th = Math.atan2(y - c[1], x - c[2]), star = d < 0.22 || (d < 0.72 && Math.abs(Math.sin(2.5 * th + (z - c[0]) * 0.08)) < 0.16);
    return star ? { hu: pv(H.scar, ph), mr: { t1: 0.3, t2: 0.75, stir: 0.7 } } : { hu: pv(H.body, ph) + 3 * tex(x, y, z), mr: MR.iso };
  }, { within: [LIV], irregular: 0.12 })];
}
export function adenoma(A, c, r, ph, { hemo = true } = {}) {
  const rv = r / A.sp[0], H = HUT.adenoma, capW = 1.8 / A.sp[0];
  return [sphere(A, c, r, (d, z, y, x) => {
    if ((1 - d) * rv < capW) return { hu: pv(H.cap, ph), mr: { t1: 0.35, t2: 0.4, stir: 0.35 } };
    if (hemo && d < 0.8 && NZ(x * 0.3 + 4, y * 0.3, z * 0.3) > 0.32) return { hu: pv(H.blood, ph), mr: MR.blood };
    return { hu: pv(H.body, ph) + 10 * tex(x, y, z), mr: { t1: 0.52, t2: 0.52, stir: 0.45 } };
  }, { within: [LIV] })];
}
export function hcc(A, c, r, ph, { capsule = true } = {}) {
  const rv = r / A.sp[0], H = HUT.hcc, capW = 1.8 / A.sp[0], big = r > 18;
  return [sphere(A, c, r, (d, z, y, x) => {
    if (capsule && (1 - d) * rv < capW) return { hu: pv(H.cap, ph), mr: { t1: 0.25, t2: 0.4, stir: 0.35 } };
    if (big && d < 0.6 && NZ(x * 0.22 + 9, y * 0.22, z * 0.22) > 0.35) return { hu: pv(H.nec, ph), mr: { t1: 0.2, t2: 0.85, stir: 0.8 } };
    return { hu: pv(H.body, ph) + (big ? 12 : 5) * tex(x, y, z, 0.3), mr: MR.solidHypoT1 };
  }, { within: [LIV], irregular: big ? 0.2 : 0.08 })];
}
export function colangio(A, c, r, ph) {
  const rv = r / A.sp[0], H = HUT.colangio;
  return [sphere(A, c, r, (d, z, y, x) => {
    if (ph === 'arterial' && (1 - d) * rv < 3 / A.sp[0]) return { hu: pv(H.rim, ph), mr: { t1: 0.3, t2: 0.7, stir: 0.65 } };
    const core = ph === 'tardia' ? pv(H.body, ph) - 18 * (d > 0.8 ? 1 : 0) : pv(H.body, ph);
    return { hu: core + 6 * tex(x, y, z), mr: { t1: 0.3, t2: 0.72, stir: 0.68 } };
  }, { within: [LIV, 'lesion'], irregular: 0.45, spic: 0.35 })];
}
/** Capsular retraction: pull in the liver surface nearest to point c (liver voxels within `deep` mm of the surface, inside radius R mm). */
export function retraction(A, c, R = 22, deep = 5) {
  const g = grid(A, LIV), rv = R / A.sp[0], li = A.id(LIV);
  // nearest surface point to c
  let best = null, bd = Infinity;
  for (let z = c[0] - rv; z <= c[0] + rv; z += 2) for (let y = c[1] - rv * 2; y <= c[1] + rv * 2; y += 2) for (let x = c[2] - rv; x <= c[2] + rv; x += 2) {
    const zz = Math.round(z), yy = Math.round(y), xx = Math.round(x), dd = depth(A, LIV, zz, yy, xx);
    if (dd > 0 && dd <= 2) { const t = Math.hypot(zz - c[0], yy - c[1], xx - c[2]); if (t < bd) { bd = t; best = [zz, yy, xx]; } }
  }
  if (!best) return { prims: [], at: c };
  const box = rbox([best[0] - rv, best[0] + rv, best[1] - rv, best[1] + rv, best[2] - rv, best[2] + rv]);
  return { at: best, prims: [{ t: 'cols', box, label: 0, fn: (z, y, x, cur) => {
    if (cur.orig !== li) return null;
    const t = Math.hypot(z - best[0], y - best[1], x - best[2]) * A.sp[0]; if (t > R) return null;
    const need = deep * (1 - t / R) ** 1.5; return depth(A, LIV, z, y, x) <= need ? { hu: -90, label: 0, mr: { t1: 0.9, t2: 0.75, stir: 0.05 } } : null;
  } }] };
}
export function meta(A, c, r, ph, { aspect = 'tipica' } = {}) {
  const rv = r / A.sp[0], H = HUT.meta, rimW = Math.max(2.4, r * 0.3) / A.sp[0];
  return [sphere(A, c, r, (d, z, y, x) => {
    if (aspect === 'calcificada' && d < 0.7 && NZ(x * 0.8, y * 0.8, z * 0.8) > 0.3) return { hu: 420, mr: MR.calc };
    if ((1 - d) * rv < rimW) return { hu: pv(H.rim, ph) + 4 * tex(x, y, z), mr: { t1: 0.32, t2: 0.62, stir: 0.6 } };
    if (aspect === 'quistica' && d < 0.65) return { hu: 14, mr: MR.fluid };
    return { hu: pv(H.core, ph) + 5 * tex(x, y, z), mr: { t1: 0.28, t2: 0.68, stir: 0.65 } };
  }, { within: [LIV], irregular: 0.18 })];
}
/** Percutaneous drainage catheter from the right flank into a liver collection (pigtail tip). */
export function drain(A, c) {
  const ext = A.extreme(LIV, 'right', c[0]) || [c[0], c[1], c[2] - 30];
  const start = [c[0], ext[1], Math.max(2, ext[2] - 22)], mid = [c[0], (ext[1] + c[1]) / 2, ext[2] + 2];
  const tip = [], R = 4;
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 1.7; tip.push([c[0] + Math.round(R * 0.3 * Math.sin(a)), c[1] + R * Math.sin(a), c[2] - R + R * Math.cos(a)]); }
  return [{ t: 'tube', pts: [start, mid, [c[0], c[1], c[2] - R], ...tip], r: 1.1, hu: 380, label: 'keep', mr: MR.gas }, mark(start, 'Catéter de drenaje percutáneo', 'Percutaneous drainage catheter', { dx: -150, dy: 40, planes: ['axial'] })];
}

/* ---------------- cirrhotic liver and portal hypertension ---------------- */
/**
 * Cirrhotic liver: nodular surface, coarse heterogeneous parenchyma, hypertrophy of the left lobe and caudate with
 * atrophy of the right lobe (x-warp about the middle-hepatic-vein line). s = 0..1 severity.
 */
export function cirrhosis(A, s = 1, { morph = true, nodular = true, hetero = true } = {}) {
  if (s <= 0) return [];
  const out = [], li = A.id(LIV), g = grid(A, LIV), bb = A.s(LIV).bbox, [Z, , X] = A.dims, Pl = segPlanes(A);
  if (nodular) out.push({ t: 'cols', box: rbox([bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]]), label: 0, fn: (z, y, x, cur) => {
    if (cur.orig !== li) return null;
    const d = depth(A, LIV, z, y, x); if (d > 2.6 + 2 * s) return null;
    return NZ(x * 0.33, y * 0.33, z * 0.33) > 0.32 - 0.25 * s ? { hu: -95, label: 0, mr: { t1: 0.9, t2: 0.75, stir: 0.05 } } : null;
  } });
  if (hetero) out.push({ t: 'fill', s: LIV, delta: -4, texture: 14 * s, label: 'keep' });
  if (morph) {
    // Cantlie-like line: from the IVC to the gallbladder fossa (x as a function of y)
    const a = Pl.ivc, b = Pl.mid, xc = y => a.x + (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1);
    const sr = 1 - 0.24 * s, sl = 1 + 0.2 * s;
    out.push({ t: 'warp', s: LIV, box: rbox([bb[0], bb[1], bb[2], bb[3], Math.max(0, bb[4] - 2), Math.min(X - 1, bb[5] + 16)]), fill: { hu: -95, label: 0 }, map: (z, y, x) => {
      const c = xc(y);
      return x < c ? [z, y, c - (c - x) / sr] : [z, y, c + (x - c) / sl];
    } });
  }
  return out;
}
/** Portal hypertension: dilated portal / splenic vein (rings of 1.5 mm), splenomegaly, collaterals, caput medusae. */
export function htp(A, ph, { rings = 2, spleen = 1.3, collat = true, medusa = false } = {}) {
  const out = [], veinHU = { sin: 40, arterial: 95, portal: 150, tardia: 120 }, vmr = { t1: 0.1, t2: 0.1, stir: 0.1 };
  const NOT = ['liver', 'pancreas', 'duodenum', 'stomach', 'inferior_vena_cava', 'aorta', 'spleen', 'kidney_left', 'kidney_right', 'gallbladder', 'adrenal_gland_left', 'adrenal_gland_right', 'small_bowel', 'colon', 'esophagus'];
  if (spleen > 1) out.push({ t: 'dilate', s: SPL, scale: spleen, fill: { hu: 40, label: 0 } });
  if (rings > 0) {
    const od = outDist(A, PV, 6), d1 = rings * 1.5 + 0.2, bad = new Set(NOT.map(k => A.id(k))), bb = A.s(PV).bbox, h = P(40, 130, 159, 120);
    out.push({ t: 'cols', box: rbox([bb[0] - 4, bb[1] + 4, bb[2] - 4, bb[3] + 4, bb[4] - 4, bb[5] + 4]), label: 'lesion', fn: (z, y, x, cur) => {
      if (bad.has(cur.orig) || bad.has(cur.lab)) return null;
      const d = od(z, y, x); return d > 0 && d <= d1 ? { hu: pv(h, ph), mr: vmr } : null;
    } });
  }
  if (collat) {
    const c = confluence(A), gej = A.extreme('esophagus', 'inferior') || [c[0] - 35, c[1] + 10, c[2] + 10];
    for (const off of [-4, 0, 4]) {
      const pts = tortuous([c, [c[0] - 9, c[1] + 4 + off, c[2] + 7], [c[0] - 22, c[1] + 8, c[2] + 10 + off], [gej[0] + 2, gej[1] + off * 0.5, gej[2] + 2]], 2.2, 4);
      out.push({ t: 'tube', pts, r: 2.2, hu: veinHU, label: 'lesion', outside: NOT, mr: vmr });
    }
    const sp = A.s(SPL).bbox, sc = [Math.round((sp[0] + sp[1]) / 2) + 6, Math.round((sp[2] + sp[3]) / 2) - 10, sp[4] - 4];
    out.push({ t: 'tube', pts: tortuous([sc, [sc[0] + 8, sc[1] + 4, sc[2] - 8], [sc[0] + 16, sc[1] + 2, sc[2] - 16]], 2.5, 3), r: 2.4, hu: veinHU, label: 'lesion', outside: NOT, mr: vmr });
    out.push(mark([c[0] - 14, c[1] + 6, c[2] + 9], 'Colaterales (varices gastroesofágicas)', 'Collaterals (gastro-oesophageal varices)', { dx: 60, dy: -50 }));
  }
  if (medusa) {
    const u = umbilicus(A), umb = segPlanes(A).umb, h = hilum(A);
    const start = [h[0], Math.round(umb.y), Math.round(umb.x)];
    out.push({ t: 'tube', pts: tortuous([start, [start[0] + 18, 34, start[2] + 8], [u[0] - 30, 24, u[2] - 4], u], 1.2, 3), r: 2, hu: veinHU, label: 'lesion', outside: ['stomach', 'colon', 'small_bowel', 'gallbladder'], mr: vmr });
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3, end = [u[0] + Math.round(30 * Math.sin(a)), u[1] + (i % 2), u[2] + Math.round(42 * Math.cos(a))];
      out.push({ t: 'tube', pts: tortuous([u, [(u[0] + end[0]) / 2, u[1] + 1, (u[2] + end[2]) / 2], end], 2.4, 2.5), r: 2.2, hu: veinHU, label: 'lesion', outside: ['colon', 'small_bowel'], mr: vmr });
    }
    out.push(mark(u, 'Cabeza de medusa', 'Caput medusae', { dx: 60, dy: -40 }));
  }
  return out;
}
export { clamp, pancParts };
