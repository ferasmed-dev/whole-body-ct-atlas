// Pancreas entities: techniques and anatomy, acute pancreatitis (oedematous vs necrotising, Balthazar, Atlanta),
// chronic pancreatitis, adenocarcinoma, cystic tumours (serous, mucinous, IPMN) and neuroendocrine tumours.
// The pancreas is segmented on s0591; the pancreatic duct is an estimated tube along the gland's centreline.
import { bi, opt, tq, mark, flag, PHL_PAN, BG, contrastRO, ecoRO, MR, pv } from './common.js';
import { LIV, GB, PAN, PV, DUO, IVC, tree, ductTubes, gbParts, pancParts, bestSite, sphere, rbox, NZ, NZ2, noiseField, quantile, liverPoints, depth, clamp } from './geo.js';
import { distanceInside, LESION_ID } from '../../src/pathology.js';
import * as L from './lesions.js';
import { balthazarDiagram, cysticDiagram } from './diagrams.js';

const P3 = (sin, arterial, portal) => ({ sin, arterial, portal, tardia: portal });
const PH3 = ['sin', 'arterial', 'portal'];
const lm = (c, es, en, x = {}) => mark(c, es, en, { dx: 60, dy: -46, ...x });
const tid = (env, d = 'ct') => (env.technique && env.technique.id) || d;
const BILE = { t1: 0.1, t2: 0.98, stir: 0.95 };
const pview = (at, zoom = 2, extra = {}) => ({ plane: 'axial', window: 'soft', zoom, at, examPlane: 'axial', ...extra });
const PT = {
  ct: (verdict, es, en, x = {}) => tq('ct', 'ct', verdict, bi('TC dinámico (vacío + contraste)', 'Dynamic CT (unenhanced + contrast)'), bi(es, en), { window: 'soft', default: true, ...x }),
  eco: (verdict, es, en) => tq('eco', 'ct', verdict, bi('Ecografía (no simulada)', 'Ultrasound (not simulated)'), bi(es + ' Se muestra el TC; el hallazgo ecográfico está en las lecturas.', en + ' The CT is shown; the ultrasound finding is in the read-outs.'), { window: 'soft' }),
  rm: (verdict, es, en, mod = 't2') => tq('rm', mod, verdict, bi(mod === 't2' ? 'RM T2' : 'RM T1', mod === 't2' ? 'T2 MR' : 'T1 MR'), bi(es, en)),
  rx: (verdict, es, en) => tq('rx', 'rx', verdict, bi('Rx simple de abdomen', 'Plain abdominal film'), bi(es, en), { plane: 'coronal' }),
};
/** HU tables (pancreas ≈ 40 / 120 / 63 HU in basal / pancreatic / portal on this study). */
const H = {
  adeno: P3(38, 62, 42), net: P3(42, 190, 98), septa: P3(40, 110, 76), cystWall: P3(40, 72, 82), pseudoWall: P3(35, 66, 82), nec: P3(26, 27, 28),
};

/* ---------------- geometry ---------------- */
/** Distance (mm) outside the pancreas, on a padded local grid (peripancreatic fat, collections). */
function panOut(A) {
  const k = 'hig:pout'; if (A.cache.has(k)) return A.cache.get(k);
  const bb = A.s(PAN).bbox, [Z, Y, X] = A.dims, pad = 26, id = A.id(PAN);
  const b = [Math.max(0, bb[0] - pad), Math.min(Z - 1, bb[1] + pad), Math.max(0, bb[2] - pad), Math.min(Y - 1, bb[3] + pad), Math.max(0, bb[4] - pad), Math.min(X - 1, bb[5] + pad)];
  const n = [b[1] - b[0] + 1, b[3] - b[2] + 1, b[5] - b[4] + 1], lab = new Uint8Array(n[0] * n[1] * n[2]);
  for (let kk = 0; kk < n[0]; kk++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[2]; i++) lab[(kk * n[1] + j) * n[2] + i] = A.at(b[0] + kk, b[2] + j, b[4] + i) === id ? 0 : 1;
  const d = distanceInside({ n, lab }, 1), g = { b, n, d };
  A.cache.set(k, g); return g;
}
function outD(A, z, y, x) {
  const g = panOut(A), kk = z - g.b[0], j = y - g.b[2], i = x - g.b[4];
  if (kk < 0 || j < 0 || i < 0 || kk >= g.n[0] || j >= g.n[1] || i >= g.n[2]) return Infinity;
  return g.d[(kk * g.n[1] + j) * g.n[2] + i] * A.sp[0];
}
/** Deepest pancreas voxel of the head / body / tail. */
function pancSite(A, part) {
  const k = 'hig:psite:' + part; if (A.cache.has(k)) return A.cache.get(k);
  const pp = pancParts(A), b = A.s(PAN).bbox, x = part === 'cabeza' ? [b[4], pp.xh - 4] : part === 'cola' ? [pp.xt + 4, b[5]] : [pp.xh + 6, pp.xt - 6];
  const s = bestSite(A, PAN, { x }) || pp.body;
  A.cache.set(k, s); return s;
}
const LOC = [opt('cabeza', 'Cabeza', 'Head'), opt('cuerpo', 'Cuerpo', 'Body'), opt('cola', 'Cola', 'Tail')];
const locP = v => ({ id: 'loc', type: 'select', label: bi('Localización', 'Location'), options: LOC, value: v, recentre: true });
const atLoc = (p, A) => pancSite(A, p.loc);
const atBody = (p, A) => pancParts(A).body;
/** Pancreatic duct (estimated) from fraction f0 to f1 of its length (0 = papilla, 1 = tail), radius r mm (number or per-point array). */
function wirsung(A, r, f0 = 0, f1 = 1, hu = 10, within = [PAN, 'lesion']) {
  const w = tree(A).wirsung, n = w.length - 1, pts = w.filter((q, i) => i / n >= f0 - 1e-6 && i / n <= f1 + 1e-6);
  return pts.length > 1 ? { t: 'tube', pts, r, hu, label: 'lesion', mr: BILE, within } : null;
}
/** Fraction along the duct of the point nearest to c. */
function ductFrac(A, c) { const w = tree(A).wirsung; let bi_ = 0, bd = Infinity; w.forEach((q, i) => { const d = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]); if (d < bd) { bd = d; bi_ = i; } }); return bi_ / (w.length - 1); }

