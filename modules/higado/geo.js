// Geometry helpers of the «Hígado, vía biliar y páncreas» module (no DOM), found from the s0591 masks:
// depth maps of liver / gallbladder / pancreas, lesion sites, the estimated biliary tree (not segmented:
// hilum → hepatic ducts → common hepatic duct → cystic duct → common bile duct → papilla in D2), the
// pancreatic duct along the gland, liver "segments" from approximate planes, and a few lesion builders.
// Everything heavy is cached in A.cache (keys start with 'hig:') so a patch rebuild stays fast.
import { distanceInside, makeNoise, LESION_ID } from '../../src/pathology.js';

export const LIV = 'liver', GB = 'gallbladder', PAN = 'pancreas', PV = 'portal_vein_and_splenic_vein', SPL = 'spleen', DUO = 'duodenum', IVC = 'inferior_vena_cava';
export const NZ = makeNoise(13), NZ2 = makeNoise(29);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rbox = b => b.map(Math.round);
const cache = (A, k, f) => { const ck = 'hig:' + k; if (!A.cache.has(ck)) A.cache.set(ck, f()); return A.cache.get(ck); };

/* ---------------- local grids with depth (distance inside, voxels) ---------------- */
export function grid(A, key, pad = 2) {
  return cache(A, 'g:' + key, () => {
    const bb = A.s(key).bbox, [Z, Y, X] = A.dims;
    const b = [Math.max(0, bb[0] - pad), Math.min(Z - 1, bb[1] + pad), Math.max(0, bb[2] - pad), Math.min(Y - 1, bb[3] + pad), Math.max(0, bb[4] - pad), Math.min(X - 1, bb[5] + pad)];
    const n = [b[1] - b[0] + 1, b[3] - b[2] + 1, b[5] - b[4] + 1], lab = new Uint8Array(n[0] * n[1] * n[2]);
    for (let k = 0; k < n[0]; k++) for (let j = 0; j < n[1]; j++) { const g = ((b[0] + k) * Y + b[2] + j) * X + b[4], p = (k * n[1] + j) * n[2]; for (let i = 0; i < n[2]; i++) lab[p + i] = A.lab[g + i]; }
    const id = A.id(key), d = distanceInside({ n, lab }, id);
    return { b, n, d, id };
  });
}
/** Distance (mm) OUTSIDE structure key, on a padded local grid (Infinity beyond the pad, 0 inside). Cached. */
export function outDist(A, key, pad = 8) {
  const g = cache(A, 'o:' + key + ':' + pad, () => {
    const bb = A.s(key).bbox, [Z, Y, X] = A.dims, id = A.id(key);
    const b = [Math.max(0, bb[0] - pad), Math.min(Z - 1, bb[1] + pad), Math.max(0, bb[2] - pad), Math.min(Y - 1, bb[3] + pad), Math.max(0, bb[4] - pad), Math.min(X - 1, bb[5] + pad)];
    const n = [b[1] - b[0] + 1, b[3] - b[2] + 1, b[5] - b[4] + 1], lab = new Uint8Array(n[0] * n[1] * n[2]);
    for (let k = 0; k < n[0]; k++) for (let j = 0; j < n[1]; j++) { const gi = ((b[0] + k) * Y + b[2] + j) * X + b[4], p = (k * n[1] + j) * n[2]; for (let i = 0; i < n[2]; i++) lab[p + i] = A.lab[gi + i] === id ? 0 : 1; }
    return { b, n, d: distanceInside({ n, lab }, 1) };
  });
  return (z, y, x) => {
    const k = z - g.b[0], j = y - g.b[2], i = x - g.b[4];
    if (k < 0 || j < 0 || i < 0 || k >= g.n[0] || j >= g.n[1] || i >= g.n[2]) return Infinity;
    return g.d[(k * g.n[1] + j) * g.n[2] + i] * A.sp[0];
  };
}
/** Depth (mm) of voxel z,y,x inside structure key (0 outside). */
export function depth(A, key, z, y, x) {
  const g = grid(A, key), k = z - g.b[0], j = y - g.b[2], i = x - g.b[4];
  if (k < 0 || j < 0 || i < 0 || k >= g.n[0] || j >= g.n[1] || i >= g.n[2]) return 0;
  return g.d[(k * g.n[1] + j) * g.n[2] + i] * A.sp[0];
}
/** Deepest voxel of a structure inside a region {z,y,x:[lo,hi]} (step 2), or the one closest to `target` mm depth. */
export function bestSite(A, key, reg, target) {
  const g = grid(A, key), bb = g.b; let best = null, bv = -Infinity;
  const r = { z: reg.z || [bb[0], bb[1]], y: reg.y || [bb[2], bb[3]], x: reg.x || [bb[4], bb[5]] };
  for (let z = Math.max(r.z[0], bb[0]); z <= Math.min(r.z[1], bb[1]); z += 2) for (let y = Math.max(r.y[0], bb[2]); y <= Math.min(r.y[1], bb[3]); y += 2)
    for (let x = Math.max(r.x[0], bb[4]); x <= Math.min(r.x[1], bb[5]); x += 2) {
      const d = g.d[((z - bb[0]) * g.n[1] + (y - bb[2])) * g.n[2] + (x - bb[4])] * A.sp[0]; if (!d) continue;
      const v = target === undefined ? d : -Math.abs(d - target) - (reg.preferAnterior ? y * 0.05 : 0);
      if (v > bv) { bv = v; best = [z, y, x]; }
    }
  return best;
}
/** Named liver sites (centres for lesions). */
export const SITES = [
  { v: 'der', es: 'Lóbulo derecho', en: 'Right lobe' },
  { v: 'izq', es: 'Lóbulo izquierdo', en: 'Left lobe' },
  { v: 'cupula', es: 'Cúpula (segmentos altos)', en: 'Dome (upper segments)' },
];
export function liverSite(A, name) {
  return cache(A, 'site:' + name, () => {
    const bb = A.s(LIV).bbox, zr = bb[1] - bb[0], xr = bb[5] - bb[4];
    const zf = f => Math.round(bb[0] + f * zr), xf = f => Math.round(bb[4] + f * xr);
    if (name === 'izq') return bestSite(A, LIV, { z: [zf(0.12), zf(0.4)], x: [xf(0.6), xf(0.9)] });
    if (name === 'cupula') return bestSite(A, LIV, { z: [zf(0.1), zf(0.25)], x: [xf(0.12), xf(0.5)] });
    if (name === 'hilio') { const h = hilum(A); return bestSite(A, LIV, { z: [h[0] - 12, h[0] + 2], y: [h[1] - 10, h[1] + 16], x: [h[2] - 24, h[2] - 8] }); }
    if (name === 'ant') return bestSite(A, LIV, { z: [zf(0.38), zf(0.55)], y: [bb[2], Math.round((bb[2] + bb[3]) / 2)], x: [xf(0.1), xf(0.38)], preferAnterior: true }, 12);
    return bestSite(A, LIV, { z: [zf(0.3), zf(0.55)], x: [xf(0.05), xf(0.35)] });     // 'der'
  });
}
/** Spread candidate points deep in the liver (for multiple lesions), deterministic. */
export function liverPoints(A, n, minDepth, seed = 3) {
  const all = cache(A, 'pts', () => {
    const g = grid(A, LIV), out = [];
    for (let k = 4; k < g.n[0]; k += 5) for (let j = 4; j < g.n[1]; j += 5) for (let i = 4; i < g.n[2]; i += 5) { const d = g.d[(k * g.n[1] + j) * g.n[2] + i] * A.sp[0]; if (d >= 9) out.push([g.b[0] + k, g.b[2] + j, g.b[4] + i, d]); }
    return out;
  });
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = [], cand = all.filter(p => p[3] >= minDepth);
  for (let t = 0; t < 400 && pick.length < n && cand.length; t++) {
    const p = cand[Math.floor(rnd() * cand.length)];
    if (pick.every(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * A.sp[0] > 32)) pick.push(p);
  }
  return pick.map(p => p.slice(0, 3));
}

