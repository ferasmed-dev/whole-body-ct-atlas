// Adrenal lesions on the real adrenal masks: incidentaloma algorithm (HU, washout, opposed phase, PET), adenoma,
// myelolipoma, metastases and adrenocortical carcinoma.
import { makeNoise, phaseValue } from '../../src/pathology.js';
import { bi, mark, T, isOOP, techId } from './common.js';
import { centroid, FLUID_MR, FAT_MR } from './anat.js';
import { adrenalDiagram } from './diagrams.js';

const NZ = makeNoise(31);
const ADR = { R: 'adrenal_gland_right', L: 'adrenal_gland_left' };
const KID = { R: 'kidney_right', L: 'kidney_left' };
const outsideAdr = (A, side, extra = []) => ['aorta', 'inferior_vena_cava', KID[side], 'stomach', 'pancreas', 'spleen', ...A.vertebraKeys(), ...extra].filter(k => A.has(k));
const PH3 = { sin: bi('Sin contraste', 'Unenhanced'), portal: bi('Con contraste (realce)', 'Contrast (enhancement)'), tardia: bi('Tardía (lavado)', 'Delayed (washout)') };
const ph3 = env => (env.phase === 'sin' || env.phase === 'tardia' ? env.phase : 'portal');
/** Absolute and relative washout (%) from the lesion's own HU: B unenhanced, E enhanced, D delayed. */
export const washout = (B, E, D) => ({ abs: E - B > 0 ? (E - D) / (E - B) * 100 : 0, rel: E > 0 ? (E - D) / E * 100 : 0 });
const pct = v => Math.round(v) + ' %';
/** Pseudo-MR T1 of an adrenal lesion: lipid-rich lesions drop on the opposed-phase sequence. */
const adrMR = (env, lipid) => ({ t1: isOOP(env) ? (lipid >= 1 ? 0.12 : lipid > 0 ? 0.28 : 0.46) : 0.46, t2: 0.42, stir: 0.36 });

/** Incidentaloma reading: the syllabus algorithm, step by step. */
function algorithm(B, E, D, pet) {
  const w = washout(B, E, D), rows = [{ label: bi('1 · TC sin contraste', '1 · Unenhanced CT'), value: bi(B + ' UH', B + ' HU') }];
  if (B <= 10) { rows.push({ label: bi('Resultado', 'Result'), value: bi('≤ 10 UH → adenoma rico en lípidos: no precisa más estudios', '≤ 10 HU → lipid-rich adenoma: no further tests') }); return rows; }
  rows.push({ label: bi('2 · Con contraste / tardía', '2 · Enhanced / delayed'), value: bi(`${E} / ${D} UH`, `${E} / ${D} HU`) });
  rows.push({ label: bi('Lavado (E − T) / (E − B)', 'Washout (E − D) / (E − U)'), value: pct(w.abs) });
  rows.push({ label: bi('Lavado relativo (E − T) / E', 'Relative washout (E − D) / E'), value: pct(w.rel) });
  if (w.abs > 50) { rows.push({ label: bi('Resultado', 'Result'), value: bi('Lavado > 50 % → adenoma', 'Washout > 50 % → adenoma') }); return rows; }
  rows.push({ label: bi('Resultado', 'Result'), value: bi('Lavado ≤ 50 %: indeterminada → RM fuera de fase / PET', 'Washout ≤ 50 %: indeterminate → opposed-phase MR / PET') });
  rows.push({ label: bi('3 · PET-FDG', '3 · FDG-PET'), value: pet === 'mayor' ? bi('Captación > hígado → maligna (primario o metástasis)', 'Uptake > liver → malignant (primary or metastasis)') : pet === 'no' ? bi('Sin captación: en un oncológico excluye metástasis', 'No uptake: in a cancer patient excludes metastasis') : bi('Captación < hígado', 'Uptake < liver') });
  return rows;
}
const CASES = {
  q9: { B: 6, E: 70, D: 30, mm: 20 },
  q10: { B: 25, E: 85, D: 49, mm: 20 },
  mts: { B: 35, E: 75, D: 67, mm: 26 },
};
const caseVals = p => (p.caso === 'libre' ? { B: p.b, E: p.e, D: p.d, mm: 20 } : CASES[p.caso]);

