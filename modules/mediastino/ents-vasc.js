// «Mediastino y pleura» — aorta torácica (aneurisma, síndrome aórtico agudo), arterias pulmonares (HTP, TEP) y neumomediastino.
import { aoSlice, aoLevels, aoPartAt, eqDiam, paTrunk, distOut, surfacePoint, wedge, effusion, noise3, vox, idsOf } from './geo.js';
import { rbox, bi, opt, tq, mark, flag, pv, T, HU, MR, LUNGS, SIDES } from './common.js';

const TL = { sin: 40, arterial: 330, portal: 240, tardia: 130 }, FL = { sin: 40, arterial: 165, portal: 190, tardia: 140 }, FLAP = { sin: 50, arterial: 75, portal: 75, tardia: 70 };
const IMH = { sin: 68, arterial: 48, portal: 48, tardia: 48 };
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const SEGS = [opt('asc', 'Aorta ascendente', 'Ascending aorta'), opt('desc', 'Aorta descendente', 'Descending aorta')];
const THR = { asc: [5, 6], desc: [4, 7] };

/* ---------------- geometry ---------------- */
function segGeom(A, seg) {
  const ck = 'seg:' + seg; if (A.cache.has(ck)) return A.cache.get(ck);
  const L = aoLevels(A), z0 = L.zSplit, z1 = seg === 'asc' ? L.zRoot - 6 : L.zHiatus, comps = new Map();
  for (let z = z0; z <= z1; z++) { const c = aoSlice(A, z)[seg]; if (c) comps.set(z, c); }
  const zc = Math.round(z0 + (z1 - z0) * (seg === 'asc' ? 0.45 : 0.55)), cc = comps.get(zc) || [...comps.values()][0];
  const g = { z0, z1, zc, comps, c: [zc, Math.round(cc.cy), Math.round(cc.cx)], d0: eqDiam(A, cc) };
  A.cache.set(ck, g); return g;
}
const BLOCK = A => idsOf(A, ['trachea', 'esophagus', 'spinal_cord', ...A.vertebraKeys()]);
/** Native calcified atheroma plates on the wall of one segment (always gives lesion voxels). */
function plaques(A, g, zr, thr = 0.45, skip) {
  return { t: 'cols', box: rbox(boxOf(A, g, zr, 1)), fn: (z, y, x) => { const c = g.comps.get(z); if (!c || (skip && skip(z)) || !c.has(y, x) || c.dist(y, x) > 1.1) return null; return noise3(z, y, x, 0.3, 11) > thr ? { hu: HU.calc, mr: MR.calc } : null; } };
}
function boxOf(A, g, zr, pad) {
  let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
  for (const [z, c] of g.comps) if (z >= zr[0] && z <= zr[1]) { y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); }
  return [zr[0], zr[1], y0 - pad, y1 + pad, x0 - pad, x1 + pad];
}
function aneurysm(A, p, env) {
  const g = segGeom(A, p.seg), D = p.diam * 10, lum = pv(HU.ao, env.phase), out = [], block = BLOCK(A); let skip = null;
  if (p.forma === 'fus') {
    const Lh = vox(A, 40), S = new Map(); let pad = 3;
    for (const [z, c] of g.comps) {
      const w = Math.abs(z - g.zc) < Lh ? Math.cos(Math.PI / 2 * (z - g.zc) / Lh) ** 2 : 0, d0 = eqDiam(A, c), Dz = Math.max(d0, D * w + d0 * (1 - w));
      S.set(z, [Dz / d0, (Dz - d0) / 2]); pad = Math.max(pad, Math.ceil(c.r * (Dz / d0 - 1)) + 3);
    }
    skip = z => S.has(z) && S.get(z)[0] > 1.02;
    const aoId = A.id('aorta');
    out.push({ t: 'cols', box: rbox(boxOf(A, g, [g.z0, g.z1], pad)), fn: (z, y, x, cur) => {
      const c = g.comps.get(z); if (!c || block.has(cur.orig)) return null;
      const [s, grow] = S.get(z); if (s <= 1.02) return null;
      const inO = c.has(y, x); if (cur.orig === aoId && !inO) return null;          // the other aortic segment
      const r = Math.hypot(y - c.cy, x - c.cx) * A.sp[1], Rz = c.r * A.sp[1] * s;
      if (r > Rz + 0.75) return null;
      if (r > Rz - 1.8) return { hu: p.placas && noise3(z, y, x, 0.3, 11) > 0.3 ? HU.calc : 50, mr: MR.calc };
      if (p.trombo && r > Rz - 1.8 - grow * 0.75) return { hu: HU.thrombus, mr: MR.soft };
      return { hu: lum + Math.round(6 * noise3(z, y, x, 0.5, 3)), label: inO ? 'keep' : 'lesion', mr: MR.calc };
    } });
  } else {
    const c = g.comps.get(g.zc), dir = p.seg === 'asc' ? [-0.72, -0.69] : [0.05, 1], Rs = Math.max(4, (D - g.d0) / 1.5), Rv = Rs / A.sp[0];
    const cen = [g.zc, c.cy + dir[0] * (c.r + Rv * 0.45), c.cx + dir[1] * (c.r + Rv * 0.45)];
    out.push({ t: 'blob', c: cen, r: [Rs * 1.1, Rs, Rs], hu: lum, rim: { w: 1.6, hu: p.placas ? 600 : 50 }, edge: 0.5, outside: ['trachea', 'esophagus', 'spinal_cord', ...A.vertebraKeys()], label: 'lesion', mr: MR.calc });
    if (p.trombo) out.push({ t: 'blob', c: [cen[0], cen[1] + dir[0] * Rv * 0.4, cen[2] + dir[1] * Rv * 0.4], r: Rs * 0.6, hu: HU.thrombus, within: ['lesion'], label: 'lesion' });
  }
  if (p.placas) out.push(plaques(A, g, [g.z0, g.z1], 0.45, skip));
  out.push(mark(g.c, p.forma === 'fus' ? 'Aneurisma fusiforme' : 'Aneurisma sacular', p.forma === 'fus' ? 'Fusiform aneurysm' : 'Saccular aneurysm', { dx: 80, dy: -40 }));
  return out;
}

