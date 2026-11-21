// Renal masses (Bosniak cysts on the real right-kidney cyst, angiomyolipoma, renal cell carcinoma), bladder tumour
// and acute pyelonephritis, drawn on the s0591 masks. Values from the syllabus; anything else is flagged.
import { makeNoise, phaseValue } from '../../src/pathology.js';
import { bi, mark, T, RENAL_PHASES, isOOP, fmt1, fmtEs } from './common.js';
import { kmodel, kidneyPaint, kSurface, kLesionCentre, excretory, perirenal, wedges, bladderWall, centroid, KHU, FLUID_MR, FAT_MR, SOFT_MR } from './anat.js';
import { bosniakDiagram } from './diagrams.js';

const NZ = makeNoise(23);
const CYST = 'kidney_cyst_right';
const bones = A => [...A.vertebraKeys(), 'sacrum', 'hip_left', 'hip_right'].filter(k => A.has(k));
const phaseOf = env => (env.phase === 'tardia' || env.phase === 'arterial' || env.phase === 'sin' ? env.phase : 'portal');

/* ---------------- Bosniak on the real cyst ---------------- */
function cystGeom(A) {
  const ck = 'uri:cyst'; if (A.cache.has(ck)) return A.cache.get(ck);
  const s = A.s(CYST), id = s.id, b = s.bbox, c = centroid(A, CYST); let n = 0;
  for (let z = b[0]; z <= b[1]; z++) { const q = A.centroidAt(CYST, z); if (q) n += q.n; }
  const diam = 2 * Math.cbrt(3 * n * A.sp[0] * A.sp[1] * A.sp[2] / (4 * Math.PI));
  // inner wall towards the kidney (medial = +x for the right kidney): where the IV nodule grows
  let w = c[2]; while (w < b[5] + 1 && A.at(c[0], c[1], w + 1) === id) w++;
  const r = { id, b, c, n, diam, wall: [c[0], c[1], w] }; A.cache.set(ck, r); return r;
}
export const BOSNIAK = {
  I: { mal: bi('Benigno', 'Benign'), act: bi('Benigno: no más exploraciones', 'Benign: no further tests'), con: bi('No capta', 'No enhancement') },
  II: { mal: bi('Benigno', 'Benign'), act: bi('Benigno: sin seguimiento', 'Benign: no follow-up'), con: bi('No capta', 'No enhancement') },
  IIF: { mal: bi('Probablemente benigno', 'Probably benign'), act: bi('Seguimiento radiológico (TC)', 'Imaging follow-up (CT)'), con: bi('No capta', 'No enhancement') },
  III: { mal: bi('50 % malignos', '50 % malignant'), act: bi('Texto: maligna → cirugía · tabla: «si dudas, exploración radiológica»', 'Text: malignant → surgery · table: "if in doubt, imaging"'), con: bi('No capta (según la tabla del temario)', 'No enhancement (per the syllabus table)') },
  IV: { mal: bi('100 % malignos', '100 % malignant'), act: bi('Tratamiento quirúrgico', 'Surgical treatment'), con: bi('Capta (tejido nodular)', 'Enhances (nodular tissue)') },
};
export function buildBosniak(cat, variant, diam, A, env) {
  const g = cystGeom(A), id = g.id, c = g.c, ph = env.phase === 'sin' ? 'sin' : 'portal', out = [], m = kmodel(A, 'R');
  const s = diam / (g.diam / 10), b = g.b;
  const pad = Math.ceil(Math.max(b[1] - b[0], b[3] - b[2], b[5] - b[4]) * Math.max(0, s - 1) / 2) + 3;
  const box = [b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad, b[4] - pad, b[5] + pad].map(Math.round);
  if (Math.abs(s - 1) > 0.03) {      // resize the real cyst around its centre (3D), giving back kidney or fat when it shrinks
    out.push({ t: 'warp', s: CYST, box, fill: { hu: -95, label: 0 }, map: (z, y, x) => [c[0] + (z - c[0]) / s, c[1] + (y - c[1]) / s, c[2] + (x - c[2]) / s] });
    if (s < 1) out.push({ t: 'cols', box, label: 'keep', fn: (z, y, x, cur) => {
      if (cur.orig !== id || cur.lab !== 0) return null; const p = m.idx(z, y, x);
      return p >= 0 && m.K[p] === 3 ? { hu: KHU[ph] + Math.round(8 * NZ(x * 0.6, y * 0.6, z * 0.6)), label: 'kidney_right', mr: SOFT_MR } : null;
    } });
  }
  const hyper = variant === 'hiper' && (cat === 'II' || cat === 'IIF');
  out.push({ t: 'fill', s: CYST, hu: hyper ? { sin: 74, portal: 76 } : { sin: 6, portal: 8 }, texture: 3, label: 'keep', mr: hyper ? { t1: 0.62, t2: 0.55, stir: 0.5 } : FLUID_MR });
  const soft = (con) => ({ sin: 40, portal: con });
  const WALL_MR = { t1: 0.36, t2: 0.4, stir: 0.36 };
  if (cat === 'III' || cat === 'IV') {
    const hw = soft(cat === 'IV' ? 92 : 47);
    out.push({ t: 'rind', s: CYST, d0: 0, d1: 1.5, hu: hw, mr: WALL_MR });
    out.push({ t: 'rind', s: CYST, d0: 1.4, d1: 3.2, hu: hw, mr: WALL_MR, side: (z, y, x) => NZ(x * 0.35, y * 0.35, z * 0.35) > 0.3 });
  } else if (cat === 'IIF') out.push({ t: 'rind', s: CYST, d0: 0, d1: 1.1, hu: soft(45), mr: WALL_MR });
  const sp = { II: [1.2, 0, 2], IIF: [1.8, 0.4, 3], III: [2.6, 1.4, 2], IV: [2.6, 1.4, 1] }[cat];
  if (sp && !hyper) {
    const ns = [[0.2, 1, 0.35], [0.5, -0.1, 1], [1, 0.35, -0.3]];
    for (let i = 0; i < sp[2]; i++) out.push({ t: 'plane', s: CYST, p: [c[0] + (i - 1) * 2, c[1] + (i === 1 ? 2 : -1), c[2]], n: ns[i], w: sp[0], jag: sp[1], hu: soft(cat === 'IV' ? 90 : 46 + sp[0]), mr: WALL_MR });
  }
  const calc = { II: [1.4, 0.64, 520], IIF: [1.6, 0.44, 650], III: [3, 0.24, 780] }[cat];
  if (calc) out.push({ t: 'rind', s: CYST, d0: 0, d1: calc[0], hu: calc[2], mr: { t1: 0.04, t2: 0.04, stir: 0.04 }, side: (z, y, x) => NZ(x * 0.4 + 5, y * 0.4, z * 0.4) > calc[1] });
  if (cat === 'IV') {
    const wv = [c[0] + (g.wall[0] - c[0]) * s, c[1] + (g.wall[1] - c[1]) * s, c[2] + (g.wall[2] - c[2]) * s], rv = 8 / A.sp[0];
    out.push({ t: 'blob', c: [wv[0] + 3, wv[1] + 2, wv[2] - rv * 0.7].map(Math.round), r: [9, 8, 8], hu: { sin: 38, arterial: 120, portal: 105, tardia: 92 }, irregular: 0.45, edge: 0.8, within: [CYST], label: 'lesion', mr: { t1: 0.4, t2: 0.45, stir: 0.42 } });
  }
  out.push({ t: 'cols', box, label: 'lesion', fn: (z, y, x, cur) => (cur.lab === id ? { hu: cur.hu, label: 'lesion' } : null) });
  const at = [c[0], c[1], Math.round(c[2] - (g.diam / 2 / A.sp[0]) * s * 0.7)];
  const txt = { I: ['Pared fina, densidad agua', 'Thin wall, water density'], II: ['Septos finos, calcio mínimo', 'Thin septa, minimal calcium'], IIF: ['Septos algo más gruesos, calcio moderado', 'Slightly thicker septa, moderate calcium'],
    III: ['Pared y septos gruesos e irregulares', 'Thick irregular wall and septa'], IV: ['Tejido nodular que capta', 'Enhancing nodular tissue'] }[cat];
  if (hyper) out.push(mark(at, 'Quiste hiperdenso (> 70 UH: complicado)', 'Hyperdense cyst (> 70 HU: complicated)', { dx: -170, dy: -40 }));
  else out.push(mark(cat === 'IV' ? [c[0] + 3, c[1] + 2, Math.round(c[2] + (g.wall[2] - c[2]) * s - 5)] : at, txt[0], txt[1], { dx: -170, dy: -40 }));
  return out;
}
const bosniakReadouts = (cat, variant, diam, env) => {
  const B = BOSNIAK[cat], hyper = variant === 'hiper' && (cat === 'II' || cat === 'IIF'), sin = env.phase === 'sin';
  const cont = hyper ? 74 : 6, enh = cat === 'IV' ? 67 : 0;
  return [
    { label: bi('Categoría', 'Category'), value: bi('Bosniak ' + cat + (hyper ? (cat === 'II' ? ' (hiperdenso < 3 cm)' : ' (hiperdenso > 3 cm)') : ''), 'Bosniak ' + cat + (hyper ? (cat === 'II' ? ' (hyperdense < 3 cm)' : ' (hyperdense > 3 cm)') : '')) },
    { label: bi('Diámetro', 'Diameter'), value: bi(fmtEs(fmt1(diam)) + ' cm', fmt1(diam) + ' cm') },
    { label: bi('Contenido sin contraste', 'Content, unenhanced'), value: bi(cont + ' UH' + (hyper ? ' · > 70 → complicado' : ' · 0–20 = agua'), cont + ' HU' + (hyper ? ' · > 70 → complicated' : ' · 0–20 = water')) },
    { label: bi('Con contraste', 'With contrast'), value: enh ? bi(`${B.con.es}: nódulo +${enh} UH`, `${B.con.en}: nodule +${enh} HU`) : B.con },
    { label: bi('Malignidad', 'Malignancy'), value: B.mal },
    { label: bi('Actitud', 'Management'), value: B.act },
    ...(sin ? [] : []),
  ];
};
const BOSNIAK_FLAGS = [
  { kind: 'revisar', es: 'Bosniak III: el texto del temario dice «maligna → cirugía», pero su tabla lo deja en «no capta» con «si dudas: exploración radiológica». El simulador sigue la tabla para la captación y muestra las dos actitudes.', en: 'Bosniak III: the syllabus text says "malignant → surgery", but its table files it under "no enhancement" with "if in doubt: imaging". The simulator follows the table for enhancement and shows both managements.' },
  { kind: 'ampliacion', es: 'Es la clasificación de Bosniak clásica. La versión 2019 usa umbrales en mm (grosor de pared y septos), incluye la RM y abandona los porcentajes de «50 % / 100 % malignos». En la clásica, la III ya tiene realce medible de paredes o septos.', en: 'This is the classic Bosniak classification. The 2019 version uses mm thresholds (wall and septal thickness), includes MR and drops the "50 % / 100 % malignant" figures. In the classic one, III already has measurable enhancement of walls or septa.' },
  { kind: 'apuntes', es: 'El quiste es real (máscara de este paciente, ≈ 3 cm). Septos, pared, calcio y nódulo se dibujan sobre él; el tamaño se puede cambiar para la regla del hiperdenso (< 3 cm → II · > 3 cm → IIF).', en: 'The cyst is real (this patient\'s mask, ≈ 3 cm). Septa, wall, calcium and nodule are drawn on it; its size can be changed for the hyperdense rule (< 3 cm → II · > 3 cm → IIF).' },
];
const CAT_OPTS = ['I', 'II', 'IIF', 'III', 'IV'].map(v => ({ v, es: v, en: v }));
const cystView = { plane: 'axial', window: 'soft', zoom: 3.4, at: (p, A) => cystGeom(A).c, examPlane: 'axial' };