function adrLesion(A, side, mm, hu, env, lipid, extra = {}) {
  const c = centroid(A, ADR[side]);
  return { t: 'blob', c, r: [mm / 2 * 1.05, mm / 2 * 0.95, mm / 2], hu, edge: 0.8, texture: 3, outside: outsideAdr(A, side), label: 'lesion', mr: adrMR(env, lipid), ...extra };
}
const adrView = side => ({ plane: 'axial', window: 'soft', zoom: 3, at: (p, A) => centroid(A, ADR[side]), examPlane: 'axial' });
const ADR_TECH = (sinVerdict, conVerdict, oopVerdict) => [
  T.ctSin(sinVerdict, 'Primer paso: ≤ 10 UH, redonda y de bordes lisos = adenoma rico en lípidos, sin más estudios.', 'First step: ≤ 10 HU, round and smooth = lipid-rich adenoma, no further tests.', { default: true }),
  T.ctCon(conVerdict, 'Si > 10 UH: contraste, medir el realce, esperar y medir de nuevo (pasa a «Tardía»): pérdida > 50 % = adenoma.', 'If > 10 HU: contrast, measure the enhancement, wait and measure again (switch to "Delayed"): loss > 50 % = adenoma.'),
  { id: 'vnc', mod: 'ct', window: 'soft', phase: 'sin', verdict: 'ok', label: bi('TC doble energía: sin contraste virtual', 'Dual-energy CT: virtual unenhanced'), note: bi('Suprime el yodo por posproceso y simula el estudio sin contraste: −27 % de dosis.', 'Removes the iodine by post-processing and simulates the unenhanced study: −27 % dose.') },
  T.inPhase('ok', 'Referencia para el desplazamiento químico.', 'Reference for chemical shift.'),
  T.oop(oopVerdict, 'Caída de señal fuera de fase = lípidos intracelulares = adenoma.', 'Signal drop on opposed phase = intracellular lipid = adenoma.'),
];