/* ---------------- lesion builder (ellipsoid with a per-voxel pattern) ---------------- */
/**
 * Ellipsoid lesion as a `cols` primitive. fn(d, z, y, x, cur) → {hu, mr, label?} | null, d = normalised radius (1 = surface).
 * o: { within: [keys], irregular, spic, label }. Radius r in mm (number or [rz, ry, rx]).
 */
export function sphere(A, c, r, fn, o = {}) {
  const rv = (Array.isArray(r) ? r : [r, r, r]).map(v => Math.max(0.8, v / A.sp[0])), irr = o.irregular || 0, spic = o.spic || 0, ext = 1 + irr * 0.6 + spic * 0.9;
  const box = rbox([c[0] - rv[0] * ext - 2, c[0] + rv[0] * ext + 2, c[1] - rv[1] * ext - 2, c[1] + rv[1] * ext + 2, c[2] - rv[2] * ext - 2, c[2] + rv[2] * ext + 2]);
  const within = o.within ? new Set(o.within.map(k => (k === 'lesion' ? LESION_ID : k === 0 ? 0 : A.id(k)))) : null;
  const outside = o.outside ? new Set(o.outside.map(k => A.id(k))) : null;
  return { t: 'cols', box, label: o.label === undefined ? 'lesion' : o.label, fn: (z, y, x, cur) => {
    if (within && !within.has(cur.orig) && !within.has(cur.lab)) return null;
    if (outside && outside.has(cur.orig)) return null;
    const dz = (z - c[0]) / rv[0], dy = (y - c[1]) / rv[1], dx = (x - c[2]) / rv[2];
    let d = Math.sqrt(dz * dz + dy * dy + dx * dx);
    if (irr) d /= 1 + irr * 0.45 * NZ(x * 0.18, y * 0.18, z * 0.18);
    if (spic) d /= 1 + spic * Math.max(0, NZ2(x * 0.55, y * 0.55, z * 0.55)) ** 2 * 1.6;
    if (d > 1) return null;
    return fn(d, z, y, x, cur);
  } };
}