/* ---------------- left-kidney solid masses (AML, CCR: same site, so they compare) ---------------- */
const siteL = (A, rmm) => kLesionCentre(A, 'L', 0.62, [-0.35, 1], rmm, 0.55);
const OUT_L = A => ['spleen', 'colon', 'small_bowel', 'pancreas', 'aorta', 'iliopsoas_left', 'stomach', ...bones(A)].filter(k => A.has(k));
function buildAML(p, A, env) {
  const r = p.size * 5, c = siteL(A, r), rv = r / A.sp[0], ph = phaseOf(env), out = [], oop = isOOP(env);
  const box = [c[0] - rv * 1.3 - 2, c[0] + rv * 1.3 + 2, c[1] - rv * 1.3 - 2, c[1] + rv * 1.3 + 2, c[2] - rv * 1.3 - 2, c[2] + rv * 1.3 + 2].map(Math.round);
  const excl = new Set(OUT_L(A).map(k => A.id(k))), strand = { sin: 40, arterial: 130, portal: 115, tardia: 95 };
  out.push({ t: 'cols', box, label: 'lesion', fn: (z, y, x, cur) => {
    if (excl.has(cur.orig)) return null;
    const d = Math.hypot((z - c[0]) / (rv * 1.05), (y - c[1]) / (rv * 0.92), (x - c[2]) / rv) / (1 + 0.12 * NZ(x * 0.2, y * 0.2, z * 0.2)); if (d > 1) return null;
    if (p.pobre) return { hu: phaseValue({ sin: 45, arterial: 130, portal: 118, tardia: 98 }, ph) + Math.round(8 * NZ(x * 0.7, y * 0.7, z * 0.7)), mr: { t1: 0.4, t2: 0.24, stir: 0.26 } };
    const n = NZ(x * 0.42 + 3, y * 0.42, z * 0.42);
    if (n > 0.42) return { hu: phaseValue(strand, ph), mr: { t1: 0.4, t2: 0.4, stir: 0.4 } };          // muscle and vessels
    return { hu: -78 + Math.round(10 * n), mr: oop ? { t1: 0.14, t2: 0.75, stir: 0.05 } : FAT_MR };      // fat (falls on opposed phase, as taught)
  } });
  if (p.sangrado) out.push({ t: 'blob', c: [c[0] + 4, c[1] + Math.round(rv * 0.4), c[2] + Math.round(rv * 0.9)], r: [r * 1.4, r * 0.9, r * 0.8], hu: 62, texture: 8, irregular: 0.5, edge: 2, outside: ['kidney_left', ...OUT_L(A)], label: 'lesion', mr: { t1: 0.7, t2: 0.55, stir: 0.5 } });
  out.push(mark(c, p.pobre ? 'AML pobre en grasa (10 %): denso' : 'Grasa: UH negativas', p.pobre ? 'Fat-poor AML (10 %): dense' : 'Fat: negative HU', { dx: 60, dy: -50 }));
  if (p.sangrado) out.push(mark([c[0] + 4, c[1] + Math.round(rv * 0.4), c[2] + Math.round(rv * 1.5)], 'Hematoma perirrenal', 'Perirenal haematoma', { dx: 40, dy: 50 }));
  return out;
}
function renalVein(A) {
  const ck = 'uri:rvl'; if (A.cache.has(ck)) return A.cache.get(ck);
  const m = kmodel(A, 'L'), zv = Math.round(m.pelvis[0] - 2), ivc = A.centroidAt('inferior_vena_cava', zv), ao = A.centroidAt('aorta', zv), aa = A.extreme('aorta', 'anterior', zv);
  const hil = [m.pelvis[0], m.pelvis[1] - 13, m.pelvis[2] - 2], yA = aa ? aa[1] : Math.round(ao.y - 8);
  const pts = [[zv, Math.round(ivc.y), Math.round(ivc.x)], [zv, yA - 3, Math.round(ao.x - 3)], [zv, yA - 1, Math.round(ao.x + 7)], [zv + 1, Math.round((yA + hil[1]) / 2), Math.round((ao.x + hil[2]) / 2 + 3)], hil];
  const r = { pts, ivc: [zv, Math.round(ivc.y), Math.round(ivc.x)] }; A.cache.set(ck, r); return r;
}
const TUM = { sin: 35, arterial: 150, portal: 112, tardia: 86 };
function buildCCR(p, A, env) {
  const ph = phaseOf(env), r = p.size * 5, c = siteL(A, r), rv = r / A.sp[0], out = [];
  if (ph === 'arterial') out.push(kidneyPaint(A, 'L', 'arterial'), kidneyPaint(A, 'R', 'arterial'));
  if (ph === 'tardia') out.push(...excretory(A, ['R', 'L'], { hu: 1200, bladder: 30 }));
  out.push({ t: 'blob', c, r: [r * 1.05, r * 0.95, r], hu: TUM, texture: 16, irregular: 0.3, edge: 1.2, outside: OUT_L(A), label: 'lesion', mr: { t1: 0.3, t2: 0.62, stir: 0.56 } });
  if (p.necrosis && p.size >= 3) out.push({ t: 'blob', c: [c[0] + 1, c[1], c[2] + 1], r: [r * 0.45, r * 0.4, r * 0.42], hu: { sin: 22, arterial: 26, portal: 28, tardia: 30 }, irregular: 0.6, edge: 1, label: 'lesion', mr: { t1: 0.15, t2: 0.9, stir: 0.86 } });
  out.push(mark([c[0], c[1], Math.round(c[2] + rv * 0.6)], ...{ sin: ['Isodenso al riñón', 'Isodense to kidney'], arterial: ['Capta, heterogéneo', 'Enhances, heterogeneous'], portal: ['Capta menos que el riñón', 'Enhances less than kidney'], tardia: ['Fase excretora', 'Excretory phase'] }[ph], { dx: 50, dy: -60 }));
  if (p.trombo !== 'no') {
    const v = renalVein(A), th = { sin: 40, arterial: 58, portal: 66, tardia: 62 };
    out.push({ t: 'tube', pts: v.pts.slice(1).reverse(), r: 5, hu: th, label: 'lesion', outside: ['aorta', 'inferior_vena_cava', ...bones(A)], mr: { t1: 0.35, t2: 0.55, stir: 0.5 } });
    out.push(mark(v.pts[3], 'Trombo en la vena renal', 'Renal vein thrombus', { dx: 40, dy: -70, planes: ['axial'] }));
    if (p.trombo === 'vci') {
      out.push({ t: 'blob', c: v.ivc, r: [26, 13, 13], hu: th, irregular: 0.25, edge: 0.6, within: ['inferior_vena_cava'], label: 'lesion', mr: { t1: 0.35, t2: 0.55, stir: 0.5 } });
      out.push(mark(v.ivc, 'Trombo en la cava inferior', 'IVC thrombus', { dx: -170, dy: -50 }));
    }
  }
  return out;
}
const ccrView = { plane: 'axial', window: 'soft', zoom: 2.4, at: (p, A) => siteL(A, p.size * 5), examPlane: 'axial' };

