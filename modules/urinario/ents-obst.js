// Obstructive uropathy: hydronephrosis I–IV by level, urinary stones (CT, plain film), dual-energy CT, ureteral jet and
// the functional tests (urography, CT/MR urography, renogram, DMSA). Left side unless stated.
import { bi, mark, T, techId } from './common.js';
import { kmodel, hydro, ureterTo, tubeOutside, stranding, perirenal, excretory, ureter, FLUID_MR } from './anat.js';
import { hydroDiagram, jetDiagram, renogramDiagram } from './diagrams.js';

const GR = ['I', 'II', 'III', 'IV'];
const GRADE_TXT = { I: bi('Pelvis dilatada', 'Dilated pelvis'), II: bi('+ ectasia calicial', '+ calyceal ectasia'), III: bi('+ cálices redondeados', '+ rounded calyces'), IV: bi('+ atrofia cortical', '+ cortical atrophy') };
const LEVELS = [{ v: 'renal', es: 'Riñón (unión pieloureteral)', en: 'Kidney (pelvi-ureteric junction)' }, { v: 'ureter', es: 'Uréter (cruce ilíaco)', en: 'Ureter (iliac crossing)' }, { v: 'vejiga', es: 'Vejiga (bilateral)', en: 'Bladder (bilateral)' }];
const dilatedUreter = (A, side, to, g, hu = 8, mr = FLUID_MR, label = 'lesion') => {
  const u = ureterTo(A, side, to);
  return { u, prim: u.pts.length > 1 ? { t: 'tube', pts: u.pts, r: 3 + 1.2 * g, hu, label, outside: tubeOutside(A, ['liver', 'spleen']), mr } : null };
};
function buildHydro(p, A) {
  const g = GR.indexOf(p.grade) + 1, sides = p.level === 'vejiga' ? ['L', 'R'] : ['L'], out = [];
  for (const side of sides) {
    out.push(...hydro(A, side, g));
    if (p.level !== 'renal') {
      const d = dilatedUreter(A, side, p.level === 'ureter' ? 'iliaco' : 'uvj', g); if (d.prim) out.push(d.prim);
      if (side === 'L') out.push(mark(d.u.end, 'Nivel de la obstrucción', 'Level of obstruction', { dx: 60, dy: 40, planes: ['coronal', 'axial'] }));
    } else out.push(mark(kmodel(A, side).upj, 'Obstrucción pieloureteral', 'Pelvi-ureteric obstruction', { dx: 60, dy: 40 }));
  }
  const m = kmodel(A, 'L');
  out.push(mark(m.pelvis, 'Grado ' + p.grade + ': ' + GRADE_TXT[p.grade].es.replace('+ ', ''), 'Grade ' + p.grade + ': ' + GRADE_TXT[p.grade].en.replace('+ ', ''), { dx: -170, dy: -50 }));
  return out;
}

/** View centre: left pelvis, or between both kidneys and lower down when the obstruction is bilateral (bladder level). */
const hydroAt = (p, A) => {
  const L = kmodel(A, 'L').pelvis; if (p.level !== 'vejiga') return L;
  const R = kmodel(A, 'R').pelvis; return [Math.round((L[0] + R[0]) / 2 + 25), Math.round((L[1] + R[1]) / 2), Math.round((L[2] + R[2]) / 2)];
};