/* ---------------- acute pancreatitis ---------------- */
const NOTFLUID = ['liver', 'spleen', 'stomach', 'duodenum', 'small_bowel', 'colon', 'kidney_left', 'kidney_right', 'aorta', 'inferior_vena_cava', 'portal_vein_and_splenic_vein', 'adrenal_gland_left', 'adrenal_gland_right', 'gallbladder'];
function collSites(A) {
  const pp = pancParts(A);
  return [[pp.body[0] - 2, pp.body[1] - 16, pp.body[2] + 4], [pp.tail[0] + 10, pp.tail[1] + 4, pp.tail[2] + 4]];
}
/**
 * o: { swell (scale), inflam 0..1, coll 0..2, nec 0..1, stage 'aguda' | 'encapsulada', gas }.
 * Order: enlarge the gland → necrosis (does not enhance) → oedema (hypodense, homogeneous) → fat stranding → collections.
 */
function pancreatitis(A, o, ph) {
  const out = [], id = A.id(PAN), bb = A.s(PAN).bbox, pad = 22, [Z, Y, X] = A.dims;
  const big = rbox([Math.max(0, bb[0] - pad), Math.min(Z - 1, bb[1] + pad), Math.max(0, bb[2] - pad), Math.min(Y - 1, bb[3] + pad), Math.max(0, bb[4] - pad), Math.min(X - 1, bb[5] + pad)]);
  if (o.swell > 1) out.push({ t: 'dilate', s: PAN, scale: o.swell });
  if (o.nec > 0) {
    const q = quantile(A, PAN, o.nec);
    out.push({ t: 'cols', box: big, label: 'lesion', fn: (z, y, x, cur) => (cur.lab === id && noiseField(z, y, x) < q ? { hu: pv(H.nec, ph) + 4 * NZ(x * 0.5, y * 0.5, z * 0.5), mr: { t1: 0.25, t2: 0.8, stir: 0.8 } } : null) });
  }
  out.push({ t: 'fill', s: PAN, delta: o.swell > 1 ? -9 : 0, texture: 3, label: 'lesion', mr: { t1: 0.35, t2: 0.62, stir: 0.6 } });
  if (o.inflam > 0) out.push({ t: 'cols', box: big, label: 'lesion', fn: (z, y, x, cur) => {
    if (cur.orig !== 0 || cur.hu > -40) return null;
    const d = outD(A, z, y, x), reach = 6 + 12 * o.inflam * (0.6 + 0.4 * NZ(x * 0.1, y * 0.1, z * 0.1));
    if (d <= 0 || d > reach) return null;
    const n = NZ2(x * 0.35, y * 0.35, z * 0.35);
    return n > -0.15 ? { hu: -55 + 60 * (1 - d / reach) + 15 * n, mr: { t1: 0.5, t2: 0.7, stir: 0.75 } } : null;
  } });
  const S = collSites(A);
  for (let i = 0; i < Math.min(2, o.coll); i++) {
    const c = S[i], enc = o.stage === 'encapsulada', r = i === 0 ? [16, 13, 26] : [14, 12, 20], rv = 2.6 / A.sp[0];
    out.push(sphere(A, c, r, (d, z, y, x, cur) => {
      if (!enc && cur.hu > -30 && cur.lab !== LESION_ID) return null;
      if (enc && (1 - d) * Math.min(...r) / A.sp[0] < rv) return { hu: pv(H.pseudoWall, ph), mr: MR.wall };
      if (o.gas && d < 0.55 && NZ(x * 0.6, y * 0.6, z * 0.6) > 0.25) return { hu: -800, mr: MR.gas };
      return { hu: 14 + 5 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: MR.fluid };
    }, { within: [0, 'lesion'], irregular: enc ? 0.05 : 0.5 }));
    out.push(lm(c, enc ? (o.nec > 0 ? 'Colección encapsulada (pseudoquiste / necrosis encapsulada)' : 'Pseudoquiste') : 'Colección líquida', enc ? (o.nec > 0 ? 'Encapsulated collection (pseudocyst / walled-off necrosis)' : 'Pseudocyst') : 'Fluid collection', { dx: i ? 60 : -170, dy: i ? 40 : -50 }));
  }
  return out;
}
const BALT = { A: 0, B: 1, C: 2, D: 3, E: 4 };
function balthazar(o) {
  const g = o.coll >= 2 || (o.coll >= 1 && o.gas) ? 'E' : o.coll === 1 ? 'D' : o.inflam > 0 ? 'C' : o.swell > 1 ? 'B' : 'A';
  const np = o.nec <= 0 ? 0 : o.nec < 0.3 ? 2 : o.nec <= 0.5 ? 4 : 6;
  return { g, gp: BALT[g], np, ctsi: BALT[g] + np };
}
function paReadouts(o, ph) {
  const b = balthazar(o), sev = b.ctsi >= 7 ? bi('grave', 'severe') : b.ctsi >= 4 ? bi('moderada', 'moderate') : bi('leve', 'mild');
  return [
    { label: bi('Balthazar (TC)', 'Balthazar (CT)'), value: bi(`Grado ${b.g} = ${b.gp} puntos${b.gp >= 4 ? ' (≥ 4 = grave según el temario)' : ''}`, `Grade ${b.g} = ${b.gp} points${b.gp >= 4 ? ' (≥ 4 = severe per the syllabus)' : ''}`) },
    { label: bi('Índice de gravedad TC (ampliación)', 'CT severity index (beyond syllabus)'), value: bi(`${b.gp} + necrosis ${b.np} = ${b.ctsi}/10 → ${sev.es}`, `${b.gp} + necrosis ${b.np} = ${b.ctsi}/10 → ${sev.en}`) },
    { label: bi('Atlanta modificada', 'Revised Atlanta'), value: o.nec > 0 ? bi('Necrotizante → PA grave', 'Necrotising → severe AP') : bi('Edematosa intersticial → PA leve', 'Interstitial oedematous → mild AP') },
    ph === 'sin' ? { label: bi('Sin contraste', 'Unenhanced'), value: bi('La necrosis no se distingue: hace falta contraste dinámico', 'Necrosis cannot be told apart: dynamic contrast is needed') } : contrastRO(o.nec > 0 ? pv(H.nec, ph) : BG.pancreas[ph] - (o.swell > 1 ? 9 : 0), ph, 'pancreas'),
  ];
}
const PA_TECH = () => [
  PT.ct('best', 'Extensión y gravedad, no antes de 48–72 h y no siempre; con contraste dinámico (80–100 cc a 3 ml/s): si el páncreas no capta → necrosis.', 'Extent and severity, not before 48–72 h and not always; dynamic contrast (80–100 mL at 3 mL/s): if the pancreas does not enhance → necrosis.'),
  PT.eco('ok', 'Para ver si la causa es biliar (colelitiasis, coledocolitiasis), edema glandular, colecciones y guía de punción. No es de elección.', 'To see whether the cause is biliary (gallstones, duct stones), gland oedema, collections and to guide aspiration. Not the test of choice.'),
];
const PA_FLAGS = [
  flag('apuntes', 'Según el temario, los criterios de Ranson y de Atlanta no hay que saberlos en detalle; sí importan Balthazar ≥ 4 y la diferencia edematosa / necrotizante.', 'Per the syllabus, Ranson and Atlanta criteria need not be known in detail; Balthazar ≥ 4 and the oedematous / necrotising difference do matter.'),
  flag('revisar', '«Balthazar ≥ 4 = grave» es ambiguo: el grado E de Balthazar vale 4 puntos, pero la gravedad se mide con el índice de gravedad TC (grado + necrosis, 0–10), donde 7–10 es grave y 4–6 moderada.', '"Balthazar ≥ 4 = severe" is ambiguous: Balthazar grade E scores 4 points, but severity is measured with the CT severity index (grade + necrosis, 0–10), where 7–10 is severe and 4–6 moderate.'),
  flag('revisar', 'El temario pone «Ranson > 3» como indicación de TC; el corte clásico de pancreatitis grave es Ranson ≥ 3 criterios.', 'The syllabus gives "Ranson > 3" as a CT indication; the classic cut-off for severe pancreatitis is Ranson ≥ 3 criteria.'),
];