/* ---------------- bladder tumour ---------------- */
function bladderSite(A, rmm) {
  const z = A.s('urinary_bladder').bbox[0] + 16, w = bladderWall(A, 'L', z, 0.6), rv = rmm / A.sp[0];
  const v = [w.c[1] - w.wall[1], w.c[2] - w.wall[2]], L = Math.hypot(...v) || 1;
  return { c: [z, Math.round(w.wall[1] + v[0] / L * rv * 0.55), Math.round(w.wall[2] + v[1] / L * rv * 0.55)], wall: w.wall, out: [z, Math.round(w.wall[1] - v[0] / L * 4), Math.round(w.wall[2] - v[1] / L * 4)] };
}
function buildVesical(p, A, env) {
  const r = p.size * 5, s = bladderSite(A, r), out = [];
  if (env.phase === 'tardia') out.push({ t: 'layer', s: 'urinary_bladder', depth: 30, hu: 650, label: 'keep', mr: FLUID_MR });
  out.push({ t: 'blob', c: s.c, r: [r * 0.9, r * 0.8, r], hu: { sin: 40, arterial: 95, portal: 86, tardia: 80 }, irregular: 0.55, edge: 0.8, texture: 8, within: ['urinary_bladder'], label: 'lesion', mr: { t1: 0.4, t2: 0.5, stir: 0.5 } });
  out.push({ t: 'blob', c: s.wall, r: [r * 1.1, 5, r * 1.1], hu: { sin: 42, arterial: 90, portal: 82, tardia: 78 }, edge: 0.6, within: ['urinary_bladder'], label: 'lesion', mr: { t1: 0.4, t2: 0.5, stir: 0.5 } });
  if (p.infiltra) out.push({ t: 'blob', c: s.out, r: [r * 0.8, r * 0.5, r * 0.6], hu: { sin: 42, portal: 75 }, irregular: 0.7, edge: 1.5, outside: ['urinary_bladder', 'hip_left', 'hip_right', 'sacrum', 'colon', 'iliac_artery_left', 'iliac_vena_left'].filter(k => A.has(k)), label: 'lesion', mr: { t1: 0.4, t2: 0.5, stir: 0.5 } });
  out.push(mark(s.c, env.phase === 'tardia' ? 'Defecto de repleción' : 'Lesión papilar de base sésil', env.phase === 'tardia' ? 'Filling defect' : 'Sessile papillary lesion', { dx: 60, dy: -50 }));
  return out;
}