/* ---------------- stones ---------------- */
const LOCS = [{ v: 'caliz', es: 'Cáliz inferior (renal)', en: 'Lower calyx (renal)' }, { v: 'upj', es: 'Unión pieloureteral', en: 'Pelvi-ureteric junction' }, { v: 'lumbar', es: 'Uréter lumbar', en: 'Lumbar ureter' }, { v: 'iliaco', es: 'Cruce ilíaco', en: 'Iliac crossing' }, { v: 'uvj', es: 'Unión ureterovesical', en: 'Vesicoureteric junction' }];
const stoneAt = (A, loc) => (loc === 'caliz' ? kmodel(A, 'L').calyx : ureterTo(A, 'L', loc).end);
function buildStone(p, A, env, { hu = 1100 } = {}) {
  const c = stoneAt(A, p.loc), out = [], uro = techId(env) === 'urografia', obst = p.loc !== 'caliz';
  const fl = uro ? 900 : 8;
  if (uro) out.push(...excretory(A, ['R'], { hu: 1200, bladder: 30 }));
  if (obst) {
    out.push(...hydro(A, 'L', 2, { hu: fl, label: 'keep' }));
    if (p.loc !== 'upj') { const u = ureterTo(A, 'L', p.loc); out.push({ t: 'tube', pts: u.pts, r: 4.5, hu: fl, label: 'keep', outside: tubeOutside(A, ['liver', 'spleen']), mr: FLUID_MR }); }
    out.push({ t: 'fill', s: 'kidney_left', delta: -10, label: 'keep' });            // oedema: hypodense parenchyma
    out.push(perirenal(A, 'L', { w: 8, gerota: false, amount: 0.55 }));
    out.push(stranding(c, 13, A, 1));
  }
  out.push({ t: 'blob', c, r: p.size / 2, hu, edge: 0.4, irregular: 0.2, label: 'lesion', mr: { t1: 0.03, t2: 0.03, stir: 0.03 } });
  out.push(mark(c, 'Litiasis', 'Stone', { dx: 60, dy: -40 }));
  return out;
}
/** Bone in front of / behind the stone on an AP film (the reason the plain film misses it). */
function boneOverlap(A, c) {
  const keys = new Set([...A.vertebraKeys(), 'sacrum', 'hip_left', 'hip_right'].filter(k => A.has(k)).map(k => A.id(k)));
  let n = 0; for (let y = 0; y < A.dims[1]; y++) for (const dx of [-1, 0, 1]) if (keys.has(A.at(c[0], y, c[2] + dx))) n++;
  return n / 3 * A.sp[1];
}

/* ---------------- dual energy ---------------- */
const DE = { calcio: { 120: 1100, 80: 1560 }, urico: { 120: 430, 80: 445 } };

/* ---------------- jet ---------------- */
const SCEN = [
  { v: 'normal', es: 'Normal', en: 'Normal', dil: false, jet: true },
  { v: 'reflujo', es: 'Dilatación sin obstrucción (reflujo)', en: 'Dilatation without obstruction (reflux)', dil: true, jet: true },
  { v: 'inicio', es: 'Obstrucción sin dilatación (inicio)', en: 'Obstruction without dilatation (onset)', dil: false, jet: false },
  { v: 'obstruccion', es: 'Dilatación con obstrucción', en: 'Dilatation with obstruction', dil: true, jet: false },
];
function buildJet(p, A, env) {
  const s = SCEN.find(x => x.v === p.esc) || SCEN[0], out = [], u = ureter(A, 'L'), uvj = u.uvj;
  out.push(...excretory(A, s.jet ? ['R', 'L'] : ['R'], { hu: 1200, bladder: 0 }));
  if (s.dil) {
    out.push(...hydro(A, 'L', 2, { hu: s.jet ? 1100 : 8, label: 'keep' }));
    const d = dilatedUreter(A, 'L', s.jet ? 'uvj' : 'iliaco', 2, s.jet ? 1100 : 8, FLUID_MR, 'keep'); if (d.prim) out.push(d.prim);
  }
  if (s.jet) {
    const c = A.centroidAt('urinary_bladder', uvj[0]), v = [0, c.y - uvj[1], c.x - uvj[2]], L = Math.hypot(...v) || 1, k = v.map(q => q / L);
    for (let i = 0; i < 4; i++) {
      const dmm = 4 + i * 8, at = [uvj[0] - i, uvj[1] + k[1] * dmm / A.sp[0], uvj[2] + k[2] * dmm / A.sp[0]].map(Math.round);
      out.push({ t: 'blob', c: at, r: [3 + i * 0.8, 2.5 + i * 1.6, 2.5 + i * 1.6], hu: 1100 - i * 220, edge: 2, irregular: 0.3, within: ['urinary_bladder'], label: 'lesion', mr: FLUID_MR });
    }
    out.push(mark(uvj, 'Jet ureteral', 'Ureteral jet', { dx: 60, dy: -40 }));
  } else out.push(mark(uvj, 'Sin jet', 'No jet', { dx: 60, dy: -40 }));
  void env; return out;
}