/* ================= entities ================= */
export const PANC = [
  {
    id: 'pancreas-tecnicas', group: 'panc-inf', tag: 'ct-real', extraTags: ['sim'], exam: false,
    name: bi('Páncreas: anatomía y técnicas', 'Pancreas: anatomy and techniques'), short: bi('Páncreas normal', 'Normal pancreas'),
    view: pview(atBody, 1.6), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'arterial',
    params: [{ id: 'calc', type: 'toggle', label: bi('Calcificaciones (por qué se hace primero en vacío)', 'Calcifications (why unenhanced comes first)'), value: false }],
    techniques: [PT.ct('best', 'La más usada. Con contraste y estudio dinámico; siempre primero en vacío para ver calcificaciones.', 'The most used. Contrast and dynamic study; always unenhanced first to see calcifications.'),
      PT.eco('ok', 'Se ve con dificultad (retroperitoneal, gas). Sirve sobre todo para buscar colelitiasis como causa. En delgados se ven cabeza, cuerpo y cola. El páncreas tiene grasa → blanco en eco.', 'Seen with difficulty (retroperitoneal, gas). Mainly to look for gallstones as the cause. In thin patients head, body and tail are seen. The pancreas contains fat → bright on US.'),
      PT.rm('ok', 'Complemento del TC para caracterizar lesiones.', 'Complement to CT to characterise lesions.'),
      tq('ecoc', 'ct', 'bad', bi('Eco con contraste', 'Contrast ultrasound'), bi('No se usa eco con contraste en el páncreas.', 'Contrast ultrasound is not used for the pancreas.'), { window: 'soft' })],
    build: (p, A) => {
      const pp = pancParts(A), T = tree(A), out = [{ t: 'fill', s: PAN, delta: 0, label: 'keep' }];
      if (p.calc) out.push(calcs(A, 0.55));
      out.push(lm(pp.head, 'Cabeza (en el marco duodenal)', 'Head (in the duodenal C-loop)', { dx: -170, dy: 30 }), lm([pp.head[0] - 8, pp.head[1] - 4, pp.xh + 4], 'Cuello', 'Neck', { dx: 0, dy: -60 }),
        lm(pp.body, 'Cuerpo', 'Body', { dy: -60 }), lm(pp.tail, 'Cola (hacia el bazo)', 'Tail (towards the spleen)', { dx: 60, dy: 30 }), lm(T.pap, 'Duodeno (D2)', 'Duodenum (D2)', { dx: -170, dy: -30 }));
      return out;
    },
    readouts: (p, A, env) => [{ label: bi('Páncreas (simulado)', 'Pancreas (simulated)'), value: `${BG.pancreas[env.phase]} HU` }, ecoRO('Ecogénico (tiene grasa); difícil por el gas', 'Echogenic (contains fat); hard because of gas')],
    info: {
      where: bi('Detrás del estómago, entre el bazo y el duodeno; retroperitoneal. Partes: cabeza, cuello, cuerpo y cola. La cabeza está en la concavidad del duodeno (sus tres porciones).', 'Behind the stomach, between the spleen and the duodenum; retroperitoneal. Parts: head, neck, body and tail. The head sits in the duodenal concavity (its three parts).'),
      see: bi('<b>TC</b>: la más usada, dinámica y siempre primero en vacío · <b>eco</b>: con dificultad, busca la causa biliar · <b>RM</b>: complemento para caracterizar.', '<b>CT</b>: most used, dynamic and always unenhanced first · <b>US</b>: difficult, looks for a biliary cause · <b>MR</b>: complement to characterise.'),
      tip: bi('Mueve la fase: el páncreas capta mucho en la fase pancreática (arterial) y menos en la portal.', 'Move the phase: the pancreas enhances strongly in the pancreatic (arterial) phase and less in the portal one.'),
    },
    flags: [flag('ampliacion', 'La «fase pancreática» (~40 s, arterial tardía) es la de mayor realce del páncreas; el temario solo dice «estudio dinámico».', 'The "pancreatic phase" (~40 s, late arterial) is when the pancreas enhances most; the syllabus only says "dynamic study".')],
  },
  {
    id: 'pa-edematosa', group: 'panc-inf', tag: 'ct-real', name: bi('Pancreatitis aguda edematosa intersticial', 'Acute interstitial oedematous pancreatitis'), short: bi('PA edematosa', 'Oedematous AP'),
    view: pview(atBody, 1.7), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [{ id: 'swell', type: 'toggle', label: bi('Glándula aumentada (edema)', 'Enlarged gland (oedema)'), value: true },
      { id: 'inflam', type: 'toggle', label: bi('Inflamación peripancreática (grasa desflecada)', 'Peripancreatic inflammation (stranded fat)'), value: true },
      { id: 'coll', type: 'range', label: bi('Colecciones líquidas', 'Fluid collections'), min: 0, max: 2, step: 1, value: 0 }],
    techniques: PA_TECH(),
    compare: ['pa-necrotizante', 'pc-cronica'],
    build: (p, A, env) => { const o = paO(p, false), out = pancreatitis(A, o, env.phase); out.push(lm(pancParts(A).body, 'Capta homogéneo · contornos desflecados', 'Homogeneous enhancement · frayed outline', { dx: 40, dy: -70 })); return out; },
    readouts: (p, A, env) => paReadouts(paO(p, false), env.phase),
    info: {
      where: bi('Muy frecuente. Dolor abdominal + lipasa y amilasa > 3 veces lo normal. Causas: litiasis biliar o alcohol. Se libera lipasa y el tripsinógeno pasa a tripsina fuera del duodeno → inflamación y autodigestión.', 'Very common. Abdominal pain + lipase and amylase > 3 times normal. Causes: gallstones or alcohol. Lipase is released and trypsinogen becomes trypsin outside the duodenum → inflammation and autodigestion.'),
      see: bi('Glándula <b>aumentada por edema</b> (difuso o focal), <b>captación homogénea</b>, hipodensidad, <b>contornos desflecados</b>, ↑ densidad de la grasa peripancreática → <b>PA leve</b>.', 'Gland <b>enlarged by oedema</b> (diffuse or focal), <b>homogeneous enhancement</b>, hypodensity, <b>frayed outline</b>, ↑ density of peripancreatic fat → <b>mild AP</b>.'),
      technique: bi('Normalmente no hace falta imagen. Eco: ¿causa biliar? TC no antes de 48–72 h, solo si: dudas diagnósticas, clínica grave (fiebre, distensión, leucocitosis), Ranson > 3 o empeoramiento de una PA leve.', 'Imaging is usually not needed. US: biliary cause? CT not before 48–72 h, only if: diagnostic doubt, severe illness (fever, distension, leucocytosis), Ranson > 3 or a mild AP getting worse.'),
      differential: bi('Necrotizante (zonas que no captan), adenocarcinoma (masa focal hipocaptante).', 'Necrotising (non-enhancing areas), adenocarcinoma (focal hypoenhancing mass).'),
      tip: bi('Sube las colecciones a 1 y a 2: Balthazar D y E.', 'Raise collections to 1 and 2: Balthazar D and E.'),
    },
    diagram: balthazarDiagram,
    flags: [...PA_FLAGS, flag('ampliacion', 'Escala de Balthazar (A–E) y puntos de necrosis completos: el temario solo da el corte ≥ 4.', 'Full Balthazar scale (A–E) and necrosis points: the syllabus only gives the ≥ 4 cut-off.')],
  },
  {
    id: 'pa-necrotizante', group: 'panc-inf', tag: 'ct-real', name: bi('Pancreatitis aguda necrotizante', 'Acute necrotising pancreatitis'), short: bi('PA necrotizante', 'Necrotising AP'),
    view: pview(atBody, 1.6), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [{ id: 'nec', type: 'range', label: bi('Necrosis', 'Necrosis'), min: 10, max: 80, step: 10, value: 40, unit: '%' },
      { id: 'coll', type: 'range', label: bi('Colecciones', 'Collections'), min: 0, max: 2, step: 1, value: 1 },
      { id: 'stage', type: 'select', label: bi('Evolución', 'Course'), options: [opt('aguda', 'Fase temprana (colección libre)', 'Early phase (free collection)'), opt('encapsulada', 'Tardía, ≥ 4 semanas (encapsulada)', 'Late, ≥ 4 weeks (encapsulated)')], value: 'aguda' },
      { id: 'gas', type: 'toggle', label: bi('Gas en la colección', 'Gas in the collection'), value: false }],
    techniques: PA_TECH(),
    compare: ['pa-edematosa'],
    build: (p, A, env) => {
      const o = paO(p, true), out = pancreatitis(A, o, env.phase), q = quantile(A, PAN, o.nec), id = A.id(PAN), b = A.s(PAN).bbox;
      let c = pancParts(A).body; for (let z = b[0]; z <= b[1] && c === pancParts(A).body; z += 3) for (let y = b[2]; y <= b[3]; y += 3) for (let x = b[4]; x <= b[5]; x += 3) if (A.at(z, y, x) === id && noiseField(z, y, x) < q * 1.1 && depth(A, PAN, z, y, x) > 4) { c = [z, y, x]; break; }
      out.push(lm(c, env.phase === 'sin' ? 'Necrosis: no se ve sin contraste' : 'No capta = necrosis', env.phase === 'sin' ? 'Necrosis: invisible unenhanced' : 'No enhancement = necrosis', { dx: 40, dy: -70 }));
      return out;
    },
    readouts: (p, A, env) => paReadouts(paO(p, true), env.phase),
    info: {
      where: bi('Afecta al páncreas y a los tejidos peripancreáticos. Se gradúa clínica (Ranson, a las 72 h) y radiológicamente (Balthazar, TC) → clasificación de Atlanta.', 'Involves the pancreas and peripancreatic tissues. Graded clinically (Ranson, at 72 h) and radiologically (Balthazar, CT) → Atlanta classification.'),
      see: bi('<b>Áreas hipodensas que no realzan</b> (necrosis); se pierde la morfología y se sustituye por inflamación → <b>PA grave</b>. Las colecciones suelen encapsularse → <b>pseudoquistes</b>. Extrapancreáticas: ascitis, derrame pleural, duodeno, bazo.', '<b>Hypodense non-enhancing areas</b> (necrosis); the shape is lost and replaced by inflammation → <b>severe AP</b>. Collections tend to wall off → <b>pseudocysts</b>. Outside the pancreas: ascites, pleural effusion, duodenum, spleen.'),
      technique: bi('TC con contraste dinámico (método de elección en las graves), no antes de 48–72 h. Atlanta: fases temprana (1.ª semana) y tardía; severidad leve (alta en la 1.ª semana), moderada (fallo orgánico transitorio), severa (persistente).', 'Dynamic contrast CT (method of choice in severe cases), not before 48–72 h. Atlanta: early (1st week) and late phases; severity mild (discharged in the 1st week), moderate (transient organ failure), severe (persistent).'),
      differential: bi('Edematosa (capta todo), absceso / necrosis infectada (gas).', 'Oedematous (all enhances), abscess / infected necrosis (gas).'),
      tip: bi('Pon la fase basal: la necrosis desaparece. Por eso el TC de la pancreatitis es con contraste dinámico.', 'Switch to unenhanced: the necrosis disappears. That is why pancreatitis CT is dynamic contrast.'),
    },
    diagram: balthazarDiagram,
    flags: [...PA_FLAGS,
      flag('revisar', 'Con Atlanta revisada (2012) el «pseudoquiste» es la colección encapsulada de la PA edematosa (≥ 4 semanas, solo líquido); en la necrotizante la colección encapsulada se llama necrosis encapsulada (WON).', 'With revised Atlanta (2012) a "pseudocyst" is the walled-off collection of oedematous AP (≥ 4 weeks, fluid only); in necrotising AP the walled-off collection is called walled-off necrosis (WON).'),
      flag('ampliacion', 'La necrosis puede no verse en un TC precoz (< 72 h): es otra razón para no adelantarlo. El gas en una colección sugiere infección.', 'Necrosis may not show on an early CT (< 72 h): another reason not to bring it forward. Gas in a collection suggests infection.')],
  },
  {
    id: 'pc-cronica', group: 'panc-inf', tag: 'ct-real', name: bi('Pancreatitis crónica', 'Chronic pancreatitis'), short: bi('Pancreatitis crónica', 'Chronic pancreatitis'),
    view: pview(atBody, 1.7), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [{ id: 'atr', type: 'range', label: bi('Atrofia', 'Atrophy'), min: 0, max: 50, step: 10, value: 30, unit: '%' },
      { id: 'calc', type: 'toggle', label: bi('Calcificaciones', 'Calcifications'), value: true },
      { id: 'duct', type: 'toggle', label: bi('Cambios ductales (canalículos accesorios)', 'Ductal changes (side branches)'), value: true }],
    techniques: [PT.ct('best', 'Atrofia, calcificaciones y cambios ductales.', 'Atrophy, calcifications and ductal changes.'), PT.rx('ok', 'Las calcificaciones se ven en la Rx simple.', 'Calcifications show on the plain film.'), PT.rm('ok', 'Atrofia con alteración del parénquima; se ven los canalículos accesorios del pancreático.', 'Atrophy with altered parenchyma; the side branches of the pancreatic duct are seen.')],
    compare: ['pa-edematosa', 'adenoca-pancreas'],
    build: (p, A) => {
      const out = [], sc = 1 - (p.atr / 100) * 0.7;
      if (sc < 1) out.push({ t: 'dilate', s: PAN, scale: sc, fill: { hu: -85, label: 0 } });
      out.push({ t: 'fill', s: PAN, delta: -6, texture: 10, label: 'keep' });
      if (p.duct) {
        const w = tree(A).wirsung, r = w.map((q, i) => (i % 2 ? 1.6 : 3));
        out.push({ t: 'tube', pts: w, r, hu: 10, label: 'lesion', mr: BILE, within: [PAN, 'lesion'] });
        for (let i = 2; i < w.length - 1; i += 2) { const q = w[i], s = i % 4 ? 1 : -1; out.push({ t: 'tube', pts: [q, [q[0] + 2 * s, q[1] - 6, q[2] + 2], [q[0] + 3 * s, q[1] - 9, q[2] + 5]], r: 1, hu: 10, label: 'lesion', mr: BILE, within: [PAN, 'lesion'] }); }
      }
      if (p.calc) out.push(calcs(A, 0.5));
      out.push(lm(pancParts(A).body, 'Atrofia + calcificaciones', 'Atrophy + calcifications', { dx: 40, dy: -70 }));
      return out;
    },
    readouts: p => [{ label: bi('Hallazgos (simulados)', 'Findings (simulated)'), value: bi([p.atr && `atrofia ${p.atr} %`, p.calc && 'calcificaciones', p.duct && 'conducto dilatado arrosariado con canalículos visibles'].filter(Boolean).join(' · ') || '—', [p.atr && `atrophy ${p.atr} %`, p.calc && 'calcifications', p.duct && 'beaded dilated duct with visible side branches'].filter(Boolean).join(' · ') || '—') }],
    info: {
      where: bi('Proceso inflamatorio progresivo e irreversible. FR: abuso de alcohol y pancreatitis agudas de repetición por este.', 'Progressive, irreversible inflammation. Risk factors: alcohol abuse and the repeated acute pancreatitis it causes.'),
      see: bi('El páncreas acaba <b>atrofiándose y calcificándose</b> (calcificaciones en Rx simple y TC). TC y RM: atrofia con alteración de la estructura; <b>cambios ductales</b>: se ven los canalículos accesorios del pancreático, que normalmente no se ven.', 'The pancreas ends up <b>atrophic and calcified</b> (calcifications on plain film and CT). CT and MR: atrophy with altered structure; <b>ductal changes</b>: the side branches of the pancreatic duct become visible, which normally are not.'),
      technique: bi('Rx simple, TC, RM.', 'Plain film, CT, MR.'),
      differential: bi('Adenocarcinoma (masa hipocaptante que dilata el conducto; la PC alcohólica multiplica ×15 su incidencia).', 'Adenocarcinoma (hypoenhancing mass dilating the duct; alcoholic CP raises its incidence ×15).'),
      tip: bi('Cambia a Rx simple: las calcificaciones se proyectan sobre L1–L2.', 'Switch to the plain film: the calcifications project over L1–L2.'),
    },
    flags: [flag('ampliacion', 'El conducto «arrosariado» (dilataciones y estenosis alternas) es el aspecto clásico; el temario solo dice «cambios ductales».', 'The "chain of lakes" duct (alternating dilatation and stricture) is the classic look; the syllabus only says "ductal changes".')],
  },

  /* ================= tumours ================= */
  {
    id: 'adenoca-pancreas', group: 'panc-tum', tag: 'ct-real', name: bi('Adenocarcinoma de páncreas', 'Pancreatic adenocarcinoma'), short: bi('Adenocarcinoma de páncreas', 'Pancreatic adenocarcinoma'),
    view: pview(atLoc, 2), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'arterial',
    params: [locP('cabeza'), { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 15, max: 45, step: 5, value: 30, unit: 'mm' },
      { id: 'mets', type: 'toggle', label: bi('Metástasis hepáticas (debut tardío)', 'Liver metastases (late presentation)'), value: false }],
    techniques: [PT.ct('best', 'De elección para diagnóstico y estadiaje. Con contraste en dos fases (vascularización arterial y venosa).', 'Of choice for diagnosis and staging. Contrast in two phases (arterial and venous vascularisation).'),
      PT.eco('ok', '1.ª ante ictericia: dilatación de la vía intrahepática, porque el tumor de cabeza obstruye conducto pancreático y colédoco.', '1st for jaundice: dilated intrahepatic ducts, because a head tumour blocks the pancreatic duct and common duct.'),
      PT.rm('ok', 'Masa hipointensa en T1, hipovascular.', 'T1-hypointense, hypovascular mass.', 't1')],
    compare: ['neuroendocrino', 'pc-cronica'],
    build: (p, A, env) => {
      const c = pancSite(A, p.loc), r = p.size / 2, f = ductFrac(A, c), out = [];
      if (p.loc === 'cabeza') {
        out.push(...ductTubes(A, { ih: 2.6, chd: 5, cbd: 5, cbdTo: 0.7, cystic: 1.8 }, { hu: 8 }), { t: 'dilate', s: GB, scale: 1.18, label: GB });
        out.push(lm(tree(A).chd[1], 'Vía biliar dilatada', 'Dilated bile ducts', { dx: -170, dy: -40, planes: ['axial'] }));
      }
      if (p.loc !== 'cola') { const w = wirsung(A, 3, f, 1); if (w) out.push(w); }
      out.push(sphere(A, c, r, (d, z, y, x) => ({ hu: pv(H.adeno, env.phase) + 6 * NZ2(x * 0.35, y * 0.35, z * 0.35), mr: MR.solidHypoT1 }), { within: [PAN, 0, 'lesion'], outside: [DUO, PV, 'aorta', IVC], irregular: 0.4 }));
      if (p.mets) for (const m of liverPoints(A, 3, 12, 7)) out.push(...L.meta(A, m, 9, env.phase));
      out.push(lm(c, 'Masa hipodensa e hipocaptante', 'Hypodense, hypoenhancing mass'));
      if (p.loc !== 'cola') out.push(lm(tree(A).wirsung[Math.min(tree(A).wirsung.length - 2, Math.round(f * (tree(A).wirsung.length - 1)) + 3)], 'Conducto pancreático dilatado', 'Dilated pancreatic duct', { dx: 60, dy: 50 }));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(H.adeno, env.phase), env.phase, 'pancreas'), { label: bi('Clínica', 'Presentation'), value: p.loc === 'cabeza' ? bi('Ictericia indolora (cabeza: 65 %); pérdida de peso; debuta tarde', 'Painless jaundice (head: 65 %); weight loss; presents late') : bi('Muy anodina: pérdida de peso, alteraciones del humor; sin ictericia', 'Very vague: weight loss, mood changes; no jaundice') },
      ecoRO(p.loc === 'cabeza' ? 'Dilatación de la vía intrahepática (y del colédoco)' : 'A menudo no se ve (gas)', p.loc === 'cabeza' ? 'Dilated intrahepatic ducts (and common duct)' : 'Often not seen (gas)')],
    info: {
      where: bi('Neoplasia maligna primaria del páncreas más frecuente (90 %) y 2.ª neoplasia maligna gastrointestinal. <b>65 % en la cabeza</b>. FR (temario): alcohol (la PC alcohólica ×15) y pancreatitis aguda.', 'Commonest primary malignant pancreatic tumour (90 %) and 2nd gastrointestinal malignancy. <b>65 % in the head</b>. Risk factors (syllabus): alcohol (alcoholic CP ×15) and acute pancreatitis.'),
      see: bi('TC/RM: <b>masa hipodensa</b> / hipointensa en T1, <b>hipovascular e hipocaptante</b>. Suele <b>dilatar el conducto pancreático principal</b>, a menudo el único hallazgo → si hay dilatación del conducto, seguir buscando.', 'CT/MR: <b>hypodense</b> / T1-hypointense, <b>hypovascular, hypoenhancing mass</b>. It usually <b>dilates the main pancreatic duct</b>, often the only finding → if the duct is dilated, keep looking.'),
      technique: bi('1) Eco ante ictericia. 2) TC de elección (dos fases).', '1) US for jaundice. 2) CT of choice (two phases).'),
      differential: bi('Neuroendocrino (hipervascular, sí capta), pancreatitis crónica focal, colangiocarcinoma distal.', 'Neuroendocrine tumour (hypervascular, does enhance), focal chronic pancreatitis, distal cholangiocarcinoma.'),
      tip: bi('En fase pancreática (arterial) el contraste con el páncreas sano es máximo.', 'In the pancreatic (arterial) phase the contrast with the healthy pancreas is greatest.'),
    },
    flags: [
      flag('revisar', 'El temario da el alcohol como FR más importante. En la práctica el principal FR modificable es el tabaco; el alcohol actúa sobre todo a través de la pancreatitis crónica.', 'The syllabus gives alcohol as the main risk factor. In practice the main modifiable risk factor is smoking; alcohol acts mainly through chronic pancreatitis.'),
      flag('ampliacion', 'Signo del doble conducto (colédoco + Wirsung dilatados) y vesícula distendida (Courvoisier) en el tumor de cabeza; la resecabilidad depende del contacto con arteria mesentérica superior, tronco celíaco y eje mesentérico-portal.', 'Double-duct sign (dilated common and pancreatic ducts) and distended gallbladder (Courvoisier) with a head tumour; resectability depends on contact with the superior mesenteric artery, coeliac trunk and mesenteric-portal axis.')],
  },
  {
    id: 'neuroendocrino', group: 'panc-tum', tag: 'ct-real', name: bi('Tumor neuroendocrino de páncreas', 'Pancreatic neuroendocrine tumour'), short: bi('Neuroendocrino', 'Neuroendocrine tumour'),
    view: pview(atLoc, 2.2), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'arterial',
    params: [locP('cuerpo'), { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 10, max: 30, step: 5, value: 15, unit: 'mm' }],
    techniques: [PT.ct('best', 'Hipervasculares / hiperdensos: sí captan, sobre todo en fase arterial (pancreática).', 'Hypervascular / hyperdense: they do enhance, mainly in the arterial (pancreatic) phase.'), tq('ct-sin', 'ct', 'bad', bi('TC sin contraste', 'Unenhanced CT'), bi('Isodenso: no se ve.', 'Isodense: not seen.'), { window: 'soft', phase: 'sin' })],
    compare: ['adenoca-pancreas'],
    build: (p, A, env) => { const c = pancSite(A, p.loc); return [sphere(A, c, p.size / 2, (d, z, y, x) => ({ hu: pv(H.net, env.phase) + 4 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: { t1: 0.3, t2: 0.75, stir: 0.7 } }), { within: [PAN, 'lesion'], irregular: 0.05 }), lm(c, env.phase === 'arterial' ? 'Nódulo hipervascular' : env.phase === 'sin' ? 'Isodenso sin contraste' : 'Sigue captando', env.phase === 'arterial' ? 'Hypervascular nodule' : env.phase === 'sin' ? 'Isodense unenhanced' : 'Still enhancing')]; },
    readouts: (p, A, env) => [contrastRO(pv(H.net, env.phase), env.phase, 'pancreas'), { label: bi('Función', 'Function'), value: bi('Temario: la mayoría funcionantes (secretan hormonas); el más frecuente, el insulinoma', 'Syllabus: most are functioning (secrete hormones); the commonest, insulinoma') }],
    info: {
      where: bi('Poco frecuentes. Secretan hormonas (funcionantes); el más frecuente, el insulinoma.', 'Uncommon. They secrete hormones (functioning); the commonest, insulinoma.'),
      see: bi('<b>Hipervasculares / hiperdensos: sí captan</b> (al contrario que el adenocarcinoma).', '<b>Hypervascular / hyperdense: they do enhance</b> (unlike adenocarcinoma).'),
      technique: bi('TC con contraste dinámico.', 'Dynamic contrast CT.'),
      differential: bi('Adenocarcinoma (hipocaptante), bazo accesorio intrapancreático, metástasis hipervascular (riñón).', 'Adenocarcinoma (hypoenhancing), intrapancreatic accessory spleen, hypervascular metastasis (kidney).'),
      tip: bi('Compáralo con el adenocarcinoma en la misma fase arterial: uno brilla y el otro queda oscuro.', 'Compare with adenocarcinoma in the same arterial phase: one is bright and the other dark.'),
    },
    flags: [flag('revisar', '«La mayoría funcionantes» está desfasado: hoy la mayoría (≈ 60–90 %) son no funcionantes, en buena parte hallazgos casuales; el insulinoma es el funcionante más frecuente.', '"Most are functioning" is outdated: today most (≈ 60–90 %) are non-functioning, many found incidentally; insulinoma is the commonest functioning one.')],
  },
  {
    id: 'seroso', group: 'panc-tum', tag: 'ct-real', name: bi('Tumor seroso quístico (cistoadenoma seroso)', 'Serous cystic tumour (serous cystadenoma)'), short: bi('Cistoadenoma seroso', 'Serous cystadenoma'),
    view: pview(atLoc, 2), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [locP('cabeza'), { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 25, max: 50, step: 5, value: 40, unit: 'mm' }],
    techniques: cysTech(),
    compare: ['mucinoso', 'tpmi'],
    build: (p, A, env) => {
      const c = pancSite(A, p.loc), sp = pv(H.septa, env.phase);
      return [sphere(A, c, p.size / 2, (d, z, y, x) => {
        if (d < 0.14) return { hu: d < 0.07 ? 260 : 70, mr: d < 0.07 ? MR.calc : MR.wall };
        const v = NZ(x * 0.5, y * 0.5, z * 0.5);
        return Math.abs(v) < 0.075 || d > 0.93 ? { hu: sp, mr: MR.wall } : { hu: 10, mr: MR.fluid };
      }, { within: [PAN, 0, 'lesion'], outside: [DUO, PV, IVC, 'aorta'], irregular: 0.15 }), lm(c, 'Múltiples quistes pequeños', 'Many small cysts')];
    },
    readouts: () => [{ label: bi('Comportamiento', 'Behaviour'), value: bi('Benigno', 'Benign') }],
    info: {
      where: bi('Los tumores quísticos suelen ser hallazgos casuales en TC hechos por otro motivo; se completa estudio con RM.', 'Cystic tumours are usually incidental findings on CT done for another reason; the work-up is completed with MR.'),
      see: bi('<b>Múltiples quistes pequeños</b> (microquístico, en panal). <b>Benigno</b>.', '<b>Many small cysts</b> (microcystic, honeycomb). <b>Benign</b>.'),
      technique: bi('TC (hallazgo) → RM.', 'CT (incidental) → MR.'),
      differential: bi('Mucinoso (quistes grandes, mujer), TPMI (comunica con el conducto).', 'Mucinous (large cysts, women), IPMN (communicates with the duct).'),
    },
    diagram: cysticDiagram,
    flags: [flag('ampliacion', 'La cicatriz central con calcificación en «estrella» es típica del seroso; el temario no la menciona.', 'The central scar with "sunburst" calcification is typical of serous tumours; the syllabus does not mention it.')],
  },
  {
    id: 'mucinoso', group: 'panc-tum', tag: 'ct-real', name: bi('Tumor mucinoso quístico', 'Mucinous cystic tumour'), short: bi('Mucinoso quístico', 'Mucinous cystic tumour'),
    view: pview(atLoc, 1.8), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [locP('cola'), { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 30, max: 70, step: 5, value: 50, unit: 'mm' }],
    techniques: cysTech(),
    compare: ['seroso', 'tpmi'],
    build: (p, A, env) => {
      const c = pancSite(A, p.loc), r = p.size / 2, rv = r / A.sp[0], wall = pv(H.cystWall, env.phase), w = 2.4 / A.sp[0];
      return [sphere(A, c, [r * 0.85, r * 0.8, r], (d, z, y, x) => {
        if ((1 - d) * rv * 0.8 < w) return { hu: wall, mr: MR.wall };
        if (Math.abs((x - c[2]) * 0.8 + (y - c[1]) * 0.6) < 1.1) return { hu: wall, mr: MR.wall };
        return { hu: 14, mr: MR.fluid };
      }, { within: [PAN, 0, 'lesion'], outside: ['stomach', 'spleen', 'kidney_left', 'colon', 'small_bowel', PV, 'aorta'], irregular: 0.06 }), lm(c, 'Quiste grande con pared y tabique', 'Large cyst with wall and septum')];
    },
    readouts: () => [{ label: bi('Comportamiento', 'Behaviour'), value: bi('Potencial maligno · típico de mujeres', 'Malignant potential · typical of women') }],
    info: {
      where: bi('Típico de mujeres. Suele ser hallazgo casual en TC; se completa con RM.', 'Typical of women. Usually incidental on CT; completed with MR.'),
      see: bi('<b>Quistes grandes</b> (macroquístico). <b>Potencial maligno</b>.', '<b>Large cysts</b> (macrocystic). <b>Malignant potential</b>.'),
      technique: bi('TC (hallazgo) → RM.', 'CT (incidental) → MR.'),
      differential: bi('Seroso (quistes pequeños, benigno), pseudoquiste (antecedente de pancreatitis).', 'Serous (small cysts, benign), pseudocyst (history of pancreatitis).'),
    },
    diagram: cysticDiagram,
    flags: [flag('ampliacion', 'Suele estar en cuerpo-cola y no comunica con el conducto pancreático; la pared gruesa, los nódulos murales o las calcificaciones periféricas sugieren malignidad.', 'It usually lies in the body-tail and does not communicate with the pancreatic duct; a thick wall, mural nodules or peripheral calcification suggest malignancy.')],
  },
  {
    id: 'tpmi', group: 'panc-tum', tag: 'ct-real', name: bi('Tumor papilar mucinoso intraductal (TPMI)', 'Intraductal papillary mucinous neoplasm (IPMN)'), short: bi('TPMI', 'IPMN'),
    view: pview(atLoc, 1.8), phases: PH3, phaseLabels: PHL_PAN, defaultPhase: 'portal',
    params: [locP('cabeza'), { id: 'tipo', type: 'select', label: bi('Tipo', 'Type'), options: [opt('ramas', 'De rama secundaria', 'Branch duct'), opt('principal', 'De conducto principal', 'Main duct'), opt('mixto', 'Mixto', 'Mixed')], value: 'ramas' }],
    techniques: cysTech(),
    compare: ['seroso', 'mucinoso'],
    build: (p, A, env) => {
      const c = pancSite(A, p.loc), f = ductFrac(A, c), w = tree(A).wirsung, out = [], wall = pv(H.cystWall, env.phase);
      const main = p.tipo !== 'ramas', wr = main ? w.map((q, i) => 3.6 + 0.8 * Math.sin(i)) : 1.4;
      out.push({ t: 'tube', pts: w, r: wr, hu: 10, label: 'lesion', mr: BILE, within: [PAN, 'lesion'] });
      if (p.tipo !== 'principal') {
        const q = w[Math.round(f * (w.length - 1))];
        [[0, -9, -3, 7], [6, -6, 5, 6], [-5, -11, 6, 5], [3, -14, -2, 4.5]].forEach(([dz, dy, dx, r]) => {
          const cc = [q[0] + dz, q[1] + dy, q[2] + dx];
          out.push({ t: 'tube', pts: [q, cc], r: 1.2, hu: 10, label: 'lesion', mr: BILE, outside: [DUO, PV, IVC, 'aorta', 'stomach'] });
          out.push(sphere(A, cc, r, d => (d > 0.86 ? { hu: wall, mr: MR.wall } : { hu: 10, mr: MR.fluid }), { within: [PAN, 0, 'lesion'], outside: [DUO, PV, IVC, 'aorta', 'stomach'] }));
        });
        out.push(lm([q[0], q[1] - 10, q[2]], 'Quistes de rama que comunican con el conducto', 'Branch cysts communicating with the duct'));
      }
      if (main) out.push(lm(w[Math.min(w.length - 2, 4)], 'Conducto pancreático principal dilatado (mucina)', 'Dilated main pancreatic duct (mucin)', { dx: 60, dy: 50 }));
      return out;
    },
    readouts: p => [{ label: bi('Comportamiento', 'Behaviour'), value: bi('Potencial maligno' + (p.tipo !== 'ramas' ? ' (más alto si afecta al conducto principal)' : ''), 'Malignant potential' + (p.tipo !== 'ramas' ? ' (higher if the main duct is involved)' : '')) }],
    info: {
      where: bi('Tumor productor de mucina intraductal. Suele ser hallazgo casual en TC; se completa con RM.', 'Intraductal mucin-producing tumour. Usually incidental on CT; completed with MR.'),
      see: bi('Dilatación quística del conducto pancreático (principal y/o ramas) por mucina. <b>Potencial maligno</b>.', 'Cystic dilatation of the pancreatic duct (main and/or branches) by mucin. <b>Malignant potential</b>.'),
      technique: bi('TC (hallazgo) → RM (la colangio-RM muestra la comunicación con el conducto).', 'CT (incidental) → MR (MRCP shows the communication with the duct).'),
      differential: bi('Pancreatitis crónica (calcificaciones, atrofia), mucinoso (no comunica), seroso.', 'Chronic pancreatitis (calcifications, atrophy), mucinous (no communication), serous.'),
    },
    diagram: cysticDiagram,
    flags: [flag('ampliacion', 'El temario solo nombra el TPMI («potencial maligno»); los tipos (rama secundaria, principal, mixto), la comunicación con el conducto y el mayor riesgo del de conducto principal son ampliación.', 'The syllabus only names IPMN ("malignant potential"); the types (branch, main, mixed), the communication with the duct and the higher risk of main-duct IPMN are beyond it.')],
  },
];
function cysTech() {
  return [PT.ct('ok', 'Suelen ser hallazgos casuales en un TC hecho por otro motivo.', 'Usually incidental findings on a CT done for another reason.'), PT.rm('best', 'Se completa el estudio con RM: el líquido brilla en T2 y se ven tabiques y comunicación con el conducto.', 'The work-up is completed with MR: fluid is bright on T2 and septa and duct communication are seen.')];
}
function paO(p, nec) {
  return nec ? { swell: 1.15, inflam: 1, coll: p.coll, nec: p.nec / 100, stage: p.stage, gas: p.gas } : { swell: p.swell ? 1.25 : 1, inflam: p.inflam ? 0.7 : 0, coll: p.coll, nec: 0, stage: 'aguda', gas: false };
}
/** Scattered parenchymal / ductal calcifications in the (possibly atrophic) pancreas. */
function calcs(A, thr) {
  const id = A.id(PAN), b = A.s(PAN).bbox;
  return { t: 'cols', box: rbox(b), label: 'lesion', fn: (z, y, x, cur) => (cur.lab === id && NZ2(x * 0.7 + 3, y * 0.7, z * 0.7) > thr ? { hu: 680, mr: MR.calc } : null) };
}
export { clamp, LIV };