/* ---------------- hilum and biliary tree (estimated: no mask) ---------------- */
/** Portal vein where it enters the liver: centroid of portal voxels touching the liver. */
export function hilum(A) {
  return cache(A, 'hilum', () => {
    const pv = A.id(PV), li = A.id(LIV), b = A.s(PV).bbox; let s = [0, 0, 0], n = 0;
    for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) {
      if (A.at(z, y, x) !== pv) continue;
      if (A.at(z + 1, y, x) === li || A.at(z - 1, y, x) === li || A.at(z, y + 1, x) === li || A.at(z, y - 1, x) === li || A.at(z, y, x + 1) === li || A.at(z, y, x - 1) === li) { s[0] += z; s[1] += y; s[2] += x; n++; }
    }
    return s.map(v => Math.round(v / n));
  });
}
/** Nearest voxel (within r) whose label is in `ok` (Set of ids), else the point itself. */
function nudge(A, p, ok, r = 4) {
  if (ok.has(A.at(...p))) return p;
  let best = p, bd = Infinity;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const q = [p[0] + dz, p[1] + dy, p[2] + dx]; if (!ok.has(A.at(...q))) continue;
    const d = dy * dy + dx * dx + dz * dz * 4; if (d < bd) { bd = d; best = q; }
  }
  return best;
}
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
/** Pancreas centreline: centroids per 8-voxel x-bin, from the head (patient right) to the tail. */
export function pancLine(A) {
  return cache(A, 'pline', () => {
    const id = A.id(PAN), b = A.s(PAN).bbox, bins = new Map();
    for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (A.at(z, y, x) === id) {
      const k = Math.floor(x / 8), v = bins.get(k) || [0, 0, 0, 0]; v[0] += z; v[1] += y; v[2] += x; v[3]++; bins.set(k, v);
    }
    return [...bins.entries()].filter(([, v]) => v[3] > 200).sort((a, b) => a[0] - b[0]).map(([, v]) => [v[0] / v[3], v[1] / v[3], v[2] / v[3]].map(Math.round));
  });
}
/** Pancreas parts by x: head < neck (≈ 27 % of the width) < body < tail (> 66 %). Returns {head, body, tail} centres and the split x. */
export function pancParts(A) {
  return cache(A, 'pparts', () => {
    const id = A.id(PAN), b = A.s(PAN).bbox, xh = Math.round(b[4] + 0.27 * (b[5] - b[4])), xt = Math.round(b[4] + 0.66 * (b[5] - b[4]));
    const acc = { head: [0, 0, 0, 0], body: [0, 0, 0, 0], tail: [0, 0, 0, 0] };
    for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (A.at(z, y, x) === id) {
      const a = acc[x < xh ? 'head' : x > xt ? 'tail' : 'body']; a[0] += z; a[1] += y; a[2] += x; a[3]++;
    }
    const c = a => [a[0] / a[3], a[1] / a[3], a[2] / a[3]].map(Math.round);
    return { head: c(acc.head), body: c(acc.body), tail: c(acc.tail), xh, xt };
  });
}
/** Papilla (ampulla of Vater): centre of the duodenal voxels touching the pancreatic head. */
export function papilla(A) {
  return cache(A, 'papilla', () => {
    const du = A.id(DUO), pa = A.id(PAN), b = A.s(DUO).bbox, { xh } = pancParts(A), hz = pancParts(A).head[0]; let s = [0, 0, 0], n = 0;
    for (let z = Math.max(b[0], hz - 10); z <= Math.min(b[1], hz + 10); z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= Math.min(b[5], xh); x++) {
      if (A.at(z, y, x) !== du) continue;
      if (A.at(z, y, x + 1) === pa || A.at(z, y, x + 2) === pa || A.at(z, y - 1, x) === pa) { s[0] += z; s[1] += y; s[2] += x; n++; }
    }
    return s.map(v => Math.round(v / n));
  });
}
/** Gallbladder neck (voxel nearest the hilum) and fundus (farthest from the neck). */
export function gbParts(A) {
  return cache(A, 'gbp', () => {
    const id = A.id(GB), b = A.s(GB).bbox, h = hilum(A); let neck = null, nd = Infinity;
    const vox = [];
    for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (A.at(z, y, x) === id) {
      vox.push([z, y, x]); const d = Math.hypot(z - h[0], y - h[1], x - h[2]); if (d < nd) { nd = d; neck = [z, y, x]; }
    }
    let fundus = neck, fd = 0; for (const v of vox) { const d = Math.hypot(v[0] - neck[0], v[1] - neck[1], v[2] - neck[2]); if (d > fd) { fd = d; fundus = v; } }
    let s = [0, 0, 0]; for (const v of vox) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
    const c = s.map(v => Math.round(v / vox.length));
    return { neck, fundus, c, n: vox.length, len: fd * A.sp[0] };
  });
}
/**
 * Estimated biliary tree (voxel polylines). conf = hepatic duct confluence (just anterior to the portal vein at the hilum);
 * chd = common hepatic duct down to the cystic junction; cbd = common bile duct to the papilla; cystic = from the gallbladder neck;
 * ihR / ihL = right / left intrahepatic branches (ending in the liver); wirsung = pancreatic duct, papilla → tail.
 */
