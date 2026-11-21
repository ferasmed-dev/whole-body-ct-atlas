// «Mediastino y pleura» — técnicas, compartimentos y masas mediastínicas (anterior, medio, posterior).
import { aoSlice, aoLevels, limits, limitPV, prevascular, trachea, scanY, noise3, vox, lungSlice } from './geo.js';
import { rbox, bi, opt, tq, mark, flag, pv, T, compRO, HU, MR, VESSELS, SIDES, LUNGS } from './common.js';

const CAR = A => (A.atlas.keylevels.find(k => k.id === 'carina') || { z: 245 }).z;
const RIBS = A => A.atlas.structures.map(s => s.key).filter(k => k.startsWith('rib_'));
export const HARD = A => [...VESSELS.filter(k => A.has(k)), 'trachea', 'esophagus', 'sternum', 'costal_cartilages', 'spinal_cord', 'clavicula_left', 'clavicula_right', ...A.vertebraKeys()];
const VK = l => 'vertebrae_' + l;
const LEVELS = (a, b) => { const all = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']; return all.slice(all.indexOf(a), all.indexOf(b) + 1).map(l => opt(l, l)); };
const THY = { sin: 100, arterial: 160, portal: 175, tardia: 110 };
/** Anterior (prevascular) mass centre: behind the sternum, in front of the ascending aorta; pushed back so a sphere of rv voxels clears the sternum. */
function antCentre(A, zOff, dx, rv) { const q = prevascular(A, aoLevels(A).zSplit + zOff, dx); return [q.z, Math.max(q.y, q.ySt + rv * 0.85 + 1), q.x]; }

/* ---------------- diagrams ---------------- */
export function compDiagram(lang) {
  const t = lang === 'en'
    ? ['Anterior', 'Middle', 'Posterior', 'thymoma', 'lymph nodes', 'neurogenic', 'sternum', 'trachea', 'heart', 'vertebrae', '1 cm', 'Commonest mass']
    : ['Anterior', 'Medio', 'Posterior', 'timoma', 'adenopatías', 'neurogénicos', 'esternón', 'tráquea', 'corazón', 'vértebras', '1 cm', 'Masa más frecuente'];
  return `<svg viewBox="0 0 320 190" class="dsvg" role="img" aria-label="${t[0]}, ${t[1]}, ${t[2]}">
  <rect x="20" y="20" width="14" height="140" rx="5" class="db"/><text x="27" y="176" class="dt2">${t[6]}</text>
  <rect x="250" y="20" width="40" height="140" rx="4" class="db"/><text x="270" y="176" class="dt2">${t[9]}</text>
  <rect x="150" y="14" width="14" height="70" rx="6" class="ds"/><text x="157" y="10" class="dt2">${t[7]}</text>
  <ellipse cx="118" cy="122" rx="44" ry="34" class="dd"/><text x="118" y="126" class="dt2">${t[8]}</text>
  <path d="M150 20 L150 84 Q160 120 150 160" class="dh" fill="none" stroke-dasharray="4 3"/>
  <path d="M232 20 L232 160" class="dh" fill="none" stroke-dasharray="4 3"/><text x="241" y="98" class="dt2">${t[10]}</text>
  <text x="85" y="40" class="dt">${t[0]}</text><text x="192" y="40" class="dt">${t[1]}</text><text x="270" y="40" class="dt" opacity="0">.</text>
  <text x="85" y="54" class="dt2">${t[3]}</text><text x="192" y="54" class="dt2">${t[4]}</text>
  <text x="241" y="120" class="dt" transform="rotate(-90 241 120)">${t[2]}: ${t[5]}</text>
  <text x="160" y="188" class="dt2">${t[11]}: T-A-N</text></svg>`;
}
export function techDiagram(lang) {
  const rows = lang === 'en'
    ? [['Film → CT', 'first the film; CT characterises, confirms, rules out'], ['MR', 'mediastinum and aorta; solid-cystic mass'], ['Angiography', 'vessels (aorta)'], ['Ultrasound', 'pleural effusion, guides drainage'], ['TTE / TOE', 'the aorta']]
    : [['Rx → TC', 'primero la Rx; la TC caracteriza, confirma, descarta'], ['RM', 'mediastino y aorta; masa sólido-quística'], ['Arteriografía', 'estructuras vasculares (aorta)'], ['Ecografía', 'derrame pleural, guía el drenaje'], ['ETT / ETE', 'valoración de la aorta']];
  return `<svg viewBox="0 0 320 ${20 + rows.length * 26}" class="dsvg" role="img" aria-label="${rows.map(r => r[0]).join(', ')}">` +
    rows.map((r, i) => `<rect x="4" y="${8 + i * 26}" width="92" height="20" rx="4" class="${i === 1 ? 'dh' : 'db'}"/><text x="50" y="${22 + i * 26}" class="dt">${r[0]}</text><text x="104" y="${22 + i * 26}" class="dt2" text-anchor="start">${r[1]}</text>`).join('') + '</svg>';
}

/* ---------------- entities ---------------- */
export const MED = [
  {
    id: 'tecnicas', group: 'tec', tag: 'sim',
    name: bi('Técnicas de imagen del mediastino', 'Imaging techniques of the mediastinum'), short: bi('Técnicas', 'Techniques'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => antCentre(A, 4, 12, 20) },
    params: [{ id: 'quist', type: 'range', label: bi('Componente quístico de la masa', 'Cystic component of the mass'), min: 0, max: 80, step: 10, value: 50, unit: '%' }],
    techniques: [
      T.rxPA('ok', 'Se empieza por la Rx: ensanchamiento mediastínico, pero no dice qué es.', 'Start with the film: widened mediastinum, but it does not say what it is.'),
      T.ctMed('ok', 'La TC caracteriza, confirma y descarta lo que la placa no deja ver.', 'CT characterises, confirms and rules out what the film cannot show.', { default: true }),
      T.t2('best', 'RM: caracteriza mejor una lesión sólido-quística (la parte quística brilla en T2), p. ej. para evitar la biopsia en zonas de riesgo.', 'MR: best characterises a solid-cystic lesion (the cystic part is bright on T2), e.g. to avoid a biopsy in risky areas.'),
      T.t1('ok', 'RM T1: el líquido es oscuro; la parte sólida, intermedia.', 'T1 MR: fluid is dark; the solid part, intermediate.'),
    ],
    build: (p, A) => {
      const c = antCentre(A, 4, 12, 20);
      return [{ t: 'blob', c, r: [32, 24, 28], hu: HU.tumour, texture: 6, irregular: 0.15, edge: 0.8, core: p.quist ? { f: Math.sqrt(p.quist / 100), hu: 12 } : undefined, outside: HARD(A), label: 'lesion', mr: MR.solid },
        ...(p.quist ? [{ t: 'blob', c, r: [32 * Math.sqrt(p.quist / 100), 24 * Math.sqrt(p.quist / 100), 28 * Math.sqrt(p.quist / 100)], hu: 12, within: ['lesion'], label: 'lesion', mr: MR.fluid }] : []),
        mark(c, 'Masa sólido-quística', 'Solid-cystic mass', { dx: 70, dy: -40 })];
    },
    readouts: (p, A) => compRO(A, antCentre(A, 4, 12, 20)),
    info: {
      where: bi('Cualquier masa mediastínica; aquí, una masa del mediastino anterior.', 'Any mediastinal mass; here, an anterior mediastinal mass.'),
      see: bi('Rx → TC, igual que en el parénquima pulmonar. <b>RM</b>: mediastino y aorta; caracteriza mejor una lesión sólido-quística (el pulmón no se ve con RM). <b>Arteriografía</b>: estructuras vasculares como la aorta. <b>Ecografía transcutánea</b>: derrame pleural y guía de su drenaje, a pie de cama y en tiempo real. <b>Eco transtorácica y transesofágica</b>: valoración de la aorta.', 'Film → CT, as for the lung parenchyma. <b>MR</b>: mediastinum and aorta; best characterises a solid-cystic lesion (the lung is not seen on MR). <b>Angiography</b>: vascular structures such as the aorta. <b>Transcutaneous ultrasound</b>: pleural effusion and guidance of its drainage, at the bedside and in real time. <b>Transthoracic and transoesophageal echo</b>: assessment of the aorta.'),
      technique: bi('Cambia de Rx a TC y a RM T2 con el componente quístico al 50 %: solo la RM separa con claridad la parte líquida.', 'Switch from film to CT and to T2 MR with the cystic component at 50 %: only MR clearly separates the fluid part.'),
      tip: bi('Ecografía, ETT/ETE y arteriografía no se simulan aquí; el esquema resume para qué sirve cada una.', 'Ultrasound, TTE/TOE and angiography are not simulated here; the diagram sums up what each one is for.'),
    },
    diagram: lang => techDiagram(lang),
    exam: false,
    flags: [flag('ampliacion', 'La RM es una simulación a partir del TC (no es una RM real).', 'The MR is simulated from the CT (not a real MR).')],
  },
  {
    id: 'compartimentos', group: 'tec', tag: 'ct-aprox',
    name: bi('Compartimentos del mediastino y sus límites', 'Mediastinal compartments and their limits'), short: bi('Compartimentos', 'Compartments'),
    view: { plane: 'sagittal', window: 'mediastinum', zoom: 1.8, at: (p, A) => { const z = CAR(A), l = limits(A, z), y = p.hl === 'anterior' ? l.yA - 22 : p.hl === 'posterior' ? l.yP + 14 : (l.yA + l.yP) / 2; return [z + (p.hl === 'anterior' ? 20 : 0), Math.round(y), l.xc]; } },
    params: [
      { id: 'hl', type: 'select', label: bi('Resaltar', 'Highlight'), options: [opt('none', 'Solo límites', 'Limits only'), opt('anterior', 'Anterior'), opt('medio', 'Medio', 'Middle'), opt('posterior', 'Posterior')], value: 'none' },
      { id: 'itmig', type: 'toggle', label: bi('Límite ITMIG 2014 (ampliación)', 'ITMIG 2014 limit (beyond the syllabus)'), value: false },
    ],
    techniques: [
      tq('ct', 'ct', 'ok', bi('TC (sagital)', 'CT (sagittal)'), bi('Los límites se ven mejor en el sagital: delante del eje traqueal / borde posterior del corazón, y 1 cm por detrás del borde anterior vertebral.', 'The limits are best seen on the sagittal: in front of the tracheal axis / posterior heart border, and 1 cm behind the anterior vertebral border.'), { window: 'mediastinum', default: true }),
      T.rxLat('ok', 'Rx lateral simulada: la división clásica se hace en la proyección lateral.', 'Simulated lateral film: the classic division is drawn on the lateral view.'),
    ],
    build: (p, A) => {
      const tb = A.s('trachea').bbox, hb = A.s('heart').bbox, z0 = tb[0] + 4, z1 = hb[1] - 2, lungIds = new Set(LUNGS.map(k => A.id(k))), out = [];
      const bones = new Set(['sternum', 'costal_cartilages', ...A.vertebraKeys()].map(k => A.id(k)));
      out.push({ t: 'cols', box: rbox([z0, z1, 15, 175, 95, 185]), fn: (z, y, x, cur) => {
        if (lungIds.has(cur.orig) || bones.has(cur.orig) || cur.hu < -500) return null;
        const l = limits(A, z); if (l.yA === null || l.yP === null || Math.abs(x - l.xc) > 45) return null;
        const yA = p.itmig ? (limitPV(A, z) ?? l.yA) : l.yA;
        if (Math.abs(y - yA) < 1.1 || Math.abs(y - l.yP) < 1.1) return { hu: 700, label: 'lesion' };
        if (p.hl === 'none') return null;
        const k = y < yA ? 'anterior' : y < l.yP ? 'medio' : 'posterior';
        if (k !== p.hl) return null;
        if (k === 'posterior' && y > l.yP + 40) return null;
        return { hu: cur.hu + 110, label: 'lesion' };
      } });
      const z = CAR(A), l = limits(A, z);
      out.push(mark([z, l.yA - 14, l.xc], 'Anterior: timoma', 'Anterior: thymoma', { dx: -150, dy: -40 }));
      out.push(mark([z, (l.yA + l.yP) / 2, l.xc], 'Medio: adenopatías', 'Middle: lymph nodes', { dx: 70, dy: -40 }));
      out.push(mark([z, l.yP + 8, l.xc], 'Posterior: neurogénicos', 'Posterior: neurogenic', { dx: 70, dy: 40 }));
      return out;
    },
    readouts: (p, A) => { const z = CAR(A), l = limits(A, z); return [
      { label: bi('Límite anterior–medio (en la carina)', 'Anterior–middle limit (at the carina)'), value: bi(p.itmig ? 'Borde anterior del pericardio y grandes vasos (ITMIG)' : 'Pared anterior traqueal · pared posterior del corazón y VCI', p.itmig ? 'Anterior border of the pericardium and great vessels (ITMIG)' : 'Anterior tracheal wall · posterior heart and IVC') },
      { label: bi('Límite medio–posterior', 'Middle–posterior limit'), value: bi('1 cm por detrás del borde anterior de las vértebras dorsales', '1 cm behind the anterior border of the thoracic vertebrae') },
      { label: bi('Distancia entre límites en este corte', 'Distance between limits on this slice'), value: `${((l.yP - l.yA) * A.sp[1]).toFixed(0)} mm` },
    ]; },
    info: {
      where: bi('Espacio extrapleural entre los pulmones, el esternón (delante), las vértebras dorsales (detrás), el opérculo torácico (arriba) y el diafragma (abajo). Por ser extrapleural, cualquier masa en su interior estará bien delimitada.', 'Extrapleural space between the lungs, the sternum (front), the thoracic vertebrae (back), the thoracic inlet (above) and the diaphragm (below). Being extrapleural, any mass inside it is well defined.'),
      see: bi('<b>Anterior</b> (hasta la pared anterior traqueal, la pared posterior del corazón y la VCI): timo, grasa, ganglios, corazón, aorta ascendente, tronco de la arteria pulmonar. <b>Medio</b> (hasta 1 cm por detrás del borde anterior vertebral): ganglios, tráquea y bronquios principales, esófago, arco aórtico, arterias pulmonares principales. <b>Posterior</b>: espacio paravertebral, vértebras, estructuras neurales, aorta descendente.', '<b>Anterior</b> (up to the anterior tracheal wall, the posterior heart wall and the IVC): thymus, fat, nodes, heart, ascending aorta, pulmonary trunk. <b>Middle</b> (up to 1 cm behind the anterior vertebral border): nodes, trachea and main bronchi, oesophagus, aortic arch, main pulmonary arteries. <b>Posterior</b>: paravertebral space, vertebrae, neural structures, descending aorta.'),
      technique: bi('Masa más frecuente: anterior → timoma · medio → adenopatías · posterior → tumores neurogénicos («T-A-N»). El posterior tiene menos componentes: su diagnóstico diferencial es el más rápido.', 'Commonest mass: anterior → thymoma · middle → lymph nodes · posterior → neurogenic tumours ("T-A-N"). The posterior has fewest components: its differential is the quickest.'),
      tip: bi('Resalta cada compartimento y recorre los cortes axiales: la línea anterior sigue a la tráquea arriba y al corazón abajo.', 'Highlight each compartment and scroll the axial slices: the anterior line follows the trachea above and the heart below.'),
    },
    diagram: lang => compDiagram(lang),
    exam: false,
    flags: [
      flag('apuntes', 'División clásica del temario (corazón y aorta ascendente en el anterior). Las líneas se calculan en este paciente a partir de la tráquea, el corazón, la VCI y las vértebras.', 'Classic division of the syllabus (heart and ascending aorta in the anterior). The lines are computed on this patient from the trachea, heart, IVC and vertebrae.'),
      flag('ampliacion', 'La clasificación ITMIG (2014), basada en TC, usa compartimentos prevascular, visceral y paravertebral: el corazón y la aorta ascendente pasan al visceral. Para el examen, usa la del temario.', 'The CT-based ITMIG classification (2014) uses prevascular, visceral and paravertebral compartments: the heart and ascending aorta move to the visceral one. For the exam, use the syllabus version.'),
      flag('ampliacion', 'El resaltado del compartimento es una ayuda visual (+110 UH), no una densidad real.', 'The compartment highlight is a visual aid (+110 HU), not a real density.'),
    ],
  },

  /* ===== anterior ===== */
  {
    id: 'timoma', group: 'ant', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Timoma', 'Thymoma'), short: bi('Timoma', 'Thymoma'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => antCentre(A, 4, 12, p.size * 5 / 1.5), examPlane: 'axial' },
    params: [
      { id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 1.5, max: 6, step: 0.5, value: 3, unit: 'cm' },
      { id: 'nec', type: 'toggle', label: bi('Áreas de necrosis', 'Necrotic areas'), value: false },
      { id: 'calc', type: 'toggle', label: bi('Calcificaciones', 'Calcifications'), value: false },
      { id: 'inv', type: 'toggle', label: bi('Invasivo (infiltra)', 'Invasive (infiltrates)'), value: false },
    ],
    techniques: [T.ctMed('best', 'Masa pequeña, sólida, redondeada y bien delimitada delante de la aorta; ± necrosis o calcio.', 'Small, solid, round, well-defined mass in front of the aorta; ± necrosis or calcium.', { default: true }), T.rxLat('ok', 'En la lateral ocupa el espacio retroesternal.', 'On the lateral film it fills the retrosternal space.'), T.t2('ok', 'Sólido (señal intermedia); la necrosis brilla en T2.', 'Solid (intermediate signal); necrosis is bright on T2.')],
    compare: ['linfoma', 'teratoma'],
    build: (p, A) => {
      const r = p.size * 5, rv = r / A.sp[0], c = antCentre(A, 4, 12, rv), out = [];
      out.push({ t: 'blob', c, r: [r * 1.05, r * 0.85, r], hu: HU.tumour, edge: p.inv ? 2.5 : 0.7, irregular: p.inv ? 0.6 : 0.12, spic: p.inv ? 0.35 : 0, texture: 5,
        core: p.nec ? { f: 0.45, hu: 18 } : undefined, calc: p.calc ? { pattern: 'eccentric', hu: 700 } : undefined, outside: HARD(A), label: 'lesion', mr: p.nec ? { t1: 0.3, t2: 0.75, stir: 0.7 } : MR.solid });
      if (p.inv) { const asc = aoSlice(A, c[0]).asc || aoSlice(A, c[0]).arch; if (asc) out.push({ t: 'tube', pts: [c, [c[0] + 3, asc.cy - asc.r * 0.6, asc.cx]], r: 3, hu: HU.tumour, label: 'lesion', outside: ['sternum'] }); }
      out.push(mark(c, p.inv ? 'Timoma invasivo: infiltra' : 'Timoma: redondeado, bien delimitado', p.inv ? 'Invasive thymoma: infiltrates' : 'Thymoma: round, well defined', { dx: 70, dy: -40 }));
      return out;
    },
    readouts: (p, A) => [{ label: bi('Tamaño', 'Size'), value: `${p.size} cm` }, { label: bi('Comportamiento', 'Behaviour'), value: p.inv ? bi('Invasivo: infiltra otras estructuras → hay que quitarlo', 'Invasive: infiltrates other structures → must be removed') : bi('Generalmente benigno (temario)', 'Usually benign (syllabus)') }, ...compRO(A, antCentre(A, 4, 12, p.size * 5 / 1.5))],
    info: {
      where: bi('Mediastino anterior (prevascular): detrás del esternón y delante de la aorta ascendente y la VCS.', 'Anterior (prevascular) mediastinum: behind the sternum, in front of the ascending aorta and SVC.'),
      see: bi('Masa más frecuente del mediastino anterior y tumor primario del timo más frecuente. Masa <b>pequeña, sólida, redondeada y bien delimitada</b>; puede tener <b>necrosis o calcificaciones</b>. Solo a veces es invasivo e infiltra otras estructuras, y por eso hay que quitarlo.', 'Commonest anterior mediastinal mass and commonest primary thymic tumour. <b>Small, solid, round, well-defined</b> mass; may show <b>necrosis or calcifications</b>. Only sometimes invasive, infiltrating other structures, which is why it is removed.'),
      technique: bi('TC con contraste.', 'Contrast CT.'),
      differential: bi('Linfoma de Hodgkin: maligno y voluminoso, <b>invade y comprime</b> (VCS, corazón) pero <b>no infiltra</b>. El timoma invasivo sí infiltra.', 'Hodgkin lymphoma: malignant and bulky, <b>invades and compresses</b> (SVC, heart) but <b>does not infiltrate</b>. Invasive thymoma does infiltrate.'),
      tip: bi('Compáralo con el linfoma: tamaño, relación con la VCS y bordes.', 'Compare it with lymphoma: size, relation to the SVC and margins.'),
    },
    flags: [
      flag('apuntes', 'El temario dice que el timoma «suele ser benigno».', 'The syllabus says thymoma is "usually benign".'),
      flag('ampliacion', 'La clasificación de la OMS considera todos los timomas tumores epiteliales malignos (de bajo grado), aunque muchos se curan con la resección; «benigno» es una simplificación antigua.', 'The WHO classification regards all thymomas as (low-grade) malignant epithelial tumours, although many are cured by resection; "benign" is an older simplification.'),
      flag('ampliacion', 'El timo no está segmentado: la masa se coloca entre el esternón y la aorta ascendente.', 'The thymus is not segmented: the mass is placed between the sternum and the ascending aorta.'),
    ],
  },
  {
    id: 'teratoma', group: 'ant', tag: 'ct-aprox',
    name: bi('Teratoma', 'Teratoma'), short: bi('Teratoma', 'Teratoma'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.2, at: (p, A) => antCentre(A, 2, 16, p.size * 5 / 1.5), examPlane: 'axial' },
    params: [{ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 3, max: 9, step: 0.5, value: 6, unit: 'cm' }, { id: 'fat', type: 'toggle', label: bi('Grasa y calcio', 'Fat and calcium'), value: true }],
    techniques: [T.ctMed('best', 'La TC detecta grasa (−100 UH), líquido y calcio en la misma masa.', 'CT detects fat (−100 HU), fluid and calcium in the same mass.', { default: true }), T.t1('ok', 'La grasa es brillante en T1.', 'Fat is bright on T1.')],
    compare: ['timoma'],
    build: (p, A) => {
      const r = p.size * 5, rv = r / A.sp[0], c = antCentre(A, 2, 16, rv), out = [];
      out.push({ t: 'blob', c, r: [r, r * 0.8, r * 0.9], hu: 14, rim: { w: 2.5, hu: 55 }, edge: 0.8, irregular: 0.2, outside: HARD(A), label: 'lesion', mr: MR.fluid });
      if (p.fat) {
        out.push({ t: 'blob', c: [c[0] - rv * 0.2, c[1] - rv * 0.15, c[2] + rv * 0.25], r: r * 0.38, hu: HU.fat, within: ['lesion'], edge: 0.5, label: 'lesion', mr: MR.fat });
        out.push({ t: 'blob', c: [c[0] + rv * 0.25, c[1] + rv * 0.3, c[2] - rv * 0.2], r: r * 0.16, hu: 900, within: ['lesion'], irregular: 0.5, label: 'lesion', mr: MR.calc });
      }
      out.push(mark(c, 'Grasa + líquido + calcio', 'Fat + fluid + calcium', { dx: 70, dy: -40 }));
      return out;
    },
    readouts: (p, A) => compRO(A, antCentre(A, 2, 16, p.size * 5 / 1.5)),
    info: {
      where: bi('Mediastino anterior: una de las «4T».', 'Anterior mediastinum: one of the "4T".'),
      see: bi('Masa del mediastino anterior. Aquí se dibuja con lo que la suele delatar en TC: componentes de grasa, líquido y calcio.', 'Anterior mediastinal mass. Drawn here with what usually gives it away on CT: fat, fluid and calcium components.'),
      differential: bi('4T: timoma, teratoma, terrible linfoma, tiroides.', '4T: thymoma, teratoma, terrible lymphoma, thyroid.'),
    },
    flags: [flag('ampliacion', 'El temario solo nombra el teratoma dentro de las 4T; la imagen (grasa, líquido, calcio) es la habitual, fuera del temario.', 'The syllabus only names teratoma among the 4T; the picture (fat, fluid, calcium) is the usual one, beyond the syllabus.')],
  },
  {
    id: 'linfoma', group: 'ant', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Linfoma de Hodgkin («terrible linfoma»)', 'Hodgkin lymphoma ("terrible lymphoma")'), short: bi('Linfoma de Hodgkin', 'Hodgkin lymphoma'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.9, at: (p, A) => { const z = aoLevels(A).zSplit - 2, q = prevascular(A, z, 2); return [z, q.y + 4, q.x - 6]; }, examPlane: 'axial' },
    params: [
      { id: 'bulk', type: 'range', label: bi('Tamaño del conglomerado', 'Size of the mass'), min: 5, max: 14, step: 1, value: 10, unit: 'cm' },
      { id: 'comp', type: 'range', label: bi('Compresión de la VCS', 'SVC compression'), min: 0, max: 70, step: 10, value: 50, unit: '%' },
    ],
    techniques: [T.ctMed('best', 'Masa voluminosa y lobulada que rodea y comprime la VCS; los planos con los vasos se conservan (no infiltra).', 'Bulky, lobulated mass surrounding and compressing the SVC; the planes with the vessels are kept (it does not infiltrate).', { default: true }), T.rxPA('ok', 'Ensanchamiento del mediastino superior en la placa.', 'Widened upper mediastinum on the film.')],
    compare: ['timoma'],
    build: (p, A) => {
      const z = aoLevels(A).zSplit - 2, q = prevascular(A, z, 2), R = p.bulk * 10 / 2 * 0.55, Rv = R / A.sp[0], out = [], hard = HARD(A).filter(k => k !== 'brachiocephalic_vein_left');
      const hu = HU.lymph, mr = { t1: 0.4, t2: 0.62, stir: 0.6 };
      for (const [dz, dy, dx, f] of [[-0.9, 0, -0.2, 0.85], [0, 0.1, 0.55, 1], [0.8, 0.05, 0.1, 0.9], [0.1, 0.15, -0.6, 0.8]])
        out.push({ t: 'blob', c: [z + dz * Rv, Math.max(q.y, q.ySt + Rv * 0.6) + dy * Rv, q.x + dx * Rv], r: [R * f, R * 0.7 * f, R * f], hu, irregular: 0.35, edge: 1, texture: 6, outside: hard, label: 'lesion', mr });
      const sv = A.centroidAt('superior_vena_cava', z) || A.centroidAt('superior_vena_cava', A.s('superior_vena_cava').bbox[0] + 6);
      if (sv) out.push({ t: 'blob', c: [z + 2, sv.y - 2, sv.x - 3], r: [R * 0.9, R * 0.55, R * 0.55], hu, irregular: 0.3, edge: 1, outside: hard, label: 'lesion', mr });
      if (p.comp) out.push({ t: 'dilate', s: 'superior_vena_cava', scale: 1 - p.comp / 100, z: [z - Rv, z + Rv], fill: { hu, label: 'lesion', mr } });
      if (sv) out.push(mark([z, sv.y, sv.x], 'VCS comprimida', 'Compressed SVC', { dx: -150, dy: -30 }));
      out.push(mark([z, q.y, q.x + Rv * 0.5], 'Invade y comprime, no infiltra', 'Invades and compresses, does not infiltrate', { dx: 70, dy: -50 }));
      return out;
    },
    readouts: (p, A) => { const z = aoLevels(A).zSplit - 2, q = prevascular(A, z, 2); return [{ label: bi('Calibre de la VCS', 'SVC calibre'), value: bi(p.comp ? `reducido un ${p.comp} %` : 'conservado', p.comp ? `reduced by ${p.comp} %` : 'preserved') }, { label: bi('Comportamiento', 'Behaviour'), value: bi('Maligno y agresivo: invade y comprime, pero no infiltra', 'Malignant and aggressive: invades and compresses, but does not infiltrate') }, ...compRO(A, [z, q.y, q.x])]; },
    info: {
      where: bi('Puede aparecer en cualquier compartimento, pero es más frecuente en el anterior, donde suele afectar al timo.', 'Can appear in any compartment, but is commonest in the anterior one, where it usually involves the thymus.'),
      see: bi('Tumor maligno y agresivo de los ganglios linfáticos. Si es muy extenso puede invadir el timo o <b>comprimir</b> estructuras vecinas, sobre todo la <b>VCS</b> y el corazón. <b>Invade y comprime, pero no infiltra.</b>', 'Malignant, aggressive tumour of the lymph nodes. When extensive it can invade the thymus or <b>compress</b> neighbouring structures, above all the <b>SVC</b> and the heart. <b>It invades and compresses, but does not infiltrate.</b>'),
      technique: bi('TC con contraste; en la Rx, ensanchamiento mediastínico.', 'Contrast CT; on the film, widened mediastinum.'),
      differential: bi('Timoma: pequeño, redondeado, bien delimitado; el invasivo sí infiltra.', 'Thymoma: small, round, well defined; the invasive one does infiltrate.'),
      tip: bi('Sube la compresión: la VCS se aplasta pero la grasa que la separa de la masa no desaparece.', 'Raise the compression: the SVC flattens but the fat separating it from the mass does not disappear.'),
    },
    flags: [flag('ampliacion', 'El timo no está segmentado: el conglomerado se coloca en el espacio prevascular y alrededor de la VCS real.', 'The thymus is not segmented: the mass is placed in the prevascular space and around the real SVC.')],
  },
  {
    id: 'timo', group: 'ant', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Hiperplasia y quistes tímicos', 'Thymic hyperplasia and cysts'), short: bi('Timo', 'Thymus'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => antCentre(A, -2, 6, 8), examPlane: 'axial' },
    params: [{ id: 'tipo', type: 'select', label: bi('Tipo', 'Type'), options: [opt('hiper', 'Hiperplasia', 'Hyperplasia'), opt('quiste', 'Quiste tímico', 'Thymic cyst')], value: 'hiper' }, { id: 'size', type: 'range', label: bi('Tamaño del quiste', 'Cyst size'), min: 2, max: 6, step: 0.5, value: 3.5, unit: 'cm' }],
    techniques: [T.ctMed('ok', 'Hiperplasia: timo aumentado que conserva su forma; quiste: densidad agua.', 'Hyperplasia: enlarged thymus that keeps its shape; cyst: water density.', { default: true }), T.t2('best', 'El quiste es muy brillante en T2.', 'The cyst is very bright on T2.')],
    compare: ['timoma'],
    build: (p, A) => {
      const c = antCentre(A, -2, 6, 8), out = [];
      if (p.tipo === 'hiper') {
        out.push({ t: 'blob', c: [c[0], c[1], c[2] + 7], r: [28, 6, 12], hu: 45, edge: 1, outside: HARD(A), label: 'lesion', mr: MR.soft });
        out.push({ t: 'blob', c: [c[0] + 2, c[1] + 1, c[2] - 7], r: [24, 5, 10], hu: 45, edge: 1, outside: HARD(A), label: 'lesion', mr: MR.soft });
        out.push(mark(c, 'Timo aumentado, forma conservada', 'Enlarged thymus, shape preserved', { dx: 70, dy: -40 }));
      } else {
        const r = p.size * 5, q = antCentre(A, -2, 10, r / 1.5);
        out.push({ t: 'blob', c: q, r: [r * 1.1, r * 0.85, r], hu: 8, rim: { w: 1, hu: 40 }, edge: 0.5, outside: HARD(A), label: 'lesion', mr: MR.fluid });
        out.push(mark(q, 'Quiste tímico (agua)', 'Thymic cyst (water)', { dx: 70, dy: -40 }));
      }
      return out;
    },
    readouts: (p, A) => compRO(A, antCentre(A, -2, 6, 8)),
    info: {
      where: bi('Mediastino anterior (timo).', 'Anterior mediastinum (thymus).'),
      see: bi('Forman parte de la patología del mediastino anterior junto a las 4T. Hiperplasia: timo grande con su forma; quiste: lesión de densidad agua, pared fina.', 'Part of anterior mediastinal disease together with the 4T. Hyperplasia: large thymus with its normal shape; cyst: water-density lesion, thin wall.'),
      technique: bi('RM para una lesión sólido-quística.', 'MR for a solid-cystic lesion.'),
    },
    flags: [flag('ampliacion', 'El temario solo los nombra; la imagen (forma conservada, densidad agua) es la habitual.', 'The syllabus only names them; the picture (preserved shape, water density) is the usual one.')],
  },
  {
    id: 'quiste-pleuropericardico', group: 'ant', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Quiste pleuropericárdico', 'Pleuropericardial cyst'), short: bi('Quiste pleuropericárdico', 'Pleuropericardial cyst'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => ppCentre(A, p.size), examPlane: 'axial' },
    params: [{ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 8, step: 0.5, value: 5, unit: 'cm' }],
    techniques: [T.ctMed('ok', 'Lesión de densidad agua, pared fina, en el ángulo cardiofrénico.', 'Water-density lesion, thin wall, at the cardiophrenic angle.', { default: true }), T.t2('best', 'Líquido: muy brillante en T2.', 'Fluid: very bright on T2.'), T.rxPA('ok', 'Opacidad en el ángulo cardiofrénico derecho.', 'Opacity at the right cardiophrenic angle.')],
    build: (p, A) => { const c = ppCentre(A, p.size), r = p.size * 5; return [{ t: 'blob', c, r: [r * 0.9, r, r], hu: 8, rim: { w: 1, hu: 40 }, edge: 0.5, outside: ['heart', 'liver', 'inferior_vena_cava', 'costal_cartilages', 'sternum', ...RIBS(A)], label: 'lesion', mr: MR.fluid }, mark(c, 'Quiste pleuropericárdico', 'Pleuropericardial cyst', { dx: -170, dy: -30 })]; },
    readouts: (p, A) => compRO(A, ppCentre(A, p.size)),
    info: {
      where: bi('Junto al corazón; típicamente en el ángulo cardiofrénico derecho.', 'Next to the heart; typically at the right cardiophrenic angle.'),
      see: bi('Lesión quística (densidad agua) bien delimitada, pegada al contorno cardíaco.', 'Well-defined cystic (water-density) lesion against the cardiac outline.'),
    },
    flags: [flag('ampliacion', 'El temario lo incluye con el mediastino anterior; su localización típica (ángulo cardiofrénico derecho) y su aspecto son ampliación.', 'The syllabus lists it with the anterior mediastinum; its typical site (right cardiophrenic angle) and appearance are beyond the syllabus.')],
  },

  /* ===== medio ===== */
  {
    id: 'bocio', group: 'med', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Bocio subesternal (crecimiento tiroideo)', 'Substernal goitre (thyroid enlargement)'), short: bi('Bocio', 'Goitre'),
    view: { plane: 'sagittal', window: 'mediastinum', zoom: 2.2, at: (p, A) => goitre(A, p).mid, examPlane: 'axial' },
    params: [
      { id: 'ext', type: 'range', label: bi('Extensión por debajo del tiroides', 'Extension below the thyroid'), min: 20, max: 70, step: 5, value: 45, unit: 'mm' },
      { id: 'via', type: 'select', label: bi('Hacia', 'Towards'), options: [opt('medio', 'Mediastino medio (paratraqueal)', 'Middle mediastinum (paratracheal)'), opt('anterior', 'Mediastino anterior (pretraqueal)', 'Anterior mediastinum (pretracheal)')], value: 'medio' },
      { id: 'side', type: 'select', label: bi('Lóbulo', 'Lobe'), options: SIDES, value: 'L' },
    ],
    techniques: [T.ctMed('best', 'Continuidad con el tiroides del cuello y densidad similar a la suya: los dos signos del bocio.', 'Continuity with the thyroid in the neck and density similar to it: the two signs of goitre.', { default: true }), T.rxPA('ok', 'Ensanchamiento del mediastino superior y desviación de la tráquea.', 'Widened upper mediastinum and tracheal deviation.')],
    build: (p, A, env) => {
      const g = goitre(A, p), hu = THY, out = [];
      const trb = A.s('trachea').bbox, zA = A.s('thyroid_gland').bbox[0], d = vox(A, 3 + p.ext / 12), sgn = p.side === 'L' ? -1 : 1;
      const sh = z => (z < zA || z > g.zEnd + 12 ? 0 : d * Math.sin(Math.PI * (z - zA) / (g.zEnd + 12 - zA)));
      out.push({ t: 'warp', s: 'trachea', box: [zA, Math.min(trb[1], g.zEnd + 12), trb[2], trb[3], trb[4] - Math.ceil(d) - 2, trb[5] + Math.ceil(d) + 2], fill: { hu: 40, label: 0 }, map: (z, y, x) => { const s = sh(z); return s < 0.5 ? null : [z, y, x - sgn * s]; } });
      out.push({ t: 'tube', pts: g.pts, r: g.rs, hu, outside: HARD(A), label: 'lesion', mr: MR.thyroid });
      out.push({ t: 'blob', c: g.pts[2], r: [g.rs[2] * 1.1, g.rs[2], g.rs[2]], hu, irregular: 0.3, texture: 10, outside: HARD(A), label: 'lesion', mr: MR.thyroid });
      out.push(mark(g.pts[0], 'Continuidad con el tiroides', 'Continuity with the thyroid', { dx: 70, dy: -40, planes: ['coronal', 'sagittal'] }));
      out.push(mark(g.pts[2], 'Misma densidad que el tiroides', 'Same density as the thyroid', { dx: 70, dy: 30 }));
      return out;
    },
    readouts: (p, A, env) => { const g = goitre(A, p); return [{ label: bi('Densidad de la masa / del tiroides', 'Density of mass / thyroid'), value: `${pv(THY, env.phase || 'portal')} / ${pv(THY, env.phase || 'portal')} UH` }, { label: bi('Continuidad con el tiroides', 'Continuity with the thyroid'), value: bi('Sí', 'Yes') }, ...compRO(A, g.pts[2])]; },
    info: {
      where: bi('Bocio subesternal que crece hacia el tórax (hacia abajo, delante, detrás, izquierda y derecha); llega sobre todo al mediastino medio, aunque también puede extenderse al anterior.', 'Substernal goitre growing into the chest (down, forward, backward, left and right); it reaches mainly the middle mediastinum, though it can also extend into the anterior one.'),
      see: bi('Clave: la masa tiene <b>continuidad con el tiroides del cuello</b> y una <b>densidad similar</b> a la suya. Puede desviar la tráquea.', 'Key: the mass is <b>continuous with the thyroid in the neck</b> and has <b>similar density</b>. It may deviate the trachea.'),
      technique: bi('TC: sigue la masa en los cortes coronales hasta el cuello.', 'CT: follow the mass on the coronal slices up to the neck.'),
      differential: bi('Tiroides es una de las 4T del mediastino anterior; el crecimiento tiroideo está también en la lista del medio.', 'Thyroid is one of the 4T of the anterior mediastinum; thyroid enlargement is also in the middle-compartment list.'),
      tip: bi('Pon el cursor sobre la masa y sobre el tiroides: mismas UH.', 'Hover over the mass and over the thyroid: same HU.'),
    },
    flags: [flag('apuntes', 'El temario pone «tiroides» en las 4T del anterior y el «crecimiento tiroideo» en el medio; aquí puedes llevarlo a los dos.', 'The syllabus puts "thyroid" in the anterior 4T and "thyroid enlargement" in the middle; here you can send it to either.')],
  },
  {
    id: 'adenopatias', group: 'med', tag: 'ct-aprox',
    name: bi('Adenopatías mediastínicas', 'Mediastinal lymph nodes'), short: bi('Adenopatías', 'Lymph nodes'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => nodeSites(A).sub, examPlane: 'axial' },
    params: [
      { id: 'causa', type: 'select', dropdown: true, label: bi('Causa', 'Cause'), options: [opt('linfoma', 'Linfoma', 'Lymphoma'), opt('meta', 'Metástasis de carcinoma pulmonar', 'Lung cancer metastases'), opt('sarco', 'Sarcoidosis'), opt('tbc', 'TBC', 'TB'), opt('silicosis', 'Silicosis')], value: 'meta' },
      { id: 'size', type: 'range', label: bi('Eje corto', 'Short axis'), min: 10, max: 35, step: 1, value: 20, unit: 'mm', examMin: 14 },
    ],
    techniques: [T.ctMed('best', 'Lesiones múltiples, sólidas, redondeadas y polilobuladas en el mediastino medio.', 'Multiple, solid, round, polylobulated lesions in the middle mediastinum.', { default: true }), T.rxPA('ok', 'Ensanchamiento paratraqueal o hiliar.', 'Paratracheal or hilar widening.')],
    compare: ['quiste-broncogenico'],
    build: (p, A) => {
      const S = nodeSites(A), sites = { linfoma: ['para', 'ap', 'sub', 'hR', 'hL'], meta: ['para', 'sub', 'hR'], sarco: ['para', 'hR', 'hL'], tbc: ['para', 'hR'], silicosis: ['sub', 'hR', 'hL'] }[p.causa];
      const s = p.size * (p.causa === 'linfoma' ? 1.25 : 1) / 2, out = [], hard = [...HARD(A), 'heart'];
      for (const k of sites) {
        const c = S[k], base = { hu: HU.lymph, irregular: 0.3, edge: 0.8, outside: hard, label: 'lesion', mr: { t1: 0.4, t2: 0.6, stir: 0.58 } };
        if (p.causa === 'tbc') Object.assign(base, { hu: { sin: 35, arterial: 60, portal: 80, tardia: 70 }, core: { f: 0.6, hu: 20 } });
        if (p.causa === 'silicosis') base.calc = { pattern: 'peripheral', hu: 650 };
        out.push({ t: 'blob', c, r: [s * 1.3, s, s * 1.1], ...base });
        out.push({ t: 'blob', c: [c[0] + vox(A, s * 1.2), c[1] + 1, c[2] + (k === 'hL' || k === 'ap' ? 2 : -2)], r: [s * 0.9, s * 0.75, s * 0.8], ...base });
      }
      out.push(mark(S[sites.includes('sub') ? 'sub' : 'para'], 'Adenopatías polilobuladas', 'Polylobulated nodes', { dx: 70, dy: 40 }));
      return out;
    },
    readouts: (p, A) => [{ label: bi('Eje corto', 'Short axis'), value: `${p.size} mm` }, { label: bi('Causas (temario)', 'Causes (syllabus)'), value: bi('Tumores (linfoma, metástasis de carcinoma pulmonar), sarcoidosis, TBC, silicosis', 'Tumours (lymphoma, lung cancer metastases), sarcoidosis, TB, silicosis') }, ...compRO(A, nodeSites(A).sub)],
    info: {
      where: bi('Mediastino medio: paratraqueales, ventana aortopulmonar, subcarinales e hiliares.', 'Middle mediastinum: paratracheal, aortopulmonary window, subcarinal and hilar.'),
      see: bi('Masas más frecuentes del mediastino medio: lesiones <b>múltiples, sólidas, redondeadas y polilobuladas</b>.', 'Commonest masses of the middle mediastinum: <b>multiple, solid, round, polylobulated</b> lesions.'),
      technique: bi('TC con contraste.', 'Contrast CT.'),
      differential: bi('Quiste broncogénico: única, densidad agua. Bocio: continuidad con el tiroides.', 'Bronchogenic cyst: single, water density. Goitre: continuity with the thyroid.'),
      tip: bi('Cambia la causa: cambian las estaciones afectadas y el aspecto.', 'Change the cause: the stations involved and the appearance change.'),
    },
    flags: [flag('ampliacion', 'El temario da solo las causas. Las estaciones de cada causa, la necrosis central en la TBC y la calcificación «en cáscara de huevo» de la silicosis son patrones habituales añadidos aquí.', 'The syllabus only gives the causes. The stations per cause, central necrosis in TB and "eggshell" calcification in silicosis are usual patterns added here.'), flag('ampliacion', 'Los ganglios no están segmentados: se colocan junto a la tráquea, los bronquios y la aorta reales.', 'Nodes are not segmented: they are placed next to the real trachea, bronchi and aorta.')],
  },
  {
    id: 'quiste-broncogenico', group: 'med', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Quiste broncogénico', 'Bronchogenic cyst'), short: bi('Quiste broncogénico', 'Bronchogenic cyst'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => nodeSites(A)[p.loc], examPlane: 'axial' },
    params: [{ id: 'loc', type: 'select', label: bi('Localización', 'Site'), options: [opt('sub', 'Subcarinal'), opt('para', 'Paratraqueal derecho', 'Right paratracheal')], value: 'sub' }, { id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 5, step: 0.5, value: 3, unit: 'cm' }],
    techniques: [T.ctMed('ok', 'Lesión redondeada, única, de densidad agua, que no realza.', 'Round, single, water-density lesion that does not enhance.', { default: true }), T.t2('best', 'RM: caracteriza la lesión quística (muy brillante en T2).', 'MR: characterises the cystic lesion (very bright on T2).')],
    compare: ['adenopatias', 'quiste-esofagico'],
    build: (p, A) => { const c = nodeSites(A)[p.loc], r = p.size * 5; return [{ t: 'blob', c, r: [r * 1.1, r * 0.9, r], hu: 12, rim: { w: 1, hu: 35 }, edge: 0.5, outside: [...HARD(A), 'heart'], label: 'lesion', mr: MR.fluid }, mark(c, 'Quiste broncogénico', 'Bronchogenic cyst', { dx: 70, dy: 40 })]; },
    readouts: (p, A) => compRO(A, nodeSites(A)[p.loc]),
    info: { where: bi('Mediastino medio, junto a la tráquea o la carina.', 'Middle mediastinum, next to the trachea or carina.'), see: bi('Lesión quística redondeada bien delimitada.', 'Well-defined round cystic lesion.'), differential: bi('Adenopatías: múltiples y sólidas.', 'Lymph nodes: multiple and solid.') },
    flags: [flag('ampliacion', 'El temario solo lo nombra en el mediastino medio; la localización subcarinal/paratraqueal y la densidad agua son lo habitual.', 'The syllabus only names it in the middle mediastinum; the subcarinal/paratracheal site and water density are the usual ones.')],
  },
  {
    id: 'quiste-esofagico', group: 'med', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Quiste de duplicación esofágico', 'Oesophageal duplication cyst'), short: bi('Quiste esofágico', 'Oesophageal cyst'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => esoCyst(A, p.size).c, examPlane: 'axial' },
    params: [{ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 5, step: 0.5, value: 3, unit: 'cm' }],
    techniques: [T.ctMed('ok', 'Quiste pegado a la pared del esófago.', 'Cyst against the oesophageal wall.', { default: true }), T.t2('best', 'Muy brillante en T2.', 'Very bright on T2.')],
    compare: ['quiste-broncogenico'],
    build: (p, A) => { const q = esoCyst(A, p.size); return [{ t: 'blob', c: q.c, r: q.r, hu: 14, rim: { w: 1.2, hu: 40 }, edge: 0.5, outside: [...HARD(A), 'heart'], label: 'lesion', mr: MR.fluid }, mark(q.c, 'Quiste junto al esófago', 'Cyst next to the oesophagus', { dx: -170, dy: 30 })]; },
    readouts: (p, A) => compRO(A, esoCyst(A, p.size).c),
    info: { where: bi('Mediastino medio, adyacente al esófago distal.', 'Middle mediastinum, next to the distal oesophagus.'), see: bi('Lesión quística ovalada en contacto con el esófago.', 'Oval cystic lesion in contact with the oesophagus.') },
    flags: [flag('ampliacion', 'El temario solo lo nombra; la imagen es la habitual.', 'The syllabus only names it; the picture is the usual one.')],
  },
  {
    id: 'hernia-hiato', group: 'med', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Hernia de hiato', 'Hiatus hernia'), short: bi('Hernia de hiato', 'Hiatus hernia'),
    view: { plane: 'sagittal', window: 'mediastinum', zoom: 2.2, at: (p, A) => hiatal(A, p).c, examPlane: 'axial' },
    params: [
      { id: 'size', type: 'range', label: bi('Estómago herniado', 'Herniated stomach'), min: 3, max: 9, step: 0.5, value: 5, unit: 'cm' },
      { id: 'tipo', type: 'select', label: bi('Tipo', 'Type'), options: [opt('desl', 'Por deslizamiento', 'Sliding'), opt('para', 'Paraesofágica (ampliación)', 'Paraoesophageal (beyond the syllabus)')], value: 'desl', examOptions: ['desl'] },
    ],
    techniques: [T.rxPA('ok', 'Masa retrocardíaca con nivel hidroaéreo (de pie, el nivel es horizontal).', 'Retrocardiac mass with an air-fluid level (standing, the level is horizontal).'), T.rxLat('best', 'En la lateral se ve detrás del corazón, delante de la columna.', 'On the lateral film it lies behind the heart, in front of the spine.'), T.ctMed('ok', 'TC: estómago por encima del hiato, detrás del corazón.', 'CT: stomach above the hiatus, behind the heart.', { default: true })],
    build: (p, A, env) => {
      const h = hiatal(A, p), c = h.c, R = h.R, Rv = R / A.sp[0], rr = [Rv * 0.95, Rv * 0.75, Rv], wall = vox(A, 3), out = [], wallHu = pv(HU.wall, env.phase), up = env.modality === 'rx';
      const hard = ['heart', 'aorta', 'inferior_vena_cava', 'liver', 'spleen', 'pulmonary_vein', ...A.vertebraKeys(), ...RIBS(A), 'sternum'];
      const hid = new Set(hard.filter(k => A.has(k)).map(k => A.id(k)));
      out.push({ t: 'tube', pts: [h.g, [h.g[0] + 10, h.gs[1], h.gs[2]]], r: 9, hu: 25, wall: { w: 3, hu: wallHu }, outside: hard, label: 'lesion' });
      out.push({ t: 'tube', pts: [c, h.p.tipo === 'para' ? [h.g[0] + 6, h.g[1], h.g[2] + 18] : h.g], r: Math.min(14, R * 0.55), hu: 25, wall: { w: 3, hu: wallHu }, outside: hard, label: 'lesion' });
      out.push({ t: 'cols', box: rbox([c[0] - rr[0] - 2, c[0] + rr[0] + 2, c[1] - rr[1] - 2, c[1] + rr[1] + 2, c[2] - rr[2] - 2, c[2] + rr[2] + 2]), fn: (z, y, x, cur) => {
        if (hid.has(cur.orig)) return null;
        const d = Math.hypot((z - c[0]) / rr[0], (y - c[1]) / rr[1], (x - c[2]) / rr[2]); if (d > 1) return null;
        if ((1 - d) * Math.min(...rr) < wall) return { hu: wallHu, mr: MR.soft };
        const air = up ? z < c[0] - rr[0] * 0.1 : y < c[1] - rr[1] * 0.05;
        return air ? { hu: -950, mr: MR.air } : { hu: 20, mr: MR.fluid };
      } });
      out.push(mark(c, 'Masa retrocardíaca con aire', 'Retrocardiac mass with air', { dx: 70, dy: -40 }));
      if (p.tipo === 'desl') out.push(mark([c[0] - rr[0] * 0.8, c[1], c[2]], 'UEG por encima del hiato', 'GOJ above the hiatus', { dx: 70, dy: -70, planes: ['sagittal', 'coronal'] }));
      return out;
    },
    readouts: (p, A) => [{ label: bi('Mecanismo', 'Mechanism'), value: p.tipo === 'desl' ? bi('Deslizamiento: la UEG y parte del estómago suben por el hiato (la mayoría)', 'Sliding: the GOJ and part of the stomach rise through the hiatus (most cases)') : bi('Paraesofágica: la UEG se queda en su sitio y sube el fundus', 'Paraoesophageal: the GOJ stays in place and the fundus rises') }, ...compRO(A, hiatal(A, p).c)],
    info: {
      where: bi('Mediastino medio, retrocardíaca, por encima del hiato esofágico.', 'Middle mediastinum, retrocardiac, above the oesophageal hiatus.'),
      see: bi('Alteración más frecuente del tracto digestivo superior. <b>Masa mediastínica media retrocardíaca, generalmente con densidad aire</b> en su interior. La mayoría son <b>por deslizamiento</b>: la unión esofagogástrica y parte del estómago ascienden a través del hiato.', 'Commonest abnormality of the upper GI tract. <b>Retrocardiac middle mediastinal mass, usually with air</b> inside. Most are <b>sliding</b>: the gastro-oesophageal junction and part of the stomach rise through the hiatus.'),
      technique: bi('Rx (PA y lateral) y TC.', 'Film (PA and lateral) and CT.'),
      differential: bi('Otras masas del medio (adenopatías, quistes): no tienen aire.', 'Other middle masses (nodes, cysts): no air.'),
      tip: bi('Cambia de TC a Rx: en el TC (decúbito) el aire queda delante; en la placa de pie, arriba, con nivel horizontal.', 'Switch from CT to film: on CT (supine) the air lies anteriorly; on the standing film, on top, with a horizontal level.'),
    },
    flags: [flag('ampliacion', 'La hernia paraesofágica no está en el temario (solo dice que la mayoría son por deslizamiento).', 'Paraoesophageal hernia is not in the syllabus (it only says most are sliding).'), flag('ampliacion', 'El estómago herniado se dibuja desde la unión esofagogástrica real; la placa simulada coloca el nivel como en bipedestación.', 'The herniated stomach is drawn from the real gastro-oesophageal junction; the simulated film places the level as when standing.')],
  },

  /* ===== posterior ===== */
  {
    id: 'neurogenico', group: 'post', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Tumor neurogénico', 'Neurogenic tumour'), short: bi('Neurogénico', 'Neurogenic'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2.4, at: (p, A) => neuro(A, p).c, examPlane: 'axial' },
    params: [
      { id: 'level', type: 'select', dropdown: true, label: bi('Nivel', 'Level'), options: LEVELS('T3', 'T10'), value: 'T6', recentre: true },
      { id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R' },
      { id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 7, step: 0.5, value: 4, unit: 'cm' },
      { id: 'foramen', type: 'toggle', label: bi('Entra en el agujero de conjunción (ampliación)', 'Enters the neural foramen (beyond the syllabus)'), value: false },
    ],
    techniques: [T.ctMed('best', 'Muestra que la masa está en el mediastino posterior y que es neurogénica (paravertebral, junto a la raíz).', 'Shows the mass is in the posterior mediastinum and neurogenic (paravertebral, by the root).', { default: true }), T.t2('ok', 'A veces hay que completar el estudio con RM (relación con el canal).', 'Sometimes MR completes the work-up (relation to the canal).'), T.rxLat('ok', 'En la lateral se proyecta sobre la columna.', 'On the lateral film it projects over the spine.')],
    examLevel: p => p.level,
    build: (p, A) => {
      const q = neuro(A, p), out = [{ t: 'blob', c: q.c, r: [q.r * 1.1, q.r * 0.9, q.r], hu: { sin: 35, arterial: 50, portal: 62, tardia: 60 }, texture: 6, edge: 0.7, irregular: 0.1, outside: ['spinal_cord', 'aorta', 'esophagus', 'autochthon_left', 'autochthon_right', ...A.vertebraKeys(), ...RIBS(A)], label: 'lesion', mr: { t1: 0.38, t2: 0.78, stir: 0.72 } }];
      if (p.foramen) out.push({ t: 'tube', pts: [q.c, q.fo], r: 4, hu: 55, outside: ['spinal_cord', ...A.vertebraKeys()], label: 'lesion', mr: { t1: 0.38, t2: 0.78, stir: 0.72 } });
      out.push(mark(q.c, 'Paravertebral: neurogénico', 'Paravertebral: neurogenic', { dx: p.side === 'R' ? -170 : 70, dy: -40 }));
      return out;
    },
    readouts: (p, A) => [{ label: bi('Nivel', 'Level'), value: p.level }, ...compRO(A, neuro(A, p).c)],
    info: {
      where: bi('Mediastino posterior, en el canal costovertebral, en relación con estructuras neurales (raíces, nervios intercostales).', 'Posterior mediastinum, in the costovertebral gutter, related to neural structures (roots, intercostal nerves).'),
      see: bi('Masas más frecuentes del mediastino posterior: redondeadas, bien delimitadas, paravertebrales.', 'Commonest masses of the posterior mediastinum: round, well defined, paravertebral.'),
      technique: bi('TC: localiza la masa en el mediastino posterior y muestra que es neurogénica; a veces se completa con RM.', 'CT: places the mass in the posterior mediastinum and shows it is neurogenic; sometimes MR completes it.'),
      differential: bi('El DD se hace con el <b>cáncer de pulmón</b>.', 'The differential is <b>lung cancer</b>.'),
    },
    flags: [flag('ampliacion', 'La forma redondeada y la extensión al agujero de conjunción («en reloj de arena») son ampliación; el temario dice que está en relación con estructuras neurales.', 'The round shape and the extension into the foramen ("dumbbell") go beyond the syllabus, which says it is related to neural structures.')],
  },
  {
    id: 'hematopoyesis', group: 'post', tag: 'ct-aprox',
    name: bi('Hematopoyesis extramedular', 'Extramedullary haematopoiesis'), short: bi('Hematopoyesis', 'Haematopoiesis'),
    view: { plane: 'coronal', window: 'mediastinum', zoom: 2, at: (p, A) => { const v = A.vertebra(VK('T9')); return [v.body.c[0], v.body.c[1] + 4, v.body.c[2]]; }, examPlane: 'axial' },
    params: [{ id: 'size', type: 'range', label: bi('Tamaño de las masas', 'Size of the masses'), min: 1.5, max: 4, step: 0.5, value: 2.5, unit: 'cm' }, { id: 'fat', type: 'toggle', label: bi('Con grasa (inactiva)', 'With fat (inactive)'), value: false }],
    techniques: [T.ctMed('best', 'Masas paravertebrales bilaterales, lobuladas, en la columna dorsal baja.', 'Bilateral, lobulated paravertebral masses in the lower thoracic spine.', { default: true }), T.t1('ok', 'Médula ósea activa: señal intermedia.', 'Active marrow: intermediate signal.')],
    compare: ['neurogenico'],
    build: (p, A) => {
      const out = [], r = p.size * 5, hard = ['spinal_cord', 'aorta', 'esophagus', 'inferior_vena_cava', 'autochthon_left', 'autochthon_right', ...A.vertebraKeys(), ...RIBS(A)];
      for (const l of ['T8', 'T9', 'T10', 'T11']) {
        const b = A.vertebra(VK(l)).body;
        for (const s of [-1, 1]) {
          const c = [b.c[0], b.c[1] + 5, s < 0 ? b.x0 - vox(A, r * 0.55) : b.x1 + vox(A, r * 0.55)];
          out.push({ t: 'blob', c, r: [r * 1.2, r * 0.6, r * 0.6], hu: 50, texture: 8, irregular: 0.3, edge: 0.8, core: p.fat ? { f: 0.55, hu: -60 } : undefined, outside: hard, label: 'lesion', mr: { t1: 0.45, t2: 0.5, stir: 0.45 } });
        }
      }
      const b = A.vertebra(VK('T9')).body; out.push(mark([b.c[0], b.c[1] + 5, b.x0 - vox(A, r * 0.6)], 'Masas paravertebrales bilaterales', 'Bilateral paravertebral masses', { dx: -200, dy: -30 }));
      return out;
    },
    readouts: (p, A) => { const b = A.vertebra(VK('T9')).body; return compRO(A, [b.c[0], b.c[1] + 5, b.x0 - 6]); },
    info: { where: bi('Mediastino posterior, paravertebral, bilateral.', 'Posterior mediastinum, paravertebral, bilateral.'), see: bi('Masas de tejido hematopoyético a ambos lados de la columna dorsal.', 'Masses of haematopoietic tissue on both sides of the thoracic spine.') },
    flags: [flag('ampliacion', 'El temario solo la nombra en el mediastino posterior; la imagen (bilateral, lobulada, en anemias crónicas) es la habitual.', 'The syllabus only names it in the posterior mediastinum; the picture (bilateral, lobulated, in chronic anaemias) is the usual one.')],
  },
  {
    id: 'patologia-vertebral', group: 'post', tag: 'ct-real',
    name: bi('Patología vertebral (masa paravertebral)', 'Vertebral disease (paravertebral mass)'), short: bi('Patología vertebral', 'Vertebral disease'),
    view: { plane: 'coronal', window: 'mediastinum', zoom: 2.2, at: (p, A) => { const b = A.vertebra(VK(p.level)).body; return [b.c[0], b.c[1], b.c[2]]; }, examPlane: 'axial' },
    params: [
      { id: 'level', type: 'select', dropdown: true, label: bi('Vértebra', 'Vertebra'), options: LEVELS('T5', 'T11'), value: 'T8', recentre: true },
      { id: 'causa', type: 'select', label: bi('Causa', 'Cause'), options: [opt('fx', 'Fractura (hematoma)', 'Fracture (haematoma)'), opt('inf', 'Infección (absceso)', 'Infection (abscess)'), opt('tum', 'Tumor (lítico)', 'Tumour (lytic)')], value: 'fx' },
    ],
    techniques: [T.ctMed('best', 'La TC enseña que la masa nace de la vértebra.', 'CT shows the mass arises from the vertebra.', { default: true, window: 'bone' }), T.rxPA('ok', 'Ensanchamiento de la línea paravertebral.', 'Widened paravertebral line.')],
    compare: ['neurogenico'],
    examLevel: p => p.level,
    build: (p, A, env) => {
      const v = A.vertebra(VK(p.level)), b = v.body, out = [], w = (b.x1 - b.x0) * A.sp[0], h = (b.z1 - b.z0) * A.sp[0];
      const hard = ['spinal_cord', 'aorta', 'esophagus', 'inferior_vena_cava', 'autochthon_left', 'autochthon_right', ...A.vertebraKeys(), ...RIBS(A)];
      if (p.causa === 'fx') out.push({ t: 'plane', s: v.key, p: b.c, n: [1, 0.2, 0.1], w: 1.8, jag: 2, hu: 60 });
      if (p.causa === 'tum') out.push({ t: 'fill', s: v.key, region: { c: b.c, r: [h * 0.35, (b.y1 - b.y0) * 0.5, w * 0.3] }, hu: 40, label: 'lesion' });
      const hu = p.causa === 'inf' ? 18 : p.causa === 'fx' ? 58 : pv(HU.tumour, env.phase);
      out.push({ t: 'blob', c: [b.c[0], b.c[1] + 3, b.c[2]], r: [h * 1.2, (b.y1 - b.y0) * 0.75, w / 2 + 9], hu, rim: p.causa === 'inf' ? { w: 2, hu: { sin: 35, arterial: 70, portal: 90, tardia: 80 } } : undefined, edge: 1, irregular: 0.2, outside: hard, label: 'lesion', mr: p.causa === 'inf' ? MR.fluid : MR.soft });
      out.push(mark([b.c[0], b.c[1], b.x0 - 4], 'Masa paravertebral fusiforme', 'Fusiform paravertebral mass', { dx: -190, dy: -30 }));
      return out;
    },
    readouts: (p, A) => { const b = A.vertebra(VK(p.level)).body; return compRO(A, [b.c[0], b.c[1] + 3, b.x0 - 4]); },
    info: { where: bi('Mediastino posterior: vértebras y espacio paravertebral.', 'Posterior mediastinum: vertebrae and paravertebral space.'), see: bi('Masa de partes blandas fusiforme alrededor de una vértebra alterada (hematoma, absceso o tumor).', 'Fusiform soft-tissue mass around an abnormal vertebra (haematoma, abscess or tumour).') },
    flags: [flag('ampliacion', 'El temario solo dice «patología vertebral»; las tres causas y su aspecto son ejemplos añadidos.', 'The syllabus only says "vertebral disease"; the three causes and their look are added examples.')],
  },
];

/* ---------------- geometry of the mediastinal entities ---------------- */
function ppCentre(A, size) {
  const ck = 'ppc'; let base = A.cache.get(ck);
  if (!base) { const z = A.s('heart').bbox[1] - 14, e = A.extreme('heart', 'right', z) || A.extreme('heart', 'right'); base = e; A.cache.set(ck, base); }
  const rv = size * 5 / A.sp[0]; return [base[0], base[1] - 3, Math.round(base[2] - rv - 1)];
}
function nodeSites(A) {
  if (A.cache.has('nodes')) return A.cache.get('nodes');
  const zc = CAR(A), L = aoLevels(A), tr = A.centroidAt('trachea', zc - 8) || { y: 107, x: 136 }, out = {};
  out.para = [zc - 8, Math.round(tr.y), Math.round(tr.x - 12)];
  const s = aoSlice(A, L.zSplit + 3); out.ap = s.asc && s.desc ? [L.zSplit + 3, Math.round((s.asc.cy + s.desc.cy) / 2), Math.round(Math.max(s.asc.cx, s.desc.cx) + 5)] : [L.zSplit + 3, 104, 160];
  const zs = zc + 10, br = A.centroidAt('trachea', zs), eso = A.centroidAt('esophagus', zs);
  out.sub = [zs, Math.round(Math.min(br ? br.y + 5 : 112, eso ? eso.y - 7 : 112)), Math.round(br ? br.x + 1 : 137)];
  const zh = zc + 14, eR = A.extreme('trachea', 'right', Math.min(zh, A.s('trachea').bbox[1])), eL = A.extreme('trachea', 'left', Math.min(zh, A.s('trachea').bbox[1]));
  out.hR = eR ? [zh, eR[1] - 3, eR[2] - 7] : [zh, 105, 118]; out.hL = eL ? [zh, eL[1] - 1, eL[2] + 7] : [zh, 110, 168];
  A.cache.set('nodes', out); return out;
}
function esoCyst(A, size) {
  const z = A.s('esophagus').bbox[1] - 26, e = A.centroidAt('esophagus', z) || { y: 112, x: 140 }, r = size * 5, rv = r / A.sp[0];
  return { c: [z, Math.round(e.y + 3), Math.round(e.x - rv * 0.9 - 4)], r: [r * 1.3, r * 0.8, r * 0.8] };
}
function goitre(A, p) {
  const tb = A.s('thyroid_gland').bbox, z0 = tb[1] - 4, tr = A.centroidAt('trachea', z0) || { y: 72, x: 136 }, sg = p.side === 'L' ? 1 : -1;
  const lobe = A.sliceVoxels('thyroid_gland', z0).filter(([, x]) => (x - tr.x) * sg > 0);
  const ly = lobe.length ? lobe.reduce((a, v) => a + v[0], 0) / lobe.length : tr.y - 4, lx = lobe.length ? lobe.reduce((a, v) => a + v[1], 0) / lobe.length : tr.x + sg * 14;
  const zEnd = Math.round(tb[1] + p.ext / A.sp[0]), zm = Math.round((z0 + zEnd) / 2), tm = A.centroidAt('trachea', zm) || tr, te = A.centroidAt('trachea', zEnd) || tm;
  const pts = p.via === 'anterior'
    ? [[z0, ly, lx], [zm, tm.y - 12, tm.x + sg * 7], [zEnd, te.y - 17, te.x + sg * 3]]
    : [[z0, ly, lx], [zm, tm.y + 1, tm.x + sg * 13], [zEnd, te.y + 6, te.x + sg * 11]];
  const R = 13 + p.ext / 10;
  return { pts: pts.map(q => q.map(Math.round)), rs: [R * 0.6, R * 0.9, R], zEnd, mid: pts[1].map(Math.round) };
}
function hiatal(A, p) {
  const g = A.extreme('esophagus', 'inferior'), R = p.size * 10 / 2, Rv = R / A.sp[0];
  const cz = Math.round(g[0] - Rv * 0.95), cx = Math.round(p.tipo === 'para' ? g[2] + Rv * 0.6 : g[2] + 2);
  const yH = scanY(A, ['heart'], cz, cx, true, 0, 140), yAo = scanY(A, ['aorta'], cz, cx, false, Math.max(0, yH), 175);
  const cy = Math.round(yH >= 0 && yAo > yH ? (yH + yAo) / 2 : g[1]);
  const st = A.centroidAt('stomach', Math.min(A.s('stomach').bbox[1], g[0] + 10)) || { y: g[1], x: g[2] + 20 };
  return { c: [cz, cy, cx], R, g, gs: [g[0] + 10, Math.round(st.y), Math.round(st.x)], p };
}
function neuro(A, p) {
  const v = A.vertebra(VK(p.level)), side = p.side, ped = v.ped[side] || v.body.c, r = p.size * 5, rv = r / A.sp[0];
  const c = [v.body.c[0], Math.round(ped[1] - 6), Math.round(side === 'R' ? v.body.x0 - rv * 0.75 : v.body.x1 + rv * 0.75)];
  return { c, r, fo: [v.body.z1 + 1, ped[1], ped[2] + (side === 'R' ? 2 : -2)] };
}