export const SUPRA = [
  {
    id: 'incidentaloma', group: 'supra', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'portal', 'tardia'], phaseLabels: PH3, defaultPhase: 'sin',
    name: bi('Incidentaloma suprarrenal: algoritmo', 'Adrenal incidentaloma: algorithm'),
    short: bi('Incidentaloma suprarrenal', 'Adrenal incidentaloma'),
    view: adrView('R'),
    params: [
      { id: 'caso', type: 'select', dropdown: true, label: bi('Caso', 'Case'), options: [
        { v: 'q9', es: '2 cm, 6 UH sin contraste', en: '2 cm, 6 HU unenhanced' },
        { v: 'q10', es: '25 UH, pierde el 60 % en tardía', en: '25 HU, loses 60 % on delayed' },
        { v: 'mts', es: '35 UH, apenas lava', en: '35 HU, barely washes out' },
        { v: 'libre', es: 'Manual (barras de abajo)', en: 'Manual (sliders below)' }], value: 'q10' },
      { id: 'b', type: 'range', label: bi('Manual: UH sin contraste', 'Manual: unenhanced HU'), min: -10, max: 60, step: 1, value: 20, unit: 'UH', exam: false },
      { id: 'e', type: 'range', label: bi('Manual: UH con contraste', 'Manual: enhanced HU'), min: 30, max: 150, step: 1, value: 90, unit: 'UH', exam: false },
      { id: 'd', type: 'range', label: bi('Manual: UH en tardía', 'Manual: delayed HU'), min: 10, max: 150, step: 1, value: 50, unit: 'UH', exam: false },
      { id: 'pet', type: 'select', label: bi('PET-FDG', 'FDG-PET'), options: [{ v: 'no', es: 'Sin captación', en: 'No uptake' }, { v: 'menor', es: '< hígado', en: '< liver' }, { v: 'mayor', es: '> hígado', en: '> liver' }], value: 'menor' },
    ],
    techniques: ADR_TECH('best', 'best', 'ok'),
    build: (p, A, env) => {
      const v = caseVals(p), w = washout(v.B, v.E, v.D), lipid = v.B <= 10 ? 1 : v.B <= 20 ? 0.5 : 0;
      const c = centroid(A, ADR.R), ph = ph3(env), now = { sin: v.B, portal: v.E, tardia: v.D }[ph];
      return [adrLesion(A, 'R', v.mm, { sin: v.B, arterial: v.E, portal: v.E, tardia: v.D }, env, lipid, { texture: 2 }),
        mark(c, `${now} UH`, `${now} HU`, { dx: 60, dy: -50 }), ...(w.abs > 50 || v.B <= 10 ? [] : [])];
    },
    readouts: (p) => { const v = caseVals(p); return algorithm(v.B, v.E, v.D, p.pet); },
    info: {
      where: bi('Glándula suprarrenal derecha real (detrás de la cava, medial al hígado).', 'Real right adrenal gland (behind the IVC, medial to the liver).'),
      see: bi('TC sin contraste: redondeada, bien delimitada, bordes lisos y <b>≤ 10 UH</b> → adenoma rico en lípidos, sin más estudios. Si <b>&gt; 10 UH</b> → contraste: realce, esperar y medir de nuevo; <b>pérdida &gt; 50 %</b> en la fase tardía = adenoma. Indeterminada → RM (caída fuera de fase = adenoma) y PET-FDG (captación &gt; hígado = maligna).', 'Unenhanced CT: round, well defined, smooth and <b>≤ 10 HU</b> → lipid-rich adenoma, no further tests. If <b>&gt; 10 HU</b> → contrast: enhancement, wait and measure again; <b>loss &gt; 50 %</b> on the delayed phase = adenoma. Indeterminate → MR (opposed-phase drop = adenoma) and FDG-PET (uptake &gt; liver = malignant).'),
      technique: bi('TC de elección (sin y con contraste). TC de doble energía: sin contraste virtual con −27 % de dosis. RM: T1, T2, en fase y fuera de fase; gadolinio si se sospecha malignidad. PET si sigue indeterminada.', 'CT is the technique of choice (unenhanced and enhanced). Dual-energy CT: virtual unenhanced with −27 % dose. MR: T1, T2, in and opposed phase; gadolinium if malignancy is suspected. PET if still indeterminate.'),
      differential: bi('Prevalencia 9 % en autopsias. Sin antecedentes oncológicos, casi siempre adenoma; con antecedentes, el 60–70 % son benignas pero hay que descartar metástasis.', 'Prevalence 9 % at autopsy. Without a cancer history, almost always adenoma; with one, 60–70 % are benign but metastasis must be excluded.'),
      tip: bi('Mide con el cursor la UH de la lesión en cada fase y comprueba la fila del lavado. Los dos primeros casos son los de la autoevaluación.', 'Hover the lesion HU in each phase and check the washout row. The first two cases are the self-test ones.'),
    },
    diagram: lang => adrenalDiagram(lang),
    flags: [
      { kind: 'apuntes', es: 'El umbral es el del temario: lavado > 50 % = adenoma. Aquí se calcula como (con contraste − tardía) / (con contraste − sin contraste).', en: 'The threshold is the syllabus one: washout > 50 % = adenoma. It is computed here as (enhanced − delayed) / (enhanced − unenhanced).' },
      { kind: 'ampliacion', es: 'Las guías habituales usan lavado absoluto ≥ 60 % o relativo ≥ 40 % (fase tardía a los 15 min). El temario da una sola cifra (> 50 %) sin decir cuál de los dos.', en: 'Usual guidelines use absolute washout ≥ 60 % or relative ≥ 40 % (delayed phase at 15 min). The syllabus gives a single figure (> 50 %) without saying which.' },
    ],
  },
  {
    id: 'adenoma', group: 'supra', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'portal', 'tardia'], phaseLabels: PH3, defaultPhase: 'sin',
    name: bi('Adenoma suprarrenal', 'Adrenal adenoma'),
    short: bi('Adenoma suprarrenal', 'Adrenal adenoma'),
    view: adrView('L'),
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 1, max: 4, step: 0.5, value: 2, unit: 'cm' },
      { id: 'lipidos', type: 'toggle', label: bi('Rico en lípidos (70 %)', 'Lipid-rich (70 %)'), value: true },
    ],
    techniques: ADR_TECH('best', 'ok', 'best'),
    compare: ['metastasis-supra', 'mielolipoma'],
    build: (p, A, env) => {
      const hu = p.lipidos ? { sin: 4, arterial: 68, portal: 72, tardia: 30 } : { sin: 28, arterial: 85, portal: 92, tardia: 44 };
      return [adrLesion(A, 'L', p.size * 10, hu, env, p.lipidos ? 1 : 0.3), mark(centroid(A, ADR.L), isOOP(env) && p.lipidos ? 'Cae fuera de fase' : 'Liso, homogéneo', isOOP(env) && p.lipidos ? 'Drops on opposed phase' : 'Smooth, homogeneous', { dx: 60, dy: -50 })];
    },
    readouts: (p, A, env) => {
      const B = p.lipidos ? 4 : 28, E = p.lipidos ? 72 : 92, D = p.lipidos ? 30 : 44, w = washout(B, E, D);
      return [
        { label: bi('Tamaño', 'Size'), value: p.size < 3 ? bi(`${String(p.size).replace('.', ',')} cm (< 3 cm, típico)`, `${p.size} cm (< 3 cm, typical)`) : bi(`${String(p.size).replace('.', ',')} cm: ≥ 3 cm, atípico`, `${p.size} cm: ≥ 3 cm, atypical`) },
        { label: bi('UH sin contraste', 'Unenhanced HU'), value: bi(B + (B <= 10 ? ' UH (≤ 10)' : ' UH (> 10)'), B + (B <= 10 ? ' HU (≤ 10)' : ' HU (> 10)')) },
        { label: bi('Lavado', 'Washout'), value: pct(w.abs) + ' (> 50 %)' },
        { label: bi('Fuera de fase', 'Opposed phase'), value: p.lipidos ? bi('Cae la señal', 'Signal drops') : bi('Cae poco', 'Drops little') },
        ...(techId(env) === 'vnc' ? [{ label: bi('Dosis', 'Dose'), value: '−27 %' }] : []),
      ];
    },
    info: {
      where: bi('Glándula suprarrenal izquierda real.', 'Real left adrenal gland.'),
      see: bi('<b>&lt; 3 cm</b>, redondeado u ovalado, bordes lisos, bien definido, homogéneo. Lípidos intracelulares (<b>70 %</b>): baja densidad en TC y pérdida de señal fuera de fase en RM.', '<b>&lt; 3 cm</b>, round or oval, smooth, well defined, homogeneous. Intracellular lipid (<b>70 %</b>): low CT density and signal loss on opposed-phase MR.'),
      technique: bi('TC sin contraste (≤ 10 UH) · si no, lavado > 50 % · RM fuera de fase.', 'Unenhanced CT (≤ 10 HU) · otherwise washout > 50 % · opposed-phase MR.'),
      differential: bi('Metástasis: > 30 UH, sin lavado, no cae fuera de fase, PET > hígado, 50 % bilaterales.', 'Metastasis: > 30 HU, no washout, no opposed-phase drop, PET > liver, 50 % bilateral.'),
      tip: bi('Tumor suprarrenal más frecuente; benigno, casi siempre asintomático; puede crecer hasta 1 cm al año, aunque suele ser estable. Cambia de RM en fase a fuera de fase.', 'Commonest adrenal tumour; benign, almost always asymptomatic; may grow up to 1 cm a year, though usually stable. Switch from in-phase to opposed-phase MR.'),
    },
    flags: [{ kind: 'ampliacion', es: 'El fuera de fase se aproxima bajando la señal T1 de la lesión con lípidos; no es una simulación de desplazamiento químico (no aparece el borde negro en las interfaces grasa-agua).', en: 'Opposed phase is approximated by lowering the T1 signal of the lipid-containing lesion; it is not a chemical-shift simulation (no black boundary at fat–water interfaces).' }],
  },
  {
    id: 'mielolipoma', group: 'supra', tag: 'ct-real', extraTags: ['sim'], contrast: true, defaultPhase: 'sin',
    name: bi('Mielolipoma suprarrenal', 'Adrenal myelolipoma'),
    short: bi('Mielolipoma', 'Myelolipoma'),
    view: adrView('R'),
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 2, max: 8, step: 0.5, value: 4, unit: 'cm' },
      { id: 'sangrado', type: 'toggle', label: bi('Sangrado (si es grande)', 'Bleeding (if large)'), value: false },
    ],
    techniques: [
      T.ctSin('best', 'Densidad < −20 UH (grasa); realce variable según las partes blandas.', 'Density < −20 HU (fat); variable enhancement of the soft-tissue parts.', { default: true }),
      T.t1('ok', 'La grasa es hiperintensa en T1.', 'Fat is hyperintense on T1.'),
      T.t2('ok', 'Y también en T2.', 'And on T2 as well.'),
      T.fatsat('best', 'La grasa pierde la señal con supresión grasa (fat sat).', 'The fat loses its signal with fat suppression.'),
    ],
    compare: ['adenoma'],
    build: (p, A, env) => {
      const c = centroid(A, ADR.R), r = p.size * 5, rv = r / A.sp[0], ph = env.phase === 'sin' ? 'sin' : 'portal';
      const box = [c[0] - rv - 2, c[0] + rv + 2, c[1] - rv - 2, c[1] + rv + 2, c[2] - rv - 2, c[2] + rv + 2].map(Math.round);
      const excl = new Set(outsideAdr(A, 'R').map(k => A.id(k))), out = [];
      out.push({ t: 'cols', box, label: 'lesion', fn: (z, y, x, cur) => {
        if (excl.has(cur.orig)) return null;
        const d = Math.hypot(z - c[0], y - c[1], x - c[2]) / rv / (1 + 0.1 * NZ(x * 0.2, y * 0.2, z * 0.2)); if (d > 1) return null;
        const n = NZ(x * 0.38 + 2, y * 0.38, z * 0.38);
        if (n > 0.38) return { hu: phaseValue({ sin: 38, portal: 60 }, ph), mr: { t1: 0.42, t2: 0.45, stir: 0.42 } };       // myeloid tissue
        return { hu: -88 + Math.round(12 * n), mr: FAT_MR };
      } });
      if (p.sangrado) out.push({ t: 'blob', c: [c[0] + 3, c[1] + 2, Math.round(c[2] - rv * 0.5)], r: [r * 0.5, r * 0.45, r * 0.5], hu: 58, irregular: 0.4, edge: 1, outside: outsideAdr(A, 'R'), label: 'lesion', mr: { t1: 0.72, t2: 0.5, stir: 0.5 } });
      out.push(mark(c, 'Grasa: < −20 UH', 'Fat: < −20 HU', { dx: 60, dy: -50 }));
      return out;
    },
    readouts: () => [
      { label: bi('Densidad', 'Density'), value: bi('≈ −85 UH (< −20 UH: grasa)', '≈ −85 HU (< −20 HU: fat)') },
      { label: bi('Composición', 'Composition'), value: bi('Grasa madura + elementos hematopoyéticos', 'Mature fat + haematopoietic elements') },
    ],
    info: {
      where: bi('Glándula suprarrenal derecha real.', 'Real right adrenal gland.'),
      see: bi('Tumor benigno de <b>grasa madura</b> y elementos hematopoyéticos: <b>&lt; −20 UH</b>, con partes blandas que realzan de forma variable. Puede sangrar si es grande.', 'Benign tumour of <b>mature fat</b> and haematopoietic elements: <b>&lt; −20 HU</b>, with variably enhancing soft tissue. May bleed if large.'),
      technique: bi('TC sin contraste. RM: grasa hiperintensa en T1 y T2 que pierde la señal con supresión grasa.', 'Unenhanced CT. MR: fat hyperintense on T1 and T2 that loses signal with fat suppression.'),
      differential: bi('Adenoma: también «graso», pero son lípidos intracelulares (≤ 10 UH, cae fuera de fase), no grasa macroscópica negativa.', 'Adenoma: also "fatty", but intracellular lipid (≤ 10 HU, drops on opposed phase), not negative macroscopic fat.'),
      tip: bi('Pasa de T1 a supresión grasa: la masa se apaga.', 'Go from T1 to fat suppression: the mass turns dark.'),
    },
    flags: [{ kind: 'revisar', es: 'Ojo al signo: el umbral es negativo, < −20 UH (grasa). Escrito «< 20 UH» sería un error, porque incluiría adenomas (≤ 10 UH) y otras lesiones de partes blandas.', en: 'Mind the sign: the threshold is negative, < −20 HU (fat). Written as "< 20 HU" it would be wrong, as it would include adenomas (≤ 10 HU) and other soft-tissue lesions.' }],
  },
  {
    id: 'metastasis-supra', group: 'supra', tag: 'ct-real', extraTags: ['sim'],
    phases: ['sin', 'portal', 'tardia'], phaseLabels: PH3, defaultPhase: 'portal',
    name: bi('Metástasis suprarrenales', 'Adrenal metastases'),
    short: bi('Metástasis suprarrenal', 'Adrenal metastasis'),
    view: adrView('L'),
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 1.5, max: 5, step: 0.5, value: 3, unit: 'cm' },
      { id: 'bilat', type: 'toggle', label: bi('Bilaterales (50 %)', 'Bilateral (50 %)'), value: true },
    ],
    techniques: ADR_TECH('ok', 'best', 'ok'),
    compare: ['adenoma'],
    build: (p, A, env) => {
      const hu = { sin: 36, arterial: 70, portal: 76, tardia: 68 }, ex = { irregular: 0.3, texture: 10 }, out = [adrLesion(A, 'L', p.size * 10, hu, env, 0, ex)];
      if (p.bilat) out.push(adrLesion(A, 'R', p.size * 8, hu, env, 0, ex));
      out.push(mark(centroid(A, ADR.L), 'Sin lavado', 'No washout', { dx: 60, dy: -50 }));
      return out;
    },
    readouts: () => {
      const w = washout(36, 76, 68);
      return [
        { label: bi('UH sin contraste', 'Unenhanced HU'), value: bi('36 UH (> 30)', '36 HU (> 30)') },
        { label: bi('Lavado', 'Washout'), value: pct(w.abs) + ' (≤ 50 %)' },
        { label: bi('Fuera de fase', 'Opposed phase'), value: bi('No cae', 'No drop') },
        { label: bi('PET', 'PET'), value: bi('Captación > hígado', 'Uptake > liver') },
      ];
    },
    info: {
      where: bi('Glándulas suprarrenales reales, izquierda (y derecha si bilateral).', 'Real adrenal glands, left (and right if bilateral).'),
      see: bi('Lesiones malignas suprarrenales más frecuentes: <b>50 % bilaterales</b>, crecimiento rápido. TC: sin lavado precoz (<b>densidad &gt; 30 UH</b>) · RM: sin pérdida de señal fuera de fase · PET-TC: captación mayor que el hígado.', 'Commonest malignant adrenal lesions: <b>50 % bilateral</b>, fast growth. CT: no early washout (<b>density &gt; 30 HU</b>) · MR: no opposed-phase signal loss · PET-CT: uptake higher than the liver.'),
      technique: bi('TC con lavado · RM fuera de fase · PET-FDG si sigue indeterminada.', 'CT with washout · opposed-phase MR · FDG-PET if still indeterminate.'),
      differential: bi('Adenoma: ≤ 10 UH o lavado > 50 %, cae fuera de fase.', 'Adenoma: ≤ 10 HU or washout > 50 %, drops on opposed phase.'),
      tip: bi('El 26–36 % de los pacientes con cáncer de pulmón, mama, páncreas, riñón o melanoma metastatizan aquí.', '26–36 % of patients with lung, breast, pancreas or kidney cancer or melanoma metastasise here.'),
    },
  },
  {
    id: 'carcinoma-supra', group: 'supra', tag: 'ct-real', contrast: true,
    name: bi('Carcinoma suprarrenal', 'Adrenocortical carcinoma'),
    short: bi('Carcinoma suprarrenal', 'Adrenal carcinoma'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.6, at: (p, A) => { const c = centroid(A, ADR.R), rv = p.size * 5 / A.sp[0]; return [Math.round(c[0] + rv * 0.35), c[1], Math.round(c[2] - rv * 0.3)]; }, examPlane: 'axial' },
    params: [
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 6, max: 14, step: 1, value: 10, unit: 'cm' },
      { id: 'calc', type: 'toggle', label: bi('Calcificaciones (30 %)', 'Calcifications (30 %)'), value: true },
      { id: 'vci', type: 'toggle', label: bi('Invasión de la cava inferior', 'IVC invasion'), value: true },
    ],
    techniques: [
      T.ctCon('best', 'Masa grande, heterogénea, centro hipodenso por necrosis; invasión venosa (renal, cava), adenopatías, metástasis.', 'Large heterogeneous mass, hypodense necrotic centre; venous invasion (renal, IVC), nodes, metastases.', { default: true }),
      T.ctSin('ok', 'Calcificaciones y hemorragia (30 %).', 'Calcifications and haemorrhage (30 %).'),
      T.t2('ok', 'La necrosis central brilla en T2.', 'The central necrosis is bright on T2.'),
    ],
    build: (p, A, env) => {
      const a = centroid(A, ADR.R), r = p.size * 5, rv = r / A.sp[0], c = [Math.round(a[0] + rv * 0.35), a[1], Math.round(a[2] - rv * 0.3)], out = [];
      const ivc = A.centroidAt('inferior_vena_cava', a[0]);
      out.push({ t: 'blob', c, r: [r * 1.05, r * 0.82, r * 0.85], hu: { sin: 40, arterial: 78, portal: 86, tardia: 76 }, texture: 18, irregular: 0.45, edge: 1.5, outside: outsideAdr(A, 'R', ['colon', 'duodenum', 'gallbladder']), label: 'lesion',
        calc: p.calc ? { pattern: 'eccentric', hu: 480 } : undefined, mr: { t1: 0.35, t2: 0.55, stir: 0.5 } });
      out.push({ t: 'blob', c: [c[0] + 2, c[1], c[2] + 2], r: [r * 0.5, r * 0.4, r * 0.42], hu: 22, irregular: 0.6, edge: 1, outside: outsideAdr(A, 'R', ['colon', 'duodenum']), label: 'lesion', mr: FLUID_MR });
      if (p.vci && ivc) {
        out.push({ t: 'blob', c: [a[0] + 4, Math.round(ivc.y), Math.round(ivc.x)], r: [30, 12, 12], hu: { sin: 40, arterial: 58, portal: 66, tardia: 62 }, irregular: 0.25, edge: 0.6, within: ['inferior_vena_cava'], label: 'lesion', mr: { t1: 0.35, t2: 0.55, stir: 0.5 } });
        out.push(mark([a[0] + 4, ivc.y, ivc.x], 'Invasión de la cava', 'IVC invasion', { dx: 60, dy: 50 }));
      }
      out.push(mark(c, 'Necrosis central', 'Central necrosis', { dx: -170, dy: -40 }));
      return out;
    },
    readouts: (p) => [
      { label: bi('Tamaño', 'Size'), value: bi(`${p.size} cm (media 10 cm al diagnóstico)`, `${p.size} cm (mean 10 cm at diagnosis)`) },
      { label: bi('Bilateral', 'Bilateral'), value: '10 %' },
      { label: bi('Calcio / hemorragia', 'Calcium / haemorrhage'), value: '30 %' },
    ],
    info: {
      where: bi('Desde la glándula suprarrenal derecha real; ocupa el espacio entre el hígado y el polo superior renal (el desplazamiento de los órganos no se simula).', 'From the real right adrenal gland; fills the space between liver and upper renal pole (organ displacement is not simulated).'),
      see: bi('Masa grande (<b>media 10 cm</b>), sólida, heterogénea, <b>centro hipodenso por necrosis</b>, bordes irregulares; calcificaciones y hemorragia en el <b>30 %</b>; 10 % bilaterales. Invasión local (venas renales, <b>cava inferior</b>), adenopatías, metástasis hepáticas o pulmonares.', 'Large (<b>mean 10 cm</b>), solid, heterogeneous mass, <b>hypodense necrotic centre</b>, irregular margins; calcification and haemorrhage in <b>30 %</b>; 10 % bilateral. Local invasion (renal veins, <b>IVC</b>), nodes, liver or lung metastases.'),
      technique: bi('TC sin y con contraste; RM con gadolinio si se sospecha malignidad.', 'Unenhanced and contrast CT; gadolinium MR if malignancy is suspected.'),
      tip: bi('Primario maligno raro de la corteza; niños y adultos de 4.ª–5.ª década, la mayoría esporádicos.', 'Rare primary malignancy of the cortex; children and adults in their 4th–5th decade, mostly sporadic.'),
    },
  },
];
