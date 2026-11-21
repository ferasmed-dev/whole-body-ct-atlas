// Módulo «Parénquima pulmonar»: espacio aéreo, atelectasia, intersticio (TCAR), vía aérea y enfisema, nódulos y
// cáncer, SDRA/COVID-19, dibujados sobre el TC real (caso s0591) a partir de las máscaras de los cinco lóbulos.
// Every value comes from the course topic (radiology topic 5); anything beyond it is flagged 'ampliacion'.
// Backbone: "Rx primero, luego TC" and "el patrón alveolar llena, la atelectasia encoge".
import { LOBE, LOBES, SIDE, HILUM, HIL, SINK, NEIGH, sstep, lerp, nz, hashU, lbox, clampBox, lungDepth, lungBase, cells, probe, ellip, paint, consolVal, ggoVal, lungPoint, bronchTree, treeTubes, collapse, mark, clamp01 } from './lib.js';
import { lobuleDiagram, emphysemaDiagram, goldenDiagram, fillShrinkDiagram } from './diagrams.js';

/* ---------------- shared data ---------------- */
const LN = { RUL: ['LSD', 'RUL'], RML: ['LM', 'RML'], RLL: ['LID', 'RLL'], LUL: ['LSI', 'LUL'], LLL: ['LII', 'LLL'] };
const LONG = { RUL: ['lóbulo superior derecho', 'right upper lobe'], RML: ['lóbulo medio', 'middle lobe'], RLL: ['lóbulo inferior derecho', 'right lower lobe'], LUL: ['lóbulo superior izquierdo (língula)', 'left upper lobe (lingula)'], LLL: ['lóbulo inferior izquierdo', 'left lower lobe'] };
const FOUR = ['RUL', 'RML', 'RLL', 'LUL'];
const lobeParam = (value = 'RUL', list = FOUR, x = {}) => ({ id: 'lobe', type: 'select', label: { es: 'Lóbulo', en: 'Lobe' }, options: list.map(c => ({ v: c, es: LN[c][0], en: LN[c][1] })), value, recentre: true, ...x });
const MED = ['trachea', 'aorta', 'superior_vena_cava', 'heart', 'esophagus', 'pulmonary_vein', 'brachiocephalic_vein_left', 'brachiocephalic_vein_right'];
const opt = (v, es, en) => ({ v, es, en });
const mid = (a, b, t = 0.5) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
const XMID = 137;                  // midline (between the hila), voxels
const LUNGS_C = [272, 102, XMID];  // centre of both lungs, for bilateral patterns
const hd = (z, y, x) => { const h = x < XMID ? HIL.R : HIL.L; return Math.hypot(z - h[0], y - h[1], x - h[2]) * 1.5; };     // mm from the hilum
const centre = (A, code) => A.s(LOBE[code]).center;
/** A point on the lobe's main fissure: walk from the lobe centre toward the neighbouring lobe until leaving it. */
const FISS_TO = { RUL: 'RML', RML: 'RUL', RLL: 'RML', LUL: 'LLL', LLL: 'LUL' };
function fissurePoint(A, code) {
  const ck = 'pul:fis:' + code; if (A.cache.has(ck)) return A.cache.get(ck);
  const id = A.id(LOBE[code]), c = centre(A, code), n = centre(A, FISS_TO[code]); let last = c;
  for (let t = 0; t <= 1.2; t += 0.02) { const p = mid(c, n, t); if (A.at(p[0], p[1], p[2]) === id) last = p; else if (t > 0.15) break; }
  A.cache.set(ck, last); return last;
}
/** Where the collapsed lobe ends up (for view centring). */
const collapsedAt = (A, code, V) => mid(SINK[code], centre(A, code), Math.cbrt(V));
const SILH = {
  RUL: ['Borde mediastínico superior derecho (vena cava superior)', 'Upper right mediastinal border (superior vena cava)'],
  RML: ['Borde cardíaco derecho', 'Right heart border'],
  RLL: ['Hemidiafragma derecho', 'Right hemidiaphragm'],
  LUL: ['Borde cardíaco izquierdo (língula)', 'Left heart border (lingula)'],
  LLL: ['Hemidiafragma izquierdo / aorta descendente', 'Left hemidiaphragm / descending aorta'],
};
function silhouetteAt(A, code) {
  const c = centre(A, code);
  if (code === 'RML') return A.extreme('heart', 'right', c[0]) || c;
  if (code === 'LUL') return A.extreme('heart', 'left', 292) || c;
  if (code === 'RLL') return A.extreme('liver', 'superior') || c;
  return A.extreme('superior_vena_cava', 'right', 248) || c;
}

/* ---------------- techniques ---------------- */
const RX_NOTE = ['Técnica inicial: fácil, rápida y con menos radiación; baja sensibilidad y especificidad.', 'Initial technique: easy, fast and lower dose; low sensitivity and specificity.'];
const TK = {
  rx: (verdict, es, en, x = {}) => ({ id: 'rx', mod: 'rx', plane: 'coronal', verdict, label: { es: 'Rx PA', en: 'PA film' }, note: { es: es || RX_NOTE[0], en: en || RX_NOTE[1] }, ...x }),
  rxl: (verdict, es, en, x = {}) => ({ id: 'rxlat', mod: 'rx', plane: 'sagittal', verdict, label: { es: 'Rx lateral', en: 'Lateral film' }, note: { es, en }, ...x }),
  ct: (verdict, es, en, x = {}) => ({ id: 'ct', mod: 'ct', window: 'lung', plane: 'axial', verdict, label: { es: 'TC', en: 'CT' }, note: { es, en }, ...x }),
  med: (verdict, es, en, x = {}) => ({ id: 'ctmed', mod: 'ct', window: 'mediastinum', plane: 'axial', verdict, label: { es: 'TC con contraste (mediastino)', en: 'Contrast CT (mediastinal window)' }, note: { es, en }, ...x }),
  tcar: (verdict, es, en, x = {}) => ({ id: 'tcar', mod: 'ct', window: 'lung', plane: 'axial', verdict, label: { es: 'TCAR (simulación)', en: 'HRCT (simulation)' }, note: { es, en }, ...x }),
  rm: (x = {}) => ({ id: 'rm', mod: 't2', plane: 'axial', verdict: 'bad', label: { es: 'RM', en: 'MR' }, note: { es: 'No se usa en el tórax: el aire altera el campo magnético de las moléculas que lo rodean y la zona no se ve bien.', en: 'Not used in the chest: air distorts the magnetic field of the surrounding molecules and the area is not seen well.' }, ...x }),
};
const CT_CONFIRM = ['Después de la Rx: confirma o descarta, localiza y caracteriza.', 'After the film: confirms or rules out, localises and characterises.'];
const ct2 = (verdict = 'ok', es = CT_CONFIRM[0], en = CT_CONFIRM[1], x) => TK.ct(verdict, es, en, x);
const TCAR_NOTE = ['Técnica del intersticio, tras detectarlo en la Rx. Más dosis que la TC y sin contraste (no valora el mediastino). Simulada sobre este TC de 1,5 mm.', 'The technique for the interstitium, after the film detects it. Higher dose than CT and no contrast (does not assess the mediastinum). Simulated on this 1.5 mm CT.'];

/* ---------------- shared flags ---------------- */
const F = {
  lll: { kind: 'revisar', es: 'Este TC es de un paciente politraumatizado: el lóbulo inferior izquierdo ya tiene un aumento de densidad posterior real (y el derecho, algo en las zonas declives). Las simulaciones evitan ese lóbulo; no confundas ese hallazgo real con la lesión simulada.', en: 'This CT is from a trauma patient: the left lower lobe already shows a real posterior increase in density (and the right one some in the dependent areas). The simulations avoid that lobe; do not mistake that real finding for the simulated lesion.' },
  tcar: { kind: 'ampliacion', es: 'La TCAR es una simulación: este estudio tiene vóxeles de 1,5 mm y la TCAR real usa cortes finos (≈ 1 mm) con filtro de alta resolución.', en: 'HRCT is simulated: this study has 1.5 mm voxels, while real HRCT uses thin (≈ 1 mm) sections with a high-resolution kernel.' },
  rm: { kind: 'ampliacion', es: '«La RM no se usa en el tórax» es una simplificación del temario: la RM tiene indicaciones torácicas concretas (por ejemplo, la invasión del plexo braquial y de la pared en el tumor de Pancoast).', en: '"MR is not used in the chest" is a simplification of the syllabus: MR has specific chest indications (for example, brachial plexus and chest wall invasion in Pancoast tumour).' },
  bronchi: { kind: 'ampliacion', es: 'Los bronquios no están segmentados en este caso: el árbol bronquial se dibuja aproximado desde el hilio estimado.', en: 'The bronchi are not segmented in this case: the bronchial tree is drawn approximately from the estimated hilum.' },
  fissure: { kind: 'apuntes', es: 'La lesión se limita a la máscara real del lóbulo: por eso se para en seco en la cisura, como dice el temario.', en: 'The lesion is confined to the real lobe mask, so it stops sharply at the fissure, as the syllabus says.' },
};

/* ---------------- shared builders ---------------- */
/** Consolidation of (part of) one lobe, with optional air bronchogram. ext 0..1. */
function lobeConsol(A, code, ext, o = {}) {
  const key = LOBE[code], s = A.s(key), b = s.bbox, c = o.c || s.center;
  const r = [(b[1] - b[0]) / 2, (b[3] - b[2]) / 2, (b[5] - b[4]) / 2].map(v => Math.max(5, v * 1.4 * ext));
  const out = [paint(A, [key], ellip(c, r, 0.35, 0.22, 5), consolVal(o.hu === undefined ? 35 : o.hu))];
  if (o.bronch !== false) out.push(...treeTubes(bronchTree(A, code, 7, 3), { hu: o.bronchHU === undefined ? -880 : o.bronchHU, within: ['lesion'] }));
  return out;
}
const massHU = { sin: 36, arterial: 48, portal: 55, tardia: 50 };
const hilarMass = (A, code, sizeMM, extra = {}) => ({ t: 'blob', c: mid(HILUM[code], centre(A, code), extra.f || 0.12), r: [sizeMM / 2, sizeMM / 2 * 0.9, sizeMM / 2], hu: massHU, edge: 1, irregular: 0.4, texture: 6, outside: MED, label: 'lesion', ...extra });
/** Per-column posterior lung edge of a set of lobes, at (z, x): largest y. Cached. */
function postEdge(A, keys) {
  const ck = 'pul:post:' + keys.join(); if (A.cache.has(ck)) return A.cache.get(ck);
  const b = lbox(A, keys), ids = new Set(keys.map(k => A.id(k))), [, , X] = A.dims, m = new Int16Array((b[1] + 1) * X).fill(-1);
  for (let z = b[0]; z <= b[1]; z++) for (let x = b[4]; x <= b[5]; x++) for (let y = b[3]; y >= b[2]; y--) if (ids.has(A.at(z, y, x))) { m[z * X + x] = y; break; }
  A.cache.set(ck, m); return m;
}
/** Per-column top (most cranial) voxel of a lobe at (y, x). Cached. */
function lobeTop(A, key) {
  const ck = 'pul:top:' + key; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = A.s(key).bbox, id = A.id(key), [, Y, X] = A.dims, m = new Int16Array(Y * X).fill(-1);
  for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) for (let z = b[0]; z <= b[1]; z++) if (A.at(z, y, x) === id) { m[y * X + x] = z; break; }
  A.cache.set(ck, m); return m;
}
/** Septal network (secondary lobules) value: thickened interlobular (+ intralobular) septa. */
function septa(z, y, x, w, inter = 0.75, intra = 0) {
  const c = cells(z, y, x, 8, 3), d = c[1] - c[0];
  if (d < inter * w) return 1;
  if (intra) { const f = cells(z, y, x, 3.6, 9); if (f[1] - f[0] < intra * w) return 0.6; }
  return 0;
}
/** Nodule / mass: solid, mixed or ground glass, with margins, calcium, fat and cavitation. */
const CALC = { difuso: 'diffuse', central: 'central', laminar: 'laminar', palomitas: 'popcorn' };
function nodule(A, env, c, o) {
  const r = o.size / 2, out = [], con = env.phase !== 'sin';
  if (o.ggo === 'vidrio') { out.push(paint(A, LOBES, ellip(c, [r / 1.5, r / 1.5, r / 1.5], 0.25, 0.25, 8), ggoVal(330), clampBox(A, [c[0] - r, c[0] + r, c[1] - r, c[1] + r, c[2] - r, c[2] + r]))); return out; }
  if (o.ggo === 'mixto') out.push(paint(A, LOBES, ellip(c, [r / 1.5 * 1.3, r / 1.5 * 1.3, r / 1.5 * 1.3], 0.25, 0.25, 8), ggoVal(300), clampBox(A, [c[0] - r * 1.4, c[0] + r * 1.4, c[1] - r * 1.4, c[1] + r * 1.4, c[2] - r * 1.4, c[2] + r * 1.4])));
  const rs = o.ggo === 'mixto' ? r * 0.55 : r;
  const blob = { t: 'blob', c, r: [rs, rs * 0.95, rs], hu: con ? 48 : 38, texture: 5, edge: o.margin === 'lisos' ? 0.5 : 1, irregular: o.margin === 'lobulados' ? 0.75 : o.margin === 'espiculados' ? 0.3 : 0.05, spic: o.margin === 'espiculados' ? 1.1 : 0, within: LOBES, label: 'lesion' };
  if (o.calc && CALC[o.calc]) blob.calc = { pattern: CALC[o.calc], hu: 750, f: 0.35 };
  if (o.fat) blob.core = { f: 0.55, hu: -95 };
  if (o.cav) blob.core = { f: 0.5, hu: -940 };
  out.push(blob);
  return out;
}
const nodPos = (A, code, sizeMM, seed = 77) => lungPoint(A, LOBE[code], seed, sizeMM / 2 + 10, code === 'RML' ? 0.35 : 0.45);

/* ---------------- entity builders ---------------- */
function buildCollapseEntity(p, A, env, o = {}) {
  const code = o.code || p.lobe, V = (o.vol !== undefined ? o.vol : p.vol) / 100, lower = code === 'RLL' || code === 'LLL';
  const col = collapse(A, env, code, V, { dia: o.dia === false || !lower ? 0 : (1 - V) * 24, tissue: o.tissue, vessel: o.vessel });
  const out = [...col.prims];
  if (o.mass) out.push(hilarMass(A, code, o.mass));
  if (o.bronch) out.push(...treeTubes(bronchTree(A, code, 5, 3), { hu: o.bronch === 'aire' ? -880 : 8, within: ['lesion'], rScale: o.rScale || 1.1 }, col.map));
  return { out, col };
}

/* ---------------- module ---------------- */
const DAYS = [opt('1', 'Día 1', 'Day 1'), opt('5', 'Día 5', 'Day 5'), opt('6', 'Día 6', 'Day 6')];