/* pulmonary arteries: estimated centreline (no mask) */
function paGeom(A) {
  if (A.cache.has('paG')) return A.cache.get('paG');
  const t = paTrunk(A), L = aoLevels(A), c = t ? t.c : [L.zSplit + 14, 87, 157];
  const rvot = [c[0] + 14, c[1] - 8, c[2] + 1], bif = [c[0] - 7, c[1] + 13, c[2] - 3];
  const asc = aoSlice(A, bif[0]).asc || aoSlice(A, bif[0] + 3).asc;
  const rh = [bif[0] + 5, asc ? asc.cy + asc.r + 7 : bif[1] + 4, asc ? asc.cx - asc.r - 15 : bif[2] - 40], lh = [bif[0] - 1, bif[1] + 13, bif[2] + 24];
  const g = { mid: c, rvot, bif, rpa: [bif, [bif[0] + 2, rh[1] - 1, (bif[2] + rh[2]) / 2], rh], lpa: [bif, [bif[0] - 3, bif[1] + 7, bif[2] + 12], lh] };
  for (const k of ['rvot', 'bif']) g[k] = g[k].map(Math.round);
  g.rpa = g.rpa.map(q => q.map(Math.round)); g.lpa = g.lpa.map(q => q.map(Math.round));
  A.cache.set('paG', g); return g;
}
const PA_OUT = A => ['aorta', 'trachea', 'superior_vena_cava', 'esophagus', 'sternum', 'costal_cartilages', ...A.vertebraKeys()];
function paTubes(A, D, hu, label) {
  const g = paGeom(A), rT = D / 2, rB = rT * 0.62;
  return [{ t: 'tube', pts: [g.rvot, g.mid, g.bif], r: rT, hu, outside: PA_OUT(A), label, mr: MR.calc },
    { t: 'tube', pts: g.rpa, r: [rB, rB * 0.92, rB * 0.8], hu, outside: PA_OUT(A), label, mr: MR.calc },
    { t: 'tube', pts: g.lpa, r: [rB, rB * 0.92, rB * 0.8], hu, outside: PA_OUT(A), label, mr: MR.calc }];
}

/* ---------------- diagram ---------------- */
export function stanfordDiagram(lang) {
  const t = lang === 'en' ? ['Type A', 'Type B', 'involves the ascending', 'spares the ascending', 'urgent surgery', 'medical → endovascular if complicated'] : ['Tipo A', 'Tipo B', 'afecta a la ascendente', 'no afecta a la ascendente', 'cirugía urgente', 'médico → endovascular si se complica'];
  const ao = (x, hiA, hiB) => `<g transform="translate(${x},0)"><path d="M40 120 L40 52 Q40 22 70 22 Q100 22 100 52 L100 150" class="db" fill="none" stroke-width="14"/>` +
    (hiA ? '<path d="M40 120 L40 52 Q40 22 70 22" class="dh" fill="none" stroke-width="6"/>' : '') + (hiB ? '<path d="M100 60 L100 150" class="dh" fill="none" stroke-width="6"/>' : '') + '</g>';
  return `<svg viewBox="0 0 320 200" class="dsvg" role="img" aria-label="Stanford A / B">${ao(10, true, true)}${ao(170, false, true)}
  <text x="80" y="170" class="dt">${t[0]}</text><text x="80" y="182" class="dt2">${t[2]}</text><text x="80" y="194" class="dt2">${t[4]}</text>
  <text x="240" y="170" class="dt">${t[1]}</text><text x="240" y="182" class="dt2">${t[3]}</text><text x="240" y="194" class="dt2">${t[5]}</text></svg>`;
}