export function tree(A) {
  return cache(A, 'tree', () => {
    const h = hilum(A), pap = papilla(A), gbn = gbParts(A).neck, free = new Set([0, A.id(PAN)]), li = new Set([A.id(LIV)]);
    const conf = nudge(A, [h[0] - 1, h[1] - 6, h[2] + 2], new Set([0]));
    const cj = nudge(A, [Math.round((gbn[0] + pap[0] * 0.25) / 1.25), Math.round((gbn[1] + pap[1]) / 2) - 2, gbn[2] + 8], free);   // cystic junction
    const chd = [conf, nudge(A, lerp(conf, cj, 0.5).map(Math.round), free), cj];
    const cbd = [cj];
    for (const t of [0.25, 0.5, 0.75]) cbd.push(nudge(A, [Math.round(cj[0] + (pap[0] - cj[0]) * t), Math.round(cj[1] + (pap[1] - cj[1]) * t), Math.round(cj[2] + (pap[2] + 6 - cj[2]) * t)], free));
    cbd.push([pap[0], pap[1], pap[2] + 2]);
    const cystic = [gbn, lerp(gbn, cj, 0.5).map(Math.round), cj];
    const L = v => nudge(A, v.map(Math.round), li, 3);
    const c = conf;
    const ihR = [[c, L([c[0] - 1, c[1] + 2, c[2] - 12]), L([c[0] - 5, c[1] - 6, c[2] - 26]), L([c[0] - 9, c[1] - 14, c[2] - 40])],     // right anterior
      [L([c[0] - 1, c[1] + 2, c[2] - 12]), L([c[0] + 1, c[1] + 10, c[2] - 26]), L([c[0] + 3, c[1] + 18, c[2] - 40])],                     // right posterior
      [L([c[0] - 5, c[1] - 6, c[2] - 26]), L([c[0] - 14, c[1] - 6, c[2] - 34])]];                                                           // segment 8 branch
    const ihL = [[c, L([c[0] - 3, c[1] - 6, c[2] + 6]), L([c[0] - 8, c[1] - 16, c[2] + 10]), L([c[0] - 14, c[1] - 24, c[2] + 24]), L([c[0] - 18, c[1] - 26, c[2] + 40])],
      [L([c[0] - 8, c[1] - 16, c[2] + 10]), L([c[0] - 2, c[1] - 26, c[2] + 14])]];
    const pl = pancLine(A), wirsung = [[pap[0], pap[1], pap[2] + 2], ...pl.filter(p => p[2] > pap[2] + 4)];
    return { conf, cj, chd, cbd, cystic, ihR, ihL, wirsung, pap, hil: h };
  });
}
export const BILE = { hu: 8, mr: { t1: 0.1, t2: 0.98, stir: 0.95 } };
/** Tube primitives of the biliary tree. o: { ih, chd, cbd, cystic, wirsung } radii (mm, 0 = not drawn); cbdTo: fraction of the CBD drawn (stone / stricture level). */
export function ductTubes(A, o, extra = {}) {
  const T = tree(A), out = [], hu = extra.hu !== undefined ? extra.hu : BILE.hu, mr = extra.mr || BILE.mr, label = extra.label || 'lesion';
  const vessels = ['portal_vein_and_splenic_vein', 'inferior_vena_cava', 'aorta', 'duodenum'];
  const tube = (pts, r, within, outside) => out.push({ t: 'tube', pts, r, hu, label, mr, ...(within ? { within } : {}), ...(outside ? { outside } : {}) });
  if (o.ih) for (const br of [...T.ihR, ...T.ihL]) tube(br, o.ih * (br[0] === T.conf ? 1 : 0.8), ['liver', 'lesion']);
  if (o.ih) tube([T.conf, T.chd[1]], Math.max(o.ih, o.chd || 0), null, vessels);
  if (o.chd) tube(T.chd, o.chd, null, vessels);
  if (o.cystic) tube(T.cystic, o.cystic, null, vessels);
  if (o.cbd) {
    const f = o.cbdTo === undefined ? 1 : o.cbdTo, pts = T.cbd, L = pts.length - 1, cut = f * L, k = Math.floor(cut), seg = pts.slice(0, k + 1);
    if (k < L && cut > k) seg.push(lerp(pts[k], pts[k + 1], cut - k));
    if (seg.length > 1) tube(seg, o.cbd, null, ['portal_vein_and_splenic_vein', 'inferior_vena_cava', 'aorta', ...(f < 1 ? [] : [])]);
  }
  if (o.wirsung) tube(T.wirsung, o.wirsung, ['pancreas', 'lesion']);
  return out;
}
/** Point at fraction t (0 = cystic junction, 1 = papilla) along the common bile duct. */
export function cbdAt(A, t) {
  const pts = tree(A).cbd, L = pts.length - 1, u = clamp(t, 0, 1) * L, k = Math.min(L - 1, Math.floor(u));
  return lerp(pts[k], pts[k + 1], u - k).map(Math.round);
}