export default {
  slug: 'pulmon',
  title: { es: 'Parénquima pulmonar', en: 'Lung parenchyma' },
  examLength: 10,
  intro: {
    text: {
      es: 'En el tórax <b>se empieza por la Rx y se confirma o caracteriza con la TC</b>; el intersticio se estudia con <b>TCAR</b> y la RM no se usa (el aire distorsiona el campo magnético). Regla de oro: <b>el patrón alveolar llena</b> (consolidación, broncograma aéreo, silueta, sin pérdida de volumen) y <b>la atelectasia encoge</b> (cisura retraída, diafragma elevado). Usa la técnica «Rx PA» (radiografía simulada a partir de este TC) y luego la TC en el mismo caso.' + fillShrinkDiagram('es'),
      en: 'In the chest <b>start with the film and confirm or characterise with CT</b>; the interstitium is studied with <b>HRCT</b> and MR is not used (air distorts the magnetic field). Golden rule: <b>the alveolar pattern fills</b> (consolidation, air bronchogram, silhouette, no volume loss) and <b>atelectasis shrinks</b> (retracted fissure, raised diaphragm). Use the "PA film" technique (a radiograph simulated from this CT) and then CT on the same case.' + fillShrinkDiagram('en'),
    },
    table: {
      es: [['Técnica', 'Papel', 'Pros / contras'], ['Rx', 'Inicial; a veces basta', 'Fácil, rápida, menos radiación · baja sensibilidad y especificidad'], ['TC', 'Tras la Rx: confirma, localiza, caracteriza', 'Detecta mucho más · irradia 400 veces más que la Rx'], ['TCAR', 'Intersticio, tras la Rx', 'Más dosis que la TC · sin contraste: no valora el mediastino'], ['RM', 'No se usa en el tórax', 'El aire altera el campo magnético']],
      en: [['Technique', 'Role', 'Pros / cons'], ['Film', 'First; sometimes enough', 'Easy, fast, lower dose · low sensitivity and specificity'], ['CT', 'After the film: confirms, localises, characterises', 'Detects much more · 400 times the dose of a film'], ['HRCT', 'Interstitium, after the film', 'Higher dose than CT · no contrast: does not assess the mediastinum'], ['MR', 'Not used in the chest', 'Air distorts the magnetic field']],
    },
  },
  groups: [
    { id: 'tec', es: 'Técnicas de imagen', en: 'Imaging techniques' },
    { id: 'alv', es: 'Espacio aéreo (patrón alveolar)', en: 'Airspace (alveolar pattern)' },
    { id: 'atel', es: 'Colapso pulmonar (atelectasia)', en: 'Lung collapse (atelectasis)' },
    { id: 'tcatel', es: 'Qué añade la TC en la atelectasia', en: 'What CT adds in atelectasis' },
    { id: 'int', es: 'Intersticio (TCAR)', en: 'Interstitium (HRCT)' },
    { id: 'via', es: 'Vía aérea', en: 'Airways' },
    { id: 'epoc', es: 'EPOC y enfisema', en: 'COPD and emphysema' },
    { id: 'nod', es: 'Nódulos y cáncer', en: 'Nodules and cancer' },
    { id: 'covid', es: 'COVID-19 y SDRA', en: 'COVID-19 and ARDS' },
  ],
  entities: [
    /* ===== técnicas ===== */
    {
      id: 'tecnicas', group: 'tec', tag: 'sim', exam: false,
      name: { es: 'Rx, TC, TCAR y RM: qué aporta cada una', en: 'Film, CT, HRCT and MR: what each one adds' },
      short: { es: 'Neumonía (técnicas)', en: 'Pneumonia (techniques)' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.5, at: (p, A) => centre(A, 'RUL') },
      params: [],
      techniques: [
        TK.rx('best', 'Técnica inicial: a veces basta para el diagnóstico. Fácil, rápida y con menos radiación; baja sensibilidad y especificidad y difícil de interpretar.', 'First technique: sometimes enough for the diagnosis. Easy, fast and lower dose; low sensitivity and specificity, and hard to interpret.', { default: true }),
        ct2('best', 'Después de la Rx: confirma o descarta, localiza y caracteriza; con contraste IV estudia perfusión y vasos. Detecta mucho más, pero irradia 400 veces más que la placa.', 'After the film: confirms or rules out, localises and characterises; with IV contrast it studies perfusion and vessels. Detects much more, but gives 400 times the dose of a film.'),
        TK.tcar('ok', TCAR_NOTE[0], TCAR_NOTE[1]),
        TK.rm(),
      ],
      build: (p, A) => [...lobeConsol(A, 'RUL', 0.6), mark(centre(A, 'RUL'), 'Neumonía del LSD', 'RUL pneumonia', { dx: -150, dy: -40 })],
      readouts: (p, A, env) => [
        { label: { es: 'Dosis relativa', en: 'Relative dose' }, value: env.modality === 'rx' ? { es: 'Rx = 1', en: 'Film = 1' } : env.technique && env.technique.id === 'tcar' ? { es: 'TCAR > TC (≈ 400 Rx)', en: 'HRCT > CT (≈ 400 films)' } : { es: 'TC ≈ 400 Rx', en: 'CT ≈ 400 films' } },
        { label: { es: 'Orden', en: 'Order' }, value: { es: 'Rx → TC (TCAR si intersticio) · RM no', en: 'Film → CT (HRCT for interstitium) · no MR' } },
      ],
      info: {
        where: { es: 'La misma neumonía del lóbulo superior derecho vista con cada técnica.', en: 'The same right upper lobe pneumonia seen with each technique.' },
        see: { es: '<b>Rx</b>: opacidad en el campo superior derecho. <b>TC</b>: consolidación con broncograma aéreo, limitada por la cisura. <b>RM</b>: el pulmón aireado sale negro, sin información del parénquima.', en: '<b>Film</b>: opacity in the right upper zone. <b>CT</b>: consolidation with air bronchogram, limited by the fissure. <b>MR</b>: the aerated lung is black, with no parenchymal information.' },
        technique: { es: 'Rx inicial → TC para confirmar, localizar y caracterizar → TCAR para el intersticio. La TC irradia 400 veces más que la Rx; la TCAR, más que la TC.', en: 'Film first → CT to confirm, localise and characterise → HRCT for the interstitium. CT gives 400 times the dose of a film; HRCT more than CT.' },
        tip: { es: 'Pasa por las cuatro técnicas sin cambiar nada: es la pregunta «¿por qué no RM en el pulmón?».', en: 'Go through the four techniques without changing anything: it is the question "why no MR for the lung?".' },
      },
      flags: [F.rm, F.tcar, { kind: 'ampliacion', es: 'La Rx es una radiografía digital reconstruida a partir de este TC (simulación), y la RM es una pseudo-RM calculada a partir de la densidad.', en: 'The film is a digitally reconstructed radiograph from this CT (simulation), and the MR is a pseudo-MR computed from density.' }],
    },
    /* ===== espacio aéreo ===== */
    {
      id: 'alveolar', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Patrón alveolar: broncograma, silueta y cisura', en: 'Alveolar pattern: bronchogram, silhouette and fissure' },
      short: { es: 'Patrón alveolar', en: 'Alveolar pattern' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.6, at: (p, A) => centre(A, p.lobe), examPlane: 'axial' },
      params: [lobeParam('RML'), { id: 'ext', type: 'range', label: { es: 'Extensión en el lóbulo', en: 'Extent within the lobe' }, min: 40, max: 100, step: 10, value: 100, unit: '%', examMin: 70 }, { id: 'bronch', type: 'toggle', label: { es: 'Broncograma aéreo', en: 'Air bronchogram' }, value: true }],
      techniques: [TK.rx('best', 'La Rx muestra los signos: opacidad mal definida, silueta, broncograma y límite en la cisura.', 'The film shows the signs: ill-defined opacity, silhouette, bronchogram and fissural border.', { default: true }), TK.rxl('ok', 'La lateral localiza el lóbulo (cisuras).', 'The lateral view localises the lobe (fissures).'), ct2()],
      compare: ['atel-obstructiva', 'vidrio'],
      build: (p, A) => {
        const out = lobeConsol(A, p.lobe, p.ext / 100, { bronch: p.bronch });
        const tr = bronchTree(A, p.lobe, 7, 3)[0];
        if (p.bronch) out.push(mark(tr.pts[1], 'Broncograma aéreo', 'Air bronchogram', { dx: -150, dy: 30 }));
        if (p.ext >= 80) out.push(mark(silhouetteAt(A, p.lobe), 'Signo de la silueta', 'Silhouette sign', { dx: 60, dy: -50, planes: ['coronal'] }));
        out.push(mark(fissurePoint(A, p.lobe), 'Límite nítido en la cisura', 'Sharp at the fissure', { dx: 60, dy: 50 }));
        return out;
      },
      readouts: p => [
        { label: { es: 'Contorno que se borra (silueta)', en: 'Border lost (silhouette)' }, value: p.ext >= 80 ? { es: SILH[p.lobe][0], en: SILH[p.lobe][1] } : { es: 'Ninguno (no contacta)', en: 'None (no contact)' } },
        { label: { es: 'Volumen del lóbulo', en: 'Lobe volume' }, value: { es: 'Sin pérdida (incluso puede aumentar)', en: 'No loss (may even increase)' } },
      ],
      info: {
        where: { es: 'Los alvéolos de un lóbulo real del paciente; la lesión respeta su cisura.', en: 'The alveoli of one of the patient\'s real lobes; the lesion respects its fissure.' },
        see: { es: 'El aire alveolar se sustituye por otro material (agua, pus, sangre, células, grasa) = neumonía. <b>Consolidación</b> de límites difusos que se vuelven <b>nítidos al llegar a una cisura</b> · <b>signo de la silueta</b> con los vasos y estructuras de igual densidad en contacto · <b>broncograma aéreo</b> (bronquios con aire dentro) · <b>sin pérdida de volumen</b>.', en: 'Alveolar air is replaced by another material (water, pus, blood, cells, fat) = pneumonia. <b>Consolidation</b> with fuzzy borders that become <b>sharp at a fissure</b> · <b>silhouette sign</b> with vessels and structures of equal density in contact · <b>air bronchogram</b> (air-filled bronchi inside) · <b>no volume loss</b>.' },
        technique: { es: 'Rx para detectarlo; TC si hay dudas o no responde.', en: 'Film to detect it; CT if in doubt or if it does not respond.' },
        differential: { es: 'Atelectasia: misma densidad pero <b>pierde volumen</b> (cisura retraída, diafragma elevado). Vidrio deslustrado: no borra los vasos.', en: 'Atelectasis: same density but it <b>loses volume</b> (retracted fissure, raised diaphragm). Ground glass: does not hide the vessels.' },
        tip: { es: 'Elige «LM» y mira la Rx PA: el borde derecho del corazón desaparece. Con «LID» lo que se borra es el diafragma.', en: 'Pick "RML" and look at the PA film: the right heart border disappears. With "RLL" it is the diaphragm that is lost.' },
      },
      flags: [F.fissure, F.bronchi, F.lll],
    },
    {
      id: 'consol-localizada', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Consolidación localizada', en: 'Localised consolidation' },
      short: { es: 'Consolidación localizada', en: 'Localised consolidation' },
      view: { plane: 'axial', window: 'lung', zoom: 1.7, at: (p, A) => p.causa === 'contusion' ? lateralPoint(A, p.lobe) : centre(A, p.lobe), examPlane: 'axial' },
      params: [
        lobeParam('RUL'),
        { id: 'causa', type: 'select', label: { es: 'Causa', en: 'Cause' }, options: [opt('neumonia', 'Neumonía bacteriana', 'Bacterial pneumonia'), opt('contusion', 'Contusión pulmonar', 'Lung contusion'), opt('tumor', 'Tumor', 'Tumour')], value: 'neumonia' },
        { id: 'ext', type: 'range', label: { es: 'Extensión', en: 'Extent' }, min: 30, max: 100, step: 10, value: 70, unit: '%', examMin: 60 },
      ],
      techniques: [TK.rx('best', 'La Rx suele bastar para la neumonía.', 'The film is usually enough for pneumonia.'), ct2('ok', 'Si la lesión no responde al tratamiento de la neumonía → TC: puede ser un tumor.', 'If the lesion does not respond to pneumonia treatment → CT: it may be a tumour.', { default: true })],
      treatment: { label: { es: 'Tras antibiótico', en: 'After antibiotics' }, note: { es: 'La neumonía bacteriana se resuelve. Sospecha un tumor en toda lesión que no responde al tratamiento de la neumonía y haz una TC.', en: 'Bacterial pneumonia resolves. Suspect a tumour in any lesion that does not respond to pneumonia treatment, and do a CT.' } },
      compare: ['atel-obstructiva', 'vidrio', 'consol-difusa-cronica'],
      build: (p, A, env) => {
        const ext = p.ext / 100, out = [];
        if (p.causa === 'contusion') {
          const c = lateralPoint(A, p.lobe), r = [22 * ext + 8, 18 * ext + 8, 14 * ext + 6];
          out.push(paint(A, SIDE[sideOf(p.lobe)], ellip(c, r.map(v => v / 1.5), 0.6, 0.3, 13), consolVal(40)));
          out.push(mark(c, 'Contusión periférica (cruza la cisura)', 'Peripheral contusion (crosses the fissure)', { dx: 60, dy: -40 }));
          return out;
        }
        const resolved = env.treated && p.causa === 'neumonia';
        out.push(...lobeConsol(A, p.lobe, resolved ? ext * 0.22 : ext, { bronch: !resolved }));
        if (p.causa === 'tumor') { out.push(hilarMass(A, p.lobe, 26)); out.push(mark(HILUM[p.lobe], 'Tumor: no responde', 'Tumour: does not respond', { dx: 60, dy: -40 })); }
        out.push(mark(centre(A, p.lobe), resolved ? 'Resolución' : 'Consolidación', resolved ? 'Resolving' : 'Consolidation', { dx: -160, dy: -30 }));
        return out;
      },
      readouts: (p, A, env) => [
        { label: { es: 'Tras antibiótico', en: 'After antibiotics' }, value: p.causa === 'neumonia' ? { es: 'Se resuelve', en: 'Resolves' } : p.causa === 'tumor' ? { es: 'No responde → TC', en: 'No response → CT' } : { es: 'No es infecciosa: antecedente de traumatismo', en: 'Not infective: history of trauma' } },
      ],
      info: {
        where: { es: 'Un lóbulo (neumonía bacteriana, tumor) o la periferia bajo la pared costal (contusión, que no respeta la cisura).', en: 'One lobe (bacterial pneumonia, tumour) or the periphery under the chest wall (contusion, which ignores the fissure).' },
        see: { es: 'Ocupación del espacio aéreo en una zona: neumonía bacteriana · contusión pulmonar · algunos tumores.', en: 'Airspace filling in one area: bacterial pneumonia · lung contusion · some tumours.' },
        technique: { es: '<b>Sospechar un tumor en toda lesión que no responde</b> al tratamiento de la neumonía y hacer TC.', en: '<b>Suspect a tumour in any lesion that does not respond</b> to pneumonia treatment, and do a CT.' },
        differential: { es: 'Difusa aguda (edema, hemorragia, aspiración, inmunodeprimido) y difusa crónica (neoplasia, sarcoidosis).', en: 'Diffuse acute (oedema, haemorrhage, aspiration, immunosuppressed) and diffuse chronic (neoplasm, sarcoidosis).' },
        tip: { es: 'Activa «Tras antibiótico» con «Neumonía» y luego con «Tumor»: solo una se va.', en: 'Turn on "After antibiotics" with "Pneumonia" and then with "Tumour": only one goes away.' },
      },
      flags: [F.fissure, F.lll, { kind: 'ampliacion', es: 'La forma de la contusión (periférica, bajo las costillas, sin respetar cisuras) es la habitual; el temario solo la cita como causa.', en: 'The shape of the contusion (peripheral, under the ribs, ignoring fissures) is the usual one; the syllabus only lists it as a cause.' }],
    },
    {
      id: 'consol-difusa-aguda', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Consolidación difusa aguda', en: 'Diffuse acute consolidation' },
      short: { es: 'Difusa aguda', en: 'Diffuse acute' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.3, at: p => p.causa === 'aspirativa' ? [302, 138, 105] : LUNGS_C, examPlane: 'axial' },
      params: [
        { id: 'causa', type: 'select', dropdown: true, label: { es: 'Causa', en: 'Cause' }, options: [opt('edema', 'Edema pulmonar', 'Pulmonary oedema'), opt('hemorragia', 'Hemorragia pulmonar', 'Pulmonary haemorrhage'), opt('aspirativa', 'Neumonía aspirativa', 'Aspiration pneumonia'), opt('inmuno', 'Neumonía en inmunodeprimido', 'Pneumonia in the immunosuppressed')], value: 'edema' },
        { id: 'sev', type: 'range', label: { es: 'Intensidad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 },
      ],
      techniques: [TK.rx('best', null, null, { default: true }), ct2()],
      compare: ['consol-difusa-cronica', 'alas-mariposa', 'sdra'],
      build: (p, A) => {
        const k = 0.45 + 0.3 * p.sev, D = lungDepth(A);
        const shape = {
          edema: (z, y, x) => (1 - sstep(45, 95, hd(z, y, x))) * (0.55 + 0.45 * sstep(85, 150, y)),
          hemorragia: (z, y, x) => sstep(-0.05, 0.35, nz(z, y, x, 0.05, 11)),
          aspirativa: (z, y, x) => sstep(105, 150, y) * sstep(250, 300, z) * (x < XMID ? 1 : 0.55) * (0.75 + 0.25 * nz(z, y, x, 0.08, 4)),
          inmuno: (z, y, x) => sstep(-0.25, 0.25, nz(z, y, x, 0.045, 17)),
        }[p.causa];
        return [paint(A, LOBES, (z, y, x) => clamp01(k * shape(z, y, x)) * sstep(1.5, 6, D.mm(z, y, x)), consolVal(32)),
          mark(p.causa === 'aspirativa' ? [300, 140, 95] : [272, 112, 95], 'Consolidación bilateral aguda', 'Acute bilateral consolidation', { dx: -170, dy: -40 })];
      },
      readouts: p => [{ label: { es: 'Distribución', en: 'Distribution' }, value: { edema: { es: 'Central y declive, bilateral', en: 'Central and dependent, bilateral' }, hemorragia: { es: 'Parcheada, bilateral', en: 'Patchy, bilateral' }, aspirativa: { es: 'Zonas declives, más a la derecha', en: 'Dependent zones, more on the right' }, inmuno: { es: 'Difusa, parcheada', en: 'Diffuse, patchy' } }[p.causa] }, { label: { es: 'Evolución', en: 'Course' }, value: { es: 'Aguda', en: 'Acute' } }],
      info: {
        where: { es: 'Ambos pulmones.', en: 'Both lungs.' },
        see: { es: 'Ocupación difusa y aguda del espacio aéreo: <b>edema pulmonar · hemorragia pulmonar · neumonía aspirativa · neumonía en inmunodeprimidos</b>.', en: 'Diffuse, acute airspace filling: <b>pulmonary oedema · pulmonary haemorrhage · aspiration pneumonia · pneumonia in the immunosuppressed</b>.' },
        technique: { es: 'Rx de entrada; TC para caracterizar.', en: 'Film first; CT to characterise.' },
        differential: { es: 'Difusa crónica: evolución lenta y prolongada, no responde al tratamiento (neoplasias, sarcoidosis).', en: 'Diffuse chronic: slow, prolonged course, no response to treatment (neoplasms, sarcoidosis).' },
      },
      flags: [{ kind: 'ampliacion', es: 'La distribución de cada causa (edema central y declive, aspiración en zonas declives y más derecha) es la habitual; el temario solo enumera las causas.', en: 'The distribution of each cause (central and dependent oedema, aspiration in dependent zones and more on the right) is the usual one; the syllabus only lists the causes.' }, F.lll],
    },
    {
      id: 'consol-difusa-cronica', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Consolidación difusa crónica', en: 'Diffuse chronic consolidation' },
      short: { es: 'Difusa crónica', en: 'Diffuse chronic' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.3, at: () => [262, 108, XMID], examPlane: 'axial' },
      params: [
        { id: 'causa', type: 'select', label: { es: 'Causa', en: 'Cause' }, options: [opt('sarcoidosis', 'Sarcoidosis', 'Sarcoidosis'), opt('neoplasia', 'Neoplasia', 'Neoplasm')], value: 'sarcoidosis' },
        { id: 'meses', type: 'select', label: { es: 'Tiempo de evolución', en: 'Time course' }, options: [opt('0', 'Inicio', 'Onset'), opt('3', '3 meses', '3 months'), opt('6', '6 meses', '6 months'), opt('12', '12 meses', '12 months')], value: '6' },
      ],
      techniques: [TK.rx('best', null, null, { default: true }), ct2()],
      treatment: { label: { es: 'Tras antibiótico', en: 'After antibiotics' }, note: { es: 'No responde al tratamiento: la imagen no cambia (evolución lenta y prolongada).', en: 'No response to treatment: the image does not change (slow, prolonged course).' } },
      compare: ['consol-difusa-aguda', 'consol-localizada'],
      build: (p, A) => {
        const g = 0.5 + 0.5 * (+p.meses) / 12, out = [], sar = p.causa === 'sarcoidosis';
        for (let i = 0; i < 12; i++) {
          const code = ['RUL', 'RLL', 'LUL', 'RML'][i % 4], q = lungPoint(A, LOBE[code], 300 + i * 7 + (sar ? 0 : 50), 8, sar ? 0.3 + 0.03 * i : null);
          const side = code[0] === 'R' ? 'R' : 'L', c = sar ? mid(HIL[side], q, 0.62) : q;
          if (!sar && i % 3 === 2) continue;
          out.push({ t: 'blob', c, r: (7 + 7 * hashU(i, 3, 5)) * g * (sar ? 1 : 1.3), hu: 35, edge: 3, irregular: 0.6, texture: 8, within: LOBES, label: 'lesion' });
        }
        out.push(mark(mid(HIL.R, centre(A, 'RUL'), 0.5), 'Consolidación crónica', 'Chronic consolidation', { dx: -170, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Evolución', en: 'Course' }, value: { es: 'Lenta y prolongada; no responde al tratamiento', en: 'Slow and prolonged; no response to treatment' } }, { label: { es: 'Tiempo', en: 'Time' }, value: { es: p.meses === '0' ? 'Inicio' : p.meses + ' meses', en: p.meses === '0' ? 'Onset' : p.meses + ' months' } }],
      info: {
        where: { es: 'Ambos pulmones (en la sarcoidosis, de predominio perihiliar en esta simulación).', en: 'Both lungs (perihilar in this simulation of sarcoidosis).' },
        see: { es: 'Consolidaciones difusas de <b>evolución lenta y prolongada</b> que <b>no responden al tratamiento</b>: neoplasias, sarcoidosis.', en: 'Diffuse consolidations with a <b>slow, prolonged course</b> that <b>do not respond to treatment</b>: neoplasms, sarcoidosis.' },
        technique: { es: 'Rx seriadas; TC para caracterizar.', en: 'Serial films; CT to characterise.' },
        tip: { es: 'Mueve el tiempo de evolución y activa «Tras antibiótico»: crece despacio y no cambia con el tratamiento.', en: 'Move the time course and turn on "After antibiotics": it grows slowly and does not change with treatment.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La distribución perihiliar de la sarcoidosis y el aspecto multifocal de la neoplasia son orientativos; el temario solo da las causas y la evolución.', en: 'The perihilar distribution of sarcoidosis and the multifocal look of the neoplasm are indicative; the syllabus only gives the causes and the course.' }],
    },
    {
      id: 'alas-mariposa', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Consolidación central: edema «en alas de mariposa»', en: 'Central consolidation: "butterfly" oedema' },
      short: { es: 'Alas de mariposa', en: 'Butterfly oedema' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.3, at: () => [266, 110, XMID], examPlane: 'coronal' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Intensidad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }],
      techniques: [TK.rx('best', 'Imagen clásica de la Rx: opacidad bilateral perihiliar que respeta la periferia.', 'The classic film image: bilateral perihilar opacity sparing the periphery.', { default: true }), ct2()],
      compare: ['consol-periferica', 'consol-difusa-aguda'],
      build: (p, A) => {
        const D = lungDepth(A), k = 0.6 + 0.3 * p.sev;
        return [paint(A, LOBES, (z, y, x) => clamp01(k * (1 - sstep(35 + 8 * p.sev, 70 + 10 * p.sev, hd(z, y, x))) * (0.85 + 0.25 * nz(z, y, x, 0.07, 6))) * sstep(8, 20, D.mm(z, y, x)), consolVal(30)),
          mark([262, 112, 100], 'Perihiliar bilateral', 'Bilateral perihilar', { dx: -170, dy: -40 }), mark([262, 70, 70], 'Periferia respetada', 'Periphery spared', { dx: -170, dy: 40, planes: ['coronal'] })];
      },
      readouts: () => [{ label: { es: 'Patrón', en: 'Pattern' }, value: { es: 'Bilateral, central, agudo', en: 'Bilateral, central, acute' } }, { label: { es: 'Clínica', en: 'Clinical' }, value: { es: 'Síntomas de fallo cardíaco', en: 'Heart-failure symptoms' } }],
      info: {
        where: { es: 'Zonas centrales o perihiliares de ambos pulmones; la periferia queda respetada.', en: 'Central or perihilar zones of both lungs; the periphery is spared.' },
        see: { es: 'Edema pulmonar clásicamente <b>«en alas de mariposa»</b>: bilateral, de predominio central, agudo y con síntomas de fallo cardíaco. Otras causas de consolidación central: hemorragia pulmonar, neumonía aspirativa, inhalación de tóxicos.', en: 'Pulmonary oedema classically <b>"butterfly" (bat-wing)</b>: bilateral, central, acute and with heart-failure symptoms. Other causes of central consolidation: pulmonary haemorrhage, aspiration pneumonia, toxic inhalation.' },
        technique: { es: 'Se reconoce en la Rx.', en: 'Recognised on the film.' },
        differential: { es: 'Periférica: neumonía eosinófila y organizativa (corticoides), infarto, contusión.', en: 'Peripheral: eosinophilic and organising pneumonia (steroids), infarction, contusion.' },
      },
      flags: [F.lll],
    },
    {
      id: 'consol-periferica', group: 'alv', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Consolidación periférica', en: 'Peripheral consolidation' },
      short: { es: 'Consolidación periférica', en: 'Peripheral consolidation' },
      view: { plane: 'axial', window: 'lung', zoom: 1.4, at: (p, A) => p.causa === 'eosinofila' ? [262, 100, XMID] : lateralPoint(A, 'RLL'), examPlane: 'axial' },
      params: [{ id: 'causa', type: 'select', label: { es: 'Causa', en: 'Cause' }, options: [opt('eosinofila', 'Neumonía eosinófila / organizativa', 'Eosinophilic / organising pneumonia'), opt('infarto', 'Infarto pulmonar', 'Pulmonary infarction'), opt('contusion', 'Contusión', 'Contusion')], value: 'eosinofila' }],
      techniques: [TK.rx('ok'), ct2('best', 'La TC muestra bien la distribución periférica, subpleural.', 'CT shows the peripheral, subpleural distribution well.', { default: true })],
      treatment: { label: { es: 'Corticoides', en: 'Steroids' }, note: { es: 'La neumonía eosinófila y la organizativa se tratan con corticoides (aquí se ve la mejoría); el infarto y la contusión no.', en: 'Eosinophilic and organising pneumonia are treated with steroids (improvement shown here); infarction and contusion are not.' } },
      compare: ['alas-mariposa'],
      build: (p, A, env) => {
        const D = lungDepth(A);
        if (p.causa === 'eosinofila') {
          const dmax = env.treated ? 7 : 22;
          return [paint(A, LOBES, (z, y, x) => (1 - sstep(dmax * 0.55, dmax, D.mm(z, y, x))) * sstep(-0.3, 0.15, nz(z, y, x, 0.05, 21)) * (1 - sstep(300, 330, z)) * sstep(205, 225, z), consolVal(35)),
            mark(lateralPoint(A, 'RUL'), 'Periférica, subpleural', 'Peripheral, subpleural', { dx: -170, dy: -30 })];
        }
        const c = lateralPoint(A, 'RLL'), r = p.causa === 'infarto' ? [18, 14, 13] : [26, 20, 16];
        return [paint(A, p.causa === 'infarto' ? [LOBE.RLL] : SIDE.R, ellip(c, r.map(v => v / 1.5), p.causa === 'infarto' ? 0.15 : 0.6, 0.2, 14), consolVal(38)),
          mark(c, p.causa === 'infarto' ? 'Infarto: base pleural' : 'Contusión', p.causa === 'infarto' ? 'Infarct: pleural base' : 'Contusion', { dx: -170, dy: 30 })];
      },
      readouts: (p, A, env) => [{ label: { es: 'Corticoides', en: 'Steroids' }, value: p.causa === 'eosinofila' ? { es: env.treated ? 'Mejora' : 'Indicados', en: env.treated ? 'Improves' : 'Indicated' } : { es: 'No es su tratamiento', en: 'Not its treatment' } }],
      info: {
        where: { es: 'Periferia del pulmón, bajo la pleura.', en: 'Lung periphery, under the pleura.' },
        see: { es: 'Consolidación periférica: <b>neumonía eosinófila y organizativa</b> (tratamiento: corticoides) · <b>infarto pulmonar</b> · <b>contusión</b>.', en: 'Peripheral consolidation: <b>eosinophilic and organising pneumonia</b> (treatment: steroids) · <b>pulmonary infarction</b> · <b>contusion</b>.' },
        technique: { es: 'Rx; la TC delimita la distribución subpleural.', en: 'Film; CT shows the subpleural distribution.' },
        differential: { es: 'Central = «alas de mariposa» (edema). Periférica = «el negativo» del edema.', en: 'Central = "butterfly" (oedema). Peripheral = the "negative" of oedema.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La forma del infarto (base pleural, vértice hacia el hilio) y la de la contusión son las habituales; el temario solo da las causas.', en: 'The shape of the infarct (pleural base, apex toward the hilum) and of the contusion are the usual ones; the syllabus only gives the causes.' }],
    },
    /* ===== atelectasia ===== */
    {
      id: 'atel-obstructiva', group: 'atel', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Atelectasia obstructiva', en: 'Obstructive atelectasis' },
      short: { es: 'Atelectasia obstructiva', en: 'Obstructive atelectasis' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.6, at: (p, A) => mid(collapsedAt(A, p.lobe, p.vol / 100), HILUM[p.lobe], 0.3), examPlane: 'axial' },
      params: [
        lobeParam('RUL'),
        { id: 'vol', type: 'range', label: { es: 'Volumen que conserva el lóbulo', en: 'Volume the lobe keeps' }, min: 20, max: 90, step: 5, value: 40, unit: '%', examMin: 20 },
        { id: 'mass', type: 'toggle', label: { es: 'Tumor central que obstruye', en: 'Obstructing central tumour' }, value: true },
        { id: 'bronch', type: 'select', label: { es: 'Bronquios distales', en: 'Distal bronchi' }, options: [opt('liquido', 'Broncograma líquido', 'Fluid bronchogram'), opt('no', 'No visibles', 'Not visible')], value: 'liquido' },
      ],
      techniques: [TK.rx('best', 'Opacidad con pérdida de volumen: cisura retraída, diafragma elevado.', 'Opacity with volume loss: retracted fissure, raised diaphragm.', { default: true }), TK.rxl('ok', 'La lateral muestra la cisura desplazada.', 'The lateral view shows the displaced fissure.'), ct2('ok', 'Vía aérea central: permeabilidad o compromiso.', 'Central airway: patency or obstruction.'), TK.med('best', 'Separa el pulmón colapsado (capta, signo del angiograma) del tumor central (hipodenso); broncograma líquido = obstrucción.', 'Separates collapsed lung (enhancing, angiogram sign) from the central tumour (hypodense); fluid bronchogram = obstruction.')],
      compare: ['consol-localizada', 'atel-cicatricial', 'angiograma'],
      build: (p, A, env) => {
        const { out, col } = buildCollapseEntity(p, A, env, { mass: p.mass ? 24 : 0, bronch: p.bronch === 'liquido' ? 'liquido' : null });
        out.push(mark(col.map(fissurePoint(A, p.lobe)), 'Cisura retraída', 'Retracted fissure', { dx: 60, dy: 50 }));
        if (p.mass) out.push(mark(HILUM[p.lobe], 'Obstrucción bronquial (cáncer)', 'Bronchial obstruction (cancer)', { dx: 60, dy: -50 }));
        return out;
      },
      readouts: (p) => [
        { label: { es: 'Volumen del lóbulo', en: 'Lobe volume' }, value: { es: `${p.vol} % (pérdida de volumen)`, en: `${p.vol} % (volume loss)` } },
        { label: { es: 'Mecanismo', en: 'Mechanism' }, value: { es: 'Reabsorción del aire distal a una obstrucción bronquial completa', en: 'Resorption of air distal to a complete bronchial obstruction' } },
      ],
      info: {
        where: { es: 'El lóbulo distal al bronquio obstruido; el tumor central está en el hilio (posición estimada).', en: 'The lobe distal to the obstructed bronchus; the central tumour sits at the hilum (estimated position).' },
        see: { es: '<b>Atelectasia</b> = pérdida de volumen por insuflación incompleta, vista como aumento de densidad, con <b>retracción de la cisura y elevación del diafragma</b>. Obstructiva: reabsorción del aire distal a una obstrucción bronquial completa.', en: '<b>Atelectasis</b> = volume loss from incomplete inflation, seen as increased density, with <b>fissure retraction and diaphragm elevation</b>. Obstructive: resorption of air distal to a complete bronchial obstruction.' },
        technique: { es: 'Rx; la TC valora la vía aérea central y distingue pulmón colapsado de tumor.', en: 'Film; CT assesses the central airway and separates collapsed lung from tumour.' },
        differential: { es: '<b>Es la más peligrosa</b>: se relaciona con el cáncer de pulmón (un cáncer central obstruye el bronquio, el aire queda atrapado y las secreciones no se expulsan). Neumonía: misma densidad, sin pérdida de volumen.', en: '<b>The most dangerous one</b>: linked to lung cancer (a central cancer blocks the bronchus, air is trapped and secretions are not cleared). Pneumonia: same density, no volume loss.' },
        tip: { es: 'Baja el volumen y mira cómo se desplaza la cisura; compáralo con la neumonía del mismo lóbulo.', en: 'Lower the volume and watch the fissure move; compare it with pneumonia of the same lobe.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Hacia dónde colapsa cada lóbulo (LSD hacia arriba y medial, LM contra el corazón, inferiores hacia atrás y medial) es la regla habitual; el temario no lo detalla.', en: 'Where each lobe collapses (RUL up and medial, RML against the heart, lower lobes back and medial) is the usual rule; the syllabus does not detail it.' }, F.lll],
    },
    {
      id: 'atel-pasiva', group: 'atel', tag: 'ct-aprox', contrast: true,
      name: { es: 'Atelectasia por relajación pasiva (derrame)', en: 'Passive (relaxation) atelectasis (effusion)' },
      short: { es: 'Atelectasia pasiva', en: 'Passive atelectasis' },
      view: { plane: 'axial', window: 'mediastinum', zoom: 1.8, at: (p, A) => [300, 145, 82], examPlane: 'axial' },
      params: [{ id: 'derrame', type: 'range', label: { es: 'Grosor del derrame', en: 'Effusion depth' }, min: 10, max: 50, step: 5, value: 30, unit: 'mm', examMin: 20 }],
      techniques: [TK.med('best', 'El líquido (≈ 0–15 UH) se separa del pulmón colapsado, que capta contraste.', 'Fluid (≈ 0–15 HU) separates from the collapsed lung, which enhances.', { default: true }), ct2('ok', 'En ventana de pulmón líquido y pulmón colapsado se confunden.', 'On the lung window fluid and collapsed lung look alike.'), TK.rx('ok', 'En decúbito el derrame se ve como un velo difuso.', 'Supine, the effusion is a diffuse haze.')],
      compare: ['atel-compresiva', 'atel-obstructiva'],
      build: (p, A, env) => {
        const keys = [LOBE.RLL], ids = new Set(keys.map(k => A.id(k))), m = postEdge(A, keys), [, , X] = A.dims, con = env.phase !== 'sin', band = 6 + p.derrame * 0.3;
        return [{ t: 'cols', box: lbox(A, keys), label: 'lesion', fn: (z, y, x, cur) => {
          if (!ids.has(cur.orig)) return null;
          const e = m[z * X + x]; if (e < 0) return null;
          const d = (e - y) * 1.5 - 3 * nz(z, y, x, 0.08, 2);
          if (d < p.derrame) return { hu: Math.round(9 + 4 * nz(z, y, x, 0.5, 1)) };
          if (d < p.derrame + band) return { hu: Math.round((con ? 70 : 38) + 6 * nz(z, y, x, 0.5, 3)) };
          return null;
        } }, mark([300, 150, 82], 'Derrame pleural', 'Pleural effusion', { dx: -170, dy: 40 }), mark([300, 150 - Math.round(p.derrame / 1.5) - 3, 82], 'Pulmón relajado (colapsado)', 'Relaxed (collapsed) lung', { dx: -190, dy: -40 })];
      },
      readouts: p => [{ label: { es: 'Causa', en: 'Cause' }, value: { es: 'Patología pleural (derrame)', en: 'Pleural disease (effusion)' } }, { label: { es: 'Derrame', en: 'Effusion' }, value: `${p.derrame} mm` }],
      info: {
        where: { es: 'Lóbulo inferior, junto al derrame pleural declive.', en: 'Lower lobe, next to the dependent pleural effusion.' },
        see: { es: 'Atelectasia por <b>relajación</b>: el pulmón no puede expandirse. <b>Pasiva</b>: por patología pleural, generalmente derrame.', en: '<b>Relaxation</b> atelectasis: the lung cannot expand. <b>Passive</b>: from pleural disease, usually effusion.' },
        technique: { es: 'TC con contraste en ventana de mediastino: líquido sin captación frente a pulmón colapsado que capta.', en: 'Contrast CT on the mediastinal window: non-enhancing fluid versus enhancing collapsed lung.' },
        differential: { es: 'Compresiva: la causa es una lesión pulmonar vecina, no la pleura.', en: 'Compressive: the cause is a neighbouring lung lesion, not the pleura.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La pleura no está segmentada: el derrame se dibuja dentro de la parte posterior de la máscara del lóbulo inferior derecho (posición aproximada). Los valores en UH son orientativos.', en: 'The pleura is not segmented: the effusion is drawn inside the posterior part of the right lower lobe mask (approximate position). HU values are indicative.' }],
    },
    {
      id: 'atel-compresiva', group: 'atel', tag: 'ct-real',
      name: { es: 'Atelectasia compresiva', en: 'Compressive atelectasis' },
      short: { es: 'Atelectasia compresiva', en: 'Compressive atelectasis' },
      view: { plane: 'axial', window: 'lung', zoom: 1.8, at: () => [238, 96, 96], examPlane: 'axial' },
      params: [{ id: 'causa', type: 'select', label: { es: 'Lesión vecina', en: 'Neighbouring lesion' }, options: [opt('bulla', 'Bulla', 'Bulla'), opt('masa', 'Masa', 'Mass')], value: 'bulla' }, { id: 'size', type: 'range', label: { es: 'Tamaño de la lesión', en: 'Lesion size' }, min: 30, max: 70, step: 5, value: 50, unit: 'mm', examMin: 40 }],
      techniques: [ct2('best', 'La TC muestra la lesión y la banda de pulmón comprimido a su alrededor.', 'CT shows the lesion and the band of compressed lung around it.', { default: true }), TK.rx('ok')],
      compare: ['atel-pasiva', 'bulloso'],
      build: (p, A, env) => {
        const c = [238, 96, 96], r = p.size / 2;
        if (p.causa === 'bulla') return [{ t: 'blob', c, r: [r + 5, r + 4, r + 4], hu: -990, rim: { w: 5, hu: env.phase !== 'sin' ? 62 : 36 }, edge: 0.8, within: SIDE.R, label: 'lesion' }, mark(c, 'Bulla', 'Bulla', { dx: -150, dy: -40 }), mark([c[0], c[1] + Math.round((r + 3) / 1.5), c[2]], 'Pulmón comprimido', 'Compressed lung', { dx: 60, dy: 50 })];
        return [{ t: 'blob', c, r: r + 7, hu: -250, edge: 2, within: SIDE.R, label: 'lesion' }, { t: 'blob', c, r, hu: massHU, edge: 0.8, irregular: 0.3, within: SIDE.R, label: 'lesion' }, mark(c, 'Masa', 'Mass', { dx: -150, dy: -40 })];
      },
      readouts: () => [{ label: { es: 'Mecanismo', en: 'Mechanism' }, value: { es: 'Relajación: patología pulmonar adyacente', en: 'Relaxation: adjacent lung disease' } }],
      info: {
        where: { es: 'Pulmón alrededor de una lesión que ocupa espacio (lóbulo superior derecho).', en: 'Lung around a space-occupying lesion (right upper lobe).' },
        see: { es: 'Atelectasia por relajación <b>compresiva</b>: el pulmón no se expande por una patología pulmonar adyacente (p. ej., bulla grande o masa).', en: '<b>Compressive</b> relaxation atelectasis: the lung cannot expand because of adjacent lung disease (e.g. a large bulla or mass).' },
        technique: { es: 'TC.', en: 'CT.' },
        differential: { es: 'Pasiva = causa pleural (derrame). En el enfisema bulloso las bullas grandes pueden causar atelectasia compresiva.', en: 'Passive = pleural cause (effusion). In bullous emphysema large bullae can cause compressive atelectasis.' },
      },
      flags: [],
    },
    {
      id: 'atel-cicatricial', group: 'atel', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Atelectasia cicatricial', en: 'Cicatricial atelectasis' },
      short: { es: 'Atelectasia cicatricial', en: 'Cicatricial atelectasis' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.7, at: (p, A) => collapsedAt(A, p.lobe, p.vol / 100), examPlane: 'axial' },
      params: [lobeParam('RUL', ['RUL', 'LUL']), { id: 'vol', type: 'range', label: { es: 'Volumen que conserva el lóbulo', en: 'Volume the lobe keeps' }, min: 30, max: 80, step: 5, value: 50, unit: '%', examMin: 30 }],
      techniques: [TK.rx('ok', null, null, { default: true }), ct2('best', 'La TC demuestra el broncograma aéreo dentro del lóbulo retraído.', 'CT shows the air bronchogram inside the retracted lobe.')],
      compare: ['atel-obstructiva'],
      build: (p, A, env) => {
        const { out, col } = buildCollapseEntity(p, A, env, { bronch: 'aire', rScale: 1.35, tissue: { sin: 30, portal: 48 } });
        out.push(mark(col.map(bronchTree(A, p.lobe, 5, 3)[0].pts[1]), 'Broncograma aéreo → no obstructiva', 'Air bronchogram → not obstructive', { dx: 60, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Volumen del lóbulo', en: 'Lobe volume' }, value: `${p.vol} %` }, { label: { es: 'Broncograma', en: 'Bronchogram' }, value: { es: 'Aéreo → no obstructiva', en: 'Air → not obstructive' } }],
      info: {
        where: { es: 'Lóbulo superior con fibrosis (posición habitual de la fibrosis cicatricial).', en: 'An upper lobe with fibrosis (the usual site of scarring).' },
        see: { es: 'El pulmón no se expande por <b>fibrosis</b>. Se ve <b>broncograma aéreo</b>, lo que indica que <b>no es obstructiva</b>.', en: 'The lung cannot expand because of <b>fibrosis</b>. An <b>air bronchogram</b> is seen, which means it is <b>not obstructive</b>.' },
        technique: { es: 'Rx; TC para ver el broncograma.', en: 'Film; CT to see the bronchogram.' },
        differential: { es: 'Obstructiva: sin aire en los bronquios (broncograma líquido o ausente).', en: 'Obstructive: no air in the bronchi (fluid or absent bronchogram).' },
      },
      flags: [F.bronchi],
    },
    {
      id: 'atel-completa', group: 'atel', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Atelectasia completa: hemitórax opaco', en: 'Complete atelectasis: white hemithorax' },
      short: { es: 'Atelectasia completa', en: 'Complete atelectasis' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.2, at: (p, A) => p.side === 'L' ? [262, 110, 180] : [262, 105, 95], examPlane: 'coronal' },
      params: [{ id: 'side', type: 'select', label: { es: 'Lado', en: 'Side' }, options: [opt('L', 'Izquierdo', 'Left'), opt('R', 'Derecho', 'Right')], value: 'L', recentre: true }, { id: 'shift', type: 'range', label: { es: 'Desplazamiento mediastínico', en: 'Mediastinal shift' }, min: 0, max: 20, step: 2, value: 12, unit: 'mm', examMin: 8 }],
      techniques: [TK.rx('best', 'Hemitórax blanco con el mediastino desplazado hacia él.', 'White hemithorax with the mediastinum shifted toward it.', { default: true }), ct2(), TK.med('ok', 'Pulmón colapsado que capta contraste.', 'Collapsed lung that enhances.')],
      compare: ['atel-lobular'],
      build: (p, A) => {
        const sgn = p.side === 'L' ? 1 : -1, dv = p.shift / 1.5 * sgn, other = p.side === 'L' ? LOBE.RML : LOBE.LUL;
        const out = [{ t: 'fill', s: SIDE[p.side], hu: { sin: 38, arterial: 55, portal: 70, tardia: 62 }, texture: 9, label: 'lesion' }];
        const taper = { trachea: z => sstep(192, 240, z), aorta: z => 1 - sstep(305, 340, z), esophagus: z => sstep(192, 240, z) * (1 - sstep(305, 330, z)), brachiocephalic_vein_left: z => sstep(205, 240, z), brachiocephalic_vein_right: z => sstep(205, 240, z) };
        if (dv) for (const k of ['heart', 'aorta', 'trachea', 'superior_vena_cava', 'esophagus', 'pulmonary_vein', 'atrial_appendage_left']) {
          const b = A.s(k).bbox, tp = taper[k] || (() => 1), zEnd = k === 'aorta' ? 345 : b[1];
          out.push({ t: 'warp', s: k, box: [b[0], zEnd, b[2], b[3], Math.min(b[4], b[4] + Math.floor(dv)) - 1, Math.max(b[5], b[5] + Math.ceil(dv)) + 1],
            fill: k === 'heart' ? { hu: -820, label: other } : { hu: -60, label: 0 },
            map: (z, y, x) => { const d = dv * tp(z); return Math.abs(d) < 0.5 ? null : [z, y, x - d]; } });
        }
        const hc = A.s('heart').center;
        out.push(mark([262, 105, p.side === 'L' ? 185 : 90], 'Hemitórax opaco', 'White hemithorax', { dx: p.side === 'L' ? 60 : -170, dy: -40 }));
        if (dv) out.push(mark([hc[0], hc[1], hc[2] + dv], 'Mediastino hacia el lado colapsado', 'Mediastinum toward the collapsed side', { dx: -60, dy: 70, planes: ['coronal', 'axial'] }));
        return out;
      },
      readouts: p => [{ label: { es: 'Mediastino', en: 'Mediastinum' }, value: { es: `${p.shift} mm hacia el lado ${p.side === 'L' ? 'izquierdo' : 'derecho'} (homolateral)`, en: `${p.shift} mm toward the ${p.side === 'L' ? 'left' : 'right'} (same side)` } }],
      info: {
        where: { es: 'Todo un pulmón (todos sus lóbulos reales).', en: 'A whole lung (all its real lobes).' },
        see: { es: '<b>Hemitórax opaco</b> (blanco): el pulmón no se expande nada; <b>desplazamiento mediastínico homolateral</b> (hacia el lado atelectasiado) por la pérdida de volumen.', en: '<b>White (opaque) hemithorax</b>: the lung does not expand at all; <b>ipsilateral mediastinal shift</b> (toward the collapsed side) from the volume loss.' },
        technique: { es: 'Rx PA.', en: 'PA film.' },
        differential: { es: 'Si el mediastino se desplazara hacia el otro lado, lo que ocupa el hemitórax empuja (no pierde volumen).', en: 'If the mediastinum were pushed to the other side, whatever fills the hemithorax is pushing (not losing volume).' },
        tip: { es: 'Sube el desplazamiento a 0 y luego a 20 mm en la Rx PA: el corazón y la tráquea se van hacia el lado blanco.', en: 'Move the shift from 0 to 20 mm on the PA film: the heart and trachea move toward the white side.' },
      },
      flags: [{ kind: 'revisar', es: 'El temario dice «hemotórax opaco»; por el contexto debe de ser «hemitórax opaco».', en: 'The syllabus says "haemothorax opaque"; from the context it must be "opaque hemithorax".' }, { kind: 'ampliacion', es: 'El desplazamiento se simula moviendo corazón, grandes vasos, tráquea y esófago en bloque; no se simula la elevación del hemidiafragma ni el cierre de los espacios intercostales. El diagnóstico diferencial del mediastino empujado es ampliación.', en: 'The shift is simulated by moving heart, great vessels, trachea and oesophagus en bloc; diaphragm elevation and narrowing of intercostal spaces are not simulated. The differential of a pushed mediastinum is beyond the syllabus.' }],
    },
    {
      id: 'atel-lobular', group: 'atel', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Atelectasia lobular: signos directos e indirectos', en: 'Lobar atelectasis: direct and indirect signs' },
      short: { es: 'Atelectasia lobular', en: 'Lobar atelectasis' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.6, at: (p, A) => collapsedAt(A, p.lobe, p.vol / 100), examPlane: 'axial' },
      params: [lobeParam('RLL'), { id: 'vol', type: 'range', label: { es: 'Volumen que conserva el lóbulo', en: 'Volume the lobe keeps' }, min: 15, max: 90, step: 5, value: 35, unit: '%', examMin: 15 }],
      techniques: [TK.rx('best', 'Signos directos (difíciles en la Rx) e indirectos.', 'Direct signs (hard on the film) and indirect ones.', { default: true }), TK.rxl('ok', 'La lateral muestra la cisura desplazada.', 'The lateral view shows the displaced fissure.'), ct2('ok', 'Vasos agrupados dentro del lóbulo colapsado.', 'Crowded vessels inside the collapsed lobe.')],
      compare: ['atel-completa', 'golden', 'atel-segmentaria'],
      build: (p, A, env) => {
        const { out, col } = buildCollapseEntity(p, A, env, {}), lower = p.lobe === 'RLL';
        out.push(mark(col.map(fissurePoint(A, p.lobe)), 'Cisura desplazada hacia el lóbulo', 'Fissure shifted toward the lobe', { dx: 60, dy: -50 }));
        out.push(mark(col.map(centre(A, p.lobe)), 'Agrupación broncovascular', 'Bronchovascular crowding', { dx: -190, dy: 30 }));
        out.push(mark(HILUM[p.lobe], 'Opacidad con vértice en el hilio', 'Opacity pointing to the hilum', { dx: 60, dy: 60, planes: ['coronal'] }));
        if (lower) { const b = A.s(LOBE.RLL).bbox; out.push(mark([b[1] - Math.round((1 - p.vol / 100) * 16) - 2, 110, 70], 'Hemidiafragma elevado', 'Raised hemidiaphragm', { dx: -180, dy: 50, planes: ['coronal'] })); }
        return out;
      },
      readouts: p => [{ label: { es: 'Signos directos', en: 'Direct signs' }, value: { es: 'Cisura desplazada · vértice hiliar · agrupación broncovascular', en: 'Displaced fissure · hilar apex · bronchovascular crowding' } }, { label: { es: 'Signos indirectos', en: 'Indirect signs' }, value: { es: p.lobe === 'RLL' ? 'Hemidiafragma elevado · mediastino e hilio hacia el lóbulo' : 'Mediastino e hilio hacia la atelectasia', en: p.lobe === 'RLL' ? 'Raised hemidiaphragm · mediastinum and hilum toward the lobe' : 'Mediastinum and hilum toward the collapse' } }],
      info: {
        where: { es: 'Un lóbulo real del paciente.', en: 'One of the patient\'s real lobes.' },
        see: { es: '<b>Directos</b> (difíciles de interpretar en la Rx): desplazamiento de la cisura hacia el lóbulo afecto · opacidad con vértice en el hilio · agrupación broncovascular. <b>Indirectos</b>: elevación del hemidiafragma · desplazamiento mediastínico homolateral · desplazamiento hiliar hacia la atelectasia.', en: '<b>Direct</b> (hard to read on the film): fissure displaced toward the affected lobe · opacity with its apex at the hilum · bronchovascular crowding. <b>Indirect</b>: raised hemidiaphragm · ipsilateral mediastinal shift · hilar displacement toward the collapse.' },
        technique: { es: 'Rx PA y lateral.', en: 'PA and lateral films.' },
        tip: { es: 'En TC los vasos reales del lóbulo se juntan al colapsar: es la agrupación broncovascular.', en: 'On CT the lobe\'s real vessels crowd together as it collapses: that is bronchovascular crowding.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Se simulan la cisura, la agrupación y la elevación del diafragma (lóbulo inferior); los desplazamientos del mediastino y del hilio no se simulan en la atelectasia lobular.', en: 'The fissure, crowding and diaphragm elevation (lower lobe) are simulated; mediastinal and hilar shifts are not simulated for lobar atelectasis.' }, F.lll],
    },
    {
      id: 'golden', group: 'atel', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Signo de la S de Golden (S itálica)', en: 'Golden\'s S sign (reverse S)' },
      short: { es: 'S de Golden', en: 'Golden\'s S' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.7, at: (p, A) => mid(collapsedAt(A, 'RUL', p.vol / 100), HILUM.RUL, 0.35), examPlane: 'coronal' },
      params: [{ id: 'vol', type: 'range', label: { es: 'Volumen que conserva el LSD', en: 'Volume the RUL keeps' }, min: 20, max: 60, step: 5, value: 35, unit: '%', examMin: 20 }, { id: 'mass', type: 'range', label: { es: 'Tamaño de la masa hiliar', en: 'Hilar mass size' }, min: 20, max: 45, step: 5, value: 32, unit: 'mm', examMin: 25 }],
      techniques: [TK.rx('best', 'Se describe en la Rx PA: borde inferior de la opacidad en S invertida.', 'Described on the PA film: lower border of the opacity as a reverse S.', { default: true }), ct2('ok', 'La TC muestra la masa central y el lóbulo colapsado.', 'CT shows the central mass and the collapsed lobe.'), TK.med('ok', 'Masa hipodensa frente a pulmón colapsado que capta.', 'Hypodense mass versus enhancing collapsed lung.')],
      compare: ['atel-lobular', 'ca-central'],
      build: (p, A, env) => {
        const { out, col } = buildCollapseEntity({ vol: p.vol }, A, env, { code: 'RUL', bronch: 'liquido' });
        out.push(hilarMass(A, 'RUL', p.mass, { f: 0.22 }));
        out.push(mark(HILUM.RUL, 'Masa hiliar convexa', 'Convex hilar mass', { dx: 60, dy: 40, planes: ['coronal'] }));
        out.push(mark(col.map(fissurePoint(A, 'RUL')), 'Cisura menor cóncava', 'Concave minor fissure', { dx: -170, dy: 50, planes: ['coronal'] }));
        return out;
      },
      readouts: () => [{ label: { es: 'Qué forma la S', en: 'What forms the S' }, value: { es: 'Masa convexa (cáncer central) + cisura cóncava retraída', en: 'Convex mass (central cancer) + concave retracted fissure' } }],
      info: {
        where: { es: 'Lóbulo superior derecho y su hilio.', en: 'Right upper lobe and its hilum.' },
        see: { es: 'Atelectasia <b>obstructiva del lóbulo superior derecho</b>. La S la forman la <b>lesión convexa</b> que causa la obstrucción (el cáncer que obstruye el bronquio y agranda el hilio) + la <b>opacidad periférica de límite cóncavo</b> (la cisura, retraída por la pérdida de volumen).', en: '<b>Obstructive atelectasis of the right upper lobe</b>. The S is made by the <b>convex lesion</b> causing the obstruction (the cancer blocking the bronchus and enlarging the hilum) + the <b>peripheral opacity with a concave border</b> (the fissure, pulled in by the volume loss).' },
        technique: { es: 'Rx PA; la TC confirma la masa.', en: 'PA film; CT confirms the mass.' },
        differential: { es: 'Atelectasia del LSD sin masa: la cisura es cóncava en toda su longitud (no hay S).', en: 'RUL collapse without a mass: the fissure is concave along its whole length (no S).' },
      },
      diagram: lang => goldenDiagram(lang),
      flags: [F.bronchi],
    },
    {
      id: 'atel-segmentaria', group: 'atel', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Atelectasia segmentaria / subsegmentaria (laminar)', en: 'Segmental / subsegmental (plate-like) atelectasis' },
      short: { es: 'Atelectasia laminar', en: 'Plate-like atelectasis' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.7, at: (p, A) => segPoints(A)[0], examPlane: 'coronal' },
      params: [{ id: 'n', type: 'range', label: { es: 'Número de bandas', en: 'Number of bands' }, min: 1, max: 3, step: 1, value: 2 }, { id: 'th', type: 'range', label: { es: 'Grosor', en: 'Thickness' }, min: 2, max: 8, step: 1, value: 4, unit: 'mm', examMin: 4 }],
      techniques: [TK.rx('best', 'Opacidad lineal en las bases.', 'Linear opacity at the bases.', { default: true }), ct2()],
      compare: ['atel-lobular'],
      build: (p, A) => {
        const key = LOBE.RLL, id = A.id(key), P = segPoints(A).slice(0, p.n), out = [];
        const ns = P.map((_, i) => { const n = [1, 0.3 * (i - 1), 0.22]; const l = Math.hypot(...n); return n.map(v => v / l); });
        out.push({ t: 'cols', box: lbox(A, [key]), label: 'lesion', fn: (z, y, x, cur) => {
          if (cur.orig !== id) return null;
          for (let i = 0; i < P.length; i++) {
            const c = P[i], n = ns[i], dz = z - c[0], dy = y - c[1], dx = x - c[2], d = dz * n[0] + dy * n[1] + dx * n[2], rr = Math.hypot(dz - d * n[0], dy - d * n[1], dx - d * n[2]) * 1.5;
            if (Math.abs(d) * 1.5 <= p.th / 2 + 0.6 * nz(z, y, x, 0.3, i) && rr < 32 + 6 * nz(z, y, x, 0.1, i + 4)) return { hu: Math.round(30 + 8 * nz(z, y, x, 0.5, 2)) };
          }
          return null;
        } });
        out.push(mark(P[0], 'Opacidad lineal (hipoventilación)', 'Linear opacity (hypoventilation)', { dx: -200, dy: 40 }));
        return out;
      },
      readouts: () => [{ label: { es: 'Causa', en: 'Cause' }, value: { es: 'Hipoventilación', en: 'Hypoventilation' } }],
      info: {
        where: { es: 'Bases pulmonares (aquí, lóbulo inferior derecho).', en: 'Lung bases (here, the right lower lobe).' },
        see: { es: 'Predomina en las bases; se debe a la <b>hipoventilación</b>; <b>opacidad lineal</b>.', en: 'Mostly at the bases; due to <b>hypoventilation</b>; <b>linear opacity</b>.' },
        technique: { es: 'Rx PA.', en: 'PA film.' },
      },
      flags: [],
    },
    {
      id: 'atel-redonda', group: 'atel', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Atelectasia redonda', en: 'Round atelectasis' },
      short: { es: 'Atelectasia redonda', en: 'Round atelectasis' },
      view: { plane: 'axial', window: 'lung', zoom: 2, at: (p, A) => roundAt(A, p.size), examPlane: 'axial' },
      params: [{ id: 'size', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 20, max: 45, step: 5, value: 32, unit: 'mm', examMin: 25 }, { id: 'calc', type: 'toggle', label: { es: 'Pleura calcificada', en: 'Calcified pleura' }, value: true }],
      techniques: [ct2('best', 'Masa periférica con pleura engrosada y vasos que se incurvan hacia ella.', 'Peripheral mass with thickened pleura and vessels curving into it.', { default: true }), TK.med('ok', 'Engrosamiento y calcificación pleural.', 'Pleural thickening and calcification.'), TK.rx('ok', 'En la Rx parece una masa: simula un cáncer.', 'On the film it looks like a mass: it mimics a cancer.')],
      compare: ['ca-periferico', 'nps-maligno'],
      build: (p, A) => {
        const c = roundAt(A, p.size), key = LOBE.RLL, id = A.id(key), D = lungDepth(A), pp = A.extreme(key, 'posterior', c[0]) || c, out = [];
        out.push({ t: 'cols', box: clampBox(A, [c[0] - 35, c[0] + 35, c[1] - 10, c[1] + 50, c[2] - 40, c[2] + 40]), label: 'lesion', fn: (z, y, x, cur) => {
          if (cur.orig !== id) return null; const dd = D.mm(z, y, x); if (dd > 4.5) return null;
          if (Math.hypot(z - pp[0], y - pp[1], x - pp[2]) * 1.5 > 48) return null;
          return { hu: p.calc && nz(z, y, x, 0.25, 8) > 0.42 ? 480 : 55 };
        } });
        for (let i = 0; i < 3; i++) {
          const a = HILUM.RLL, e = [c[0] + (i - 1) * 9, c[1] - 6, c[2] + 6], m = [(c[0] + a[0]) / 2 + (i - 1) * 10, c[1] - 14, (c[2] + a[2]) / 2];
          out.push({ t: 'tube', pts: [c, e, m], r: 1.4, hu: 60, within: [key], label: 'lesion' });
        }
        out.push({ t: 'blob', c, r: [p.size / 2, p.size / 2 * 0.85, p.size / 2], hu: 45, edge: 0.8, irregular: 0.2, texture: 6, within: [key], label: 'lesion' });
        out.push(mark(c, 'Masa redonda periférica', 'Round peripheral mass', { dx: 60, dy: -40 }), mark(pp, 'Pleura engrosada', 'Thickened pleura', { dx: 60, dy: 50 }), mark([c[0], c[1] - 10, c[2] + 8], 'Incurvación broncovascular', 'Curving bronchovascular bundle', { dx: -200, dy: -40 }));
        return out;
      },
      readouts: () => [{ label: { es: 'Qué es', en: 'What it is' }, value: { es: 'Pérdida de volumen, no una masa', en: 'Volume loss, not a mass' } }],
      info: {
        where: { es: 'Periferia de los <b>lóbulos inferiores</b>, junto a pleura engrosada.', en: 'Periphery of the <b>lower lobes</b>, next to thickened pleura.' },
        see: { es: 'Masa esférica periférica en los lóbulos inferiores · asociada a <b>enfermedad pleural crónica</b> (engrosamiento pleural, a veces calcificado) · <b>incurvación broncovascular</b> y elevación del diafragma.', en: 'Spherical peripheral mass in the lower lobes · associated with <b>chronic pleural disease</b> (pleural thickening, sometimes calcified) · <b>curving bronchovascular bundle</b> and raised diaphragm.' },
        technique: { es: 'TC.', en: 'CT.' },
        differential: { es: 'Importante porque <b>puede simular un cáncer de pulmón</b>, pero es pérdida de volumen, no una masa.', en: 'Important because it <b>can mimic lung cancer</b>, but it is volume loss, not a mass.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La pleura no está segmentada: el engrosamiento pleural se dibuja en el borde del lóbulo (posición aproximada); los vasos que se incurvan se dibujan aproximados.', en: 'The pleura is not segmented: the pleural thickening is drawn on the lobe edge (approximate); the curving vessels are drawn approximately.' }],
    },
    /* ===== TC en la atelectasia ===== */
    {
      id: 'angiograma', group: 'tcatel', tag: 'ct-aprox', contrast: true,
      name: { es: 'Signo del angiograma frente a tumor central', en: 'Angiogram sign versus central tumour' },
      short: { es: 'Signo del angiograma', en: 'Angiogram sign' },
      view: { plane: 'axial', window: 'mediastinum', zoom: 1.9, at: (p, A) => mid(collapsedAt(A, p.lobe, 0.35), HILUM[p.lobe], 0.4), examPlane: 'axial' },
      params: [lobeParam('RLL', ['RUL', 'RLL', 'LUL']), { id: 'tumor', type: 'range', label: { es: 'Tumor central', en: 'Central tumour' }, min: 0, max: 40, step: 5, value: 30, unit: 'mm', examMin: 20 }],
      techniques: [TK.med('best', 'Con contraste: el pulmón colapsado capta de forma homogénea y deja ver sus vasos (angiograma); el tumor central es hipodenso.', 'With contrast: the collapsed lung enhances homogeneously and shows its vessels (angiogram); the central tumour is hypodense.', { default: true }), ct2('ok', 'En ventana de pulmón todo es blanco: no se separan.', 'On the lung window everything is white: they cannot be separated.'), TK.rx('bad', 'La Rx no distingue el tumor del pulmón colapsado.', 'The film cannot tell the tumour from the collapsed lung.')],
      compare: ['broncograma-liquido', 'atel-obstructiva'],
      build: (p, A, env) => {
        const { out } = buildCollapseEntity({ lobe: p.lobe, vol: 35 }, A, env, { tissue: { sin: 38, portal: 85 }, vessel: { sin: 44, portal: 190 }, dia: false });
        if (p.tumor) out.push(hilarMass(A, p.lobe, p.tumor, { hu: { sin: 34, arterial: 40, portal: 42, tardia: 44 } }));
        out.push(mark(collapsedAt(A, p.lobe, 0.35), 'Vasos dentro del pulmón colapsado', 'Vessels inside the collapsed lung', { dx: -200, dy: 40 }));
        if (p.tumor) out.push(mark(HILUM[p.lobe], 'Tumor central hipodenso', 'Hypodense central tumour', { dx: 60, dy: -40 }));
        return out;
      },
      readouts: (p, A, env) => [{ label: { es: 'Pulmón colapsado', en: 'Collapsed lung' }, value: env.phase === 'sin' ? { es: 'Sin contraste: no se ve el angiograma', en: 'Unenhanced: no angiogram' } : { es: 'Capta homogéneo + vasos (≈ 85 / 190 UH)', en: 'Homogeneous enhancement + vessels (≈ 85 / 190 HU)' } }, { label: { es: 'Tumor', en: 'Tumour' }, value: p.tumor ? { es: 'Hipodenso (≈ 40 UH)', en: 'Hypodense (≈ 40 HU)' } : '—' }],
      info: {
        where: { es: 'Lóbulo colapsado (vasos reales de este TC, comprimidos con el lóbulo) y su hilio (posición estimada del tumor).', en: 'Collapsed lobe (this CT\'s real vessels, compressed with the lobe) and its hilum (estimated tumour position).' },
        see: { es: 'La TC distingue: a) el <b>pulmón colapsado periférico</b> con arquitectura vascular conservada (<b>signo del angiograma</b>) y captación homogénea; b) el <b>tumor central</b>, generalmente <b>hipodenso</b>.', en: 'CT separates: a) the <b>collapsed peripheral lung</b> with preserved vascular architecture (<b>angiogram sign</b>) and homogeneous enhancement; b) the <b>central tumour</b>, usually <b>hypodense</b>.' },
        technique: { es: 'TC con contraste, ventana de mediastino. También valora la vía aérea central.', en: 'Contrast CT, mediastinal window. It also assesses the central airway.' },
        tip: { es: 'Cambia a «Sin contraste»: el angiograma desaparece y tumor y pulmón se igualan.', en: 'Switch to "Unenhanced": the angiogram vanishes and tumour and lung look the same.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Las cifras de UH son orientativas (el temario solo dice «capta homogéneo» e «hipodenso»).', en: 'HU figures are indicative (the syllabus only says "homogeneous enhancement" and "hypodense").' }],
    },
    {
      id: 'broncograma-liquido', group: 'tcatel', tag: 'kit', contrast: true,
      kitNote: { es: 'Los bronquios no están segmentados en este caso: se dibujan aproximados dentro del lóbulo real. Con una máscara de vía aérea se verían los bronquios reales llenos de líquido.', en: 'The bronchi are not segmented in this case: they are drawn approximately inside the real lobe. With an airway mask the real fluid-filled bronchi could be shown.' },
      name: { es: 'Broncograma aéreo frente a líquido', en: 'Air versus fluid bronchogram' },
      short: { es: 'Broncograma líquido', en: 'Fluid bronchogram' },
      view: { plane: 'axial', window: 'mediastinum', zoom: 1.8, at: (p, A) => collapsedAt(A, p.lobe, p.vol / 100), examPlane: 'axial' },
      params: [lobeParam('RLL', ['RUL', 'RLL', 'LUL']), { id: 'tipo', type: 'select', label: { es: 'Contenido de los bronquios', en: 'Bronchial content' }, options: [opt('liquido', 'Líquido (secreciones)', 'Fluid (secretions)'), opt('aire', 'Aire', 'Air')], value: 'liquido' }, { id: 'vol', type: 'range', label: { es: 'Volumen que conserva el lóbulo', en: 'Volume the lobe keeps' }, min: 50, max: 100, step: 10, value: 100, unit: '%' }],
      techniques: [TK.med('best', 'Tubos ramificados de densidad agua dentro del lóbulo que capta.', 'Branching water-density tubes inside the enhancing lobe.', { default: true }), ct2('ok', 'El broncograma aéreo se ve en ventana de pulmón; el líquido no.', 'The air bronchogram shows on the lung window; the fluid one does not.')],
      compare: ['angiograma'],
      build: (p, A, env) => {
        const { out, col } = buildCollapseEntity(p, A, env, { bronch: p.tipo, rScale: 1.4, dia: false });
        out.push(mark(col.map(bronchTree(A, p.lobe, 5, 3)[0].pts[1]), p.tipo === 'aire' ? 'Broncograma aéreo' : 'Broncograma líquido', p.tipo === 'aire' ? 'Air bronchogram' : 'Fluid bronchogram', { dx: 60, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Interpretación', en: 'Meaning' }, value: p.tipo === 'aire' ? { es: 'Puede indicar origen no obstructivo', en: 'May mean a non-obstructive cause' } : { es: 'Obstrucción bronquial; explica que no haya pérdida de volumen', en: 'Bronchial obstruction; explains the lack of volume loss' } }],
      info: {
        where: { es: 'Bronquios del lóbulo afectado.', en: 'Bronchi of the affected lobe.' },
        see: { es: '<b>Broncograma aéreo</b>: puede indicar un origen no obstructivo. <b>Broncograma líquido</b> (tubos ramificados de densidad agua = bronquios con secreciones): indica <b>obstrucción bronquial</b> y explica que no haya pérdida de volumen.', en: '<b>Air bronchogram</b>: may indicate a non-obstructive cause. <b>Fluid bronchogram</b> (branching water-density tubes = bronchi full of secretions): indicates <b>bronchial obstruction</b> and explains the lack of volume loss.' },
        technique: { es: 'TC con contraste, ventana de mediastino.', en: 'Contrast CT, mediastinal window.' },
      },
      flags: [F.bronchi],
    },
    /* ===== intersticio ===== */
    {
      id: 'lobulillo', group: 'int', tag: 'esquema',
      name: { es: 'Lobulillo pulmonar secundario', en: 'Secondary pulmonary lobule' },
      short: { es: 'Lobulillo secundario', en: 'Secondary lobule' },
      view: { plane: 'axial', window: 'lung', zoom: 1.4, at: (p, A) => centre(A, 'RLL') },
      info: {
        see: { es: 'Unidad que usan la TCAR y la clasificación del enfisema: <b>septos interlobulillares</b> en la periferia (los que se engruesan en el patrón septal y el empedrado) y <b>centro del lobulillo</b> (bronquiolo y arteriola: donde empieza el enfisema centrolobulillar).', en: 'The unit used by HRCT and the emphysema classification: <b>interlobular septa</b> at the periphery (thickened in the septal pattern and crazy paving) and the <b>lobule centre</b> (bronchiole and arteriole: where centrilobular emphysema starts).' },
        tip: { es: 'Con este esquema en mente, mira «Engrosamiento de septos» y los tres tipos de enfisema.', en: 'With this diagram in mind, look at "Septal thickening" and the three types of emphysema.' },
      },
      diagram: lang => lobuleDiagram(lang) + emphysemaDiagram(lang),
      flags: [{ kind: 'ampliacion', es: 'La anatomía del lobulillo (contenido de septos y centro) va más allá del temario, que solo usa el término en el enfisema y los septos.', en: 'Lobule anatomy (what the septa and centre contain) goes beyond the syllabus, which uses the term only for emphysema and septa.' }],
    },
    {
      id: 'tcar-nodulos', group: 'int', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'TCAR: nódulos', en: 'HRCT: nodules' },
      short: { es: 'Nódulos (TCAR)', en: 'Nodules (HRCT)' },
      view: { plane: 'axial', window: 'lung', zoom: 1.3, at: () => [262, 100, XMID], examPlane: 'axial' },
      params: [{ id: 'size', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 2, max: 10, step: 1, value: 4, unit: 'mm', examMin: 3 }, { id: 'n', type: 'range', label: { es: 'Número', en: 'Number' }, min: 20, max: 120, step: 10, value: 70, examMin: 50 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('ok', 'La Rx detecta el patrón; la TCAR lo caracteriza.', 'The film detects the pattern; HRCT characterises it.')],
      compare: ['nodulos-multiples'],
      build: (p, A) => {
        const out = [], codes = ['RUL', 'RLL', 'LUL', 'RML', 'RUL', 'LUL'];
        for (let i = 0; i < p.n; i++) { const code = codes[i % codes.length], c = lungPoint(A, LOBE[code], 500 + i, 3); out.push({ t: 'blob', c, r: p.size / 2 * (0.75 + 0.5 * hashU(i, 9, 2)), hu: 35, edge: 0.6, within: LOBES, label: 'lesion' }); }
        out.push(mark(lungPoint(A, LOBE.RUL, 500, 3), 'Nódulos', 'Nodules', { dx: -150, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Tamaño', en: 'Size' }, value: `${p.size} mm` }],
      info: {
        where: { es: 'Ambos pulmones.', en: 'Both lungs.' },
        see: { es: 'Hallazgo de TCAR en la enfermedad pulmonar intersticial (enfermedad pulmonar infiltrativa difusa): <b>nódulos</b>.', en: 'HRCT finding in interstitial lung disease (diffuse infiltrative lung disease): <b>nodules</b>.' },
        technique: { es: 'Tras detectarla en la Rx, se estudia con TCAR (más dosis que la TC; sin contraste, no estudia bien el mediastino).', en: 'Once the film detects it, it is studied with HRCT (higher dose than CT; no contrast, so the mediastinum is not well assessed).' },
        differential: { es: 'Nódulo pulmonar solitario: una sola lesión, que se valora como benigna o maligna.', en: 'Solitary pulmonary nodule: a single lesion, assessed as benign or malignant.' },
      },
      flags: [{ kind: 'revisar', es: 'El temario dice «nódulos: hasta 3 cm» en la TCAR. Ese límite es el del nódulo pulmonar solitario (≤ 3 cm; por encima, masa); los nódulos del intersticio suelen ser de milímetros.', en: 'The syllabus says "nodules: up to 3 cm" for HRCT. That limit belongs to the solitary pulmonary nodule (≤ 3 cm; above it, a mass); interstitial nodules are usually a few millimetres.' }, F.tcar],
    },
    {
      id: 'panal', group: 'int', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'TCAR: quistes en panal', en: 'HRCT: honeycomb cysts' },
      short: { es: 'Panal', en: 'Honeycombing' },
      view: { plane: 'axial', window: 'lung', zoom: 2, at: (p, A) => panalAt(A), examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Extensión', en: 'Extent' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('ok', 'La Rx detecta la enfermedad intersticial.', 'The film detects the interstitial disease.')],
      compare: ['traccion', 'paraseptal'],
      build: (p, A) => [honeycomb(A, p.sev, 0.4), mark(panalAt(A), 'Quistes en panal subpleurales', 'Subpleural honeycomb cysts', { dx: -200, dy: 40 })],
      readouts: () => [{ label: { es: 'Significado', en: 'Meaning' }, value: { es: 'Fibrosis pulmonar irreversible', en: 'Irreversible lung fibrosis' } }],
      info: {
        where: { es: 'Zonas subpleurales de las bases (aquí, lóbulo inferior derecho).', en: 'Subpleural zones of the bases (here, the right lower lobe).' },
        see: { es: '<b>Quistes de panal</b>: lesiones aéreas redondeadas de <b>pared gruesa</b>; indican <b>fibrosis pulmonar irreversible</b>.', en: '<b>Honeycomb cysts</b>: round air lesions with a <b>thick wall</b>; they indicate <b>irreversible lung fibrosis</b>.' },
        technique: { es: 'TCAR.', en: 'HRCT.' },
        differential: { es: 'Enfisema paraseptal: espacios subpleurales de pared fina.', en: 'Paraseptal emphysema: subpleural spaces with thin walls.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La localización subpleural y basal es la habitual de la fibrosis; el temario solo define el quiste. Se simula en el lado derecho por el hallazgo real del lóbulo inferior izquierdo.', en: 'The subpleural, basal site is the usual one for fibrosis; the syllabus only defines the cyst. It is simulated on the right because of the real finding in the left lower lobe.' }, F.tcar],
    },
    {
      id: 'peribroncovascular', group: 'int', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'TCAR: engrosamiento peribroncovascular', en: 'HRCT: peribronchovascular thickening' },
      short: { es: 'Peribroncovascular', en: 'Peribronchovascular' },
      view: { plane: 'axial', window: 'lung', zoom: 1.5, at: () => [266, 108, XMID], examPlane: 'axial' },
      params: [{ id: 'w', type: 'range', label: { es: 'Grosor del manguito', en: 'Cuff thickness' }, min: 1, max: 4, step: 0.5, value: 2.5, unit: 'mm', examMin: 2 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('ok')],
      compare: ['septos', 'bronquiectasias'],
      build: (p, A) => {
        const out = [];
        for (const code of FOUR) out.push(...treeTubes(bronchTree(A, code, 4, 5), { hu: -870, within: LOBES, label: 'lesion', wall: { w: p.w, hu: 15 } }));
        out.push(mark(bronchTree(A, 'RLL', 4, 5)[0].pts[1], 'Manguito peribroncovascular', 'Peribronchovascular cuff', { dx: -200, dy: 40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Grosor', en: 'Thickness' }, value: `${p.w} mm` }],
      info: {
        where: { es: 'Intersticio que rodea bronquios y vasos, del hilio a la periferia.', en: 'Interstitium around bronchi and vessels, from the hilum outward.' },
        see: { es: 'Hallazgo de TCAR: <b>engrosamiento peribroncovascular</b> (paredes de los haces broncovasculares engrosadas).', en: 'HRCT finding: <b>peribronchovascular thickening</b> (thickened walls of the bronchovascular bundles).' },
        technique: { es: 'TCAR.', en: 'HRCT.' },
      },
      flags: [F.bronchi, F.tcar],
    },
    {
      id: 'septos', group: 'int', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'TCAR: engrosamiento de septos', en: 'HRCT: septal thickening' },
      short: { es: 'Septos engrosados', en: 'Septal thickening' },
      view: { plane: 'axial', window: 'lung', zoom: 1.6, at: (p, A) => centre(A, 'RLL'), examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Grosor', en: 'Thickness' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }, { id: 'intra', type: 'toggle', label: { es: 'También intralobulillares', en: 'Also intralobular' }, value: false }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('ok')],
      compare: ['empedrado', 'peribroncovascular'],
      build: (p, A) => {
        const D = lungDepth(A), w = 0.45 + 0.25 * p.sev, keys = [LOBE.RLL, LOBE.RML];
        return [paint(A, keys, (z, y, x) => (1 - sstep(25, 45, D.mm(z, y, x))), (cur, a, z, y, x) => {
          if (cur.hu > -300) return null; const s = septa(z, y, x, w * a, 1, p.intra ? 0.55 : 0); if (!s) return null;
          return { hu: Math.round(s === 1 ? lerp(cur.hu, -60, a) : lerp(cur.hu, -380, a)), label: s === 1 && a > 0.5 ? 'lesion' : 'keep' };
        }), mark(lateralPoint(A, 'RLL'), 'Septos interlobulillares', 'Interlobular septa', { dx: -190, dy: 40 })];
      },
      readouts: p => [{ label: { es: 'Septos', en: 'Septa' }, value: p.intra ? { es: 'Inter e intralobulillares', en: 'Inter- and intralobular' } : { es: 'Interlobulillares', en: 'Interlobular' } }],
      info: {
        where: { es: 'Bordes de los lobulillos secundarios, más visibles bajo la pleura (aquí, lóbulos inferior y medio derechos).', en: 'Borders of the secondary lobules, clearest under the pleura (here, right lower and middle lobes).' },
        see: { es: 'Engrosamiento de septos <b>inter e intralobulillares</b>: red de líneas que dibuja los lobulillos.', en: 'Thickening of <b>inter- and intralobular</b> septa: a network of lines outlining the lobules.' },
        technique: { es: 'TCAR.', en: 'HRCT.' },
        differential: { es: 'Empedrado = septos engrosados + vidrio deslustrado en la misma zona.', en: 'Crazy paving = thickened septa + ground glass in the same area.' },
      },
      diagram: lang => lobuleDiagram(lang),
      flags: [F.tcar],
    },
    {
      id: 'vidrio', group: 'int', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Vidrio deslustrado frente a consolidación', en: 'Ground glass versus consolidation' },
      short: { es: 'Vidrio deslustrado', en: 'Ground glass' },
      view: { plane: 'axial', window: 'lung', zoom: 1.7, at: (p, A) => centre(A, p.lobe), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'ext', type: 'range', label: { es: 'Extensión', en: 'Extent' }, min: 30, max: 100, step: 10, value: 70, unit: '%', examMin: 60 }, { id: 'delta', type: 'range', label: { es: 'Aumento de atenuación', en: 'Attenuation increase' }, min: 150, max: 400, step: 50, value: 300, unit: 'UH', examMin: 250 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('bad', 'Puede pasar desapercibido en la Rx.', 'It can be missed on the film.')],
      compare: ['consol-localizada', 'empedrado', 'alveolar'],
      build: (p, A) => {
        const key = LOBE[p.lobe], s = A.s(key), b = s.bbox, r = [(b[1] - b[0]) / 2, (b[3] - b[2]) / 2, (b[5] - b[4]) / 2].map(v => Math.max(6, v * 1.4 * p.ext / 100));
        return [paint(A, [key], ellip(s.center, r, 0.35, 0.22, 5), ggoVal(p.delta)), mark(s.center, 'Vidrio: los vasos se siguen viendo', 'Ground glass: vessels still visible', { dx: -200, dy: -40 })];
      },
      readouts: p => [{ label: { es: 'Vasos y paredes bronquiales', en: 'Vessels and bronchial walls' }, value: { es: 'Visibles (no los borra)', en: 'Visible (not hidden)' } }, { label: { es: 'Parénquima', en: 'Parenchyma' }, value: `+${p.delta} UH` }],
      info: {
        where: { es: 'Un lóbulo real (compáralo con la consolidación del mismo lóbulo).', en: 'One real lobe (compare it with consolidation of the same lobe).' },
        see: { es: '<b>Vidrio deslustrado</b>: aumento de atenuación que <b>NO borra</b> vasos ni paredes bronquiales. <b>Consolidación</b>: aumento de atenuación que <b>SÍ los borra</b>.', en: '<b>Ground glass</b>: increased attenuation that does <b>NOT hide</b> vessels or bronchial walls. <b>Consolidation</b>: increased attenuation that <b>DOES hide them</b>.' },
        technique: { es: 'TCAR.', en: 'HRCT.' },
        tip: { es: 'Abre la comparación con «Consolidación localizada» del mismo lóbulo: a la izquierda los vasos siguen ahí; a la derecha desaparecen.', en: 'Open the comparison with "Localised consolidation" of the same lobe: on the left the vessels are still there; on the right they vanish.' },
      },
      flags: [F.tcar, F.lll],
    },
    {
      id: 'empedrado', group: 'int', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'TCAR: patrón en empedrado', en: 'HRCT: crazy-paving pattern' },
      short: { es: 'Empedrado', en: 'Crazy paving' },
      view: { plane: 'axial', window: 'lung', zoom: 1.7, at: (p, A) => centre(A, p.lobe), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'ext', type: 'range', label: { es: 'Extensión', en: 'Extent' }, min: 40, max: 100, step: 10, value: 70, unit: '%', examMin: 60 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true }), TK.rx('bad', 'La Rx no muestra los septos.', 'The film does not show the septa.')],
      compare: ['vidrio', 'septos'],
      build: (p, A) => {
        const key = LOBE[p.lobe], s = A.s(key), b = s.bbox, r = [(b[1] - b[0]) / 2, (b[3] - b[2]) / 2, (b[5] - b[4]) / 2].map(v => Math.max(6, v * 1.4 * p.ext / 100)), w = ellip(s.center, r, 0.35, 0.22, 5), g = ggoVal(280);
        return [paint(A, [key], w, (cur, a, z, y, x) => {
          const v = g(cur, a, z, y, x); if (!v) return null; const sp = septa(z, y, x, a, 0.85, 0.5);
          if (sp) v.hu = Math.round(lerp(v.hu, sp === 1 ? -40 : -220, a));
          return v;
        }), mark(s.center, 'Vidrio + septos engrosados', 'Ground glass + thickened septa', { dx: -200, dy: -40 })];
      },
      readouts: () => [{ label: { es: 'Componentes', en: 'Components' }, value: { es: 'Vidrio deslustrado + septos inter e intralobulillares', en: 'Ground glass + inter- and intralobular septa' } }],
      info: {
        where: { es: 'Un lóbulo real.', en: 'One real lobe.' },
        see: { es: '<b>Patrón en empedrado</b>: vidrio deslustrado + engrosamiento de septos inter e intralobulillares <b>en la misma zona</b>.', en: '<b>Crazy-paving pattern</b>: ground glass + thickened inter- and intralobular septa <b>in the same area</b>.' },
        technique: { es: 'TCAR. Es uno de los hallazgos de la COVID-19 / SDRA.', en: 'HRCT. It is one of the findings of COVID-19 / ARDS.' },
      },
      flags: [F.tcar],
    },
    /* ===== vía aérea ===== */
    {
      id: 'bronquiectasias', group: 'via', tag: 'kit', extraTags: ['sim'],
      kitNote: { es: 'Los bronquios y las arterias intrapulmonares no están segmentados: el árbol bronquial y su arteria se dibujan aproximados dentro del lóbulo real. Con una máscara de vía aérea se medirían los bronquios reales.', en: 'Intrapulmonary bronchi and arteries are not segmented: the bronchial tree and its artery are drawn approximately inside the real lobe. With an airway mask the real bronchi could be measured.' },
      name: { es: 'Bronquiectasias', en: 'Bronchiectasis' },
      short: { es: 'Bronquiectasias', en: 'Bronchiectasis' },
      view: { plane: 'axial', window: 'lung', zoom: 2, at: (p, A) => bronchTree(A, p.lobe, 4, 7)[0].pts[1].map(Math.round), examPlane: 'axial' },
      params: [lobeParam('RLL', ['RML', 'RLL', 'LUL']), { id: 'tipo', type: 'select', label: { es: 'Tipo', en: 'Type' }, options: [opt('cilindricas', 'Cilíndricas', 'Cylindrical'), opt('varicosas', 'Varicosas', 'Varicose'), opt('quisticas', 'Quísticas', 'Cystic')], value: 'cilindricas' }, { id: 'ratio', type: 'range', label: { es: 'Bronquio / arteria', en: 'Bronchus / artery' }, min: 1, max: 3, step: 0.25, value: 2, examMin: 1.75 }],
      techniques: [TK.tcar('best', 'TC (TCAR): bronquio más ancho que su arteria, sin afilamiento distal, pared engrosada.', 'CT (HRCT): bronchus wider than its artery, no distal tapering, thick wall.', { default: true }), TK.rx('ok', 'La Rx puede mostrar paredes engrosadas, poco específica.', 'The film may show thick walls; not specific.')],
      compare: ['traccion', 'peribroncovascular'],
      build: (p, A, env) => {
        const tree = bronchTree(A, p.lobe, 4, 7), out = [], ra = 1.5, rb = ra * p.ratio, con = env.phase !== 'sin';
        for (const br of tree) {
          const [a, m, t] = br.pts, art = br.pts.map(q => [q[0], q[1] + 3.2 * (1 + p.ratio / 2), q[2] + 1]);
          out.push({ t: 'tube', pts: art, r: [ra, ra * 0.8, ra * 0.55], hu: con ? 160 : 45, within: LOBES, label: 'keep' });
          let pts = br.pts, r = [rb, rb, rb];
          if (p.tipo === 'varicosas') { pts = []; r = []; for (let i = 0; i <= 8; i++) { const s = i / 8, q = s < 0.5 ? mid(a, m, s * 2) : mid(m, t, (s - 0.5) * 2); pts.push(q); r.push(i % 2 ? rb * 0.55 : rb * 1.1); } }
          out.push({ t: 'tube', pts, r, hu: -900, wall: { w: 1.6, hu: 20 }, within: LOBES, label: 'lesion' });
          if (p.tipo === 'quisticas') for (let k = 0; k < 3; k++) out.push({ t: 'blob', c: [t[0] + (k - 1) * 5, t[1] + (k % 2) * 4, t[2] + (k - 1) * 3], r: rb * 1.6 + 2, hu: -930, rim: { w: 1.6, hu: 25 }, edge: 0.4, within: LOBES, label: 'lesion' });
        }
        out.push(mark(tree[0].pts[1], 'Bronquio > arteria', 'Bronchus > artery', { dx: -170, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Bronquio / arteria', en: 'Bronchus / artery' }, value: { es: `${p.ratio.toFixed(2)} ${p.ratio > 1 ? '(> 1: bronquiectasia)' : '(normal ≤ 1)'}`, en: `${p.ratio.toFixed(2)} ${p.ratio > 1 ? '(> 1: bronchiectasis)' : '(normal ≤ 1)'}` } }, { label: { es: 'Afilamiento distal', en: 'Distal tapering' }, value: { es: 'Ausente', en: 'Absent' } }],
      info: {
        where: { es: 'Bronquios de un lóbulo (dibujados aproximados).', en: 'Bronchi of one lobe (drawn approximately).' },
        see: { es: 'Dilatación localizada e irreversible del árbol bronquial: <b>diámetro interno del bronquio mayor que el de la arteria pulmonar adyacente</b> · <b>ausencia de afilamiento distal</b> · <b>pared bronquial engrosada</b>. Tipos: <b>cilíndricas</b> o leves (dilatación uniforme), <b>varicosas</b> (dilatación y estenosis alternas), <b>quísticas</b> o severas (saculares).', en: 'Localised, irreversible dilatation of the bronchial tree: <b>internal bronchial diameter larger than the adjacent pulmonary artery</b> · <b>no distal tapering</b> · <b>thickened bronchial wall</b>. Types: <b>cylindrical</b> or mild (uniform dilatation), <b>varicose</b> (alternating dilatation and stenosis), <b>cystic</b> or severe (saccular).' },
        technique: { es: 'TC. Causa más frecuente: infección aguda, crónica o recidivante; desconocida en el 40 %.', en: 'CT. Commonest cause: acute, chronic or recurrent infection; unknown in 40 %.' },
        differential: { es: 'Por tracción: por fibrosis, no por enfermedad de la vía aérea; asintomáticas.', en: 'Traction: due to fibrosis, not airway disease; asymptomatic.' },
      },
      flags: [F.tcar],
    },
    {
      id: 'traccion', group: 'via', tag: 'kit', extraTags: ['sim'],
      kitNote: { es: 'Los bronquios no están segmentados: los bronquios irregulares se dibujan aproximados en la zona de fibrosis del lóbulo real.', en: 'The bronchi are not segmented: the irregular bronchi are drawn approximately in the fibrotic area of the real lobe.' },
      name: { es: 'Bronquiectasias por tracción', en: 'Traction bronchiectasis' },
      short: { es: 'Por tracción', en: 'Traction' },
      view: { plane: 'axial', window: 'lung', zoom: 2, at: (p, A) => panalAt(A), examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Fibrosis', en: 'Fibrosis' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }],
      techniques: [TK.tcar('best', TCAR_NOTE[0], TCAR_NOTE[1], { default: true })],
      compare: ['bronquiectasias', 'panal'],
      build: (p, A) => {
        const out = [honeycomb(A, p.sev, 0.15)], P = panalAt(A), D = lungDepth(A);
        for (let i = 0; i < 4; i++) {
          const s = lungPoint(A, LOBE.RLL, 900 + i, 14, 0.7 + 0.06 * i), pts = [], r = [];
          for (let k = 0; k <= 6; k++) { const t = k / 6, q = mid(s, mid(P, s, 0.15 * i), t); pts.push([q[0] + 2 * nz(k, i, 1, 0.9, 3), q[1] + 2.5 * nz(i, k, 2, 0.9, 5), q[2] + 2.5 * nz(k, k, i, 0.9, 7)]); r.push(1.6 + 1.5 * (0.5 + 0.5 * nz(i, k, 9, 0.8, 1)) + p.sev * 0.3); }
          out.push({ t: 'tube', pts, r, hu: -900, wall: { w: 1.2, hu: 0 }, within: [LOBE.RLL], label: 'lesion' });
        }
        out.push(mark(P, 'Bronquios irregulares hacia la fibrosis', 'Irregular bronchi pulled to fibrosis', { dx: -200, dy: -40 }));
        void D; return out;
      },
      readouts: () => [{ label: { es: 'Síntomas', en: 'Symptoms' }, value: { es: 'Asintomáticas', en: 'Asymptomatic' } }, { label: { es: 'Causa', en: 'Cause' }, value: { es: 'Fibrosis pulmonar', en: 'Lung fibrosis' } }],
      info: {
        where: { es: 'Zonas de fibrosis (aquí, base derecha subpleural).', en: 'Fibrotic areas (here, the right subpleural base).' },
        see: { es: 'Dilatación irreversible, pero <b>por fibrosis pulmonar</b>, no por enfermedad primaria de la vía aérea. <b>Asintomáticas</b>. Bronquios periféricos irregulares, <b>retraídos hacia las zonas de fibrosis</b>.', en: 'Irreversible dilatation, but <b>from lung fibrosis</b>, not primary airway disease. <b>Asymptomatic</b>. Irregular peripheral bronchi, <b>pulled toward the fibrotic areas</b>.' },
        technique: { es: 'TCAR.', en: 'HRCT.' },
      },
      flags: [F.tcar],
    },
    {
      id: 'bronquitis', group: 'epoc', tag: 'ct-aprox', exam: false,
      name: { es: 'Bronquitis crónica', en: 'Chronic bronchitis' },
      short: { es: 'Bronquitis crónica', en: 'Chronic bronchitis' },
      view: { plane: 'axial', window: 'lung', zoom: 1.5, at: () => [280, 112, XMID] },
      params: [],
      techniques: [TK.rx('ok', 'Hallazgos ausentes o inespecíficos.', 'Findings absent or non-specific.', { default: true }), ct2('ok', 'Puede ser normal; a lo sumo, paredes bronquiales algo engrosadas (inespecífico).', 'May be normal; at most, mildly thick bronchial walls (non-specific).')],
      compare: ['centrolobulillar'],
      build: (p, A) => {
        const out = [];
        for (const code of ['RLL', 'LUL']) out.push(...treeTubes(bronchTree(A, code, 3, 11), { hu: -880, within: LOBES, label: 'lesion', wall: { w: 1, hu: -150 } }));
        out.push(mark(bronchTree(A, 'RLL', 3, 11)[0].pts[1], 'Paredes bronquiales (inespecífico)', 'Bronchial walls (non-specific)', { dx: -200, dy: 40 }));
        return out;
      },
      readouts: () => [{ label: { es: 'Definición', en: 'Definition' }, value: { es: 'Clínica: tos y expectoración > 3 meses/año, > 2 años', en: 'Clinical: cough and sputum > 3 months/year, > 2 years' } }],
      info: {
        where: { es: 'Vía aérea (EPOC).', en: 'Airways (COPD).' },
        see: { es: '<b>Definición clínica</b>: tos y expectoración más de 3 meses al año durante más de 2 años consecutivos, sin otra causa. <b>Hallazgos radiológicos ausentes o inespecíficos</b>.', en: '<b>Clinical definition</b>: cough and sputum for more than 3 months a year for more than 2 consecutive years, with no other cause. <b>Imaging findings absent or non-specific</b>.' },
        technique: { es: 'EPOC: limitación persistente al flujo aéreo, generalmente progresiva, con respuesta inflamatoria crónica exagerada a partículas o gases nocivos; suelen coexistir bronquitis crónica y enfisema.', en: 'COPD: persistent, usually progressive airflow limitation, with an exaggerated chronic inflammatory response to noxious particles or gases; chronic bronchitis and emphysema usually coexist.' },
        differential: { es: 'Enfisema: definición y clasificación radiológicas (TC).', en: 'Emphysema: radiological definition and classification (CT).' },
      },
      flags: [{ kind: 'ampliacion', es: 'El engrosamiento leve de las paredes bronquiales que se dibuja es un hallazgo inespecífico habitual; el temario dice solo «ausentes o inespecíficos».', en: 'The mild bronchial wall thickening drawn is a common non-specific finding; the syllabus only says "absent or non-specific".' }, F.bronchi],
    },
    {
      id: 'enfisema-rx', group: 'epoc', tag: 'sim', exam: false,
      name: { es: 'Enfisema en la Rx: hiperinsuflación y bullas', en: 'Emphysema on the film: hyperinflation and bullae' },
      short: { es: 'Enfisema (Rx)', en: 'Emphysema (film)' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.2, at: () => [245, 105, 145] },
      params: [{ id: 'desc', type: 'range', label: { es: 'Descenso y aplanamiento del diafragma', en: 'Diaphragm lowering and flattening' }, min: 0, max: 30, step: 5, value: 20, unit: 'mm' }, { id: 'bullas', type: 'toggle', label: { es: 'Bullas (> 1 cm)', en: 'Bullae (> 1 cm)' }, value: true }, { id: 'exc', type: 'range', label: { es: 'Movimiento del diafragma inspiración–espiración', en: 'Diaphragm movement inspiration–expiration' }, min: 1, max: 6, step: 0.5, value: 2, unit: 'cm' }],
      techniques: [TK.rx('ok', 'Hiperinsuflación: diafragma aplanado, costillas horizontales. Destrucción: hiperlucencia, difícil de ver.', 'Hyperinflation: flat diaphragm, horizontal ribs. Destruction: hyperlucency, hard to see.', { default: true }), TK.rxl('best', 'Diafragma aplanado y ↑ del espacio aéreo retroesternal.', 'Flat diaphragm and ↑ retrosternal air space.'), ct2('best', 'La definición y la clasificación del enfisema son radiológicas (TC).', 'The definition and classification of emphysema are radiological (CT).')],
      compare: ['centrolobulillar', 'bulloso'],
      build: (p, A) => {
        const out = [paint(A, LOBES, () => 1, (cur, a, z, y, x) => (cur.hu < -350 ? { hu: Math.round(cur.hu - 120 + 10 * nz(z, y, x, 0.4, 1)), label: 'keep' } : null))];
        if (p.desc) for (const side of ['R', 'L']) out.push(flatDiaphragm(A, side, p.desc));
        if (p.bullas) for (const [k, c, r] of bullaeSpots(A)) out.push({ t: 'blob', c, r, hu: -995, rim: { w: 0.9, hu: -450 }, edge: 0.3, within: SIDE[k], label: 'lesion' });
        out.push(mark([318, 110, 85], 'Diafragma aplanado', 'Flattened diaphragm', { dx: -180, dy: 50, planes: ['coronal', 'sagittal'] }));
        if (p.bullas) out.push(mark(bullaeSpots(A)[0][1], 'Bulla: único signo directo', 'Bulla: the only direct sign', { dx: -200, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Atrapamiento aéreo', en: 'Air trapping' }, value: p.exc < 3 ? { es: `Sí: el diafragma se mueve ${p.exc} cm (< 3 cm)`, en: `Yes: the diaphragm moves ${p.exc} cm (< 3 cm)` } : { es: `No: se mueve ${p.exc} cm`, en: `No: it moves ${p.exc} cm` } }, { label: { es: 'Signo directo', en: 'Direct sign' }, value: p.bullas ? { es: 'Bullas (> 1 cm, subpleurales)', en: 'Bullae (> 1 cm, subpleural)' } : { es: 'Ninguno', en: 'None' } }],
      info: {
        where: { es: 'Ambos pulmones y diafragmas.', en: 'Both lungs and hemidiaphragms.' },
        see: { es: '<b>Limitación al flujo</b>: hiperinsuflación (diafragma aplanado, ↑ espacio aéreo retroesternal, costillas horizontales) y atrapamiento aéreo (el diafragma se mueve <b>< 3 cm</b> entre inspiración y espiración). <b>Destrucción</b>: zonas de hiperlucencia, difíciles de ver. <b>Único signo directo: bullas</b> (poco frecuentes en la Rx; baja atenuación <b>> 1 cm</b>; generalmente subpleurales).', en: '<b>Airflow limitation</b>: hyperinflation (flat diaphragm, ↑ retrosternal air space, horizontal ribs) and air trapping (the diaphragm moves <b>< 3 cm</b> between inspiration and expiration). <b>Destruction</b>: hyperlucent areas, hard to see. <b>Only direct sign: bullae</b> (uncommon on the film; low attenuation <b>> 1 cm</b>; usually subpleural).' },
        technique: { es: 'Enfisema: agrandamiento permanente de los espacios aéreos distales al bronquiolo terminal, con destrucción de la pared alveolar y sin fibrosis manifiesta. Su definición y clasificación son radiológicas (TC).', en: 'Emphysema: permanent enlargement of the airspaces distal to the terminal bronchiole, with alveolar wall destruction and no obvious fibrosis. Its definition and classification are radiological (CT).' },
        tip: { es: 'Mira la Rx lateral: diafragma plano y espacio retroesternal oscuro.', en: 'Look at the lateral film: flat diaphragm and dark retrosternal space.' },
      },
      flags: [{ kind: 'ampliacion', es: 'El descenso del diafragma se simula convirtiendo en pulmón la cúpula de las vísceras bajo él; las costillas horizontales y la expiración no se simulan (el atrapamiento se da como lectura).', en: 'Diaphragm lowering is simulated by turning the top of the organs under it into lung; horizontal ribs and expiration are not simulated (air trapping is given as a readout).' }],
    },
    {
      id: 'centrolobulillar', group: 'epoc', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Enfisema centrolobulillar (centroacinar)', en: 'Centrilobular (centriacinar) emphysema' },
      short: { es: 'Centrolobulillar', en: 'Centrilobular' },
      view: { plane: 'axial', window: 'lung', zoom: 1.4, at: () => [236, 100, XMID], examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Gravedad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }],
      techniques: [ct2('best', 'Definición y clasificación del enfisema por la TC: áreas de baja atenuación sin pared.', 'Emphysema is defined and classified on CT: low-attenuation areas without a wall.', { default: true }), TK.rx('bad', 'La destrucción es difícil de ver en la Rx.', 'Destruction is hard to see on the film.')],
      compare: ['panlobulillar', 'paraseptal', 'bulloso'],
      build: (p, A) => {
        const lowers = new Set([A.id(LOBE.RLL), A.id(LOBE.LLL)]), tops = { [A.id(LOBE.RLL)]: A.s(LOBE.RLL).bbox, [A.id(LOBE.LLL)]: A.s(LOBE.LLL).bbox }, rr = 1.2 + 0.75 * p.sev;
        return [{ t: 'cols', box: lbox(A, LOBES), label: 'keep', fn: (z, y, x, cur) => {
          const l = cur.orig; if (!(l && (lowers.has(l) || l === A.id(LOBE.RUL) || l === A.id(LOBE.LUL) || l === A.id(LOBE.RML))) || cur.hu > -520) return null;
          let w; if (lowers.has(l)) { const b = tops[l]; w = 1 - sstep(b[0] + 0.15 * (b[1] - b[0]), b[0] + 0.35 * (b[1] - b[0]), z); } else w = 1 - sstep(258, 300, z);
          if (w < 0.05) return null;
          const c = cells(z, y, x, 8, 21); if (hashU(c[2] * 1e6, 3, 1) > 0.35 + 0.2 * p.sev) return null;
          if (c[0] > rr * w * (1 + 0.25 * nz(z, y, x, 0.3, 2))) return null;
          return { hu: -985 + Math.round(8 * nz(z, y, x, 0.6, 3)), label: 'lesion' };
        } }, mark([226, 98, 98], 'Agujeros centrolobulillares sin pared', 'Centrilobular holes without a wall', { dx: -210, dy: -40 })];
      },
      readouts: () => [{ label: { es: 'Distribución', en: 'Distribution' }, value: { es: 'Superior: vértices y segmentos apicales de los inferiores', en: 'Upper: apices and apical segments of the lower lobes' } }, { label: { es: 'Asociación', en: 'Association' }, value: { es: 'Tabaquismo · el más frecuente', en: 'Smoking · the commonest' } }],
      info: {
        where: { es: 'Predominio superior: vértices y segmentos apicales de los lóbulos inferiores.', en: 'Upper predominance: apices and apical segments of the lower lobes.' },
        see: { es: 'Destrucción del <b>centro del lobulillo</b> secundario: áreas de baja atenuación sin pared, con <b>límites bien definidos</b> entre pulmón sano y afectado.', en: 'Destruction of the <b>centre of the secondary lobule</b>: low-attenuation areas without a wall, with <b>sharp borders</b> between healthy and affected lung.' },
        technique: { es: 'TC: áreas de baja atenuación sin pared (salvo junto a septos o haces broncovasculares) · vasos distorsionados, amputados en fases avanzadas · posible complicación: neumotórax.', en: 'CT: low-attenuation areas without a wall (except next to septa or bronchovascular bundles) · distorted vessels, pruned in advanced stages · possible complication: pneumothorax.' },
        differential: { es: 'El más frecuente; secundario a tabaquismo.', en: 'The commonest; secondary to smoking.' },
      },
      diagram: lang => emphysemaDiagram(lang),
      flags: [],
    },
    {
      id: 'panlobulillar', group: 'epoc', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Enfisema panlobulillar (panacinar)', en: 'Panlobular (panacinar) emphysema' },
      short: { es: 'Panlobulillar', en: 'Panlobular' },
      view: { plane: 'axial', window: 'lung', zoom: 1.4, at: () => [305, 112, 100], examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Gravedad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }],
      techniques: [ct2('best', 'Destrucción uniforme de los lóbulos inferiores; vasos escasos y finos.', 'Uniform destruction of the lower lobes; sparse, thin vessels.', { default: true }), TK.rx('ok', 'Hiperlucencia de las bases.', 'Hyperlucent bases.')],
      compare: ['centrolobulillar', 'paraseptal', 'bulloso'],
      build: (p, A) => {
        const keys = [LOBE.RLL, LOBE.LLL, LOBE.RML], k = 0.45 + 0.25 * p.sev;
        return [paint(A, keys, (z) => clamp01(k * sstep(255, 315, z) * 1.3), (cur, a, z, y, x) => {
          if (cur.hu > -150) return null;
          if (cur.hu > -470) return p.sev >= 2 && a > 0.55 ? { hu: -880, label: 'keep' } : null;      // thinner, pruned vessels
          return { hu: Math.round(lerp(cur.hu, -975 + 6 * nz(z, y, x, 0.6, 3), a)), label: a > 0.5 ? 'lesion' : 'keep' };
        }), mark([312, 118, 92], 'Destrucción uniforme del lobulillo', 'Uniform lobular destruction', { dx: -210, dy: 40 })];
      },
      readouts: () => [{ label: { es: 'Distribución', en: 'Distribution' }, value: { es: 'Lóbulos inferiores', en: 'Lower lobes' } }, { label: { es: 'Asociación', en: 'Association' }, value: { es: 'Déficit de α1-antitripsina', en: 'α1-antitrypsin deficiency' } }],
      info: {
        where: { es: '<b>Lóbulos inferiores</b>.', en: '<b>Lower lobes</b>.' },
        see: { es: 'Afecta a <b>todo el lobulillo</b>: destrucción uniforme; queda poco pulmón normal. Vasos escasos.', en: 'Involves the <b>whole lobule</b>: uniform destruction; little normal lung is left. Sparse vessels.' },
        technique: { es: 'TC.', en: 'CT.' },
        differential: { es: 'Paciente joven no fumador con enfisema basal → <b>déficit de α1-antitripsina</b>.', en: 'Young non-smoker with basal emphysema → <b>α1-antitrypsin deficiency</b>.' },
      },
      diagram: lang => emphysemaDiagram(lang),
      flags: [F.lll],
    },
    {
      id: 'paraseptal', group: 'epoc', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Enfisema paraseptal', en: 'Paraseptal emphysema' },
      short: { es: 'Paraseptal', en: 'Paraseptal' },
      view: { plane: 'axial', window: 'lung', zoom: 1.6, at: () => [232, 98, XMID], examPlane: 'axial' },
      params: [{ id: 'sev', type: 'range', label: { es: 'Gravedad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 }, { id: 'bullas', type: 'toggle', label: { es: 'Bullas (> 1 cm)', en: 'Bullae (> 1 cm)' }, value: true }],
      techniques: [ct2('best', 'Espacios subpleurales de pared fina en hilera.', 'Rows of thin-walled subpleural spaces.', { default: true }), TK.rx('bad', 'Solo se verían las bullas.', 'Only the bullae would be seen.')],
      compare: ['centrolobulillar', 'panlobulillar', 'panal'],
      build: (p, A) => {
        const D = lungDepth(A), keys = [LOBE.RUL, LOBE.LUL], dmax = 3 + 2 * p.sev, out = [];
        out.push(paint(A, keys, (z, y, x) => (1 - sstep(dmax * 0.6, dmax, D.mm(z, y, x))) * (1 - sstep(262, 290, z)), (cur, a, z, y, x) => {
          const c = cells(z, y, x, 5, 31); if (hashU(c[2] * 1e6, 5, 2) > 0.45 + 0.15 * p.sev) return null;
          if (c[1] - c[0] < 0.7) return { hu: -420, label: 'keep' };
          return { hu: Math.round(lerp(cur.hu, -990, a)), label: a > 0.5 ? 'lesion' : 'keep' };
        }));
        if (p.bullas) for (const [k, c] of bullaeSpots(A)) out.push({ t: 'blob', c, r: 8, hu: -995, rim: { w: 0.8, hu: -420 }, edge: 0.3, within: SIDE[k], label: 'lesion' });
        out.push(mark(lateralPoint(A, 'RUL'), 'Subpleural, pared fina', 'Subpleural, thin wall', { dx: -190, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Riesgo', en: 'Risk' }, value: { es: 'Neumotórax espontáneo', en: 'Spontaneous pneumothorax' } }, { label: { es: 'Bullas', en: 'Bullae' }, value: p.bullas ? { es: 'Sí (> 1 cm, lóbulos superiores)', en: 'Yes (> 1 cm, upper lobes)' } : { es: 'No', en: 'No' } }],
      info: {
        where: { es: '<b>Subpleural</b>: parte más distal del lobulillo.', en: '<b>Subpleural</b>: the most distal part of the lobule.' },
        see: { es: 'Espacios de <b>paredes finas</b> (septos interlobulillares) bajo la pleura; si miden <b>> 1 cm = bullas</b> (lóbulos superiores).', en: 'Spaces with <b>thin walls</b> (interlobular septa) under the pleura; if <b>> 1 cm = bullae</b> (upper lobes).' },
        technique: { es: 'TC.', en: 'CT.' },
        differential: { es: 'Panal: quistes subpleurales de <b>pared gruesa</b> (fibrosis). Complicación del paraseptal: <b>neumotórax espontáneo</b>.', en: 'Honeycombing: subpleural cysts with a <b>thick wall</b> (fibrosis). Complication of paraseptal: <b>spontaneous pneumothorax</b>.' },
      },
      diagram: lang => emphysemaDiagram(lang),
      flags: [],
    },
    {
      id: 'bulloso', group: 'epoc', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Enfisema bulloso', en: 'Bullous emphysema' },
      short: { es: 'Bulloso', en: 'Bullous' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.5, at: () => [234, 96, 96], examPlane: 'axial' },
      params: [{ id: 'frac', type: 'range', label: { es: 'Volumen de las bullas (pulmón derecho)', en: 'Bullae volume (right lung)' }, min: 10, max: 50, step: 5, value: 40, unit: '%', examMin: 35 }],
      techniques: [ct2('best', 'Bullas grandes que ocupan > 1/3 del pulmón.', 'Large bullae filling > 1/3 of the lung.', { default: true }), TK.rx('ok', 'Zona hiperlucente sin vasos (bulla: signo directo).', 'Hyperlucent area without vessels (bulla: direct sign).')],
      compare: ['atel-compresiva', 'paraseptal', 'centrolobulillar'],
      build: (p, A, env) => {
        const vml = SIDE.R.reduce((s, k) => s + (A.s(k).volume_ml || 600), 0), V = vml * p.frac / 100 * 1.25;
        const r1 = Math.cbrt(3 * V * 0.8 / (4 * Math.PI)) * 10, r2 = Math.cbrt(3 * V * 0.2 / (4 * Math.PI)) * 10, c1 = [234, 92, 94], c2 = [Math.round(234 + r1 / 1.5 * 0.8), 120, 100];
        return [
          { t: 'blob', c: c1, r: [r1, r1 * 0.85, r1 * 0.8], hu: -995, rim: { w: 4, hu: env.phase !== 'sin' ? 55 : 32 }, edge: 0.5, within: SIDE.R, label: 'lesion' },
          { t: 'blob', c: c2, r: [r2, r2, r2], hu: -995, rim: { w: 1, hu: -400 }, edge: 0.4, within: SIDE.R, label: 'lesion' },
          mark(c1, 'Bulla gigante', 'Giant bulla', { dx: -170, dy: -40 }), mark([c1[0] + Math.round(r1 / 1.5 * 0.85), c1[1], c1[2]], 'Atelectasia compresiva', 'Compressive atelectasis', { dx: 60, dy: 50 }),
        ];
      },
      readouts: p => [{ label: { es: 'Volumen ocupado', en: 'Volume taken' }, value: { es: `≈ ${p.frac} % del pulmón ${p.frac > 33 ? '(> 1/3: bulloso)' : '(< 1/3)'}`, en: `≈ ${p.frac} % of the lung ${p.frac > 33 ? '(> 1/3: bullous)' : '(< 1/3)'}` } }],
      info: {
        where: { es: '<b>Lóbulos superiores</b>.', en: '<b>Upper lobes</b>.' },
        see: { es: 'Bullas grandes que ocupan <b>más de 1/3 del pulmón</b> y <b>crecen</b>; pueden causar <b>atelectasia compresiva</b>.', en: 'Large bullae filling <b>more than 1/3 of the lung</b> that <b>grow</b>; they can cause <b>compressive atelectasis</b>.' },
        technique: { es: 'TC.', en: 'CT.' },
      },
      diagram: lang => emphysemaDiagram(lang),
      flags: [],
    },
    /* ===== nódulos y cáncer ===== */
    {
      id: 'nps-benigno', group: 'nod', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Nódulo pulmonar solitario: rasgos de benignidad', en: 'Solitary pulmonary nodule: benign features' },
      short: { es: 'NPS benigno', en: 'Benign SPN' },
      view: { plane: 'axial', window: 'lung', zoom: 2.6, at: (p, A) => nodPos(A, p.lobe, p.sizeB), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'sizeB', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 4, max: 30, step: 1, value: 14, unit: 'mm', examMin: 8 },
        { id: 'calc', type: 'select', dropdown: true, label: { es: 'Calcio', en: 'Calcium' }, options: [opt('no', 'Sin calcio', 'No calcium'), opt('difuso', 'Difuso', 'Diffuse'), opt('central', 'Central', 'Central'), opt('laminar', 'Laminar', 'Laminar'), opt('palomitas', 'En palomitas de maíz', 'Popcorn')], value: 'central' },
        { id: 'fat', type: 'toggle', label: { es: 'Grasa', en: 'Fat' }, value: false }, { id: 'estable', type: 'toggle', label: { es: 'Estable > 2 años', en: 'Stable > 2 years' }, value: true }],
      techniques: [ct2('best', 'Ante la mínima duda → TC: caracteriza calcio, grasa y márgenes.', 'At the slightest doubt → CT: characterises calcium, fat and margins.', { default: true }), TK.med('ok', 'Ventana de mediastino para ver calcio y grasa.', 'Mediastinal window to see calcium and fat.'), TK.rx('ok', 'Uno de cada 500 Rx muestra un nódulo.', 'One in 500 films shows a nodule.')],
      compare: ['nps-maligno', 'pseudonodulos'],
      build: (p, A, env) => { const c = nodPos(A, p.lobe, p.sizeB); return [...nodule(A, env, c, { size: p.sizeB, margin: 'lisos', calc: p.calc, fat: p.fat }), mark(c, 'Nódulo', 'Nodule', { dx: 60, dy: -40 })]; },
      readouts: p => npsReadouts({ size: p.sizeB, margin: 'lisos', calc: p.calc, fat: p.fat, estable: p.estable, ggo: 'solido', cav: false }),
      info: {
        where: { es: 'Parénquima de un lóbulo real.', en: 'Parenchyma of a real lobe.' },
        see: { es: 'Calcio <b>difuso, central o laminar</b> → benignidad (TBC) · condroide <b>«en palomitas de maíz»</b> → hamartoma · <b>grasa</b> → hamartoma · <b>estable > 2 años</b> → benignidad · la mayoría de los benignos miden <b>< 2 cm</b> · los nódulos <b>< 8 mm</b> son un hallazgo muy frecuente con la TC multidetector.', en: '<b>Diffuse, central or laminar</b> calcium → benign (TB) · chondroid <b>"popcorn"</b> → hamartoma · <b>fat</b> → hamartoma · <b>stable > 2 years</b> → benign · most benign ones are <b>< 2 cm</b> · nodules <b>< 8 mm</b> are a very common finding on multidetector CT.' },
        technique: { es: 'Uno de los problemas radiológicos más frecuentes (1 de cada 500 Rx). Valorar siempre historia clínica, tamaño y aspecto. Ante la mínima duda → TC.', en: 'One of the commonest radiological problems (1 in 500 films). Always weigh history, size and appearance. At the slightest doubt → CT.' },
        differential: { es: 'Causas más frecuentes: 1) granuloma, 2) carcinoma broncogénico, 3) hamartoma, 4) metástasis única. Excluir pseudonódulos.', en: 'Commonest causes: 1) granuloma, 2) bronchogenic carcinoma, 3) hamartoma, 4) single metastasis. Exclude pseudonodules.' },
      },
      flags: [
        { kind: 'revisar', es: 'El resumen del temario define el nódulo como «lesión redondeada > 3 cm». Lo correcto es nódulo ≤ 3 cm (por encima, masa), coherente con el resto del temario.', en: 'The syllabus summary defines the nodule as a "round lesion > 3 cm". The correct definition is nodule ≤ 3 cm (above that, a mass), consistent with the rest of the syllabus.' },
        { kind: 'ampliacion', es: 'La regla «estable > 2 años = benigno» vale para nódulos sólidos. Los nódulos en vidrio deslustrado o mixtos crecen despacio y se siguen más tiempo (guías Fleischner 2017).', en: 'The "stable > 2 years = benign" rule applies to solid nodules. Ground-glass or part-solid nodules grow slowly and are followed for longer (Fleischner 2017 guidelines).' },
      ],
    },
    {
      id: 'nps-maligno', group: 'nod', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Nódulo pulmonar solitario: rasgos de malignidad', en: 'Solitary pulmonary nodule: malignant features' },
      short: { es: 'NPS maligno', en: 'Malignant SPN' },
      view: { plane: 'axial', window: 'lung', zoom: 2.4, at: (p, A) => nodPos(A, p.lobe, p.sizeM), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'sizeM', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 8, max: 30, step: 1, value: 22, unit: 'mm', examMin: 15 },
        { id: 'margin', type: 'select', label: { es: 'Márgenes', en: 'Margins' }, options: [opt('lisos', 'Lisos', 'Smooth'), opt('lobulados', 'Lobulados', 'Lobulated'), opt('espiculados', 'Espiculados', 'Spiculated')], value: 'espiculados' },
        { id: 'ggo', type: 'select', label: { es: 'Densidad', en: 'Density' }, options: [opt('solido', 'Sólido', 'Solid'), opt('mixto', 'Mixto', 'Part-solid'), opt('vidrio', 'Vidrio deslustrado', 'Ground glass')], value: 'solido' },
        { id: 'cav', type: 'toggle', label: { es: 'Cavitación', en: 'Cavitation' }, value: false }],
      techniques: [ct2('best', 'Márgenes, densidad y cavitación se valoran en TC.', 'Margins, density and cavitation are assessed on CT.', { default: true }), TK.rx('ok')],
      compare: ['nps-benigno', 'ca-periferico'],
      build: (p, A, env) => { const c = nodPos(A, p.lobe, p.sizeM); return [...nodule(A, env, c, { size: p.sizeM, margin: p.margin, ggo: p.ggo, cav: p.cav && p.ggo !== 'vidrio' }), mark(c, p.margin === 'espiculados' ? 'Espículas' : 'Nódulo', p.margin === 'espiculados' ? 'Spicules' : 'Nodule', { dx: 60, dy: -40 })]; },
      readouts: p => npsReadouts({ size: p.sizeM, margin: p.margin, calc: 'no', fat: false, estable: false, ggo: p.ggo, cav: p.cav }),
      info: {
        where: { es: 'Parénquima de un lóbulo real.', en: 'Parenchyma of a real lobe.' },
        see: { es: '<b>Márgenes espiculados</b> → malignidad · contorno irregular o mal definido · <b>vidrio deslustrado</b>: benignidad o malignidad · <b>cavitación</b>.', en: '<b>Spiculated margins</b> → malignant · irregular or ill-defined contour · <b>ground glass</b>: benign or malignant · <b>cavitation</b>.' },
        technique: { es: 'TC ante la mínima duda.', en: 'CT at the slightest doubt.' },
        differential: { es: 'Granuloma calcificado, hamartoma (palomitas, grasa). Múltiples → metástasis.', en: 'Calcified granuloma, hamartoma (popcorn, fat). Multiple → metastases.' },
        tip: { es: '«Espícula pica, es mala; palomitas y grasa, buenas.»', en: '"Spicules sting, they are bad; popcorn and fat are good."' },
      },
      flags: [{ kind: 'apuntes', es: 'El temario lista la cavitación sin especificar si orienta a benigno o maligno; en la tabla resumen la coloca entre los rasgos de malignidad.', en: 'The syllabus lists cavitation without saying whether it suggests benign or malignant; the summary table places it among the malignant features.' }],
    },
    {
      id: 'pseudonodulos', group: 'nod', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Pseudonódulos (excluir antes de hablar de nódulo)', en: 'Pseudonodules (exclude before calling a nodule)' },
      short: { es: 'Pseudonódulo', en: 'Pseudonodule' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.4, at: (p, A) => pseudoAt(A, p.tipo), examPlane: 'axial' },
      params: [{ id: 'tipo', type: 'select', dropdown: true, label: { es: 'Origen', en: 'Origin' }, options: [opt('pezon', 'Pezones', 'Nipples'), opt('objeto', 'Objeto externo (electrodo)', 'External object (electrode)'), opt('piel', 'Lesión cutánea', 'Skin lesion'), opt('osea', 'Lesión ósea (costilla)', 'Bone lesion (rib)'), opt('pleural', 'Lesión pleural', 'Pleural lesion')], value: 'pezon', recentre: true }],
      techniques: [TK.rx('ok', 'En la Rx se proyecta sobre el pulmón y parece un nódulo.', 'On the film it projects over the lung and looks like a nodule.', { default: true }), ct2('best', 'La TC lo sitúa fuera del parénquima.', 'CT places it outside the parenchyma.'), TK.med('ok', 'Partes blandas, hueso y pleura.', 'Soft tissue, bone and pleura.')],
      compare: ['nps-benigno'],
      build: (p, A) => pseudoBuild(A, p.tipo),
      readouts: p => [{ label: { es: 'Dónde está realmente', en: 'Where it really is' }, value: { pezon: { es: 'Piel (pezón)', en: 'Skin (nipple)' }, objeto: { es: 'Fuera del paciente', en: 'Outside the patient' }, piel: { es: 'Piel de la espalda', en: 'Skin of the back' }, osea: { es: 'Costilla', en: 'Rib' }, pleural: { es: 'Pleura', en: 'Pleura' } }[p.tipo] }],
      info: {
        where: { es: 'Fuera del parénquima: piel, objetos externos, hueso o pleura.', en: 'Outside the parenchyma: skin, external objects, bone or pleura.' },
        see: { es: 'Antes de hablar de nódulo pulmonar solitario hay que <b>excluir pseudonódulos</b>: objetos externos, pezones, lesiones cutáneas, óseas o pleurales.', en: 'Before calling a solitary pulmonary nodule, <b>exclude pseudonodules</b>: external objects, nipples, skin, bone or pleural lesions.' },
        technique: { es: 'Rx (donde engañan) → TC (o exploración) para situarlos.', en: 'Film (where they deceive) → CT (or examination) to place them.' },
        tip: { es: 'Mira «Pezones» en la Rx PA y luego en TC: dos «nódulos» simétricos que están en la piel.', en: 'Look at "Nipples" on the PA film and then on CT: two symmetric "nodules" sitting in the skin.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Las posiciones (pezones, electrodo, lesión de la espalda) se estiman a partir de la piel de este TC; el temario solo enumera los tipos.', en: 'Positions (nipples, electrode, back lesion) are estimated from this CT\'s skin; the syllabus only lists the types.' }],
    },
    {
      id: 'nodulos-multiples', group: 'nod', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Nódulos pulmonares múltiples (metástasis)', en: 'Multiple pulmonary nodules (metastases)' },
      short: { es: 'Nódulos múltiples', en: 'Multiple nodules' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.3, at: () => [272, 100, XMID], examPlane: 'axial' },
      params: [{ id: 'n', type: 'range', label: { es: 'Número', en: 'Number' }, min: 5, max: 40, step: 5, value: 15, examMin: 10 }, { id: 'size', type: 'range', label: { es: 'Tamaño máximo', en: 'Largest size' }, min: 6, max: 30, step: 2, value: 16, unit: 'mm', examMin: 10 }],
      techniques: [ct2('best', 'La TC detecta muchos más nódulos que la Rx.', 'CT detects many more nodules than the film.', { default: true }), TK.rx('ok')],
      compare: ['tcar-nodulos', 'nps-maligno'],
      build: (p, A, env) => {
        const out = [], codes = ['RLL', 'RUL', 'LUL', 'RLL', 'RML', 'LUL'];
        for (let i = 0; i < p.n; i++) { const s = p.size * (0.35 + 0.65 * hashU(i, 4, 4)), c = lungPoint(A, LOBE[codes[i % codes.length]], 700 + i, s / 2 + 4); out.push({ t: 'blob', c, r: s / 2, hu: env.phase !== 'sin' ? 45 : 36, edge: 0.6, irregular: 0.1, within: LOBES, label: 'lesion' }); }
        return out;
      },
      readouts: p => [{ label: { es: 'Causa más frecuente', en: 'Commonest cause' }, value: { es: 'Metástasis', en: 'Metastases' } }, { label: { es: 'Número', en: 'Number' }, value: String(p.n) }],
      info: {
        where: { es: 'Ambos pulmones.', en: 'Both lungs.' },
        see: { es: 'Varios nódulos de distinto tamaño: la causa más frecuente son las <b>metástasis</b>.', en: 'Several nodules of different sizes: the commonest cause is <b>metastases</b>.' },
        technique: { es: 'TC.', en: 'CT.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Distintos tamaños y localización periférica son el aspecto habitual de las metástasis hematógenas; el temario solo da la causa.', en: 'Varying sizes and peripheral location are the usual look of haematogenous metastases; the syllabus only gives the cause.' }],
    },
    {
      id: 'ca-central', group: 'nod', tag: 'ct-aprox', extraTags: ['sim'], contrast: true,
      name: { es: 'Carcinoma broncogénico central', en: 'Central bronchogenic carcinoma' },
      short: { es: 'Carcinoma central', en: 'Central carcinoma' },
      view: { plane: 'coronal', window: 'lung', zoom: 1.6, at: (p, A) => mid(HILUM[p.lobe], centre(A, p.lobe), 0.25), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'size', type: 'range', label: { es: 'Masa', en: 'Mass' }, min: 20, max: 50, step: 5, value: 35, unit: 'mm', examMin: 30 },
        { id: 'distal', type: 'select', label: { es: 'Pulmón distal', en: 'Distal lung' }, options: [opt('atel', 'Atelectasia', 'Atelectasis'), opt('consol', 'Consolidación que no responde', 'Non-resolving consolidation'), opt('no', 'Aireado', 'Aerated')], value: 'atel' },
        { id: 'hist', type: 'select', label: { es: 'Histología', en: 'Histology' }, options: [opt('epidermoide', 'Epidermoide', 'Squamous'), opt('microcitico', 'Microcítico', 'Small cell')], value: 'epidermoide', exam: false }],
      techniques: [TK.rx('ok', 'Hilio aumentado, atelectasia o consolidación que no responde.', 'Enlarged hilum, atelectasis or non-resolving consolidation.', { default: true }), TK.med('best', 'Estadificación con TC: masa, adenopatías y extensión.', 'CT staging: mass, nodes and extent.'), ct2()],
      compare: ['ca-periferico', 'golden'],
      build: (p, A, env) => {
        const out = [];
        if (p.distal === 'atel') out.push(...buildCollapseEntity({ lobe: p.lobe, vol: 45 }, A, env, { bronch: 'liquido' }).out);
        if (p.distal === 'consol') out.push(...lobeConsol(A, p.lobe, 1, { bronch: false }));
        out.push(hilarMass(A, p.lobe, p.size));
        out.push(mark(HILUM[p.lobe], 'Masa central / hilio aumentado', 'Central mass / enlarged hilum', { dx: 60, dy: -40 }));
        return out;
      },
      readouts: p => [{ label: { es: 'Histología típica', en: 'Typical histology' }, value: { es: 'Epidermoide y microcítico', en: 'Squamous and small cell' } }, { label: { es: 'Distal', en: 'Distal' }, value: { atel: { es: 'Atelectasia obstructiva', en: 'Obstructive atelectasis' }, consol: { es: 'Consolidación que no responde', en: 'Non-resolving consolidation' }, no: { es: 'Aireado', en: 'Aerated' } }[p.distal] }],
      info: {
        where: { es: 'Hilio (bronquio principal o lobar); posición estimada a partir del lóbulo real.', en: 'Hilum (main or lobar bronchus); position estimated from the real lobe.' },
        see: { es: 'Obstrucción bronquial → <b>atelectasia y/o retención de secreciones</b> · atelectasia o consolidación <b>que no responde</b> · <b>masa central o hilio aumentado</b> (tumor o adenopatías) · atelectasia lobar: signo de la <b>«S itálica» o «S de Golden»</b> · con o sin cavitación.', en: 'Bronchial obstruction → <b>atelectasis and/or retained secretions</b> · atelectasis or consolidation <b>that does not respond</b> · <b>central mass or enlarged hilum</b> (tumour or nodes) · lobar collapse: the <b>"reverse S" or Golden\'s S sign</b> · with or without cavitation.' },
        technique: { es: '1.ª causa de muerte por cáncer (hombres y mujeres). El tratamiento más eficaz es la cirugía, con estadificación previa sobre todo con TC. Prevención: evitar el tabaco.', en: 'Leading cause of cancer death (men and women). The most effective treatment is surgery, after staging mainly with CT. Prevention: avoid tobacco.' },
        differential: { es: 'Periférico: adenocarcinoma y células grandes (nódulo o masa).', en: 'Peripheral: adenocarcinoma and large cell (nodule or mass).' },
        tip: { es: '«Centrales: E y M (epidermoide, microcítico); periféricos: A (adenocarcinoma).»', en: '"Central: S and S (squamous, small cell); peripheral: A (adenocarcinoma)."' },
      },
      flags: [{ kind: 'revisar', es: 'La supervivencia a 5 años del 13–15 % del temario es una cifra antigua; con el cribado con TC de baja dosis y los tratamientos actuales ha mejorado (consulta datos recientes).', en: 'The syllabus 5-year survival of 13–15 % is an old figure; with low-dose CT screening and current treatments it has improved (check recent data).' }, { kind: 'ampliacion', es: 'El hilio no está segmentado: la masa se coloca en el origen estimado del bronquio lobar.', en: 'The hilum is not segmented: the mass is placed at the estimated origin of the lobar bronchus.' }],
    },
    {
      id: 'ca-periferico', group: 'nod', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Carcinoma broncogénico periférico', en: 'Peripheral bronchogenic carcinoma' },
      short: { es: 'Carcinoma periférico', en: 'Peripheral carcinoma' },
      view: { plane: 'axial', window: 'lung', zoom: 1.9, at: (p, A) => nodPos(A, p.lobe, p.size, 91), examPlane: 'axial' },
      params: [lobeParam('RUL'), { id: 'size', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 10, max: 60, step: 5, value: 35, unit: 'mm', examMin: 20 }, { id: 'cav', type: 'toggle', label: { es: 'Cavitación', en: 'Cavitation' }, value: false },
        { id: 'hist', type: 'select', label: { es: 'Histología', en: 'Histology' }, options: [opt('adeno', 'Adenocarcinoma', 'Adenocarcinoma'), opt('grandes', 'Células grandes', 'Large cell')], value: 'adeno', exam: false }],
      techniques: [ct2('best', 'Nódulo o masa; estadificación con TC.', 'Nodule or mass; CT staging.', { default: true }), TK.rx('ok')],
      compare: ['ca-central', 'atel-redonda', 'nps-maligno'],
      build: (p, A, env) => { const c = nodPos(A, p.lobe, p.size, 91); return [...nodule(A, env, c, { size: p.size, margin: 'espiculados', cav: p.cav }), mark(c, p.size > 30 ? 'Masa' : 'Nódulo', p.size > 30 ? 'Mass' : 'Nodule', { dx: 60, dy: -40 })]; },
      readouts: p => [{ label: { es: 'Es', en: 'It is' }, value: p.size > 30 ? { es: `Masa (${p.size} mm > 3 cm): mucha más probabilidad de ser maligna`, en: `Mass (${p.size} mm > 3 cm): much more likely malignant` } : { es: `Nódulo (${p.size} mm ≤ 3 cm)`, en: `Nodule (${p.size} mm ≤ 3 cm)` } }, { label: { es: 'Histología típica', en: 'Typical histology' }, value: { es: 'Adenocarcinoma, células grandes', en: 'Adenocarcinoma, large cell' } }],
      info: {
        where: { es: 'Periferia del pulmón.', en: 'Lung periphery.' },
        see: { es: '<b>Nódulo o masa</b> (las masas tienen mucha más probabilidad de ser malignas) · consolidación que no responde · con o sin cavitación.', en: '<b>Nodule or mass</b> (masses are much more likely to be malignant) · non-resolving consolidation · with or without cavitation.' },
        technique: { es: 'TC; estadificación con TC antes de la cirugía. El carcinoma puede infiltrar el mediastino, la pleura (derrame) y la pared torácica.', en: 'CT; CT staging before surgery. The carcinoma can invade the mediastinum, pleura (effusion) and chest wall.' },
        differential: { es: 'Atelectasia redonda: simula un cáncer, pero es pérdida de volumen junto a pleura engrosada.', en: 'Round atelectasis: mimics a cancer, but it is volume loss next to thickened pleura.' },
      },
      flags: [],
    },
    {
      id: 'pancoast', group: 'nod', tag: 'ct-real', extraTags: ['sim'], contrast: true,
      name: { es: 'Tumor de Pancoast (sulcus superior)', en: 'Pancoast (superior sulcus) tumour' },
      short: { es: 'Pancoast', en: 'Pancoast' },
      view: { plane: 'coronal', window: 'lung', zoom: 2, at: (p, A) => pancoastC(A, p.size), examPlane: 'coronal' },
      params: [{ id: 'size', type: 'range', label: { es: 'Tamaño de la masa', en: 'Mass size' }, min: 0, max: 50, step: 5, value: 35, unit: 'mm' }, { id: 'cap', type: 'range', label: { es: 'Engrosamiento apical derecho', en: 'Right apical thickening' }, min: 2, max: 20, step: 1, value: 10, unit: 'mm', examMin: 8 },
        { id: 'ribs', type: 'toggle', label: { es: 'Invasión de costillas (1.ª–2.ª)', en: 'Rib invasion (1st–2nd)' }, value: true }, { id: 'vert', type: 'toggle', label: { es: 'Invasión vertebral (T1–T2)', en: 'Vertebral invasion (T1–T2)' }, value: false }],
      techniques: [TK.rx('ok', 'Sospechar si hay un engrosamiento apical irregular, asimétrico, > 5 mm respecto al otro lado.', 'Suspect it if there is irregular, asymmetric apical thickening > 5 mm compared with the other side.', { default: true }), TK.med('best', 'Extensión a pared torácica, costillas, vértebras y opérculo.', 'Extension to chest wall, ribs, vertebrae and thoracic inlet.'), ct2(), { id: 't1', mod: 't1', plane: 'coronal', verdict: 'ok', label: { es: 'RM T1 (ampliación)', en: 'T1 MR (beyond syllabus)' }, note: { es: 'Fuera del temario: la RM valora el plexo braquial y la pared (pseudo-RM simulada).', en: 'Beyond the syllabus: MR assesses the brachial plexus and chest wall (simulated pseudo-MR).' } }],
      compare: ['ca-periferico'],
      build: (p, A) => {
        const key = LOBE.RUL, id = A.id(key), top = lobeTop(A, key), [, , X] = A.dims, apex = A.extreme(key, 'superior'), g = p.cap / 1.5, out = [];
        out.push({ t: 'cols', box: clampBox(A, [apex[0], apex[0] + 40, apex[1] - 40, apex[1] + 40, apex[2] - 45, apex[2] + 30]), label: 'lesion', fn: (z, y, x, cur) => {
          if (cur.orig !== id) return null; const t = top[y * X + x]; if (t < 0 || z - t > g * (1 + 0.25 * nz(z, y, x, 0.15, 3))) return null;
          return { hu: Math.round(40 + 6 * nz(z, y, x, 0.5, 1)) };
        } });
        if (p.size) {
          const c = pancoastC(A, p.size), r = p.size / 2, keep = ['trachea', 'esophagus', 'subclavian_artery_right', 'common_carotid_artery_right', 'brachiocephalic_trunk'];
          const outside = keep.concat(p.ribs ? [] : ['rib_right_1', 'rib_right_2', 'clavicula_right']).concat(p.vert ? [] : ['vertebrae_T1', 'vertebrae_T2', 'vertebrae_C7', 'spinal_cord']).filter(k => A.has(k));
          if (p.ribs) out.push({ t: 'fill', s: ['rib_right_1', 'rib_right_2'], region: { c, r: r * 1.15 }, hu: 48, label: 'lesion' });
          if (p.vert) out.push({ t: 'fill', s: ['vertebrae_T1', 'vertebrae_T2'].filter(k => A.has(k)), region: { c, r: r * 1.25 }, hu: 55, label: 'lesion' });
          out.push({ t: 'blob', c, r: [r * 0.85, r, r], hu: massHU, edge: 1.2, irregular: 0.5, texture: 6, outside, label: 'lesion', mr: { t1: 0.35, t2: 0.6, stir: 0.6 } });
          out.push(mark(c, 'Masa del ápex', 'Apical mass', { dx: -170, dy: -40 }));
          if (p.ribs) out.push(mark(A.extreme('rib_right_1', 'posterior') || c, 'Costilla destruida', 'Destroyed rib', { dx: 60, dy: -50 }));
        }
        out.push(mark([apex[0] + Math.round(g / 2), apex[1], apex[2]], `Engrosamiento apical ${p.cap} mm`, `Apical thickening ${p.cap} mm`, { dx: 60, dy: 40, planes: ['coronal', 'sagittal'] }));
        return out;
      },
      readouts: p => [{ label: { es: 'Asimetría apical', en: 'Apical asymmetry' }, value: p.cap > 5 ? { es: `${p.cap} mm (> 5 mm: sospecha de Pancoast)`, en: `${p.cap} mm (> 5 mm: suspect Pancoast)` } : { es: `${p.cap} mm (≤ 5 mm)`, en: `${p.cap} mm (≤ 5 mm)` } }, { label: { es: 'Invasión', en: 'Invasion' }, value: { es: [p.ribs ? 'costillas' : '', p.vert ? 'vértebras' : ''].filter(Boolean).join(', ') || 'no ósea', en: [p.ribs ? 'ribs' : '', p.vert ? 'vertebrae' : ''].filter(Boolean).join(', ') || 'no bone' } }],
      info: {
        where: { es: '<b>Ápex pulmonar</b> (sulcus superior); invade por contigüidad la pared torácica y/o el opérculo torácico.', en: '<b>Lung apex</b> (superior sulcus); spreads directly into the chest wall and/or thoracic inlet.' },
        see: { es: '<b>Síndrome de Pancoast</b>: invasión del plexo braquial, el sistema simpático, los vasos subclavios, costillas, cuerpos vertebrales y/o el canal neural. En la Rx: <b>engrosamiento apical irregular, asimétrico, > 5 mm</b> respecto al otro lado.', en: '<b>Pancoast syndrome</b>: invasion of the brachial plexus, sympathetic chain, subclavian vessels, ribs, vertebral bodies and/or the neural canal. On the film: <b>irregular, asymmetric apical thickening > 5 mm</b> compared with the other side.' },
        technique: { es: 'Rx para sospecharlo; TC para la extensión.', en: 'Film to suspect it; CT for the extent.' },
        tip: { es: 'Pon la masa a 0 y mueve el engrosamiento: en la Rx PA solo cambia el vértice derecho.', en: 'Set the mass to 0 and move the thickening: on the PA film only the right apex changes.' },
      },
      flags: [F.rm, { kind: 'ampliacion', es: 'Este TC es de un paciente politraumatizado: revisa las costillas reales antes de interpretar la destrucción costal simulada.', en: 'This CT is from a trauma patient: check the real ribs before reading the simulated rib destruction.' }],
    },
    /* ===== COVID-19 / SDRA ===== */
    {
      id: 'sdra', group: 'covid', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'COVID-19 / SDRA: evolución', en: 'COVID-19 / ARDS: course' },
      short: { es: 'COVID-19 / SDRA', en: 'COVID-19 / ARDS' },
      view: { plane: 'axial', window: 'lung', zoom: 1.3, at: () => [282, 108, XMID], examPlane: 'axial' },
      params: [{ id: 'dia', type: 'select', label: { es: 'Evolución', en: 'Course' }, options: DAYS, value: '5' }, { id: 'causa', type: 'select', label: { es: 'Lesión de la barrera', en: 'Barrier injury' }, options: [opt('pulmonar', 'Pulmonar (directa)', 'Pulmonary (direct)'), opt('extrapulmonar', 'Extrapulmonar (indirecta)', 'Extrapulmonary (indirect)')], value: 'pulmonar', exam: false }],
      techniques: [ct2('best', 'Vidrio, empedrado, consolidación; uni o bilateral, subpleural, central o difusa.', 'Ground glass, crazy paving, consolidation; uni- or bilateral, subpleural, central or diffuse.', { default: true }), TK.rx('ok', 'Focos bilaterales de consolidación.', 'Bilateral foci of consolidation.')],
      compare: ['consol-difusa-aguda', 'empedrado'],
      build: (p, A) => {
        const D = lungDepth(A), d = +p.dia;
        if (d === 1) return [paint(A, LOBES, (z, y, x) => sstep(0, 0.32, nz(z, y, x, 0.05, 41)) * (1 - sstep(14, 30, D.mm(z, y, x))), ggoVal(300)), mark(lateralPoint(A, 'RLL'), 'Vidrio subpleural parcheado', 'Patchy subpleural ground glass', { dx: -200, dy: 40 })];
        if (d === 5) { const g = ggoVal(290); return [paint(A, LOBES, (z, y, x) => sstep(-0.35, 0, nz(z, y, x, 0.04, 41)) * (1 - sstep(30, 60, D.mm(z, y, x))), (cur, a, z, y, x) => { const v = g(cur, a, z, y, x); if (!v) return null; const s = septa(z, y, x, a, 0.85, 0.45); if (s) v.hu = Math.round(lerp(v.hu, s === 1 ? -60 : -230, a)); return v; }), mark(lateralPoint(A, 'RLL'), 'Empedrado', 'Crazy paving', { dx: -200, dy: 40 })]; }
        return [paint(A, LOBES, (z, y, x) => clamp01(0.55 + 0.35 * sstep(80, 140, y) + 0.3 * nz(z, y, x, 0.05, 41)) * sstep(1.5, 5, D.mm(z, y, x)), consolVal(30)), mark([282, 130, 90], 'Consolidación bilateral difusa', 'Diffuse bilateral consolidation', { dx: -200, dy: 40 })];
      },
      readouts: p => [{ label: { es: 'Patrón', en: 'Pattern' }, value: { 1: { es: 'Día 1: vidrio deslustrado', en: 'Day 1: ground glass' }, 5: { es: 'Día 5: empedrado', en: 'Day 5: crazy paving' }, 6: { es: 'Día 6: consolidación difusa (exitus)', en: 'Day 6: diffuse consolidation (death)' } }[p.dia] }, { label: { es: 'No típicos', en: 'Not typical' }, value: { es: 'Adenopatías mediastínicas, derrame', en: 'Mediastinal nodes, effusion' } }, { label: { es: 'Causa', en: 'Cause' }, value: p.causa === 'pulmonar' ? { es: 'Pulmonar: infección, aspiración', en: 'Pulmonary: infection, aspiration' } : { es: 'Extrapulmonar: sepsis, trauma grave', en: 'Extrapulmonary: sepsis, severe trauma' } }],
      info: {
        where: { es: 'Ambos pulmones.', en: 'Both lungs.' },
        see: { es: 'COVID-19: de una neumonía a un <b>SDRA</b>. Sospechar SDRA ante un cuadro agudo con disnea, taquipnea, tos seca y <b>focos bilaterales de consolidación sin insuficiencia cardíaca izquierda</b>. Hallazgos (pueden faltar): <b>vidrio, empedrado, consolidación</b>; uni o bilateral, uni o multilobar; subpleural, central o difusa. <b>No típicos: adenopatías mediastínicas ni derrame</b>.', en: 'COVID-19: from pneumonia to <b>ARDS</b>. Suspect ARDS with an acute picture of dyspnoea, tachypnoea, dry cough and <b>bilateral foci of consolidation without left heart failure</b>. Findings (may be absent): <b>ground glass, crazy paving, consolidation</b>; uni- or bilateral, uni- or multilobar; subpleural, central or diffuse. <b>Not typical: mediastinal nodes or effusion</b>.' },
        technique: { es: 'Directa o indirecta, la lesión es la misma: se rompe la <b>barrera alveolocapilar</b>. Pulmonar (agresión directa: infección, aspiración) o extrapulmonar (mediadores de un proceso sistémico: sepsis, trauma grave).', en: 'Direct or indirect, the injury is the same: the <b>alveolocapillary barrier</b> breaks. Pulmonary (direct injury: infection, aspiration) or extrapulmonary (mediators of a systemic process: sepsis, severe trauma).' },
        tip: { es: 'Recorre día 1 → 5 → 6 como en la imagen del temario.', en: 'Step through day 1 → 5 → 6 as in the syllabus image.' },
      },
      flags: [{ kind: 'apuntes', es: 'La secuencia día 1 / 5 / 6 reproduce el caso de evolución radiológica de la COVID-19 del temario.', en: 'The day 1 / 5 / 6 sequence reproduces the syllabus case of the radiological course of COVID-19.' }, F.lll],
    },
  ],
  questions: [
    { prompt: { es: '¿Por qué no se usa la RM para estudiar el parénquima pulmonar?', en: 'Why is MR not used to study the lung parenchyma?' }, show: 'tecnicas',
      options: [{ es: 'Porque el aire altera el campo magnético de las moléculas de alrededor y la zona no se ve bien', en: 'Because air distorts the magnetic field of the surrounding molecules and the area is not seen well' }, { es: 'Porque irradia más que la TC', en: 'Because it gives more radiation than CT' }, { es: 'Porque necesita contraste yodado', en: 'Because it needs iodinated contrast' }, { es: 'Porque no ve el mediastino', en: 'Because it cannot see the mediastinum' }],
      answer: 0, explain: { es: 'El aire altera el campo magnético; la RM no irradia.', en: 'Air distorts the magnetic field; MR uses no radiation.' } },
    { prompt: { es: '¿Qué cuatro signos definen el patrón alveolar?', en: 'Which four signs define the alveolar pattern?' }, show: 'alveolar',
      options: [{ es: 'Consolidación, broncograma aéreo, signo de la silueta y límite nítido en la cisura; sin pérdida de volumen', en: 'Consolidation, air bronchogram, silhouette sign and sharp border at the fissure; no volume loss' }, { es: 'Pérdida de volumen, cisura retraída, diafragma elevado y desplazamiento hiliar', en: 'Volume loss, retracted fissure, raised diaphragm and hilar shift' }, { es: 'Quistes en panal, septos, vidrio y nódulos', en: 'Honeycombing, septa, ground glass and nodules' }, { es: 'Bullas, hiperinsuflación, diafragma plano y costillas horizontales', en: 'Bullae, hyperinflation, flat diaphragm and horizontal ribs' }],
      answer: 0, explain: { es: 'El patrón alveolar llena: no pierde volumen (incluso puede aumentar).', en: 'The alveolar pattern fills: no volume loss (it may even increase).' } },
    { prompt: { es: 'Paciente con una «neumonía» del LSD que no mejora tras dos ciclos de antibiótico. ¿Qué haces y qué sospechas?', en: 'A patient with RUL "pneumonia" that does not improve after two courses of antibiotics. What do you do and suspect?' }, show: 'consol-localizada',
      options: [{ es: 'TC: sospechar un tumor', en: 'CT: suspect a tumour' }, { es: 'Otro ciclo de antibiótico y Rx en un mes', en: 'Another course of antibiotics and a film in a month' }, { es: 'RM torácica', en: 'Chest MR' }, { es: 'Nada: es una neumonía lenta', en: 'Nothing: it is a slow pneumonia' }],
      answer: 0, explain: { es: 'Hay que sospechar un tumor en toda consolidación que no responde al tratamiento y pedir una TC.', en: 'Suspect a tumour in any consolidation that does not respond to treatment, and order a CT.' } },
    { prompt: { es: 'Consolidación bilateral central aguda en un paciente con insuficiencia cardíaca. ¿Cómo se llama el patrón?', en: 'Acute bilateral central consolidation in a patient with heart failure. What is the pattern called?' }, show: 'alas-mariposa',
      options: [{ es: 'Edema pulmonar «en alas de mariposa»', en: '"Butterfly" pulmonary oedema' }, { es: 'Neumonía eosinófila', en: 'Eosinophilic pneumonia' }, { es: 'Patrón en empedrado', en: 'Crazy paving' }, { es: 'Atelectasia completa', en: 'Complete atelectasis' }],
      answer: 0, explain: { es: 'Bilateral, central, aguda y con fallo cardíaco: alas de mariposa. La periférica es la neumonía eosinófila / organizativa.', en: 'Bilateral, central, acute, with heart failure: butterfly. The peripheral one is eosinophilic / organising pneumonia.' } },
    { prompt: { es: '¿Cuál es la atelectasia más peligrosa y por qué?', en: 'Which atelectasis is the most dangerous, and why?' }, show: 'atel-obstructiva',
      options: [{ es: 'La obstructiva, porque se relaciona con el cáncer de pulmón', en: 'Obstructive, because it is linked to lung cancer' }, { es: 'La pasiva, porque indica derrame', en: 'Passive, because it means effusion' }, { es: 'La cicatricial, porque es irreversible', en: 'Cicatricial, because it is irreversible' }, { es: 'La segmentaria, porque es basal', en: 'Segmental, because it is basal' }],
      answer: 0, explain: { es: 'Un cáncer central obstruye el bronquio.', en: 'A central cancer blocks the bronchus.' } },
    { prompt: { es: 'En una atelectasia ves broncograma aéreo. ¿Qué te sugiere?', en: 'You see an air bronchogram in an atelectasis. What does it suggest?' }, show: 'atel-cicatricial',
      options: [{ es: 'Que no es obstructiva (p. ej., cicatricial)', en: 'That it is not obstructive (e.g. cicatricial)' }, { es: 'Que hay un tumor central', en: 'That there is a central tumour' }, { es: 'Que es un derrame', en: 'That it is an effusion' }, { es: 'Nada: siempre aparece', en: 'Nothing: it is always present' }],
      answer: 0, explain: { es: 'El broncograma líquido, en cambio, indica obstrucción.', en: 'A fluid bronchogram, by contrast, means obstruction.' } },
    { prompt: { es: 'Describe el signo de la S de Golden.', en: 'Describe Golden\'s S sign.' }, show: 'golden',
      options: [{ es: 'Atelectasia obstructiva del LSD: masa hiliar convexa + cisura cóncava retraída', en: 'Obstructive RUL collapse: convex hilar mass + concave retracted fissure' }, { es: 'Atelectasia del LII por derrame', en: 'LLL collapse from effusion' }, { es: 'Consolidación del LM que borra el borde cardíaco', en: 'RML consolidation hiding the heart border' }, { es: 'Engrosamiento apical asimétrico', en: 'Asymmetric apical thickening' }],
      answer: 0, explain: { es: 'La masa convexa (cáncer que obstruye) y la cisura cóncava forman una S.', en: 'The convex mass (obstructing cancer) and the concave fissure form an S.' } },
    { prompt: { es: '¿Qué criterio de TC define una bronquiectasia?', en: 'Which CT criterion defines bronchiectasis?' }, show: 'bronquiectasias',
      options: [{ es: 'Diámetro interno del bronquio mayor que el de la arteria pulmonar adyacente', en: 'Internal bronchial diameter larger than the adjacent pulmonary artery' }, { es: 'Bronquio más fino que su arteria', en: 'Bronchus thinner than its artery' }, { es: 'Afilamiento distal normal', en: 'Normal distal tapering' }, { es: 'Quistes subpleurales de pared gruesa', en: 'Thick-walled subpleural cysts' }],
      answer: 0, explain: { es: 'Además, sin afilamiento distal y con pared engrosada.', en: 'Also, no distal tapering and a thick wall.' } },
    { prompt: { es: 'Paciente joven no fumador con enfisema de predominio en lóbulos inferiores. ¿Qué tipo y qué causa?', en: 'Young non-smoker with emphysema mainly in the lower lobes. Which type and cause?' }, show: 'panlobulillar',
      options: [{ es: 'Panlobulillar, por déficit de α1-antitripsina', en: 'Panlobular, from α1-antitrypsin deficiency' }, { es: 'Centrolobulillar, por tabaco', en: 'Centrilobular, from smoking' }, { es: 'Paraseptal, por neumotórax', en: 'Paraseptal, from pneumothorax' }, { es: 'Bulloso, por infección', en: 'Bullous, from infection' }],
      answer: 0, explain: { es: 'Panlobulillar: todo el lobulillo, lóbulos inferiores, α1-antitripsina.', en: 'Panlobular: the whole lobule, lower lobes, α1-antitrypsin.' } },
    { prompt: { es: '¿Cuál es el único signo directo de enfisema en la Rx?', en: 'What is the only direct sign of emphysema on the film?' }, show: 'enfisema-rx',
      options: [{ es: 'Las bullas (> 1 cm, generalmente subpleurales)', en: 'Bullae (> 1 cm, usually subpleural)' }, { es: 'El diafragma aplanado', en: 'The flattened diaphragm' }, { es: 'Las costillas horizontales', en: 'Horizontal ribs' }, { es: 'El aumento del espacio retroesternal', en: 'The larger retrosternal space' }],
      answer: 0, explain: { es: 'Los demás son signos indirectos de hiperinsuflación.', en: 'The others are indirect signs of hyperinflation.' } },
    { prompt: { es: 'Nódulo con calcificación «en palomitas de maíz». ¿Qué es probablemente?', en: 'Nodule with "popcorn" calcification. What is it probably?' }, show: 'nps-benigno',
      options: [{ es: 'Un hamartoma (benigno)', en: 'A hamartoma (benign)' }, { es: 'Un adenocarcinoma', en: 'An adenocarcinoma' }, { es: 'Una metástasis', en: 'A metastasis' }, { es: 'Un pseudonódulo', en: 'A pseudonodule' }],
      answer: 0, explain: { es: 'Calcio condroide en palomitas y grasa → hamartoma.', en: 'Chondroid popcorn calcium and fat → hamartoma.' } },
    { prompt: { es: 'Fumador con dolor en el hombro y la mano, y engrosamiento apical asimétrico de 8 mm en la Rx. ¿Qué sospechas?', en: 'Smoker with shoulder and hand pain and 8 mm asymmetric apical thickening on the film. What do you suspect?' }, show: 'pancoast',
      options: [{ es: 'Tumor de Pancoast (sulcus superior) invadiendo el plexo braquial', en: 'Pancoast (superior sulcus) tumour invading the brachial plexus' }, { es: 'Engrosamiento pleural normal', en: 'Normal pleural thickening' }, { es: 'Enfisema paraseptal', en: 'Paraseptal emphysema' }, { es: 'Atelectasia redonda', en: 'Round atelectasis' }],
      answer: 0, explain: { es: 'Engrosamiento apical asimétrico > 5 mm → sospecha de Pancoast.', en: 'Asymmetric apical thickening > 5 mm → suspect Pancoast.' } },
    { prompt: { es: '¿Qué hallazgos no son típicos del SDRA/COVID en la imagen?', en: 'Which findings are not typical of ARDS/COVID on imaging?' }, show: 'sdra',
      options: [{ es: 'Adenopatías mediastínicas y derrame pleural', en: 'Mediastinal nodes and pleural effusion' }, { es: 'Vidrio deslustrado', en: 'Ground glass' }, { es: 'Patrón en empedrado', en: 'Crazy paving' }, { es: 'Consolidación', en: 'Consolidation' }],
      answer: 0, explain: { es: 'Vidrio, empedrado y consolidación sí son típicos.', en: 'Ground glass, crazy paving and consolidation are typical.' } },
  ],
};

/* ---------------- placement helpers used by several entities ---------------- */
function sideOf(code) { return code === 'LUL' || code === 'LLL' ? 'L' : 'R'; }
/** A point just inside the lateral pleura of a lobe, at its mid height. */
function lateralPoint(A, code) {
  const ck = 'pul:lat:' + code; if (A.cache.has(ck)) return A.cache.get(ck);
  const key = LOBE[code], c = centre(A, code), e = A.extreme(key, sideOf(code) === 'R' ? 'right' : 'left', c[0]) || c;
  const r = [e[0], e[1], e[2] + (sideOf(code) === 'R' ? 9 : -9)]; A.cache.set(ck, r); return r;
}
/** Basal subpleural point of the right lower lobe (honeycombing, traction). */
function panalAt(A) {
  const ck = 'pul:panal'; if (A.cache.has(ck)) return A.cache.get(ck);
  const e = A.extreme(LOBE.RLL, 'right', 312) || centre(A, 'RLL');
  const r = [e[0], e[1], e[2] + 10]; A.cache.set(ck, r); return r;
}
/** Honeycomb cysts in the subpleural base of the right lung. */
function honeycomb(A, sev, wall) {
  const D = lungDepth(A), keys = [LOBE.RLL, LOBE.RML], dmax = 7 + 5 * sev, b = A.s(LOBE.RLL).bbox;
  return paint(A, keys, (z, y, x) => (1 - sstep(dmax * 0.7, dmax, D.mm(z, y, x))) * sstep(b[0] + 0.45 * (b[1] - b[0]), b[0] + 0.7 * (b[1] - b[0]), z) * sstep(70, 105, y) * sstep(-0.45, -0.05, nz(z, y, x, 0.06, 7)), (cur, a, z, y, x) => {
    const c = cells(z, y, x, 5.5, 17), edge = c[1] - c[0];
    if (edge < 1.5) return { hu: Math.round(lerp(cur.hu, 25, a)), label: a > 0.4 ? 'lesion' : 'keep' };
    return { hu: Math.round(lerp(cur.hu, -950 + wall * 100, a)), label: a > 0.4 ? 'lesion' : 'keep' };
  });
}
/** Points for the plate-like bands (lower third of the right lower lobe). */
function segPoints(A) {
  const ck = 'pul:seg'; if (A.cache.has(ck)) return A.cache.get(ck);
  const r = [0, 1, 2].map(i => lungPoint(A, LOBE.RLL, 40 + i * 3, 18, 0.62 + 0.08 * i)); A.cache.set(ck, r); return r;
}
/** Round atelectasis centre: posterior lower right lobe, touching the pleura. */
function roundAt(A, size) {
  const b = A.s(LOBE.RLL).bbox, z = Math.round(b[0] + 0.62 * (b[1] - b[0])), p = A.extreme(LOBE.RLL, 'posterior', z) || centre(A, 'RLL');
  return [p[0], Math.round(p[1] - size / 2 / 1.5 * 0.9), p[2]];
}
/** Pancoast mass centre: posterior right apex. */
function pancoastC(A, size) {
  const ap = A.extreme(LOBE.RUL, 'superior'); const r = Math.max(size, 20) / 2 / 1.5;
  return [Math.round(ap[0] + r * 0.9 + 2), ap[1] + 4, ap[2] - 4];
}
/** Diaphragm lowered and flattened (hyperinflation): lung extends into the dome down to the deepest sulcus. */
function flatDiaphragm(A, side, mm) {
  const base = lungBase(A, side), b = lbox(A, SIDE[side]), [, , X] = A.dims, dv = mm / 1.5, lo = SIDE[side][SIDE[side].length - 1];
  let zf = 0; for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (base[y * X + x] > zf) zf = base[y * X + x];
  const stop = new Int16Array(base.length).fill(-1), prot = new Set(['heart', 'aorta', 'inferior_vena_cava', 'esophagus', 'sternum', 'costal_cartilages', 'pulmonary_vein', 'atrial_appendage_left'].filter(k => A.has(k)).map(k => A.id(k)));
  for (const k of A.vertebraKeys()) prot.add(A.id(k));
  for (let i = 1; i <= 12; i++) for (const s of ['left', 'right']) if (A.has(`rib_${s}_${i}`)) prot.add(A.id(`rib_${s}_${i}`));
  for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) {
    const z0 = base[y * X + x]; if (z0 < 0) continue; let z = z0 + 1; const zEnd = Math.min(zf, z0 + dv);
    while (z <= zEnd && !prot.has(A.at(z, y, x))) z++;
    stop[y * X + x] = z - 1;
  }
  return { t: 'cols', box: [Math.max(0, b[0]), Math.min(A.dims[0] - 1, zf), b[2], b[3], b[4], b[5]], label: 'keep', fn: (z, y, x, cur) => {
    const z0 = base[y * X + x]; if (z0 < 0 || z <= z0 || z > stop[y * X + x]) return null;
    return { hu: Math.round(-900 + 12 * nz(z, y, x, 0.4, 3)), label: lo };
  } };
}
/** Subpleural apical bullae (> 1 cm). Returns [side, centre, r mm]. */
function bullaeSpots(A) {
  const ck = 'pul:bul'; if (A.cache.has(ck)) return A.cache.get(ck);
  const out = [];
  for (const [side, code, k] of [['R', 'RUL', 0], ['L', 'LUL', 1], ['R', 'RUL', 2]]) {
    const b = A.s(LOBE[code]).bbox, z = Math.round(b[0] + (0.12 + 0.12 * k) * (b[1] - b[0])), e = A.extreme(LOBE[code], k === 2 ? 'anterior' : side === 'R' ? 'right' : 'left', z);
    if (!e) continue; const r = 9 + 3 * (k % 2); const off = Math.round(r / 1.5 * 0.7);
    out.push([side, k === 2 ? [e[0], e[1] + off, e[2]] : [e[0], e[1], e[2] + (side === 'R' ? off : -off)], r]);
  }
  A.cache.set(ck, out); return out;
}
/** NPS readouts: each feature with what it suggests, then the overall leaning. */
function npsReadouts(o) {
  const rows = [], add = (es, en, ves, ven, s) => { rows.push({ label: { es, en }, value: { es: ves, en: ven } }); return s; };
  let b = 0, m = 0;
  if (o.size < 8) b += add('Tamaño', 'Size', `${o.size} mm: < 8 mm, hallazgo muy frecuente en TCMD`, `${o.size} mm: < 8 mm, very common on MDCT`, 1);
  else if (o.size < 20) b += add('Tamaño', 'Size', `${o.size} mm (la mayoría de los benignos < 2 cm)`, `${o.size} mm (most benign ones < 2 cm)`, 1);
  else add('Tamaño', 'Size', `${o.size} mm (≥ 2 cm)`, `${o.size} mm (≥ 2 cm)`, 0);
  if (o.margin === 'espiculados') m += add('Márgenes', 'Margins', 'Espiculados → malignidad', 'Spiculated → malignant', 2);
  else if (o.margin === 'lobulados') add('Márgenes', 'Margins', 'Lobulados (contorno irregular)', 'Lobulated (irregular contour)', 0);
  else add('Márgenes', 'Margins', 'Lisos, bien definidos', 'Smooth, well defined', 0);
  if (o.calc === 'palomitas') b += add('Calcio', 'Calcium', 'En palomitas → hamartoma', 'Popcorn → hamartoma', 2);
  else if (o.calc && o.calc !== 'no') b += add('Calcio', 'Calcium', `${o.calc[0].toUpperCase() + o.calc.slice(1)} → benignidad (TBC)`, `${{ difuso: 'Diffuse', central: 'Central', laminar: 'Laminar' }[o.calc]} → benign (TB)`, 2);
  if (o.fat) b += add('Grasa', 'Fat', 'Sí → hamartoma', 'Yes → hamartoma', 2);
  if (o.ggo !== 'solido') add('Vidrio deslustrado', 'Ground glass', 'Benignidad o malignidad', 'Benign or malignant', 0);
  if (o.cav) m += add('Cavitación', 'Cavitation', 'Sí (tabla de malignidad)', 'Yes (malignant table)', 1);
  if (o.estable) b += add('Crecimiento', 'Growth', 'Estable > 2 años → benignidad', 'Stable > 2 years → benign', 2);
  rows.unshift({ label: { es: 'Orienta a', en: 'Suggests' }, value: b > m ? { es: 'Benignidad', en: 'Benign' } : m > b ? { es: 'Malignidad', en: 'Malignant' } : { es: 'Indeterminado → TC / seguimiento', en: 'Indeterminate → CT / follow-up' } });
  return rows;
}
/** Pseudonodules: skin (nipples, back lesion), external electrode, rib lesion or pleural lesion. */
const PSEUDO = { pezon: [[276, 'R'], [276, 'L']], objeto: [[300, 'R']], piel: [[286, 'B']] };
function skinTarget(A, z, s) {
  const x = s === 'R' ? 82 : s === 'L' ? 192 : 108, ant = s !== 'B';
  const st = A.extreme('sternum', 'anterior') || [z, 30, XMID];
  return [z, ant ? Math.max(4, st[1] - 2) : 170, x];
}
function pseudoAt(A, tipo) {
  if (tipo === 'osea') return ribSpot(A);
  if (tipo === 'pleural') return lateralPoint(A, 'RLL');
  const [z, s] = PSEUDO[tipo][0], t = skinTarget(A, z, s); return tipo === 'pezon' ? [t[0], t[1], XMID] : t;
}
function ribSpot(A) { const e = A.extreme('rib_right_6', 'right') || A.s('rib_right_6').center; return e; }
function pseudoBuild(A, tipo) {
  if (tipo === 'osea') { const c = ribSpot(A); return [{ t: 'blob', c, r: 7, hu: 700, edge: 0.8, irregular: 0.3, outside: LOBES, label: 'lesion' }, mark(c, 'Lesión de la costilla', 'Rib lesion', { dx: -170, dy: -30 })]; }
  if (tipo === 'pleural') { const p = lateralPoint(A, 'RLL'), c = [p[0], p[1], p[2] - 7]; return [{ t: 'blob', c, r: [10, 10, 4.5], hu: 45, edge: 0.8, label: 'lesion' }, mark(c, 'Lesión pleural', 'Pleural lesion', { dx: -170, dy: -30 })]; }
  const out = [], [Z, Y] = A.dims;
  for (const [z, s] of PSEUDO[tipo]) {
    const t = skinTarget(A, z, s), ant = s !== 'B', box = clampBox(A, [z - 10, z + 10, ant ? 0 : Y - 90, ant ? 90 : Y - 1, t[2] - 10, t[2] + 10]), pr = probe(A, box), skin = new Map();
    const mk = mark(t, { pezon: 'Pezón', objeto: 'Electrodo (objeto externo)', piel: 'Lesión cutánea' }[tipo], { pezon: 'Nipple', objeto: 'Electrode (external object)', piel: 'Skin lesion' }[tipo], { dx: s === 'L' ? 60 : -190, dy: -40 });
    const skinY = (zz, xx) => {     // first body voxel along y from outside, read from the probe
      const k = zz * 1000 + xx; if (skin.has(k)) return skin.get(k); let yy = -1;
      if (ant) { for (let y = box[2]; y <= box[3]; y++) if (pr.get(zz, y, xx) > -300) { yy = y; break; } } else { for (let y = box[3]; y >= box[2]; y--) if (pr.get(zz, y, xx) > -300) { yy = y; break; } }
      skin.set(k, yy); return yy;
    };
    const rr = tipo === 'objeto' ? 7 : tipo === 'pezon' ? 8 : 7, h = tipo === 'objeto' ? 1.5 : 8;
    out.push(pr.prim, { t: 'cols', box, label: 'lesion', fn: (zz, y, xx) => {
      const d = Math.hypot(zz - z, xx - t[2]) * 1.5; if (d > rr) return null;
      const sy = skinY(z, t[2]); if (sy < 0) return null;
      if (zz === z && xx === t[2]) mk.at = [z, sy + (ant ? -1 : 1), t[2]];
      const dep = (ant ? sy - y : y - sy) * 1.5, hh = h * Math.sqrt(Math.max(0, 1 - (d / rr) ** 2)) + (tipo === 'objeto' ? 0 : 0.8);
      if (dep < 0 || dep > hh) return null;
      return { hu: tipo === 'objeto' ? 2500 : 35 };
    } }, mk);
  }
  void Z; return out;
}