/* ---------------- acute pyelonephritis (left kidney) ---------------- */
function pyeloTargets(A, n) {
  return [kSurface(A, 'L', 0.3, [-0.5, 1]), kSurface(A, 'L', 0.55, [0.6, 1]), kSurface(A, 'L', 0.8, [-0.25, 1])].slice(0, n);
}
function buildPielo(p, A, env) {
  const ph = phaseOf(env), m = kmodel(A, 'L'), id = m.id, out = [], tg = pyeloTargets(A, p.ext), W = wedges(A, 'L', tg);
  out.push({ t: 'dilate', s: 'kidney_left', scale: 1.06 });
  out.push(perirenal(A, 'L', { w: 9, amount: 0.8 }));
  const pad = 5, b = m.box, box = [b[0], b[1], b[2] - pad, b[3] + pad, b[4] - pad, b[5] + pad];
  out.push({ t: 'cols', box, label: 'lesion', fn: (z, y, x, cur) => {
    if (cur.lab !== id) return null; const w = W(z, y, x); if (!w) return null;
    const hu = ph === 'sin' ? cur.hu - 8 : ph === 'tardia' ? cur.hu + 28 : Math.round(cur.hu * (w === 1 ? 0.55 : 0.75));
    return { hu, mr: { t1: 0.36, t2: 0.62, stir: 0.8 } };
  } });
  if (p.absceso) {
    const t = tg[Math.min(1, tg.length - 1)], ap = m.pelvis, c = [0, 1, 2].map(i => Math.round(ap[i] + (t[i] - ap[i]) * 0.62));
    out.push({ t: 'blob', c, r: 9, hu: { sin: 18, arterial: 20, portal: 20, tardia: 22 }, rim: { w: 2.5, hu: { sin: 34, arterial: 110, portal: 125, tardia: 115 } }, edge: 0.8, irregular: 0.3, within: ['kidney_left', 'lesion'], label: 'lesion', mr: FLUID_MR });
    out.push(mark(c, 'Absceso (anillo)', 'Abscess (rim)', { dx: 60, dy: 50 }));
  }
  const t0 = tg[0], ap = m.pelvis;
  out.push(mark([0, 1, 2].map(i => ap[i] + (t0[i] - ap[i]) * 0.7), ph === 'tardia' ? 'Nefrograma persistente' : 'Cuña hipocaptante', ph === 'tardia' ? 'Persistent nephrogram' : 'Hypoenhancing wedge', { dx: 60, dy: -50 }));
  out.push(mark(kSurface(A, 'L', 0.62, [0.2, 1]).map((v, i) => v + [0, 2, 9][i]), 'Gerota engrosada', 'Thickened Gerota fascia', { dx: 50, dy: 30, planes: ['axial'] }));
  return out;
}