/* ---------------- entities ---------------- */
export const VASC = [
  {
    id: 'aneurisma', group: 'aorta', tag: 'ct-real',
    name: bi('Aneurisma de aorta torácica', 'Thoracic aortic aneurysm'), short: bi('Aneurisma aórtico', 'Aortic aneurysm'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => segGeom(A, p.seg).c, examPlane: 'axial' },
    phases: ['sin', 'arterial', 'portal'],
    params: [
      { id: 'seg', type: 'select', label: bi('Segmento', 'Segment'), options: SEGS, value: 'asc', recentre: true },
      { id: 'diam', type: 'range', label: bi('Diámetro máximo', 'Maximum diameter'), min: 3, max: 8, step: 0.1, value: 5.3, unit: 'cm', examMin: 5 },
      { id: 'forma', type: 'select', label: bi('Forma', 'Shape'), options: [opt('fus', 'Fusiforme', 'Fusiform'), opt('sac', 'Sacular', 'Saccular')], value: 'fus' },
      { id: 'placas', type: 'toggle', label: bi('Ateromatosis (placas calcificadas)', 'Atheromatosis (calcified plaques)'), value: true },
      { id: 'trombo', type: 'toggle', label: bi('Trombo mural (ampliación)', 'Mural thrombus (beyond the syllabus)'), value: false, exam: false },
    ],
    techniques: [T.ctMed('best', 'Mide el diámetro máximo y la extensión; las placas calcificadas se ven blancas.', 'Measures the maximum diameter and extent; calcified plaques look white.', { default: true }), T.angio('ok', 'Angio-TC: luz muy densa; útil para planificar el tratamiento.', 'CT angiography: very dense lumen; useful to plan treatment.'), T.rxPA('ok', 'Ensanchamiento mediastínico o del botón aórtico: no mide el diámetro.', 'Widened mediastinum or aortic knob: does not measure the diameter.'), T.t1('ok', 'La RM sirve para el mediastino y la aorta (vacío de señal en la luz).', 'MR serves for the mediastinum and aorta (flow void in the lumen).')],
    build: (p, A, env) => aneurysm(A, p, env),
    readouts: (p, A) => {
      const [a, r] = THR[p.seg], g = segGeom(A, p.seg), D = Math.max(p.diam, g.d0 / 10);
      const st = D >= r ? bi(`Aneurisma con mayor riesgo de rotura (≥ ${r} cm)`, `Aneurysm with higher rupture risk (≥ ${r} cm)`) : D >= a ? bi(`Aneurisma (≥ ${a} cm)`, `Aneurysm (≥ ${a} cm)`) : bi(`Por debajo del umbral de aneurisma (< ${a} cm)`, `Below the aneurysm threshold (< ${a} cm)`);
      return [
        { label: bi('Diámetro máximo', 'Maximum diameter'), value: `${D.toFixed(1)} cm` },
        { label: bi('Umbrales del segmento (temario)', 'Segment thresholds (syllabus)'), value: bi(`aneurisma ≥ ${a} cm · rotura ≥ ${r} cm`, `aneurysm ≥ ${a} cm · rupture ≥ ${r} cm`) },
        { label: bi('Resultado', 'Result'), value: st },
        { label: bi('Si es un hallazgo casual', 'If an incidental finding'), value: D >= a ? (D >= r ? bi('Riesgo de rotura elevado → tratar', 'High rupture risk → treat') : bi('Seguimiento clínico + radiológico anual', 'Clinical + yearly imaging follow-up')) : bi('—', '—') },
        { label: bi('Diámetro de este paciente (estimado)', 'This patient\'s diameter (estimated)'), value: `${(g.d0 / 10).toFixed(1)} cm` },
      ];
    },
    info: {
      where: bi('Más frecuente en la raíz y la aorta ascendente, pero puede afectar a los 3 compartimentos. Los de la descendente suelen acompañar a los de la aorta abdominal.', 'Commonest at the root and ascending aorta, but may involve all 3 compartments. Descending ones usually accompany abdominal aortic aneurysms.'),
      see: bi('Dilatación focal o difusa. <b>Ascendente ≥ 5 cm, descendente ≥ 4 cm</b>; mayor riesgo de rotura <b>≥ 6 / ≥ 7 cm</b>. <b>Fusiforme</b> si afecta a toda la circunferencia; <b>sacular</b> si solo a una parte (excéntrico). Causa más frecuente: ateromatosis (placas calcificadas, blancas), con FRCV: diabetes, hipercolesterolemia, tabaco e HTA.', 'Focal or diffuse dilatation. <b>Ascending ≥ 5 cm, descending ≥ 4 cm</b>; higher rupture risk <b>≥ 6 / ≥ 7 cm</b>. <b>Fusiform</b> when the whole circumference is involved; <b>saccular</b> when only part (eccentric). Commonest cause: atheromatosis (white calcified plaques), with CV risk factors: diabetes, hypercholesterolaemia, smoking and hypertension.'),
      technique: bi('Casi todos son asintomáticos y se descubren por casualidad (o por compresión de vecinos). Hallazgo en una TC por otro motivo: seguimiento clínico + radiológico anual; se trata cuando el riesgo de rotura es elevado.', 'Most are asymptomatic and found by chance (or by compression of neighbours). Found on a CT done for another reason: clinical + yearly imaging follow-up; treated when the rupture risk is high.'),
      differential: bi('Regla «5-4 / 6-7»: con 5 y 4 cm se diagnostica; con 6 y 7 se rompe.', 'Rule "5-4 / 6-7": 5 and 4 cm diagnose it; 6 and 7 cm rupture it.'),
      tip: bi('Pon 5,3 cm en la ascendente (la pregunta de la autoevaluación) y luego la misma cifra en la descendente.', 'Set 5.3 cm on the ascending aorta (the self-test question) and then the same value on the descending one.'),
    },
    flags: [
      flag('apuntes', 'Los umbrales 5/4 y 6/7 cm son los del temario.', 'The 5/4 and 6/7 cm thresholds are those of the syllabus.'),
      flag('ampliacion', 'Las guías actuales (ESC 2024, ACC/AHA 2022) indican reparación electiva hacia ≈ 5,5 cm en la ascendente y la descendente (antes en casos concretos). Para el examen, usa las cifras del temario.', 'Current guidelines (ESC 2024, ACC/AHA 2022) recommend elective repair at about 5.5 cm in the ascending and descending aorta (earlier in specific cases). For the exam, use the syllabus figures.'),
      flag('ampliacion', 'El crecimiento se simula dilatando radialmente la aorta real de este paciente en el segmento elegido; las estructuras vecinas no se desplazan.', 'Growth is simulated by radially dilating this patient\'s real aorta in the chosen segment; neighbouring structures are not displaced.'),
    ],
  },
  {
    id: 'hematoma-intramural', group: 'aorta', tag: 'ct-real',
    name: bi('Hematoma intramural', 'Intramural haematoma'), short: bi('Hematoma intramural', 'Intramural haematoma'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => imhAt(A, p), examPlane: 'axial' },
    contrast: true, defaultPhase: 'sin',
    params: [
      { id: 'stan', type: 'select', label: bi('Stanford', 'Stanford'), options: [opt('A', 'A (ascendente)', 'A (ascending)'), opt('B', 'B (descendente)', 'B (descending)')], value: 'B', recentre: true },
      { id: 'grosor', type: 'range', label: bi('Grosor de la semiluna', 'Crescent thickness'), min: 3, max: 12, step: 1, value: 7, unit: 'mm', examMin: 5 },
    ],
    techniques: [tq('ct-sin', 'ct', 'best', bi('TC sin contraste', 'Unenhanced CT'), bi('Semiluna HIPERDENSA en la pared: la clave del diagnóstico.', 'HYPERDENSE crescent in the wall: the key to the diagnosis.'), { window: 'mediastinum', phase: 'sin', default: true }), tq('ct', 'ct', 'ok', bi('TC con contraste', 'Contrast CT'), bi('La semiluna queda HIPODENSA respecto a la luz; no hay flap ni doble luz.', 'The crescent is HYPODENSE to the lumen; no flap, no double lumen.'), { window: 'mediastinum', phase: 'portal' })],
    compare: ['diseccion', 'ulcera'],
    build: (p, A, env) => {
      const L = aoLevels(A), aoId = A.id('aorta'), parts = p.stan === 'A' ? ['asc', 'arch'] : ['desc'];
      const zS = p.stan === 'A' ? L.zTop : L.zSplit + 3, zE = p.stan === 'A' ? L.zRoot - 4 : L.zSplit + 70, arc = Math.PI * 1.15, Tm = vox(A, p.grosor), hu = pv(IMH, env.phase);
      const dirs = { asc: Math.atan2(-0.4, -0.9), arch: Math.atan2(-0.95, 0.1), desc: Math.atan2(0.15, 1) }, b = A.s('aorta').bbox;
      return [{ t: 'cols', box: rbox([zS, zE, b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
        if (cur.orig !== aoId) return null; const pa = aoPartAt(A, z, y, x); if (!pa || !parts.includes(pa[0])) return null;
        const [k, c] = pa, da = angDiff(Math.atan2(y - c.cy, x - c.cx), dirs[k]); if (da > arc / 2) return null;
        const taper = Math.min(1, (z - zS + 1) / 8, (zE - z + 1) / 8), t = Tm * Math.cos(da / (arc / 2) * Math.PI / 2) ** 0.6 * taper;
        return c.dist(y, x) <= t ? { hu, mr: MR.blood } : null;
      } }, mark(imhAt(A, p), 'Semiluna en la pared', 'Crescent in the wall', { dx: 80, dy: -40 })];
    },
    readouts: (p, A, env) => [{ label: bi('Semiluna / luz en esta fase', 'Crescent / lumen in this phase'), value: `${pv(IMH, env.phase)} / ${pv(HU.ao, env.phase)} UH` }, { label: bi('En la TC', 'On CT'), value: env.phase === 'sin' ? bi('Hiperdensa sin contraste', 'Hyperdense unenhanced') : bi('Hipodensa con contraste', 'Hypodense with contrast') }, { label: bi('Desgarro de la íntima', 'Intimal tear'), value: bi('No', 'No') }, { label: bi('Manejo (Stanford)', 'Management (Stanford)'), value: p.stan === 'A' ? bi('A: cirugía urgente', 'A: urgent surgery') : bi('B: tratamiento médico inicial', 'B: initial medical treatment') }],
    info: {
      where: bi('Capa media de la pared aórtica (síndrome aórtico agudo).', 'Media of the aortic wall (acute aortic syndrome).'),
      see: bi('Hemorragia en la capa media, probablemente por rotura espontánea de los vasa vasorum, <b>sin desgarro de la íntima</b>. TC: imagen en <b>semiluna</b> en la pared, <b>hiperdensa sin contraste</b> e <b>hipodensa con contraste</b>.', 'Bleeding into the media, probably from spontaneous rupture of the vasa vasorum, <b>without an intimal tear</b>. CT: <b>crescent</b> in the wall, <b>hyperdense unenhanced</b> and <b>hypodense with contrast</b>.'),
      technique: bi('Hace falta la fase sin contraste: con contraste se confunde con trombo o placa.', 'The unenhanced phase is needed: with contrast it can be mistaken for thrombus or plaque.'),
      differential: bi('Disección: flap intimomedial y dos luces. Úlcera penetrante: cráter que atraviesa una placa.', 'Dissection: intimomedial flap and two lumens. Penetrating ulcer: crater through a plaque.'),
      tip: bi('Alterna sin / con contraste: la misma semiluna pasa de blanca a gris.', 'Toggle unenhanced / contrast: the same crescent goes from white to grey.'),
    },
    diagram: lang => stanfordDiagram(lang),
    flags: [flag('ampliacion', 'El grosor y la extensión de la semiluna son de ejemplo; el temario no da cifras.', 'The thickness and extent of the crescent are examples; the syllabus gives no figures.')],
  },
  {
    id: 'ulcera', group: 'aorta', tag: 'ct-real',
    name: bi('Úlcera penetrante aórtica', 'Penetrating aortic ulcer'), short: bi('Úlcera penetrante', 'Penetrating ulcer'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.8, at: (p, A) => ulcer(A, p).neck, examPlane: 'axial' },
    phases: ['sin', 'arterial', 'portal'], defaultPhase: 'arterial',
    params: [{ id: 'depth', type: 'range', label: bi('Profundidad del cráter', 'Crater depth'), min: 3, max: 15, step: 1, value: 8, unit: 'mm' }, { id: 'imh', type: 'toggle', label: bi('Hematoma alrededor (ha llegado a la media)', 'Haematoma around it (reached the media)'), value: true }],
    techniques: [T.angio('best', 'El contraste rellena un cráter que sale de la luz a través de una placa calcificada.', 'Contrast fills a crater leaving the lumen through a calcified plaque.', { default: true }), tq('ct-sin', 'ct', 'ok', bi('TC sin contraste', 'Unenhanced CT'), bi('Se ven las placas y el hematoma, no el cráter.', 'Shows the plaques and the haematoma, not the crater.'), { window: 'mediastinum', phase: 'sin' })],
    compare: ['hematoma-intramural', 'diseccion'],
    build: (p, A, env) => {
      const u = ulcer(A, p), lum = pv(HU.ao, env.phase), out = [plaques(A, u.g, [u.z - 14, u.z + 14], 0.15)];
      if (p.imh) { const aoId = A.id('aorta'), hu = pv(IMH, env.phase); out.push({ t: 'cols', box: rbox(boxOf(A, u.g, [u.z - 10, u.z + 10], 1)), fn: (z, y, x, cur) => {
        const c = u.g.comps.get(z); if (!c || cur.orig !== aoId || !c.has(y, x)) return null; const da = angDiff(Math.atan2(y - c.cy, x - c.cx), u.ang); if (da > 1.2) return null;
        return c.dist(y, x) <= vox(A, 4) * (1 - Math.abs(z - u.z) / 11) * Math.cos(da / 1.2 * Math.PI / 2) ** 0.5 ? { hu, mr: MR.blood } : null; } }); }
      out.push({ t: 'tube', pts: [u.base, u.neck, u.tip], r: [2.8, 2.6, 2.2], hu: lum, outside: ['esophagus', 'trachea', ...A.vertebraKeys()], label: 'lesion' });
      out.push({ t: 'blob', c: u.tip, r: Math.max(2.5, p.depth * 0.35), hu: lum, outside: ['esophagus', 'trachea', ...A.vertebraKeys()], label: 'lesion' });
      out.push(mark(u.tip, 'Cráter a través de la placa', 'Crater through the plaque', { dx: 80, dy: -40 }));
      return out;
    },
    readouts: (p) => [{ label: bi('Profundidad del cráter', 'Crater depth'), value: `${p.depth} mm` }, { label: bi('Clínica', 'Symptoms'), value: p.imh ? bi('Sintomática al llegar a la media', 'Symptomatic once it reaches the media') : bi('Limitada a la íntima: suele ser asintomática', 'Limited to the intima: usually asymptomatic') }],
    info: {
      where: bi('Placa de ateroma de la aorta, sobre todo la descendente.', 'Atheromatous plaque of the aorta, mainly the descending.'),
      see: bi('Ulceración de una placa de ateroma que penetra en la pared. Suele limitarse a la íntima y ser asintomática; se vuelve sintomática al llegar a la media. Aquí: cráter de contraste que sale de la luz a través de una placa calcificada, con hematoma de pared alrededor.', 'Ulceration of an atheromatous plaque that penetrates the wall. Usually limited to the intima and asymptomatic; it becomes symptomatic on reaching the media. Here: a contrast crater leaving the lumen through a calcified plaque, with wall haematoma around it.'),
      technique: bi('Angio-TC.', 'CT angiography.'),
      differential: bi('Disección: flap a lo largo de la luz y dos luces. Hematoma intramural: semiluna sin cráter.', 'Dissection: flap along the lumen and two lumens. Intramural haematoma: crescent without a crater.'),
    },
    flags: [
      flag('revisar', 'En el resumen del temario la imagen de la úlcera («línea hipodensa corta en el centro de la luz, íntima desgarrada y desplazada, gran puerta de entrada») se parece mucho a la de la disección. Confírmalo con las diapositivas de clase.', 'In the syllabus summary the ulcer image ("short hypodense line in the centre of the lumen, torn and displaced intima, large entry") reads very much like dissection. Check it against the lecture slides.'),
      flag('ampliacion', 'Se dibuja como se describe habitualmente: un cráter de contraste que atraviesa una placa calcificada y sobrepasa el contorno de la aorta.', 'It is drawn as usually described: a contrast crater through a calcified plaque, projecting beyond the aortic outline.'),
    ],
  },
  {
    id: 'diseccion', group: 'aorta', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Disección aórtica (Stanford A / B)', 'Aortic dissection (Stanford A / B)'), short: bi('Disección aórtica', 'Aortic dissection'),
    view: { plane: 'axial', window: 'vascular', zoom: 2, at: (p, A) => { const L = aoLevels(A), z = p.ext === 'abd' ? L.zHiatus : L.zSplit + 18, s = aoSlice(A, z); if (p.ext === 'abd') return [z, Math.round(s.desc.cy), Math.round(s.desc.cx)]; return [z, Math.round(((s.asc || s.desc).cy + s.desc.cy) / 2), Math.round(s.desc.cx - 6)]; }, examPlane: 'axial' },
    phases: ['sin', 'arterial', 'portal'], defaultPhase: 'arterial',
    params: [
      { id: 'stan', type: 'select', label: bi('Stanford', 'Stanford'), options: [opt('A', 'A: afecta a la ascendente', 'A: involves the ascending'), opt('B', 'B: no la afecta', 'B: spares it')], value: 'B' },
      { id: 'ext', type: 'select', label: bi('Extensión distal', 'Distal extent'), options: [opt('tor', 'Hasta el hiato', 'To the hiatus'), opt('abd', 'Hasta la bifurcación', 'To the bifurcation')], value: 'tor' },
      { id: 'comp', type: 'toggle', label: bi('Complicaciones (isquemia, dolor, HTA no controlada)', 'Complications (ischaemia, pain, uncontrolled BP)'), value: false, exam: false },
    ],
    techniques: [T.angio('best', 'Flap intimomedial y dos luces: la verdadera (pequeña, muy densa) y la falsa (grande, se rellena más despacio).', 'Intimomedial flap and two lumens: the true (small, very dense) and the false (large, fills more slowly).', { default: true }), T.ctMed('ok', 'En fase portal las dos luces se igualan: el flap se ve, pero cuesta distinguir las luces.', 'In the portal phase both lumens even out: the flap shows but the lumens are harder to tell apart.', { phase: 'portal' }), tq('ct-sin', 'ct', 'bad', bi('TC sin contraste', 'Unenhanced CT'), bi('No muestra el flap: no sirve para diagnosticarla.', 'Does not show the flap: not enough to diagnose it.'), { window: 'mediastinum', phase: 'sin' })],
    treatment: { label: bi('Tratamiento', 'Treatment'), note: bi('Tipo A: cirugía urgente (prótesis en la ascendente). Tipo B: tratamiento médico inicial; endovascular (endoprótesis) si hay isquemia visceral o de MMII, dolor pese a la analgesia o HTA no controlada.', 'Type A: urgent surgery (ascending graft). Type B: initial medical treatment; endovascular (stent graft) if visceral or limb ischaemia, pain despite analgesia or uncontrolled hypertension.') },
    compare: ['hematoma-intramural', 'ulcera'],
    build: (p, A, env) => {
      const L = aoLevels(A), aoId = A.id('aorta'), parts = p.stan === 'A' ? ['asc', 'arch', 'desc'] : ['desc'], ph = env.phase, b = A.s('aorta').bbox;
      const zS = p.stan === 'A' ? L.zTop : L.zSplit + 1, zE = p.ext === 'abd' ? L.zBif - 8 : L.zHiatus, stent = env.treated && p.stan === 'B' ? [L.zSplit + 1, L.zSplit + 55] : null;
      const out = [{ t: 'cols', box: rbox([zS, zE, b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => {
        if (cur.orig !== aoId) return null; const pa = aoPartAt(A, z, y, x); if (!pa || !parts.includes(pa[0])) return null;
        const [k, c] = pa, R = c.r;
        if (env.treated && p.stan === 'A' && k === 'asc') return c.dist(y, x) <= 1.2 ? { hu: 160, label: 'lesion' } : { hu: pv(TL, ph), label: 'keep' };
        let n; if (k === 'arch') n = [-c.major[1], c.major[0]]; else { const th = (k === 'asc' ? 0.6 : 2.3) + (z - zS) * 0.012; n = [Math.sin(th), Math.cos(th)]; }
        const dy = y - c.cy, dx = x - c.cx, u = dy * n[0] + dx * n[1], t = -dy * n[1] + dx * n[0];
        let d = u - 0.45 * R + 0.3 * t * t / R;                       // d > 0: true lumen (smaller, compressed by the false one)
        const inStent = stent && z >= stent[0] && z <= stent[1];
        if (inStent) { d += 0.9 * R; if (Math.abs(d) < 0.9 && noise3(z, y, x, 0.8, 2) > -0.2) return { hu: 1800, label: 'lesion' }; return d > 0 ? { hu: pv(TL, ph), label: 'keep' } : { hu: 45, label: 'lesion' }; }
        if (Math.abs(d) < 0.75) return { hu: pv(FLAP, ph), label: 'lesion', mr: MR.soft };
        return d > 0 ? { hu: pv(TL, ph), label: 'keep' } : { hu: pv(FL, ph), label: 'lesion', mr: MR.calc };
      } }];
      const z = L.zSplit + 18, s = aoSlice(A, z);
      if (s.desc) out.push(mark([z, s.desc.cy, s.desc.cx], 'Flap intimomedial', 'Intimomedial flap', { dx: 80, dy: 40 }));
      if (p.stan === 'B' && s.asc) out.push(mark([z, s.asc.cy, s.asc.cx], 'Ascendente respetada', 'Ascending spared', { dx: -120, dy: -40 }));
      if (p.stan === 'A' && s.asc) out.push(mark([z, s.asc.cy, s.asc.cx], 'Ascendente afectada', 'Ascending involved', { dx: -120, dy: -40 }));
      return out;
    },
    readouts: (p, A, env) => [
      { label: bi('Clasificación', 'Classification'), value: p.stan === 'A' ? bi('Stanford A: afecta a la ascendente (sea cual sea su extensión distal)', 'Stanford A: involves the ascending (whatever its distal extent)') : bi('Stanford B: no afecta a la ascendente', 'Stanford B: spares the ascending') },
      { label: bi('Manejo', 'Management'), value: p.stan === 'A' ? bi('Cirugía urgente', 'Urgent surgery') : p.comp ? bi('Tratamiento endovascular (hay complicaciones)', 'Endovascular treatment (complicated)') : bi('Tratamiento médico inicial', 'Initial medical treatment') },
      { label: bi('Luz verdadera / falsa (esta fase)', 'True / false lumen (this phase)'), value: `${pv(TL, env.phase)} / ${pv(FL, env.phase)} UH` },
    ],
    info: {
      where: bi('Aorta torácica; Stanford según si afecta o no a la aorta ascendente.', 'Thoracic aorta; Stanford by whether the ascending aorta is involved.'),
      see: bi('Rotura de la íntima + desgarro en el espesor de la media, que queda dividida en dos subcapas. TC: <b>línea hipodensa a lo largo de la luz</b> («flap» o colgajo intimomedial) y <b>dos luces</b>: la verdadera (generalmente más pequeña) y la falsa (suele comprimir a la verdadera).', 'Intimal tear + split within the media, which is divided into two sublayers. CT: <b>hypodense line along the lumen</b> (intimomedial "flap") and <b>two lumens</b>: the true one (usually smaller) and the false one (usually compresses the true).'),
      technique: bi('Síndrome aórtico agudo: proceso agudo de la capa media con riesgo de rotura y dolor torácico, alta mortalidad intrahospitalaria; factor principal la HTA. <b>Tipo A → cirugía urgente.</b> <b>Tipo B → tratamiento médico inicial</b>; endovascular si isquemia visceral o de MMII, dolor pese a la analgesia o HTA no controlada.', 'Acute aortic syndrome: acute process of the media with rupture risk and chest pain, high in-hospital mortality; main factor hypertension. <b>Type A → urgent surgery.</b> <b>Type B → initial medical treatment</b>; endovascular if visceral or limb ischaemia, pain despite analgesia or uncontrolled hypertension.'),
      differential: bi('Hematoma intramural: sin flap, semiluna hiperdensa sin contraste.', 'Intramural haematoma: no flap, crescent hyperdense unenhanced.'),
      tip: bi('«Stanford A = Ascendente = A quirófano». Cambia A/B y mira el corte donde se ven la ascendente y la descendente a la vez.', '"Stanford A = Ascending = to theatre (A quirófano)". Switch A/B and look at the slice showing both ascending and descending aorta.'),
    },
    diagram: lang => stanfordDiagram(lang),
    flags: [flag('ampliacion', 'La fase arterial es una simulación sobre el estudio portal; las UH de cada luz son valores docentes. La espiral del flap y la endoprótesis son esquemáticas.', 'The arterial phase is simulated on the portal study; the HU of each lumen are teaching values. The spiral flap and the stent graft are schematic.')],
  },
  {
    id: 'htp', group: 'pulm', tag: 'kit',
    kitNote: bi('El tronco pulmonar y las cavidades cardíacas no están segmentados (necesitan «heartchambers_highres», licencia no comercial, o una máscara de la arteria pulmonar). El tronco se dibuja sobre una línea central estimada.', 'The pulmonary trunk and heart chambers are not segmented (they need "heartchambers_highres", non-commercial licence, or a pulmonary artery mask). The trunk is drawn on an estimated centreline.'),
    name: bi('Hipertensión pulmonar (HTP)', 'Pulmonary hypertension (PH)'), short: bi('HTP', 'PH'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.2, at: (p, A) => paGeom(A).mid, examPlane: 'axial' },
    params: [
      { id: 'd', type: 'range', label: bi('Diámetro del tronco pulmonar', 'Pulmonary trunk diameter'), min: 22, max: 45, step: 0.5, value: 34, unit: 'mm', examMin: 32 },
      { id: 'young', type: 'toggle', label: bi('Paciente < 50 años', 'Patient < 50 years'), value: true },
      { id: 'evol', type: 'toggle', label: bi('HTP evolucionada (cardiomegalia)', 'Advanced PH (cardiomegaly)'), value: false },
    ],
    techniques: [T.ctMed('best', 'Medición del tronco de la arteria pulmonar en el corte de la bifurcación.', 'Measure the pulmonary trunk on the bifurcation slice.', { default: true }), T.rxPA('ok', 'Arterias pulmonares centrales grandes; cardiomegalia si está evolucionada.', 'Large central pulmonary arteries; cardiomegaly if advanced.')],
    build: (p, A, env) => {
      const out = paTubes(A, p.d, pv(HU.heart, env.phase), 'lesion'), hb = A.s('heart').bbox;
      if (p.evol) out.push({ t: 'dilate', s: 'heart', scale: 1.13, z: [hb[0] + 18, hb[1]] });
      out.push(mark(paGeom(A).mid, 'Tronco pulmonar', 'Pulmonary trunk', { dx: 80, dy: -40 }));
      return out;
    },
    readouts: (p, A) => {
      const g = paGeom(A), s = aoSlice(A, g.mid[0]), ao = s.asc ? eqDiam(A, s.asc) : 32, crit = p.d > 31.5 ? bi('HTP (> 29–31,5 mm)', 'PH (> 29–31.5 mm)') : p.d > 29 ? bi('En el rango 29–31,5 mm', 'Within 29–31.5 mm') : bi('Normal', 'Normal');
      return [
        { label: bi('Tronco pulmonar / aorta ascendente', 'Pulmonary trunk / ascending aorta'), value: `${p.d.toFixed(1)} / ${ao.toFixed(0)} mm` },
        { label: bi('Criterio de diámetro', 'Diameter criterion'), value: crit },
        { label: bi('¿Mayor que la aorta en < 50 años?', 'Larger than the aorta under 50?'), value: p.young ? (p.d > ao ? bi('Sí → criterio de HTP', 'Yes → PH criterion') : bi('No', 'No')) : bi('No aplica (≥ 50 años)', 'Not applicable (≥ 50 years)') },
        { label: bi('HTP evolucionada (no medible aquí)', 'Advanced PH (not measurable here)'), value: bi('AD dilatada · VD/VI > 1 · tabique aplanado o desviado a la izquierda · pared libre del VD > 4 mm', 'Dilated RA · RV/LV > 1 · septum flattened or bowed to the left · RV free wall > 4 mm') },
      ];
    },
    info: {
      where: bi('Tronco de la arteria pulmonar (mediastino anterior) y arterias principales derecha e izquierda (mediastino medio).', 'Pulmonary trunk (anterior mediastinum) and right and left main arteries (middle mediastinum).'),
      see: bi('Aumento de la presión arterial pulmonar media que con el tiempo agranda el tronco y las arterias principales. TC: <b>tronco > 29–31,5 mm</b>, o <b>mayor que la aorta ascendente en < 50 años</b>. Evolucionada: crecen las cavidades derechas (AD dilatada con la AI comprimida, VD/VI > 1, tabique aplanado o desviado a la izquierda, pared libre del VD > 4 mm).', 'Raised mean pulmonary artery pressure that over time enlarges the trunk and main arteries. CT: <b>trunk > 29–31.5 mm</b>, or <b>larger than the ascending aorta under 50 years</b>. Advanced: right chambers enlarge (dilated RA with compressed LA, RV/LV > 1, septum flattened or bowed to the left, RV free wall > 4 mm).'),
      technique: bi('Causa principal (temario): disminución brusca del calibre de las arterias periféricas por vasoconstricción.', 'Main cause (syllabus): abrupt narrowing of the peripheral arteries from vasoconstriction.'),
      tip: bi('Compara el tronco con la aorta ascendente en el mismo corte: es la regla rápida.', 'Compare the trunk with the ascending aorta on the same slice: the quick rule.'),
    },
    flags: [flag('ampliacion', 'La cardiomegalia se simula agrandando todo el corazón; sin máscara de cavidades no se pueden medir VD/VI ni el tabique.', 'Cardiomegaly is simulated by enlarging the whole heart; without chamber masks RV/LV and the septum cannot be measured.')],
  },
  {
    id: 'tep', group: 'pulm', tag: 'kit', extraTags: ['sim'],
    kitNote: bi('Las arterias pulmonares no están segmentadas: el trombo central o lobar se dibuja en una arteria estimada; los émbolos segmentarios necesitarían la máscara «lung_vessels» (abierta).', 'The pulmonary arteries are not segmented: the central or lobar thrombus is drawn in an estimated artery; segmental emboli would need the open "lung_vessels" mask.'),
    name: bi('Tromboembolismo pulmonar (TEP) agudo', 'Acute pulmonary embolism (PE)'), short: bi('TEP', 'PE'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => { const g = paGeom(A); return p.sitio === 'izq' ? g.lpa[1] : g.rpa[1]; }, examPlane: 'axial' },
    phases: ['arterial', 'portal'], defaultPhase: 'arterial',
    params: [
      { id: 'sitio', type: 'select', label: bi('Localización del trombo', 'Thrombus site'), options: [opt('silla', 'Central (en silla de montar)', 'Central (saddle)'), opt('der', 'Arteria pulmonar derecha', 'Right pulmonary artery'), opt('izq', 'Arteria pulmonar izquierda', 'Left pulmonary artery')], value: 'der' },
      { id: 'total', type: 'toggle', label: bi('Defecto completo (oclusivo)', 'Complete (occlusive) defect'), value: false },
      { id: 'infarto', type: 'toggle', label: bi('Condensación triangular periférica (infarto)', 'Peripheral triangular consolidation (infarct)'), value: true },
      { id: 'vidrio', type: 'toggle', label: bi('Vidrio deslustrado (hemorragia)', 'Ground glass (haemorrhage)'), value: true },
      { id: 'atel', type: 'toggle', label: bi('Atelectasias laminares', 'Plate atelectasis'), value: false },
      { id: 'derrame', type: 'toggle', label: bi('Derrame pleural', 'Pleural effusion'), value: false },
    ],
    techniques: [T.angio('best', 'Prueba de elección (alta sensibilidad y especificidad): defecto de repleción hipodenso en una arteria hiperdensa.', 'Test of choice (high sensitivity and specificity): hypodense filling defect in a hyperdense artery.', { default: true, window: 'mediastinum' }), T.ctLung('ok', 'Ventana de pulmón: infarto, vidrio deslustrado y atelectasias.', 'Lung window: infarct, ground glass and atelectasis.', { phase: 'arterial' }), T.rxPA('bad', 'La placa no muestra el trombo: no es la prueba de elección.', 'The film does not show the thrombus: not the test of choice.')],
    build: (p, A, env) => {
      const g = paGeom(A), out = paTubes(A, 26, pv(HU.heart, env.phase), 'keep'), rB = 26 / 2 * 0.62, f = p.total ? 0.92 : 0.55;
      const pts = p.sitio === 'silla' ? [g.rpa[1], g.bif, g.lpa[1]] : p.sitio === 'der' ? [g.rpa[0].map((v, i) => (v + g.rpa[1][i]) / 2), g.rpa[1], g.rpa[2]] : [g.lpa[0].map((v, i) => (v + g.lpa[1][i]) / 2), g.lpa[1], g.lpa[2]];
      out.push({ t: 'tube', pts, r: rB * f, hu: HU.thrombus, outside: PA_OUT(A), label: 'lesion', mr: MR.soft });
      out.push(mark(pts[1], 'Defecto de repleción', 'Filling defect', { dx: 80, dy: -40 }));
      const side = p.sitio === 'izq' ? 'L' : 'R', lk = side === 'R' ? 'lung_lower_lobe_right' : 'lung_lower_lobe_left', lb = A.s(lk).bbox;
      if (p.infarto || p.vidrio) {
        const seed = surfacePoint(A, side, lb[1] - 28, [0.55, side === 'R' ? -0.83 : 0.83]);
        if (seed) { out.push(wedge(A, side, seed, 28, 20, { keys: [lk], hu: p.infarto ? 30 : -450, halo: p.vidrio && p.infarto ? 6 : 0, haloHu: -450, label: 'keep' })); out.push(mark(seed, p.infarto ? 'Infarto: triángulo periférico' : 'Vidrio deslustrado', p.infarto ? 'Infarct: peripheral triangle' : 'Ground glass', { dx: side === 'R' ? -180 : 80, dy: 40 })); }
      }
      if (p.atel) { const zl = lb[1] - 18, ok = new Set([A.id(lk)]); out.push({ t: 'cols', box: rbox([zl - 2, zl + 2, lb[2], lb[3], lb[4], lb[5]]), fn: (z, y, x, cur) => (ok.has(cur.orig) && Math.abs(z - zl - (y - (lb[2] + lb[3]) / 2) * 0.08) < 0.8 && Math.abs(x - (lb[4] + lb[5]) / 2) < 22 ? { hu: -20, label: 'keep' } : null) }); }
      if (p.derrame) out.push({ ...effusion(A, side, { h: 30, d: 14, mode: env.modality === 'rx' ? 'upright' : 'supine' }), label: 'keep' });
      return out;
    },
    readouts: p => [{ label: bi('Signo directo', 'Direct sign'), value: bi('Defecto de repleción ' + (p.total ? 'completo' : 'parcial'), (p.total ? 'Complete' : 'Partial') + ' filling defect') }, { label: bi('Prueba de elección', 'Test of choice'), value: bi('TC (angio-TC)', 'CT (CT angiography)') }, { label: bi('Origen habitual', 'Usual source'), value: bi('TVP de miembros inferiores', 'Lower-limb DVT') }],
    info: {
      where: bi('Arterias pulmonares (trombo) y parénquima pulmonar periférico (repercusión).', 'Pulmonary arteries (thrombus) and peripheral lung (consequences).'),
      see: bi('<b>Defecto de repleción</b>: el vaso está hiperdenso por el contraste, excepto el trombo, que queda hipodenso; completo o parcial, con o sin aumento del diámetro. Pulmón: <b>vidrio deslustrado</b> (hemorragia adyacente a la consolidación, isquemia transitoria con reperfusión por la circulación bronquial), <b>condensaciones triangulares periféricas que no captan</b> (infartos), <b>atelectasias laminares</b> (alteración del surfactante, hipoventilación) y a veces derrame.', '<b>Filling defect</b>: the vessel is hyperdense with contrast except the thrombus, which stays hypodense; complete or partial, with or without vessel enlargement. Lung: <b>ground glass</b> (haemorrhage next to the consolidation, transient ischaemia with reperfusion via bronchial circulation), <b>non-enhancing peripheral triangular consolidations</b> (infarcts), <b>plate atelectasis</b> (surfactant loss, hypoventilation) and sometimes effusion.'),
      technique: bi('TEP y TVP son manifestaciones de la enfermedad tromboembólica venosa; la mayoría de los TEP nacen de una TVP de los miembros inferiores. Frecuente y grave. Prueba de elección: TC.', 'PE and DVT are manifestations of venous thromboembolic disease; most PEs arise from lower-limb DVT. Common and serious. Test of choice: CT.'),
      tip: bi('Usa la ventana de mediastino para el trombo y la de pulmón para el infarto.', 'Use the mediastinal window for the thrombus and the lung window for the infarct.'),
    },
    flags: [flag('ampliacion', 'La fase arterial pulmonar es una simulación; el recorrido de las arterias pulmonares es estimado.', 'The pulmonary arterial phase is simulated; the course of the pulmonary arteries is estimated.')],
  },
  {
    id: 'neumomediastino', group: 'pulm', tag: 'ct-real',
    name: bi('Neumomediastino', 'Pneumomediastinum'), short: bi('Neumomediastino', 'Pneumomediastinum'),
    view: { plane: 'axial', window: 'lung', zoom: 2, at: (p, A) => { const z = A.s('trachea').bbox[0] + 45, c = A.centroidAt('trachea', z); return [z, Math.round(c.y), Math.round(c.x)]; }, examPlane: 'axial' },
    params: [{ id: 'grosor', type: 'range', label: bi('Cantidad de aire', 'Amount of air'), min: 2, max: 10, step: 1, value: 5, unit: 'mm' }, { id: 'cuello', type: 'toggle', label: bi('Extensión al cuello y a la pared (enfisema)', 'Spread to the neck and wall (emphysema)'), value: true }],
    techniques: [T.ctLung('best', 'Aire que diseca la grasa y dibuja la tráquea, el esófago y la aorta; fuera del pulmón.', 'Air dissecting the fat and outlining the trachea, oesophagus and aorta; outside the lung.', { default: true }), T.ctMed('ok', 'En ventana de mediastino también se ve: el aire es negro.', 'On the mediastinal window it also shows: the air is black.'), T.rxPA('ok', 'Líneas de aire paramediastínicas y enfisema en el cuello.', 'Paramediastinal air lines and neck emphysema.')],
    build: (p, A) => {
      const keys = ['trachea', 'esophagus', 'aorta', 'heart', 'superior_vena_cava', 'brachiocephalic_trunk', 'brachiocephalic_vein_left', 'brachiocephalic_vein_right', 'common_carotid_artery_left', 'common_carotid_artery_right', 'thyroid_gland'];
      const tb = A.s('trachea').bbox, z0 = p.cuello ? A.s('thyroid_gland').bbox[0] - 8 : tb[0] + 8, z1 = A.s('heart').bbox[0] + 40, Tm = vox(A, p.grosor), out = [];
      out.push({ t: 'cols', box: rbox([z0, z1, 25, 175, 85, 195]), fn: (z, y, x, cur) => {
        if (cur.orig !== 0 || cur.hu < -400 || cur.hu > 90) return null;
        const d = distOut(A, 'pm', keys, z)(y, x), lim = Tm * (0.55 + 0.7 * Math.max(0, noise3(z, y, x, 0.22, 4) + 0.35)); if (d > lim) return null;
        if (distOut(A, 'pmL', LUNGS, z)(y, x) < 1.5) return null;
        return { hu: -950, mr: MR.air };
      } });
      if (p.cuello) {
        const zw0 = tb[0] + 15, zw1 = A.s('heart').bbox[0] + 30, front = new Map(), ids = idsOf(A, ['sternum', 'costal_cartilages', ...A.atlas.structures.map(s => s.key).filter(k => k.startsWith('rib_'))]);
        const fy = (z, x) => { const k = z * 1024 + x; if (!front.has(k)) { let r = -1; for (let y = 0; y < 140; y++) if (ids.has(A.at(z, y, x))) { r = y; break; } front.set(k, r); } return front.get(k); };
        out.push({ t: 'cols', box: rbox([zw0, zw1, 0, 120, 20, 255]), fn: (z, y, x, cur) => {
          if (cur.orig !== 0 || cur.hu < -400 || cur.hu > 90) return null; const f = fy(z, x); if (f < 0 || y >= f - 1) return null;
          return noise3(z, y, x, 0.3, 8) > 0.42 ? { hu: -930, mr: MR.air } : null;
        } });
      }
      const z = tb[0] + 45, c = A.centroidAt('trachea', z); out.push(mark([z, c.y, c.x], 'Aire que dibuja la tráquea', 'Air outlining the trachea', { dx: 80, dy: -40 }));
      return out;
    },
    readouts: () => [{ label: bi('Regla', 'Rule'), value: bi('El mediastino NUNCA tiene aire', 'The mediastinum NEVER contains air') }, { label: bi('Causas', 'Causes'), value: bi('Rotura esofágica, traqueobronquial, laríngea o alveolar; extensión desde un retroneumoperitoneo', 'Oesophageal, tracheobronchial, laryngeal or alveolar rupture; spread from retropneumoperitoneum') }],
    info: {
      where: bi('Planos grasos del mediastino; puede extenderse al cuello y a la pared toracoabdominal.', 'Mediastinal fat planes; may extend to the neck and the thoracoabdominal wall.'),
      see: bi('Colecciones de aire que <b>disecan los planos grasos</b> y rodean las estructuras mediastínicas, <b>dibujando su contorno</b>. Es grave, porque el mediastino nunca tiene aire. Puede causar enfisema de partes blandas.', 'Air collections that <b>dissect the fat planes</b> and surround mediastinal structures, <b>outlining them</b>. Serious, because the mediastinum never contains air. May cause soft-tissue emphysema.'),
      technique: bi('TC (ventana de pulmón); en la Rx, líneas de aire junto al mediastino.', 'CT (lung window); on the film, air lines along the mediastinum.'),
      differential: bi('Neumotórax: el aire está en la cavidad pleural, no alrededor de la tráquea y la aorta.', 'Pneumothorax: the air is in the pleural cavity, not around the trachea and aorta.'),
    },
    flags: [flag('ampliacion', 'El aire se coloca en la grasa (sin máscara) que rodea las estructuras segmentadas; su distribución es de ejemplo.', 'The air is placed in the (unsegmented) fat around the segmented structures; its distribution is an example.')],
  },
];

/* ---------------- small geometry for the acute aortic syndrome ---------------- */
function imhAt(A, p) {
  const L = aoLevels(A);
  if (p.stan === 'A') { const z = L.zSplit + 10, c = aoSlice(A, z).asc; return c ? [z, Math.round(c.cy), Math.round(c.cx - c.r * 0.6)] : segGeom(A, 'asc').c; }
  const z = L.zSplit + 30, c = aoSlice(A, z).desc; return [z, Math.round(c.cy), Math.round(c.cx + c.r * 0.6)];
}
function ulcer(A, p) {
  const g = segGeom(A, 'desc'), z = Math.round(g.z0 + (g.z1 - g.z0) * 0.45), c = g.comps.get(z), ang = Math.atan2(-0.35, 0.94), d = [Math.sin(ang), Math.cos(ang)], dv = vox(A, p.depth);
  const at = k => [z, Math.round(c.cy + d[0] * k), Math.round(c.cx + d[1] * k)];
  return { g, z, ang, base: at(c.r * 0.6), neck: at(c.r + 0.5), tip: at(c.r + dv), c };
}