/* ---------------- liver segments (approximate planes: no hepatic-vein mask) ---------------- */
/** Planes: middle hepatic vein (IVC → gallbladder fossa), right hepatic vein (IVC → right lateral edge), umbilical fissure (IVC → left portal umbilical part), portal plane (hilum z). */
export function segPlanes(A) {
  return cache(A, 'segp', () => {
    const h = hilum(A), bb = A.s(LIV).bbox, zI = Math.round(bb[0] + 0.25 * (bb[1] - bb[0]));
    const ivc = A.centroidAt(IVC, zI) || { y: h[1] + 14, x: h[2] + 16 }, gb = gbParts(A).c;
    // umbilical portion of the left portal vein: portal voxels in the liver, anterior to the hilum, left of it
    const pv = A.id(PV), b = A.s(PV).bbox; let s = [0, 0], n = 0;
    for (let z = h[0] - 8; z <= h[0] + 4; z++) for (let y = b[2]; y < h[1] - 10; y++) for (let x = h[2]; x <= h[2] + 20; x++) if (A.at(z, y, x) === pv) { s[0] += y; s[1] += x; n++; }
    const umb = n ? { y: s[0] / n, x: s[1] / n } : { y: h[1] - 22, x: h[2] + 8 };
    const xMin = A.s(LIV).bbox[4];
    return { zp: h[0], ivc: { y: ivc.y, x: ivc.x }, mid: { y: gb[1], x: gb[2] + 6 }, rhv: { y: ivc.y - 18, x: xMin }, umb, zI };
  });
}
const side2 = (a, b, y, x) => (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
/** Couinaud segment (1–8) of a liver voxel, from the approximate planes. */
export function segmentOf(A, z, y, x) {
  const P = segPlanes(A), up = z < P.zp;
  const dCaud = Math.hypot((y - (P.ivc.y - 8)) * 1, (x - (P.ivc.x - 6)) * 1.1);
  if (dCaud < 12 && z > P.zp - 14 && z < P.zp + 8 && y > P.umb.y + 18) return 1;
  const sMid = side2(P.ivc, P.mid, y, x), right = sMid * side2(P.ivc, P.mid, P.ivc.y, P.ivc.x - 40) > 0;
  if (right) {
    const sR = side2(P.ivc, P.rhv, y, x), post = sR * side2(P.ivc, P.rhv, P.ivc.y + 30, P.ivc.x - 20) > 0;
    return post ? (up ? 7 : 6) : (up ? 8 : 5);
  }
  const sU = side2(P.ivc, P.umb, y, x), lat = sU * side2(P.ivc, P.umb, P.umb.y, P.umb.x + 40) > 0;
  return lat ? (up ? 2 : 3) : 4;
}
/** Centroid of each segment on slice z (for numbered marks). */
export function segCentres(A, z) {
  return cache(A, 'segc:' + z, () => {
    const acc = {}; for (const [y, x] of A.sliceVoxels(LIV, z)) { const s = segmentOf(A, z, y, x), a = acc[s] || (acc[s] = [0, 0, 0]); a[0] += y; a[1] += x; a[2]++; }
    const out = {}; for (const [s, a] of Object.entries(acc)) if (a[2] > 60) out[s] = [z, Math.round(a[0] / a[2]), Math.round(a[1] / a[2])];
    return out;
  });
}

/* ---------------- tortuous vessels (collaterals) ---------------- */
/** Subdivide a polyline and add a sinusoidal wiggle perpendicular to it (voxels). */
export function tortuous(pts, amp = 2, waves = 3, seg = 6) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...v) || 1;
    let p1 = Math.abs(v[0]) / L > 0.7 ? [0, 1, 0] : [1, 0, 0];
    const cr = [v[1] * p1[2] - v[2] * p1[1], v[2] * p1[0] - v[0] * p1[2], v[0] * p1[1] - v[1] * p1[0]], cl = Math.hypot(...cr) || 1; p1 = cr.map(t => t / cl);
    for (let i = 0; i < seg; i++) {
      const t = i / seg, w = Math.sin((s + t) * Math.PI * waves) * amp;
      out.push([a[0] + v[0] * t + p1[0] * w, a[1] + v[1] * t + p1[1] * w, a[2] + v[2] * t + p1[2] * w]);
    }
  }
  out.push(pts[pts.length - 1]); return out;
}
/** Umbilicus, for the caput medusae: midline, anterior skin of s0591 at the L3 level (y ≈ 16 measured on the CT; no skin mask). */
export function umbilicus(A) {
  return cache(A, 'umb', () => {
    const v = A.vertebra('vertebrae_L3'), zz = v.body.c[0];
    return [zz, 20, v.body.c[2]];
  });
}
/** Splenoportal confluence: portal-system voxels behind the pancreatic neck. */
export function confluence(A) {
  return cache(A, 'conf', () => {
    const { xh } = pancParts(A), pv = A.id(PV), b = A.s(PV).bbox; let s = [0, 0, 0], n = 0;
    for (let z = Math.round((b[0] + b[1]) / 2); z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = xh - 4; x <= xh + 10; x++) if (A.at(z, y, x) === pv) { s[0] += z; s[1] += y; s[2] += x; n++; }
    return n ? s.map(v => Math.round(v / n)) : hilum(A);
  });
}