/* ---------------- entities ---------------- */
export const RENAL = [
  {
    id: 'bosniak', group: 'quiste', tag: 'ct-real', contrast: true,
    name: bi('Quiste renal: clasificación de Bosniak', 'Renal cyst: Bosniak classification'),
    short: bi('Quiste renal (Bosniak)', 'Renal cyst (Bosniak)'),
    view: cystView,
    params: [
      { id: 'cat', type: 'select', label: bi('Categoría de Bosniak', 'Bosniak category'), options: CAT_OPTS, value: 'I', dropdown: false },
      { id: 'tipo', type: 'select', label: bi('Variante (II / IIF)', 'Variant (II / IIF)'), options: [{ v: 'septos', es: 'Septos y calcio', en: 'Septa and calcium' }, { v: 'hiper', es: 'Hiperdenso', en: 'Hyperdense' }], value: 'septos' },
      { id: 'diam', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 4.5, step: 0.5, value: 3, unit: 'cm' },
    ],
    techniques: [
      T.ctCon('best', 'Bosniak se basa en la TC sin y con contraste: pared, septos, calcio, contenido (0–20 UH) y si capta.', 'Bosniak relies on unenhanced and contrast CT: wall, septa, calcium, content (0–20 HU) and enhancement.', { default: true }),
      T.ctSin('ok', 'Sin contraste: densidad agua (0–20 UH); > 70 UH = quiste complicado (hemorragia, infección, proteináceo) → estudios adicionales.', 'Unenhanced: water density (0–20 HU); > 70 HU = complicated cyst (haemorrhage, infection, proteinaceous) → further tests.'),
      T.t2('ok', 'RM: T2 hiperintenso, T1 hipointenso, sin gadolinio; detecta y caracteriza mejor los quistes < 1 cm.', 'MR: T2 hyperintense, T1 hypointense, no gadolinium; best to detect and characterise cysts < 1 cm.'),
      T.t1('ok', 'T1 hipointenso (el hiperdenso, proteináceo o hemorrágico, sube en T1).', 'T1 hypointense (the hyperdense, proteinaceous or haemorrhagic one, rises on T1).'),
    ],
    compare: ['bosniak-comp'],
    build: (p, A, env) => buildBosniak(p.cat, p.tipo, p.diam, A, env),
    readouts: (p, A, env) => bosniakReadouts(p.cat, p.tipo, p.diam, env),
    info: {
      where: bi('Quiste real del riñón derecho de este paciente (cortical, exofítico). Muy frecuentes: > 50 % de los mayores de 55 años; suelen ser múltiples y bilaterales.', 'This patient\'s real right-kidney cyst (cortical, exophytic). Very common: > 50 % of people over 55; usually multiple and bilateral.'),
      see: bi('<b>I</b>: densidad agua homogénea, pared fina y lisa, sin calcio, septos ni sólido · <b>II</b>: algunos septos finos, calcio mínimo, o hiperdenso &lt; 3 cm · <b>IIF</b>: septos algo más gruesos, calcio moderado, o hiperdenso &gt; 3 cm · <b>III</b>: paredes, calcio y septos gruesos e irregulares, contenido heterogéneo · <b>IV</b>: paredes gruesas con tejido nodular que <b>capta</b>.', '<b>I</b>: homogeneous water density, thin smooth wall, no calcium, septa or solid part · <b>II</b>: a few thin septa, minimal calcium, or hyperdense &lt; 3 cm · <b>IIF</b>: slightly thicker septa, moderate calcium, or hyperdense &gt; 3 cm · <b>III</b>: thick irregular walls, calcium and septa, heterogeneous content · <b>IV</b>: thick walls with nodular tissue that <b>enhances</b>.'),
      technique: bi('Eco: anecoico con refuerzo acústico posterior (simple); pared gruesa o ecos dentro (complicado). TC sin y con contraste para clasificar; RM mejor en &lt; 1 cm.', 'Ultrasound: anechoic with posterior acoustic enhancement (simple); thick wall or internal echoes (complicated). Unenhanced and contrast CT to classify; MR better under 1 cm.'),
      differential: bi('Hasta un 10 % de los carcinomas renales son masas quísticas: por eso se gradúa con Bosniak.', 'Up to 10 % of renal carcinomas present as cystic masses: hence the Bosniak grading.'),
      tip: bi('Sube de I a IV y alterna sin / con contraste: solo el nódulo de la IV cambia de UH. Pasa el cursor por el contenido y por el nódulo.', 'Step from I to IV and toggle unenhanced / contrast: only the IV nodule changes HU. Hover the content and the nodule.'),
    },
    diagram: lang => bosniakDiagram(lang),
    flags: BOSNIAK_FLAGS,
  },
  {
    id: 'bosniak-comp', group: 'quiste', tag: 'ct-real', contrast: true, exam: false,
    name: bi('Quiste complejo (Bosniak IIF / III / IV)', 'Complex cyst (Bosniak IIF / III / IV)'),
    short: bi('Quiste complejo', 'Complex cyst'),
    view: cystView,
    params: [{ id: 'catc', type: 'select', label: bi('Categoría', 'Category'), options: CAT_OPTS.slice(2), value: 'III' }],
    techniques: [T.ctCon('best', 'Paredes y septos gruesos; la IV tiene tejido nodular que capta.', 'Thick walls and septa; IV has enhancing nodular tissue.', { default: true }), T.ctSin('ok', 'Calcio y contenido sin contraste.', 'Calcium and content without contrast.')],
    compare: ['bosniak'],
    build: (p, A, env) => buildBosniak(p.catc, 'septos', 3, A, env),
    readouts: (p, A, env) => bosniakReadouts(p.catc, 'septos', 3, env),
    info: {
      see: bi('IIF: probablemente benigno → seguimiento con TC · III: 50 % malignos · IV: 100 % malignos, cirugía.', 'IIF: probably benign → CT follow-up · III: 50 % malignant · IV: 100 % malignant, surgery.'),
      tip: bi('Compáralo con el quiste de «Bosniak» puesto en II: mismo quiste, distinta pared y septos.', 'Compare it with the "Bosniak" cyst set to II: same cyst, different wall and septa.'),
    },
    flags: [BOSNIAK_FLAGS[0]],
  },
  {
    id: 'aml', group: 'solido', tag: 'ct-real', extraTags: ['sim'], contrast: true, defaultPhase: 'sin',
    name: bi('Angiomiolipoma', 'Angiomyolipoma'),
    short: bi('Angiomiolipoma', 'Angiomyolipoma'),
    view: ccrView,
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 1.5, max: 8, step: 0.5, value: 3, unit: 'cm' },
      { id: 'pobre', type: 'toggle', label: bi('Pobre en grasa (10 %: denso)', 'Fat-poor (10 %: dense)'), value: false },
      { id: 'sangrado', type: 'toggle', label: bi('Sangrado (riesgo si > 4 cm)', 'Bleeding (risk if > 4 cm)'), value: false },
    ],
    techniques: [
      T.ctSin('best', 'Confirma la grasa: UH bajas (negativas a 10 UH). Es la prueba ante una lesión hiperecogénica en eco.', 'Confirms the fat: low HU (negative to 10 HU). The test after a hyperechoic lesion on ultrasound.', { default: true }),
      T.ctCon('ok', 'Captación variable (músculo y vasos).', 'Variable enhancement (muscle and vessels).'),
      T.t1('ok', 'Si hay dudas: como la grasa, hiperintenso en T1 (y en T2).', 'If in doubt: like fat, hyperintense on T1 (and T2).'),
      T.oop('ok', 'En fuera de fase cae la señal en el interior (se vuelve negro), según el temario.', 'On opposed phase the inner signal drops (turns black), as the syllabus says.'),
      T.fatsat('ok', 'La grasa se apaga con la supresión grasa.', 'The fat turns dark with fat suppression.'),
    ],
    compare: ['ccr'],
    build: buildAML,
    readouts: (p) => [
      { label: bi('UH sin contraste', 'Unenhanced HU'), value: p.pobre ? bi('≈ 45 UH (sin grasa visible)', '≈ 45 HU (no visible fat)') : bi('≈ −80 UH (grasa)', '≈ −80 HU (fat)') },
      { label: bi('Riesgo de sangrado', 'Bleeding risk'), value: p.size > 4 ? bi(`Sí (${fmtEs(p.size)} cm > 4 cm) → embolización o resección si síntomas o riesgo`, `Yes (${p.size} cm > 4 cm) → embolisation or resection if symptoms or risk`) : bi('Bajo (≤ 4 cm)', 'Low (≤ 4 cm)') },
      { label: bi('Eco', 'Ultrasound'), value: bi('Hiperecogénico (como la grasa) · no descarta CCR', 'Hyperechoic (like fat) · does not exclude RCC') },
    ],
    info: {
      where: bi('Riñón izquierdo real, cortical y algo exofítico (mismo sitio que el carcinoma, para compararlos).', 'Real left kidney, cortical and slightly exophytic (same site as the carcinoma, to compare them).'),
      see: bi('Tumor benigno mesenquimal: <b>músculo, grasa y vasos</b>. TC sin contraste: UH negativas (hipodenso como la grasa); un <b>10 %</b> es denso (pequeño, poca grasa). Con contraste: captación variable.', 'Benign mesenchymal tumour: <b>muscle, fat and vessels</b>. Unenhanced CT: negative HU (hypodense like fat); <b>10 %</b> are dense (small, little fat). With contrast: variable enhancement.'),
      technique: bi('Eco: lesión hiperecogénica. ¡Cuidado!: el carcinoma renal también puede ser hiperecogénico → confirmar la grasa con <b>TC sin contraste</b>. RM si hay dudas.', 'Ultrasound: hyperechoic lesion. Careful: renal carcinoma can also be hyperechoic → confirm the fat with <b>unenhanced CT</b>. MR if in doubt.'),
      differential: bi('Carcinoma de células renales: sin grasa, isodenso sin contraste, capta menos que el riñón en fase nefrográfica.', 'Renal cell carcinoma: no fat, isodense unenhanced, enhances less than the kidney in the nephrographic phase.'),
      tip: bi('Prevalencia 0,1 %, mujeres 4:1, 80 % espontáneos y 20 % sindrómicos (esclerosis tuberosa). Activa «Pobre en grasa»: ya no se distingue del carcinoma por la densidad.', 'Prevalence 0.1 %, women 4:1, 80 % sporadic and 20 % syndromic (tuberous sclerosis). Turn on "Fat-poor": density no longer separates it from carcinoma.'),
    },
    flags: [
      { kind: 'ampliacion', es: 'La grasa macroscópica pura no cae en fuera de fase (cae la mezcla agua-grasa; en las interfaces aparece la «tinta china»); lo que cae del todo es la supresión grasa. El simulador sigue el temario.', en: 'Pure macroscopic fat does not drop on opposed phase (water–fat mixtures do; "India ink" appears at interfaces); what fully darkens it is fat suppression. The simulator follows the syllabus.' },
      { kind: 'ampliacion', es: 'Que el AML pobre en grasa sea hipointenso en T2 es ampliación.', en: 'The fat-poor AML being T2-hypointense goes beyond the syllabus.' },
    ],
  },
  {
    id: 'ccr', group: 'solido', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'arterial', 'portal', 'tardia'], phaseLabels: RENAL_PHASES, defaultPhase: 'portal',
    name: bi('Carcinoma de células renales', 'Renal cell carcinoma'),
    short: bi('Carcinoma renal', 'Renal carcinoma'),
    view: ccrView,
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 2, max: 9, step: 0.5, value: 5, unit: 'cm' },
      { id: 'necrosis', type: 'toggle', label: bi('Necrosis central', 'Central necrosis'), value: true },
      { id: 'trombo', type: 'select', label: bi('Trombo venoso (30 %)', 'Venous thrombus (30 %)'), options: [{ v: 'no', es: 'No', en: 'No' }, { v: 'renal', es: 'Vena renal', en: 'Renal vein' }, { v: 'vci', es: 'Vena renal + cava', en: 'Renal vein + IVC' }], value: 'no' },
    ],
    techniques: [
      T.ctCon('best', 'Fase nefrográfica: la más eficaz para detectarlo y caracterizarlo (capta, pero menos que el riñón).', 'Nephrographic phase: the best to detect and characterise it (enhances, but less than the kidney).', { default: true }),
      T.ctSin('ok', 'Sin contraste es isodenso al parénquima: puede pasar desapercibido.', 'Unenhanced it is isodense to the parenchyma: it can be missed.'),
      T.t2('ok', 'RM si hay alergia al contraste, pero inferior a la TC: hipointenso en T1, hiperintenso en T2, captación similar.', 'MR if contrast allergy, but inferior to CT: T1 hypointense, T2 hyperintense, similar enhancement.'),
    ],
    compare: ['aml', 'pielonefritis'],
    build: buildCCR,
    readouts: (p, A, env) => {
      const ph = phaseOf(env), t = TUM[ph], k = KHU[ph];
      return [
        { label: bi('Fase', 'Phase'), value: RENAL_PHASES[ph] },
        { label: bi('Tumor / riñón', 'Tumour / kidney'), value: bi(`${t} / ${k} UH`, `${t} / ${k} HU`) },
        { label: bi('Lectura', 'Reading'), value: ph === 'sin' ? bi('Isodenso: casi invisible', 'Isodense: almost invisible') : ph === 'portal' ? bi('Capta, pero menos que el riñón', 'Enhances, but less than the kidney') : ph === 'arterial' ? bi('Capta; corteza y médula aún distintas', 'Enhances; cortex and medulla still distinct') : bi('Contraste en la vía excretora', 'Contrast in the collecting system') },
        { label: bi('Trombo venoso', 'Venous thrombus'), value: p.trombo === 'no' ? bi('No (ocurre en el 30 %)', 'No (occurs in 30 %)') : p.trombo === 'renal' ? bi('Vena renal', 'Renal vein') : bi('Vena renal y cava inferior', 'Renal vein and IVC') },
      ];
    },
    info: {
      where: bi('Riñón izquierdo real (interpolar, lateral). Vena renal izquierda aproximada (no segmentada); la cava es la máscara real.', 'Real left kidney (interpolar, lateral). Left renal vein approximated (not segmented); the IVC is the real mask.'),
      see: bi('Masa sólida, a veces con <b>necrosis central</b>. Sin contraste, <b>isodensa</b>. Fases: corticomedular → <b>nefrográfica</b> (la más eficaz: capta <b>menos que el riñón</b>) → excretora. Complicación: trombosis o infiltración de la vena renal o la cava (<b>30 %</b>).', 'Solid mass, sometimes with <b>central necrosis</b>. Unenhanced, <b>isodense</b>. Phases: corticomedullary → <b>nephrographic</b> (the best: enhances <b>less than the kidney</b>) → excretory. Complication: thrombosis or infiltration of the renal vein or IVC (<b>30 %</b>).'),
      technique: bi('Eco: masa sólida iso, hipo o hiperecoica (heterogénea si es grande). TC con contraste por fases; RM si hay alergia, pero inferior.', 'Ultrasound: iso-, hypo- or hyperechoic solid mass (heterogeneous if large). Multiphase contrast CT; MR if allergy, but inferior.'),
      differential: bi('AML (grasa) · pielonefritis (cuñas, clínica infecciosa) · quiste Bosniak III–IV (las formas quísticas, 10 %).', 'AML (fat) · pyelonephritis (wedges, infection) · Bosniak III–IV cyst (the cystic forms, 10 %).'),
      tip: bi('Tumor renal maligno primario más frecuente del adulto; tríada masa-dolor-hematuria, pero el 70–80 % es incidental. Recorre las cuatro fases y lee la fila «Tumor / riñón».', 'Commonest primary malignant renal tumour in adults; mass–pain–haematuria triad, but 70–80 % are incidental. Step through the four phases and read the "Tumour / kidney" row.'),
    },
    flags: [
      { kind: 'apuntes', es: 'Las fases siguen el temario (corticomedular, nefrográfica, secretora). Se simulan sobre el TC portal real: el riñón «nefrográfico» es el adquirido.', en: 'The phases follow the syllabus (corticomedullary, nephrographic, secretory). They are simulated on the real portal CT: the "nephrographic" kidney is the acquired one.' },
      { kind: 'ampliacion', es: 'Las UH de cada fase son valores didácticos; el temario solo da la relación (isodenso, capta menos que el riñón).', en: 'The HU of each phase are teaching values; the syllabus only gives the relation (isodense, enhances less than the kidney).' },
    ],
  },
  {
    id: 'vesical', group: 'solido', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'portal', 'tardia'], phaseLabels: { sin: bi('Sin contraste', 'Unenhanced'), portal: bi('Con contraste', 'Contrast'), tardia: bi('Excretora', 'Excretory') },
    name: bi('Tumor vesical (urotelial)', 'Bladder tumour (urothelial)'),
    short: bi('Tumor vesical', 'Bladder tumour'),
    view: { plane: 'axial', window: 'soft', zoom: 2.6, at: (p, A) => bladderSite(A, p.size * 5).c, examPlane: 'axial' },
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 1, max: 5, step: 0.5, value: 2.5, unit: 'cm' },
      { id: 'infiltra', type: 'toggle', label: bi('Infiltración perivesical', 'Perivesical infiltration'), value: false },
    ],
    techniques: [
      T.ctCon('ok', 'Tras la RTU: estadificación y seguimiento (próstata, adenopatías, distancia); nódulo que capta o engrosamiento asimétrico.', 'After TURBT: staging and follow-up (prostate, nodes, distant); enhancing nodule or asymmetric wall thickening.', { default: true }),
      T.t2('best', 'RM: mayor resolución, distingue las capas vesicales y da el estadio. T2: señal intermedia entre la orina (hiper) y el músculo (hipo).', 'MR: higher resolution, separates the bladder layers and gives the stage. T2: signal between urine (high) and muscle (low).'),
      T.ctExc('ok', 'Como la urografía: defecto de repleción en las lesiones grandes; evalúa pequeños defectos en vías altas.', 'Like urography: filling defect in large lesions; assesses small defects in the upper tract.'),
    ],
    build: buildVesical,
    info: {
      where: bi('Pared posterolateral izquierda de la vejiga real.', 'Left posterolateral wall of the real bladder.'),
      see: bi('Eco: lesión ecogénica <b>papilar-polipoidea de base sésil</b>, inmóvil, con engrosamiento de la pared (Doppler: vascularizada). TC: nódulo que capta o engrosamiento asimétrico. RM: restringe en difusión y capta.', 'Ultrasound: echogenic <b>sessile papillary-polypoid</b> lesion, immobile, with wall thickening (Doppler: vascular). CT: enhancing nodule or asymmetric thickening. MR: restricts on diffusion and enhances.'),
      technique: bi('Eco · urografía (defecto de repleción; tras RTU de tumores infiltrantes o de alto grado) · TC tras RTU · RM (capas, estadio) · PET-FDG (metástasis y adenopatías; recidiva frente a fibrosis o cambios actínicos).', 'Ultrasound · urography (filling defect; after TURBT of invasive or high-grade tumours) · CT after TURBT · MR (layers, stage) · FDG-PET (metastases and nodes; recurrence versus fibrosis or radiation change).'),
      tip: bi('2.º tumor urológico (tras el CCR); urotelial el 95 %; varones 3:1, &gt; 70 años, tabaco; hematuria. Pasa a fase excretora para ver el defecto de repleción.', '2nd urological tumour (after RCC); urothelial in 95 %; men 3:1, &gt; 70 years, smoking; haematuria. Switch to the excretory phase to see the filling defect.'),
    },
    flags: [{ kind: 'ampliacion', es: 'La RM con difusión no se simula; la RM T2 muestra la señal intermedia que describe el temario.', en: 'Diffusion MR is not simulated; T2 MR shows the intermediate signal the syllabus describes.' }],
  },
  {
    id: 'pielonefritis', group: 'inf', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'portal', 'tardia'], phaseLabels: { sin: bi('Sin contraste', 'Unenhanced'), portal: bi('Nefrográfica', 'Nephrographic'), tardia: bi('Tardía', 'Delayed') },
    name: bi('Pielonefritis aguda', 'Acute pyelonephritis'),
    short: bi('Pielonefritis aguda', 'Acute pyelonephritis'),
    view: { plane: 'axial', window: 'soft', zoom: 2.4, at: (p, A) => { const m = kmodel(A, 'L'), t = pyeloTargets(A, 1)[0]; return [0, 1, 2].map(i => Math.round(m.pelvis[i] + (t[i] - m.pelvis[i]) * 0.6)); }, examPlane: 'axial' },
    params: [
      { id: 'ext', type: 'range', label: bi('Áreas en cuña', 'Wedge areas'), min: 1, max: 3, step: 1, value: 2 },
      { id: 'absceso', type: 'toggle', label: bi('Absceso', 'Abscess'), value: false },
    ],
    techniques: [
      T.ctCon('best', 'Fase nefrográfica: áreas de baja captación en cuña de centro a cápsula, estriaciones; Gerota engrosada; abscesos.', 'Nephrographic phase: low-enhancing wedges from centre to capsule, striations; thickened Gerota; abscesses.', { default: true }),
      T.ctSin('ok', 'Sin contraste: atenuación normal, ↓ (edema) o ↑ (hemorragia) y cambios perirrenales.', 'Unenhanced: normal, ↓ (oedema) or ↑ (haemorrhage) attenuation and perirenal changes.'),
      { id: 'rm-dif', mod: 'stir', verdict: 'ok', label: bi('RM difusión (aprox.)', 'Diffusion MR (approx.)'), note: bi('Embarazadas, alérgicos o niños: riñón agrandado y restricción en difusión en las zonas infectadas (aquí con una secuencia sensible al edema).', 'Pregnancy, allergy or children: enlarged kidney and restricted diffusion in the infected areas (shown here with an oedema-sensitive sequence).') },
    ],
    compare: ['ccr'],
    build: buildPielo,
    readouts: (p, A, env) => [
      { label: bi('Germen', 'Organism'), value: bi('E. coli (80 %), vía ascendente', 'E. coli (80 %), ascending route') },
      { label: bi('Eco', 'Ultrasound'), value: bi('Poco sensible: puede ser normal', 'Insensitive: may be normal') },
      { label: bi('En esta fase', 'In this phase'), value: env.phase === 'tardia' ? bi('Nefrograma persistente o retardado en las cuñas', 'Persistent or delayed nephrogram in the wedges') : env.phase === 'sin' ? bi('Casi normal; cambios perirrenales', 'Near normal; perirenal changes') : bi('Cuñas hipocaptantes de centro a cápsula', 'Hypoenhancing wedges from centre to capsule') },
      { label: bi('DMSA', 'DMSA'), value: bi('Zonas hipoactivas periféricas', 'Peripheral cold areas') },
    ],
    info: {
      where: bi('Riñón izquierdo real; cuñas desde el seno renal hasta la cápsula.', 'Real left kidney; wedges from the renal sinus to the capsule.'),
      see: bi('Riñón agrandado; con contraste, <b>áreas de baja captación en cuña de centro a cápsula</b> y estriaciones; <b>nefrograma persistente</b> o retardado; fascia de <b>Gerota</b> y tabiques engrosados; urotelio pélvico engrosado. Complicaciones: abscesos, trombosis de la vena renal.', 'Enlarged kidney; with contrast, <b>low-enhancing wedges from centre to capsule</b> and striations; <b>persistent</b> or delayed nephrogram; thickened <b>Gerota</b> fascia and septa; thickened pelvic urothelium. Complications: abscesses, renal vein thrombosis.'),
      technique: bi('Eco poco sensible (riñón grande, áreas hipo o hiperecoicas, ↓ Doppler) · DMSA: zonas hipoactivas · TC con contraste · RM en embarazadas, alérgicos y niños (difusión).', 'Ultrasound insensitive (large kidney, hypo/hyperechoic areas, ↓ Doppler) · DMSA: cold areas · contrast CT · MR in pregnancy, allergy and children (diffusion).'),
      differential: bi('Carcinoma renal: masa redondeada que deforma el contorno, sin clínica infecciosa.', 'Renal carcinoma: round mass that bulges the contour, no infection.'),
      tip: bi('Infección bacteriana pielocalicial y tubulointersticial, más en mujeres: dolor en flanco + fiebre. Pasa de nefrográfica a tardía: las cuñas que no captaban se quedan más densas.', 'Bacterial infection of the pelvicalyceal system and interstitium, commoner in women: flank pain + fever. Go from nephrographic to delayed: the wedges that did not enhance stay denser.'),
    },
    flags: [{ kind: 'ampliacion', es: 'No hay simulador de difusión: la restricción se aproxima con una secuencia sensible al edema (STIR).', en: 'There is no diffusion simulator: restriction is approximated with an oedema-sensitive sequence (STIR).' }],
  },
];