/* ---------------- functional tests ---------------- */
function buildPruebas(p, A, env) {
  const out = [], contrast = env.phase !== 'sin' || env.modality === 'rx' || env.modality === 't2';
  if (contrast) out.push(...excretory(A, p.obst ? ['R'] : ['R', 'L'], { hu: 1200, bladder: 30 }));
  if (p.obst) {
    out.push(...hydro(A, 'L', 2));
    const d = dilatedUreter(A, 'L', 'iliaco', 2); if (d.prim) out.push(d.prim);
    if (contrast && env.modality !== 't2') out.push({ t: 'fill', s: 'kidney_left', hu: { sin: 30, arterial: 160, portal: 175, tardia: 205 }, texture: 6, label: 'keep' });   // delayed, persistent nephrogram
    out.push(mark(kmodel(A, 'L').pelvis, 'Retraso de nefrograma y pielograma', 'Delayed nephrogram and pyelogram', { dx: 60, dy: -60 }));
  }
  return out;
}

export const OBST = [
  {
    id: 'hidronefrosis', group: 'obst', tag: 'ct-aprox', extraTags: ['sim'], contrast: true,
    name: bi('Uropatía obstructiva: hidronefrosis I–IV', 'Obstructive uropathy: hydronephrosis I–IV'),
    short: bi('Hidronefrosis', 'Hydronephrosis'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.6, at: (p, A) => hydroAt(p, A), examPlane: 'coronal' },
    params: [
      { id: 'grade', type: 'select', label: bi('Grado', 'Grade'), options: GR.map(v => ({ v, es: v, en: v })), value: 'II' },
      { id: 'level', type: 'select', label: bi('Nivel de la obstrucción', 'Level of obstruction'), options: LEVELS, value: 'ureter' },
    ],
    techniques: [
      T.ctCon('ok', 'Muestra nivel y grado; con contraste, la uro-TC se hace siempre con fase excretora.', 'Shows level and grade; with contrast, CT urography always includes an excretory phase.', { default: true, plane: 'coronal' }),
      T.ctSin('best', 'Uro-TC sin contraste: de elección en el cólico nefrítico complicado.', 'Unenhanced CT urography: the choice in complicated renal colic.', { plane: 'coronal' }),
      { ...T.t2('ok', 'Uro-RM T2: muy sensible para la ureterohidronefrosis y no irradia (embarazadas o dudas en TC), pero no ve bien los cálculos.', 'T2 MR urography: very sensitive for ureterohydronephrosis and no radiation (pregnancy or doubtful CT), but shows stones poorly.'), label: bi('Uro-RM T2', 'T2 MR urography'), plane: 'coronal' },
    ],
    compare: ['litiasis'],
    build: buildHydro,
    readouts: (p) => [
      { label: bi('Grado', 'Grade'), value: bi(`${p.grade}: ${GRADE_TXT[p.grade].es}`, `${p.grade}: ${GRADE_TXT[p.grade].en}`) },
      { label: bi('Nivel', 'Level'), value: LEVELS.find(l => l.v === p.level) },
      { label: bi('Eco (prueba inicial)', 'Ultrasound (first test)'), value: bi('Morfología (nivel, dilatación, causa), no función', 'Morphology (level, dilatation, cause), not function') },
      { label: bi('Trampa', 'Pitfall'), value: bi('Dilatación ≠ obstrucción → jet ureteral', 'Dilatation ≠ obstruction → ureteral jet') },
    ],
    info: {
      where: bi('Riñón y uréter izquierdos (vía excretora no segmentada: seno renal y trayecto del uréter estimados). Nivel vesical: bilateral.', 'Left kidney and ureter (collecting system not segmented: renal sinus and ureteric course estimated). Bladder level: bilateral.'),
      see: bi('<b>I</b> pelvis dilatada · <b>II</b> + ectasia calicial · <b>III</b> + cálices redondeados · <b>IV</b> + atrofia cortical. Por encima del nivel de obstrucción, uréter dilatado.', '<b>I</b> dilated pelvis · <b>II</b> + calyceal ectasia · <b>III</b> + rounded calyces · <b>IV</b> + cortical atrophy. Above the level of obstruction, dilated ureter.'),
      technique: bi('Eco inicial (morfología, no función) · urografía IV: escaso papel · renograma isotópico: función · uro-TC sin contraste en el cólico complicado · uro-RM T2 en embarazadas.', 'Ultrasound first (morphology, not function) · IV urography: minor role · isotope renogram: function · unenhanced CT urography in complicated colic · T2 MR urography in pregnancy.'),
      differential: bi('Obstrucción sin dilatación (deshidratado, inicio del cuadro) y dilatación sin obstrucción (reflujo vesicoureteral): ver «Jet ureteral».', 'Obstruction without dilatation (dehydration, onset) and dilatation without obstruction (vesicoureteric reflux): see "Ureteral jet".'),
      tip: bi('Datos clínicos: dolor, hematuria, sepsis, obstrucción bilateral, ↑ creatinina, uremia. Causas: litiasis (la más frecuente), tumores, infección (TBC), coágulo, vejiga neurógena, masas extrínsecas.', 'Clinical clues: pain, haematuria, sepsis, bilateral obstruction, ↑ creatinine, uraemia. Causes: stones (commonest), tumours, infection (TB), clot, neurogenic bladder, extrinsic masses.'),
    },
    diagram: lang => hydroDiagram(lang),
    flags: [{ kind: 'apuntes', es: 'Los cuatro grados son los del temario. La vía excretora no está segmentada en este caso: pelvis, cálices y uréter se dibujan desde el seno renal real y el borde del psoas.', en: 'The four grades are the syllabus ones. The collecting system is not segmented in this case: pelvis, calyces and ureter are drawn from the real renal sinus and the psoas border.' }],
  },
  {
    id: 'litiasis', group: 'obst', tag: 'ct-aprox', extraTags: ['sim'], contrast: false,
    name: bi('Litiasis urinaria (cólico nefrítico)', 'Urinary stones (renal colic)'),
    short: bi('Litiasis', 'Stone'),
    view: { plane: 'coronal', window: 'soft', zoom: 2, at: (p, A) => stoneAt(A, p.loc), examPlane: 'axial' },
    params: [
      { id: 'loc', type: 'select', dropdown: true, label: bi('Localización', 'Location'), options: LOCS, value: 'lumbar', recentre: true },
      { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 3, max: 12, step: 1, value: 6, unit: 'mm', examMin: 5 },
    ],
    techniques: [
      T.ctSin('best', '2.ª técnica (tras la eco): S 94–100 %, E 92–100 %; se puede hacer con insuficiencia renal o alergia y ve causas extraurinarias.', '2nd test (after ultrasound): Se 94–100 %, Sp 92–100 %; feasible in renal failure or allergy and shows extra-urinary causes.', { default: true }),
      T.kub('ok', 'Utilidad limitada: sensibilidad 45 %, especificidad 77 % (depende del contenido intestinal y de lo que se superpone).', 'Limited use: sensitivity 45 %, specificity 77 % (depends on bowel content and overlap).'),
      { id: 'urografia', mod: 'rx', plane: 'coronal', verdict: 'bad', label: bi('Urografía IV', 'IV urography'), note: bi('Morfológica y funcional, pero las litiasis no obstructivas pasan desapercibidas; no en insuficiencia renal ni alergia; menos S y E que la TC.', 'Morphological and functional, but non-obstructing stones are missed; not in renal failure or allergy; lower Se and Sp than CT.') },
    ],
    compare: ['hidronefrosis'],
    build: buildStone,
    readouts: (p, A, env) => {
      const c = stoneAt(A, p.loc), b = boneOverlap(A, c);
      return [
        { label: bi('Rx simple', 'Plain film'), value: bi('S 45 % · E 77 %', 'Se 45 % · Sp 77 %') },
        { label: bi('Hueso superpuesto en la Rx (AP)', 'Bone overlapping on the AP film'), value: b > 3 ? bi(`Sí (≈ ${Math.round(b)} mm)`, `Yes (≈ ${Math.round(b)} mm)`) : bi('No', 'No') },
        { label: bi('Eco (1.ª)', 'Ultrasound (1st)'), value: p.loc === 'caliz' ? bi('S 96 % (litiasis renal)', 'Se 96 % (renal stone)') : bi('Menor en el uréter (gas)', 'Lower in the ureter (gas)') },
        { label: bi('TC sin contraste (2.ª)', 'Unenhanced CT (2nd)'), value: bi('S 94–100 % · E 92–100 %', 'Se 94–100 % · Sp 92–100 %') },
        ...(techId(env) === 'urografia' ? [{ label: bi('Urografía', 'Urography'), value: bi('Contraste hasta el nivel de la litiasis (imagen tardía)', 'Contrast down to the stone (delayed image)') }] : []),
      ];
    },
    info: {
      where: bi('Vía excretora izquierda estimada (cáliz inferior → unión pieloureteral → uréter sobre el psoas → cruce ilíaco → unión ureterovesical).', 'Estimated left collecting system (lower calyx → PUJ → ureter over the psoas → iliac crossing → VUJ).'),
      see: bi('TC sin contraste: <b>litiasis hiperdensa</b> + trabeculación asimétrica de la grasa perirrenal y periureteral, riñón grande, parénquima hipodenso (edema), hidronefrosis e hidrouréter. Eco: hiperecogénica con sombra acústica posterior.', 'Unenhanced CT: <b>hyperdense stone</b> + asymmetric stranding of the perirenal and periureteric fat, large kidney, hypodense parenchyma (oedema), hydronephrosis and hydroureter. Ultrasound: hyperechoic with posterior acoustic shadow.'),
      technique: bi('Eco 1.ª (S 96 % renal; de elección en niños y embarazadas; detecta tarde la obstrucción) · TC sin contraste 2.ª, del polo renal superior a la sínfisis púbica · Rx simple S 45 % · urografía: escaso papel · TC de doble energía: composición.', 'Ultrasound 1st (Se 96 % renal; choice in children and pregnancy; late to show obstruction) · unenhanced CT 2nd, from the upper renal pole to the pubic symphysis · plain film Se 45 % · urography: minor role · dual-energy CT: composition.'),
      differential: bi('La TC sin contraste ve causas extraurinarias del dolor: diverticulitis, apendicitis, rotura de aneurisma.', 'Unenhanced CT shows extra-urinary causes of pain: diverticulitis, appendicitis, ruptured aneurysm.'),
      tip: bi('Muy común (12 %), varones de 30–60 años, 75–90 % cálcicas (radiopacas). Pon la litiasis en «Uréter lumbar» o «Cruce ilíaco» y cambia a Rx simple: sobre la apófisis transversa o el sacro casi no se ve.', 'Very common (12 %), men aged 30–60, 75–90 % calcium (radio-opaque). Put the stone at "Lumbar ureter" or "Iliac crossing" and switch to the plain film: over the transverse process or sacrum it is barely seen.'),
    },
    flags: [{ kind: 'apuntes', es: 'Sensibilidades y especificidades tal como vienen en el temario. La Rx es una proyección simulada del TC de este paciente.', en: 'Sensitivities and specificities exactly as in the syllabus. The film is a projection simulated from this patient\'s CT.' }],
  },
  {
    id: 'doble-energia', group: 'obst', tag: 'sim', contrast: false, exam: false,
    name: bi('TC de doble energía: composición de la litiasis', 'Dual-energy CT: stone composition'),
    short: bi('TC de doble energía', 'Dual-energy CT'),
    view: { plane: 'axial', window: 'bone', zoom: 3, at: (p, A) => stoneAt(A, 'caliz') },
    params: [{ id: 'comp', type: 'select', label: bi('Composición', 'Composition'), options: [{ v: 'calcio', es: 'Cálcica (75–90 %)', en: 'Calcium (75–90 %)' }, { v: 'urico', es: 'No cálcica (ácido úrico)', en: 'Non-calcium (uric acid)' }], value: 'calcio' }],
    techniques: [
      { id: 'kv120', mod: 'ct', verdict: 'ok', default: true, window: 'bone', label: bi('120 kVp', '120 kVp'), note: bi('Adquisición de alta energía.', 'High-energy acquisition.') },
      { id: 'kv80', mod: 'ct', verdict: 'ok', window: 'bone', label: bi('80 kVp', '80 kVp'), note: bi('Adquisición de baja energía: el calcio atenúa mucho más; el ácido úrico casi igual.', 'Low-energy acquisition: calcium attenuates much more; uric acid almost the same.') },
    ],
    build: (p, A, env) => buildStone({ loc: 'caliz', size: 9 }, A, env, { hu: DE[p.comp][techId(env) === 'kv80' ? 80 : 120] }),
    readouts: (p) => {
      const d = DE[p.comp], r = d[80] / d[120];
      return [
        { label: bi('UH a 80 / 120 kVp', 'HU at 80 / 120 kVp'), value: `${d[80]} / ${d[120]}` },
        { label: bi('Cociente 80/120', '80/120 ratio'), value: bi(r.toFixed(2).replace('.', ','), r.toFixed(2)) },
        { label: bi('Lectura', 'Reading'), value: r > 1.2 ? bi('Cálcica (el calcio sube a baja energía)', 'Calcium (calcium rises at low energy)') : bi('No cálcica (apenas cambia)', 'Non-calcium (barely changes)') },
        { label: bi('Sin contraste virtual', 'Virtual unenhanced'), value: bi('Suprime el yodo: −27 % de dosis (suprarrenal)', 'Removes iodine: −27 % dose (adrenal)') },
      ];
    },
    info: {
      see: bi('Dos adquisiciones (<b>80 y 120 kVp</b>): el cambio de atenuación entre ambas caracteriza la composición de la litiasis.', 'Two acquisitions (<b>80 and 120 kVp</b>): the change in attenuation between them characterises the stone composition.'),
      technique: bi('Alterna 120 kVp y 80 kVp y mira las UH de la litiasis con el cursor.', 'Switch between 120 kVp and 80 kVp and hover the stone HU.'),
      tip: bi('La misma técnica, por posproceso, suprime el yodo y simula un estudio sin contraste (−27 % de dosis): ver «Incidentaloma suprarrenal».', 'The same technique, by post-processing, removes iodine and simulates an unenhanced study (−27 % dose): see "Adrenal incidentaloma".'),
    },
    flags: [{ kind: 'ampliacion', es: 'El temario solo dice que caracteriza la composición. Las UH y el cociente 80/120 son ilustrativos, y el ejemplo de ácido úrico es ampliación.', en: 'The syllabus only says it characterises composition. The HU and the 80/120 ratio are illustrative, and the uric acid example goes beyond it.' }],
  },
  {
    id: 'jet', group: 'obst', tag: 'sim', exam: false, phases: ['tardia'], phaseLabels: { tardia: bi('Excretora', 'Excretory') }, defaultPhase: 'tardia',
    name: bi('Jet ureteral (Doppler color)', 'Ureteral jet (colour Doppler)'),
    short: bi('Jet ureteral', 'Ureteral jet'),
    view: { plane: 'axial', window: 'soft', zoom: 2.4, at: (p, A) => ureter(A, 'L').uvj },
    params: [{ id: 'esc', type: 'select', dropdown: true, label: bi('Caso', 'Case'), options: SCEN.map(({ v, es, en }) => ({ v, es, en })), value: 'reflujo' }],
    techniques: [T.ctExc('ok', 'El Doppler color no se simula: el chorro de orina con contraste que entra en la vejiga en fase excretora hace de «jet».', 'Colour Doppler is not simulated: the contrast-laden urine entering the bladder in the excretory phase stands in for the "jet".', { default: true })],
    build: buildJet,
    readouts: (p) => {
      const s = SCEN.find(x => x.v === p.esc) || SCEN[0];
      return [
        { label: bi('Vía excretora', 'Collecting system'), value: s.dil ? bi('Dilatada', 'Dilated') : bi('No dilatada', 'Not dilated') },
        { label: bi('Jet ureteral', 'Ureteral jet'), value: s.jet ? bi('Sí', 'Yes') : bi('No', 'No') },
        { label: bi('Interpretación', 'Interpretation'), value: s.jet ? (s.dil ? bi('Dilatación SIN obstrucción (p. ej., reflujo)', 'Dilatation WITHOUT obstruction (e.g. reflux)') : bi('Sin obstrucción', 'No obstruction')) : (s.dil ? bi('Obstrucción', 'Obstruction') : bi('Obstrucción SIN dilatación (inicio, deshidratado)', 'Obstruction WITHOUT dilatation (onset, dehydrated)')) },
      ];
    },
    info: {
      see: bi('Si no hay obstrucción, en algún momento entra orina en la vejiga por el meato ureteral y da señal color: el <b>jet</b>. Si se ve, no hay obstrucción.', 'If there is no obstruction, urine enters the bladder through the ureteric orifice at some point and gives a colour signal: the <b>jet</b>. If it is seen, there is no obstruction.'),
      technique: bi('Doppler color en la vejiga. Resuelve los dos «falsos amigos» de la eco: dilatación sin obstrucción y obstrucción sin dilatación.', 'Colour Doppler of the bladder. Solves the two "false friends" of ultrasound: dilatation without obstruction and obstruction without dilatation.'),
      tip: bi('Recorre los cuatro casos y fíjate solo en dos cosas: ¿está dilatada? y ¿hay jet?', 'Go through the four cases and look at two things only: is it dilated? is there a jet?'),
    },
    diagram: lang => jetDiagram(lang),
    flags: [{ kind: 'ampliacion', es: 'El chorro de contraste en la TC excretora es el equivalente que se puede simular aquí; el temario describe el jet en Doppler color.', en: 'The contrast jet on excretory CT is the equivalent that can be simulated here; the syllabus describes the jet on colour Doppler.' }],
  },
  {
    id: 'pruebas', group: 'obst', tag: 'sim', exam: false,
    name: bi('Pruebas funcionales: urografía, uro-TC, uro-RM, renograma, DMSA', 'Functional tests: urography, CT and MR urography, renogram, DMSA'),
    short: bi('Pruebas funcionales', 'Functional tests'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.3, at: (p, A) => kmodel(A, 'L').pelvis },
    params: [{ id: 'obst', type: 'toggle', label: bi('Obstrucción izquierda', 'Left obstruction'), value: true }],
    techniques: [
      { id: 'urografia', mod: 'rx', plane: 'coronal', verdict: 'ok', default: true, label: bi('Urografía IV', 'IV urography'), note: bi('Morfología (nivel, en imágenes tardías) y función (retraso de nefrograma y pielograma); papel escaso hoy.', 'Morphology (level, on delayed images) and function (delayed nephrogram and pyelogram); minor role today.') },
      T.ctExc('best', 'Uro-TC con contraste: fases arterial, corticomedular, nefrográfica y siempre excretora; menos series para irradiar menos.', 'Contrast CT urography: arterial, corticomedullary, nephrographic and always excretory phases; fewer series to lower the dose.', { plane: 'coronal' }),
      { ...T.ctSin('ok', 'Uro-TC sin contraste: de elección en el cólico nefrítico complicado.', 'Unenhanced CT urography: the choice in complicated renal colic.'), label: bi('Uro-TC sin contraste', 'Unenhanced CT urography'), plane: 'coronal' },
      { ...T.t2('ok', 'Uro-RM T2: muy sensible para la ureterohidronefrosis, no irradia; no muestra bien los cálculos.', 'T2 MR urography: very sensitive for ureterohydronephrosis, no radiation; shows stones poorly.'), label: bi('Uro-RM T2', 'T2 MR urography'), plane: 'coronal' },
    ],
    build: buildPruebas,
    readouts: () => [
      { label: bi('Renograma Tc99m-DTPA', 'Tc99m-DTPA renogram'), value: bi('Filtrado glomerular', 'Glomerular filtration') },
      { label: bi('Renograma Tc99m-MAG3', 'Tc99m-MAG3 renogram'), value: bi('Secreción tubular (flujo plasmático renal efectivo)', 'Tubular secretion (effective renal plasma flow)') },
      { label: bi('Gammagrafía DMSA', 'DMSA scan'), value: bi('Cortical: zonas hipoactivas en la pielonefritis', 'Cortical: cold areas in pyelonephritis') },
      { label: bi('Renograma: para qué', 'Renogram: what for'), value: bi('Obstrucción sin dilatación, dilataciones no obstructivas, evolución', 'Obstruction without dilatation, non-obstructive dilatation, follow-up') },
    ],
    info: {
      see: bi('Urografía y uro-TC excretora: la vía excretora se rellena de contraste; con obstrucción, <b>retraso del nefrograma y del pielograma</b> en ese lado. Uro-RM T2: la orina brilla sin contraste.', 'Urography and excretory CT urography: the collecting system fills with contrast; with obstruction, <b>delayed nephrogram and pyelogram</b> on that side. T2 MR urography: urine is bright without contrast.'),
      technique: bi('Los estudios isotópicos (renograma DTPA / MAG3, DMSA) no se pueden simular a partir de un TC: el esquema muestra sus curvas.', 'Isotope studies (DTPA / MAG3 renogram, DMSA) cannot be simulated from a CT: the diagram shows their curves.'),
      tip: bi('Cambia entre urografía, uro-TC y uro-RM con la obstrucción activada: el mismo riñón izquierdo, tres maneras de verlo.', 'Switch between urography, CT urography and MR urography with the obstruction on: the same left kidney, three ways to see it.'),
    },
    diagram: lang => renogramDiagram(lang),
    flags: [{ kind: 'ampliacion', es: 'La urografía es una proyección simulada del TC con contraste excretor añadido; el renograma y el DMSA se muestran solo como esquema.', en: 'The urogram is a projection simulated from the CT with added excretory contrast; the renogram and DMSA are shown as a diagram only.' }],
  },
];