/* ---------------- noise quantile over a structure (fractions: necrosis %, …) ---------------- */
export function noiseField(z, y, x) { return NZ2(x * 0.11 + 3, y * 0.11, z * 0.11) + 0.5 * NZ(x * 0.23, y * 0.23 + 7, z * 0.23); }
export function quantile(A, key, f) {
  const vals = cache(A, 'nq:' + key, () => {
    const id = A.id(key), b = A.s(key).bbox, v = [];
    for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (A.at(z, y, x) === id) v.push(noiseField(z, y, x));
    return Float32Array.from(v).sort();
  });
  if (f <= 0) return -Infinity; if (f >= 1) return Infinity;
  return vals[Math.floor(f * (vals.length - 1))];
}
/** Max in-plane width (mm) of a structure on its median slice. */
export function width(A, key) {
  return cache(A, 'w:' + key, () => {
    const b = A.s(key).bbox; let w = 0;
    for (let z = b[0]; z <= b[1]; z += 2) { const v = A.sliceVoxels(key, z); if (!v.length) continue; const xs = v.map(p => p[1]), ys = v.map(p => p[0]); w = Math.max(w, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))); }
    return w * A.sp[0];
  });
}
/** Diameter (mm) of the extrahepatic portal trunk: volume / length of the portal voxels between the confluence and the hilum. */
export function portalDiameter(A) {
  return cache(A, 'pvd', () => {
    const h = hilum(A), c = confluence(A), pv = A.id(PV), pts = [];
    const z0 = Math.min(h[0], c[0]), z1 = Math.max(h[0], c[0]), x0 = Math.min(h[2], c[2]), x1 = Math.max(h[2], c[2]);
    for (let z = z0; z <= z1; z++) for (let y = Math.min(h[1], c[1]) - 10; y <= Math.max(h[1], c[1]) + 14; y++) for (let x = x0; x <= x1; x++) if (A.at(z, y, x) === pv && depth(A, LIV, z, y, x) === 0) pts.push([z, y, x]);
    const len = Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]) || 1;
    return pts.length ? 2 * Math.sqrt(pts.length / (Math.PI * len)) * A.sp[0] : 12;
  });
}
