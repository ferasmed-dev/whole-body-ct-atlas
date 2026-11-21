// «Mediastino y pleura» — pared torácica (osteofitos, prótesis mamaria, lipoma, tumores malignos, metástasis) y diafragma.
import { SIDE_LUNG, colsZ, diaCols, raiseBase, distOut, scanY, noise3, vox, idsOf, clamp, unionBox } from './geo.js';
import { rbox, bi, opt, mark, flag, pv, T, tq, HU, MR, SIDES, SIDES3, sidesOf } from './common.js';

const VK = l => 'vertebrae_' + l;
const RIBS = A => A.atlas.structures.map(s => s.key).filter(k => k.startsWith('rib_'));
/** Anterolateral corner of a vertebral body at its upper (top) or lower endplate, on one side. */
function corner(A, v, side, top) {
  const b = v.body; let best = null, bv = Infinity;
  for (const [k, zz] of v.cols) {
    const [y, x] = k.split(',').map(Number); if (y > b.c[1]) continue;
    const ze = top ? zz[0] : zz[1]; if (top ? ze > b.z0 + 3 : ze < b.z1 - 3) continue;
    const sc = side === 'R' ? x : -x; if (sc < bv) { bv = sc; best = [ze, y, x]; }
  }
  return best;
}
/** Most lateral point of a rib on its middle slice. */
function ribPt(A, key) {
  const ck = 'rib:' + key; if (A.cache.has(ck)) return A.cache.get(ck);
  const b = A.s(key).bbox, z = Math.round((b[0] + b[1]) / 2), right = key.includes('right');
  let best = null;
  for (let dz = 0; dz < 12 && !best; dz++) for (const zz of [z + dz, z - dz]) { const vs = A.sliceVoxels(key, zz); if (!vs.length) continue; const v = vs.reduce((a, q) => ((right ? q[1] < a[1] : q[1] > a[1]) ? q : a)); best = [zz, v[0], v[1]]; break; }
  A.cache.set(ck, best); return best;
}
const centreOf = (A, key, z) => { const c = A.centroidAt(key, z); return c ? [z, Math.round(c.y), Math.round(c.x)] : null; };
function metSites(A) {
  if (A.cache.has('mets')) return A.cache.get('mets');
  const s = [];
  for (const l of ['T4', 'T6', 'T7', 'T9', 'T11', 'L1']) { const v = A.vertebra(VK(l)); s.push([v.key, v.body.c]); }
  for (const r of ['rib_right_4', 'rib_left_6', 'rib_right_8', 'rib_left_9']) { const q = ribPt(A, r); if (q) s.push([r, q]); }
  const st = A.s('sternum').bbox, sc = centreOf(A, 'sternum', Math.round(st[0] + (st[1] - st[0]) * 0.35)); if (sc) s.push(['sternum', sc]);
  const sp = A.s('scapula_left').bbox, scp = centreOf(A, 'scapula_left', Math.round(sp[0] + (sp[1] - sp[0]) * 0.4)); if (scp) s.push(['scapula_left', scp]);
  const hu = A.s('humerus_right').bbox, hc = centreOf(A, 'humerus_right', hu[0] + 14); if (hc) s.push(['humerus_right', hc]);
  A.cache.set('mets', s); return s;
}
function dome(A, s) { return diaCols(A, s).dome; }
function implantGeom(A, side) {
  const z = A.s('heart').bbox[0] + 25, st = A.centroidAt('sternum', z) || { x: 147 }, x = Math.round(st.x + (side === 'R' ? -1 : 1) * vox(A, 52));
  const yR = scanY(A, [...RIBS(A), 'costal_cartilages'], z, x); return { c: [z, (yR > 0 ? yR : 50) - vox(A, 24), x], r: [vox(A, 40), vox(A, 15), vox(A, 48)] };
}

export const PARED = [
  {
    id: 'osteofitos', group: 'pared', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Osteofitos vertebrales', 'Vertebral osteophytes'), short: bi('Osteofitos', 'Osteophytes'),
    view: { plane: 'coronal', window: 'bone', zoom: 2, at: (p, A) => { const v = A.vertebra(VK(p.region === 'dorsal' ? 'T8' : 'L2')); return [v.body.z1, v.body.c[1], v.body.c[2]]; }, examPlane: 'coronal' },
    params: [{ id: 'region', type: 'select', label: bi('Región', 'Region'), options: [opt('dorsal', 'Dorsal', 'Thoracic'), opt('lumbar', 'Lumbar')], value: 'dorsal', recentre: true }, { id: 'sev', type: 'range', label: bi('Tamaño', 'Size'), min: 1, max: 3, step: 1, value: 2 }],
    techniques: [T.rxPA('best', 'Rx AP/PA: picos óseos en los márgenes laterales de los cuerpos.', 'AP/PA film: bony spurs at the lateral margins of the bodies.'), tq('ct', 'ct', 'ok', bi('TC (ventana de hueso)', 'CT (bone window)'), bi('Formaciones óseas anterolaterales.', 'Anterolateral bony outgrowths.'), { window: 'bone', default: true })],
    build: (p, A) => {
      const lv = p.region === 'dorsal' ? ['T6', 'T7', 'T8', 'T9', 'T10'] : ['L1', 'L2', 'L3', 'L4'], sides = p.region === 'dorsal' ? ['R'] : ['R', 'L'], out = [], s = p.sev;
      const outside = [...A.vertebraKeys(), 'aorta', 'esophagus', 'inferior_vena_cava', 'spinal_cord'];
      for (let i = 0; i < lv.length - 1; i++) {
        const v = A.vertebra(VK(lv[i])), w = A.vertebra(VK(lv[i + 1]));
        for (const sd of sides) {
          const k = sd === 'R' ? -1 : 1;
          for (const [vv, top] of [[v, false], [w, true]]) { const q = corner(A, vv, sd, top); if (q) out.push({ t: 'blob', c: [q[0] + (top ? -1 : 1), q[1], q[2] + k * (1 + s)], r: [1.5 + s * 1.3, 2 + s, 2 + s * 1.2], hu: 800, edge: 0.6, irregular: 0.3, outside, label: 'lesion', mr: MR.calc }); }
        }
      }
      const v = A.vertebra(VK(p.region === 'dorsal' ? 'T8' : 'L2')), q = corner(A, v, 'R', false); if (q) out.push(mark(q, p.region === 'dorsal' ? 'Osteofitos a la derecha' : 'Osteofitos bilaterales', p.region === 'dorsal' ? 'Osteophytes on the right' : 'Bilateral osteophytes', { dx: -180, dy: -30 }));
      return out;
    },
    readouts: p => [{ label: bi('Frecuencia', 'Frequency'), value: bi('60–80 % de los mayores de 50 años (fisiológico con la edad)', '60–80 % of people over 50 (physiological with age)') }, { label: bi('Distribución', 'Distribution'), value: p.region === 'dorsal' ? bi('Dorsales: predominio derecho (la pulsación aórtica impide que se formen a la izquierda)', 'Thoracic: right-sided (aortic pulsation prevents them on the left)') : bi('Lumbares: bilaterales', 'Lumbar: bilateral') }],
    info: {
      where: bi('Márgenes anterolaterales de los cuerpos vertebrales.', 'Anterolateral margins of the vertebral bodies.'),
      see: bi('Formaciones óseas vertebrales anterolaterales de origen degenerativo. <b>Lumbares: bilaterales.</b> <b>Dorsales: predominan en el lado derecho</b>, porque la pulsación de la aorta impide que se formen en el otro lado.', 'Degenerative anterolateral vertebral bony outgrowths. <b>Lumbar: bilateral.</b> <b>Thoracic: mainly right-sided</b>, because aortic pulsation prevents them on the other side.'),
      tip: bi('Busca la aorta descendente a la izquierda del cuerpo dorsal: ahí no crecen.', 'Find the descending aorta on the left of the thoracic body: they do not grow there.'),
    },
    flags: [flag('revisar', 'El resumen del temario pone «60 80 %»; lo más probable es que sea «60–80 %».', 'The syllabus summary reads "60 80 %"; most likely "60–80 %".')],
  },
  {
    id: 'protesis-mamaria', group: 'pared', tag: 'kit',
    kitNote: bi('Este paciente es un varón y no hay máscara de mama: haría falta un caso femenino y la máscara «breasts». La prótesis se dibuja delante del músculo pectoral estimado.', 'This patient is a man and there is no breast mask: a female case and the "breasts" mask would be needed. The implant is drawn in front of the estimated pectoral muscle.'),
    name: bi('Prótesis mamaria', 'Breast implant'), short: bi('Prótesis mamaria', 'Breast implant'),
    view: { plane: 'axial', window: 'soft', zoom: 1.4, at: (p, A) => { const g = implantGeom(A, p.side === 'L' ? 'L' : 'R'), z = g.c[0]; return p.side === 'both' ? [z, g.c[1] + 20, 147] : g.c.map(Math.round); }, examPlane: 'axial' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES3, value: 'both' }, { id: 'mast', type: 'toggle', label: bi('Con mastectomía (sin tejido mamario)', 'After mastectomy (no breast tissue)'), value: false }, { id: 'cont', type: 'select', label: bi('Contenido (ampliación)', 'Content (beyond the syllabus)'), options: [opt('sil', 'Silicona', 'Silicone'), opt('suero', 'Suero', 'Saline')], value: 'sil' }],
    techniques: [tq('ct', 'ct', 'ok', bi('TC (partes blandas)', 'CT (soft tissue)'), bi('Colección de líquido encapsulado en la mama.', 'Encapsulated fluid collection in the breast.'), { window: 'soft', default: true }), T.rxPA('ok', 'Densidad redondeada sobre el campo pulmonar.', 'Round density over the lung field.')],
    build: (p, A) => {
      const out = [], hu = p.cont === 'sil' ? 110 : 12;
      for (const s of sidesOf(p.side)) {
        const g = implantGeom(A, s), [c, r] = [g.c, g.r], rb = [r[0] * 1.25, r[1] * 2.4, r[2] * 1.2], cb = [c[0], c[1] - r[1] * 0.9, c[2]];
        const bone = idsOf(A, [...RIBS(A), 'costal_cartilages', 'sternum', ...SIDE_LUNG.R, ...SIDE_LUNG.L]);
        out.push({ t: 'cols', box: rbox([cb[0] - rb[0] - 1, cb[0] + rb[0] + 1, cb[1] - rb[1] - 1, c[1] + r[1] + 1, cb[2] - rb[2] - 1, cb[2] + rb[2] + 1]), fn: (z, y, x, cur) => {
          if (bone.has(cur.orig)) return null;
          const di = Math.hypot((z - c[0]) / r[0], (y - c[1]) / r[1], (x - c[2]) / r[2]);
          if (di <= 1) return (1 - di) * Math.min(...r) < 1 ? { hu: 70, mr: MR.soft } : { hu, mr: p.cont === 'sil' ? { t1: 0.3, t2: 0.85, stir: 0.8 } : MR.fluid };
          if (y > c[1]) return null;
          const db = Math.hypot((z - cb[0]) / rb[0], (y - cb[1]) / rb[1], (x - cb[2]) / rb[2]);
          if (db > 1) return null;
          if ((1 - db) * Math.min(...rb) < 1.2) return { hu: 30, label: 'keep' };
          return p.mast ? (cur.hu < -500 ? null : { hu: -90, label: 'keep' }) : { hu: noise3(z, y, x, 0.25, 6) > 0.1 ? 25 : -90, label: 'keep', mr: MR.soft };
        } });
      }
      const g = implantGeom(A, p.side === 'L' ? 'L' : 'R'); out.push(mark(g.c, 'Prótesis (líquido encapsulado)', 'Implant (encapsulated fluid)', { dx: 80, dy: -40 }));
      return out;
    },
    info: {
      where: bi('Mama, delante del músculo pectoral; uni o bilateral.', 'Breast, in front of the pectoral muscle; uni- or bilateral.'),
      see: bi('Colección de <b>líquido encapsulado</b> en la mama. Puede ser unilateral o bilateral, y puede ir asociada a mastectomía (sin tejido mamario) o no (con tejido mamario).', '<b>Encapsulated fluid</b> collection in the breast. Can be unilateral or bilateral, and may follow mastectomy (no breast tissue) or not (with breast tissue).'),
    },
    flags: [flag('ampliacion', 'La forma, la posición y la diferencia silicona/suero son aproximaciones; el temario solo la describe como líquido encapsulado.', 'The shape, position and the silicone/saline difference are approximations; the syllabus only describes encapsulated fluid.')],
  },
  {
    id: 'lipoma', group: 'pared', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Lipoma de la pared torácica', 'Chest-wall lipoma'), short: bi('Lipoma', 'Lipoma'),
    view: { plane: 'axial', window: 'soft', zoom: 2.4, at: (p, A) => lipC(A), examPlane: 'axial' },
    params: [{ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 2, max: 8, step: 0.5, value: 5, unit: 'cm' }],
    techniques: [tq('ct', 'ct', 'best', bi('TC (partes blandas)', 'CT (soft tissue)'), bi('Misma densidad que la grasa (≈ −100 UH): grasa madura intramuscular.', 'Same density as fat (≈ −100 HU): mature intramuscular fat.'), { window: 'soft', default: true }), T.t1('ok', 'Brillante en T1 como la grasa; se anula con STIR.', 'Bright on T1 like fat; suppressed on STIR.'), tq('stir', 'stir', 'ok', bi('RM STIR', 'STIR MR'), bi('La grasa se suprime: el lipoma queda oscuro.', 'Fat is suppressed: the lipoma goes dark.'))],
    build: (p, A) => { const c = lipC(A), r = p.size * 5; return [{ t: 'blob', c, r: [r * 1.3, r * 0.6, r * 0.8], hu: -100, rim: { w: 0.8, hu: -30 }, edge: 0.6, within: ['autochthon_right'], label: 'lesion', mr: MR.fat }, mark(c, 'Grasa encapsulada', 'Encapsulated fat', { dx: -170, dy: 30 })]; },
    readouts: () => [{ label: bi('Densidad', 'Density'), value: '≈ −100 UH' }],
    info: {
      where: bi('Pared torácica, dentro de un músculo (aquí, los paravertebrales).', 'Chest wall, inside a muscle (here, the paraspinals).'),
      see: bi('Tumor benigno más frecuente de la pared torácica. <b>Encapsulado</b>, <b>adapta su forma a las estructuras vecinas</b> y tiene la <b>misma densidad que la grasa</b>: se identifica fácilmente como grasa madura intramuscular.', 'Commonest benign chest-wall tumour. <b>Encapsulated</b>, <b>moulds to neighbouring structures</b> and has the <b>same density as fat</b>: easily identified as mature intramuscular fat.'),
      tip: bi('Pasa el cursor: mismas UH que la grasa subcutánea.', 'Hover: same HU as the subcutaneous fat.'),
    },
  },
  {
    id: 'tumor-pared', group: 'pared', tag: 'ct-real',
    name: bi('Tumor maligno de la pared (blástico / lítico / mieloma)', 'Malignant chest-wall tumour (blastic / lytic / myeloma)'), short: bi('Tumor maligno de pared', 'Malignant wall tumour'),
    view: { plane: 'axial', window: 'bone', zoom: 2.4, at: (p, A) => p.tipo === 'mieloma' ? A.vertebra(VK('T8')).body.c : ribPt(A, 'rib_right_7'), examPlane: 'axial' },
    params: [{ id: 'tipo', type: 'select', label: bi('Tipo de lesión', 'Lesion type'), options: [opt('blastica', 'Blástica', 'Blastic'), opt('litica', 'Lítica', 'Lytic'), opt('mieloma', 'Mieloma múltiple (líticas)', 'Multiple myeloma (lytic)')], value: 'litica', recentre: true }, { id: 'masa', type: 'toggle', label: bi('Masa de partes blandas', 'Soft-tissue mass'), value: true }],
    techniques: [tq('ct', 'ct', 'best', bi('TC (ventana de hueso)', 'CT (bone window)'), bi('Blástica: blanca; lítica: destrucción del hueso; la masa se ve en partes blandas.', 'Blastic: white; lytic: bone destruction; the mass shows on soft tissue.'), { window: 'bone', default: true }), T.rxPA('ok', 'Costilla destruida o esclerosa.', 'Destroyed or sclerotic rib.')],
    compare: ['metastasis'],
    build: (p, A, env) => {
      const out = [];
      if (p.tipo === 'mieloma') {
        const bones = [...['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].map(VK), 'rib_right_5', 'rib_left_6', 'rib_right_7', 'rib_left_8', 'rib_right_9', 'sternum'];
        bones.forEach((k, i) => { const q = k.startsWith('rib') ? ribPt(A, k) : k === 'sternum' ? centreOf(A, 'sternum', Math.round((A.s('sternum').bbox[0] + A.s('sternum').bbox[1]) / 2)) : A.vertebra(k).body.c; if (!q) return;
          for (let j = 0; j < (k.startsWith('vert') ? 3 : 1); j++) out.push({ t: 'blob', c: [q[0] + (j - 1) * 4, q[1] + ((i + j) % 3 - 1) * 3, q[2] + ((i * 2 + j) % 3 - 1) * 3], r: 3 + ((i + j) % 3), hu: 40, within: [k], edge: 0.3, label: 'lesion', mr: { t1: 0.2, t2: 0.75, stir: 0.8 } }); });
        out.push(mark(A.vertebra(VK('T8')).body.c, 'Lesiones líticas múltiples', 'Multiple lytic lesions', { dx: 80, dy: -40 }));
        return out;
      }
      const k = 'rib_right_7', q = ribPt(A, k), bl = p.tipo === 'blastica';
      out.push({ t: 'blob', c: q, r: [16, 9, 9], hu: bl ? 1300 : 40, within: [k], edge: 0.4, label: 'lesion', mr: bl ? MR.calc : { t1: 0.2, t2: 0.75, stir: 0.8 } });
      if (p.masa) out.push({ t: 'blob', c: [q[0], q[1], q[2] + 3], r: [24, 18, 16], hu: pv(HU.tumour, env.phase), irregular: 0.3, edge: 1, texture: 6, outside: [k, 'liver'], label: 'lesion', mr: MR.solid });
      out.push(mark(q, bl ? 'Blástica: hueso más denso' : p.masa ? 'Lítica + masa de partes blandas' : 'Lítica: destrucción ósea', bl ? 'Blastic: denser bone' : p.masa ? 'Lytic + soft-tissue mass' : 'Lytic: bone destruction', { dx: -190, dy: -40 }));
      return out;
    },
    readouts: p => [{ label: bi('En el hueso', 'In the bone'), value: p.tipo === 'blastica' ? bi('Formación de hueso (escleroso): mayor densidad', 'Bone formation (sclerotic): higher density') : bi('Destrucción del hueso: menor densidad', 'Bone destruction: lower density') }, { label: bi('Masa de partes blandas', 'Soft-tissue mass'), value: p.masa && p.tipo !== 'mieloma' ? bi('Sí: signo de malignidad', 'Yes: sign of malignancy') : bi('No', 'No') }],
    info: {
      where: bi('Costillas, esternón y columna de la pared torácica.', 'Ribs, sternum and spine of the chest wall.'),
      see: bi('Son las neoplasias más frecuentes de la pared torácica en adultos. A partir de los 40 años pueden ser <b>metástasis (blásticas o líticas)</b> o un <b>mieloma múltiple (líticas)</b>. <b>Blástica</b>: formación de hueso, se ve blanca. <b>Lítica</b>: destrucción del hueso, menor densidad; puede acompañarse de una <b>masa de partes blandas, signo de malignidad</b>.', 'The commonest chest-wall neoplasms in adults. After 40 they may be <b>metastases (blastic or lytic)</b> or <b>multiple myeloma (lytic)</b>. <b>Blastic</b>: bone formation, white. <b>Lytic</b>: bone destruction, lower density; may come with a <b>soft-tissue mass, a sign of malignancy</b>.'),
    },
  },
  {
    id: 'metastasis', group: 'pared', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Metástasis óseas de la pared torácica', 'Chest-wall bone metastases'), short: bi('Metástasis óseas', 'Bone metastases'),
    view: { plane: 'coronal', window: 'bone', zoom: 1.2, at: (p, A) => { const s = metSites(A).slice(0, p.n), m = [0, 1, 2].map(i => Math.round(s.reduce((a, q) => a + q[1][i], 0) / s.length)); return m; }, examPlane: 'coronal' },
    params: [{ id: 'tipo', type: 'select', label: bi('Tipo', 'Type'), options: [opt('blast', 'Blásticas', 'Blastic'), opt('lit', 'Líticas', 'Lytic'), opt('mix', 'Mixtas', 'Mixed')], value: 'mix' }, { id: 'n', type: 'range', label: bi('Número de lesiones', 'Number of lesions'), min: 3, max: 13, step: 1, value: 9 }],
    techniques: [tq('ct', 'ct', 'best', bi('TC (ventana de hueso)', 'CT (bone window)'), bi('Lesiones multicéntricas en el esqueleto axial.', 'Multicentric lesions in the axial skeleton.'), { window: 'bone', default: true }), T.rxPA('ok', 'Solo se ven cuando la destrucción o la esclerosis son grandes.', 'Only seen once destruction or sclerosis is large.'), T.t1('ok', 'RM T1: sustituyen la médula grasa (oscuras).', 'T1 MR: they replace fatty marrow (dark).')],
    compare: ['tumor-pared'],
    build: (p, A) => {
      const out = [];
      metSites(A).slice(0, p.n).forEach(([k, q], i) => { const bl = p.tipo === 'blast' || (p.tipo === 'mix' && i % 2 === 0), r = k.startsWith('vert') ? 9 : k.startsWith('rib') ? 6 : 8;
        out.push({ t: 'blob', c: q, r, hu: bl ? 1200 : 45, within: [k], irregular: 0.35, edge: 0.6, label: 'lesion', mr: bl ? MR.calc : { t1: 0.2, t2: 0.7, stir: 0.8 } }); });
      out.push(mark(A.vertebra(VK('T7')).body.c, 'Metástasis multicéntricas', 'Multicentric metastases', { dx: 80, dy: -40 }));
      return out;
    },
    readouts: () => [{ label: bi('Dónde predominan', 'Where they predominate'), value: bi('Esqueleto axial (más médula hematopoyética): columna, costillas, pelvis, cráneo, húmero y fémur proximales', 'Axial skeleton (more haematopoietic marrow): spine, ribs, pelvis, skull, proximal humerus and femur') }],
    info: {
      where: bi('Columna, costillas, pelvis, cráneo y extremos proximales de húmero y fémur.', 'Spine, ribs, pelvis, skull and proximal ends of humerus and femur.'),
      see: bi('Son las <b>lesiones óseas malignas más frecuentes</b> de la pared torácica. Suelen ser <b>multicéntricas</b> y predominan en el esqueleto axial, donde hay más médula hematopoyética.', 'The <b>commonest malignant bone lesions</b> of the chest wall. Usually <b>multicentric</b>, predominating in the axial skeleton, where there is more haematopoietic marrow.'),
    },
  },

  /* ===== diafragma ===== */
  {
    id: 'diafragma', group: 'dia', tag: 'ct-aprox',
    name: bi('Diafragma normal y pilares', 'Normal diaphragm and crura'), short: bi('Diafragma normal', 'Normal diaphragm'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.4, at: (p, A) => { const z = Math.round((A.vertebra(VK('T11')).body.z0 + A.vertebra(VK('L3')).body.z1) / 2) - 15, c = A.centroidAt('aorta', z); return [z, Math.round(c.y), Math.round(c.x)]; } },
    params: [],
    techniques: [tq('ct', 'ct', 'ok', bi('TC (coronal)', 'CT (coronal)'), bi('Las dos cúpulas y los pilares, que bajan por delante de las primeras lumbares.', 'Both domes and the crura, running down in front of the upper lumbar vertebrae.'), { window: 'soft', default: true }), T.rxPA('ok', 'El hemidiafragma derecho suele estar más alto.', 'The right hemidiaphragm is usually higher.')],
    build: (p, A) => {
      const z0 = A.vertebra(VK('T11')).body.z0, z1 = A.vertebra(VK('L3')).body.z1, b = A.s('aorta').bbox, out = [];
      out.push({ t: 'cols', box: rbox([z0, z1, b[2] - 12, b[3] + 8, b[4] - 22, b[5] + 22]), fn: (z, y, x, cur) => {
        if (cur.orig !== 0 || cur.hu < 20 || cur.hu > 120) return null; const c = A.centroidAt('aorta', z); if (!c || y < c.y - 14 || y > c.y + 8) return null;
        const d = distOut(A, 'aoD', ['aorta'], z)(y, x); return d >= 1 && d <= 7 ? { hu: cur.hu, label: 'lesion' } : null;
      } });
      const zm = A.vertebra(VK('L1')).body.c[0], c = A.centroidAt('aorta', zm); if (c) out.push(mark([zm, c.y, c.x - 9], 'Pilar derecho', 'Right crus', { dx: -150, dy: 30 }));
      out.push(mark(dome(A, 'R'), 'Cúpula derecha (más alta)', 'Right dome (higher)', { dx: -170, dy: -40, planes: ['coronal', 'sagittal'] }));
      out.push(mark(dome(A, 'L'), 'Cúpula izquierda', 'Left dome', { dx: 80, dy: -40, planes: ['coronal', 'sagittal'] }));
      return out;
    },
    readouts: (p, A) => { const r = dome(A, 'R'), l = dome(A, 'L'), d = (l[0] - r[0]) * A.sp[0]; return [{ label: bi('Cúpula derecha respecto a la izquierda', 'Right dome relative to the left'), value: bi(d >= 0 ? `${d.toFixed(0)} mm más alta` : `${(-d).toFixed(0)} mm más baja`, d >= 0 ? `${d.toFixed(0)} mm higher` : `${(-d).toFixed(0)} mm lower`) }, { label: bi('Pilares', 'Crura'), value: bi('Inserción más caudal hasta L3 (cara anterior de las 3 primeras lumbares)', 'Lowest insertion down to L3 (anterior surface of the first 3 lumbar vertebrae)') }]; },
    info: {
      where: bi('Separa tórax y abdomen; los pilares se insertan en la cara anterior de las tres primeras lumbares.', 'Separates thorax and abdomen; the crura insert on the anterior surface of the first three lumbar vertebrae.'),
      see: bi('El <b>hemidiafragma derecho suele estar más alto</b> que el izquierdo, por el hígado. La inserción más caudal de los pilares llega hasta la <b>3.ª vértebra lumbar</b>.', 'The <b>right hemidiaphragm is usually higher</b> than the left, because of the liver. The lowest insertion of the crura reaches the <b>3rd lumbar vertebra</b>.'),
      tip: bi('En los cortes axiales de L1–L2, los pilares abrazan la aorta por delante y a los lados.', 'On the axial slices at L1–L2, the crura wrap the aorta in front and at the sides.'),
    },
    exam: false,
    flags: [flag('ampliacion', 'El diafragma no está segmentado: las cúpulas salen de la base de los pulmones y los pilares se marcan en el tejido blando junto a la aorta.', 'The diaphragm is not segmented: the domes come from the lung bases and the crura are marked in the soft tissue beside the aorta.')],
  },
  {
    id: 'bochdalek', group: 'dia', tag: 'ct-aprox',
    name: bi('Hernia de Bochdalek', 'Bochdalek hernia'), short: bi('Bochdalek', 'Bochdalek'),
    view: { plane: 'sagittal', window: 'soft', zoom: 2.2, at: (p, A) => bochC(A, p.size), examPlane: 'sagittal' },
    params: [{ id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 2, max: 7, step: 0.5, value: 4, unit: 'cm' }],
    techniques: [tq('ct', 'ct', 'best', bi('TC (sagital / coronal)', 'CT (sagittal / coronal)'), bi('Grasa que sube por un defecto posterolateral del diafragma.', 'Fat rising through a posterolateral diaphragmatic defect.'), { window: 'soft', default: true }), T.rxLat('ok', 'Opacidad posterior en la base, sobre el diafragma.', 'Posterior basal opacity, over the diaphragm.')],
    compare: ['hernia-traumatica'],
    build: (p, A) => { const c = bochC(A, p.size), r = p.size * 5, out = [];
      const outside = [...RIBS(A), ...A.vertebraKeys(), 'spleen', 'kidney_left', 'aorta', 'autochthon_left', 'colon', 'stomach'];
      out.push({ t: 'blob', c, r: [r * 0.9, r, r * 0.8], hu: -90, edge: 0.8, irregular: 0.15, outside, label: 'lesion', mr: MR.fat });
      out.push({ t: 'tube', pts: [c, [c[0] + vox(A, r + 12), c[1] + 2, c[2]]], r: Math.max(5, r * 0.45), hu: -90, outside, label: 'lesion', mr: MR.fat });
      out.push(mark(c, 'Defecto posterolateral con grasa', 'Posterolateral defect with fat', { dx: 80, dy: -40 })); return out; },
    readouts: () => [{ label: bi('Tipo', 'Type'), value: bi('Congénita (la más frecuente de las congénitas)', 'Congenital (commonest congenital hernia)') }, { label: bi('Adulto / neonato', 'Adult / newborn'), value: bi('Adulto: pequeña, asintomática · neonato: si es grande, insuficiencia respiratoria', 'Adult: small, asymptomatic · newborn: if large, respiratory failure') }],
    info: {
      where: bi('Región posterolateral del diafragma (aquí, la izquierda).', 'Posterolateral diaphragm (here, the left).'),
      see: bi('La más frecuente de las congénitas. <b>Defecto en la región posterolateral.</b> Si es grande, causa insuficiencia respiratoria en el neonato; en adultos suele ser <b>pequeña y asintomática</b>.', 'Commonest congenital hernia. <b>Posterolateral defect.</b> If large, it causes respiratory failure in the newborn; in adults it is usually <b>small and asymptomatic</b>.'),
      differential: bi('Traumática: más a la izquierda, con discontinuidad del diafragma y vísceras o grasa.', 'Traumatic: more on the left, with a diaphragmatic gap and viscera or fat.'),
    },
    flags: [flag('ampliacion', 'El predominio izquierdo y el contenido graso del adulto son lo habitual; el temario dice solo «posterolateral».', 'Left-sided predominance and fatty content in adults are usual; the syllabus only says "posterolateral".')],
  },
  {
    id: 'hernia-traumatica', group: 'dia', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Hernia diafragmática traumática', 'Traumatic diaphragmatic hernia'), short: bi('Hernia traumática', 'Traumatic hernia'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.8, at: (p, A) => traumaC(A, p.size), examPlane: 'coronal' },
    params: [{ id: 'cont', type: 'select', label: bi('Contenido', 'Content'), options: [opt('visc', 'Vísceras (estómago)', 'Viscera (stomach)'), opt('grasa', 'Grasa', 'Fat')], value: 'visc' }, { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 4, max: 12, step: 1, value: 8, unit: 'cm' }],
    techniques: [tq('ct', 'ct', 'best', bi('TC (coronal / sagital)', 'CT (coronal / sagittal)'), bi('Vísceras o grasa por encima del diafragma, con discontinuidad de este.', 'Viscera or fat above the diaphragm, with a diaphragmatic gap.'), { window: 'soft', default: true }), T.rxPA('ok', 'Aire o asas en la base del hemitórax izquierdo; a veces pasa desapercibida.', 'Air or bowel at the left lung base; sometimes missed.')],
    compare: ['bochdalek', 'elevacion'],
    build: (p, A, env) => {
      const c = traumaC(A, p.size), Rv = vox(A, p.size * 5), st = A.extreme('stomach', 'superior'), out = [], visc = p.cont === 'visc', wall = pv(HU.wall, env.phase), up = env.modality === 'rx';
      const hard = idsOf(A, ['heart', 'spleen', 'aorta', 'liver', 'pulmonary_vein', ...RIBS(A), ...A.vertebraKeys()]), rr = [Rv * 0.8, Rv * 0.8, Rv];
      out.push({ t: 'tube', pts: [[st[0] + 6, st[1], st[2]], c], r: visc ? 9 : 7, hu: visc ? 25 : -90, wall: visc ? { w: 2.5, hu: wall } : undefined, outside: ['heart', 'spleen', 'aorta', 'liver'], label: 'lesion' });
      out.push({ t: 'cols', box: rbox([c[0] - rr[0] - 2, c[0] + rr[0] + 2, c[1] - rr[1] - 2, c[1] + rr[1] + 2, c[2] - rr[2] - 2, c[2] + rr[2] + 2]), fn: (z, y, x, cur) => {
        if (hard.has(cur.orig)) return null; const d = Math.hypot((z - c[0]) / rr[0], (y - c[1]) / rr[1], (x - c[2]) / rr[2]); if (d > 1) return null;
        if (!visc) return { hu: -90, mr: MR.fat };
        if ((1 - d) * Math.min(...rr) < vox(A, 3)) return { hu: wall, mr: MR.soft };
        return (up ? z < c[0] - rr[0] * 0.1 : y < c[1]) ? { hu: -950, mr: MR.air } : { hu: 20, mr: MR.fluid };
      } });
      out.push(mark([c[0] + rr[0], c[1], c[2]], 'Discontinuidad del diafragma', 'Diaphragmatic gap', { dx: 80, dy: 40, planes: ['coronal', 'sagittal'] }));
      out.push(mark(c, visc ? 'Estómago en el tórax' : 'Grasa en el tórax', visc ? 'Stomach in the chest' : 'Fat in the chest', { dx: 80, dy: -40 }));
      return out;
    },
    readouts: () => [{ label: bi('Lado más frecuente', 'Commonest side'), value: bi('Izquierdo', 'Left') }, { label: bi('Mecanismo', 'Mechanism'), value: bi('Traumatismo abierto o cerrado; a veces pasa desapercibida', 'Open or blunt trauma; sometimes missed') }],
    info: {
      where: bi('Hemidiafragma izquierdo (más frecuente).', 'Left hemidiaphragm (commonest).'),
      see: bi('Por traumatismo abierto o cerrado. <b>Más frecuente en el lado izquierdo.</b> A veces pasa desapercibida. Hay <b>herniación de vísceras o grasa</b> y <b>discontinuidad del diafragma</b>.', 'From open or blunt trauma. <b>Commoner on the left.</b> Sometimes missed. <b>Herniation of viscera or fat</b> and <b>discontinuity of the diaphragm</b>.'),
      differential: bi('Elevación diafragmática: el contorno es continuo. Bochdalek: congénita, posterolateral.', 'Diaphragmatic elevation: the outline is continuous. Bochdalek: congenital, posterolateral.'),
    },
    flags: [flag('ampliacion', 'El diafragma no está segmentado: el estómago se dibuja subiendo desde el fundus real por encima de la cúpula izquierda.', 'The diaphragm is not segmented: the stomach is drawn rising from the real fundus above the left dome.')],
  },
  {
    id: 'elevacion', group: 'dia', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Elevación diafragmática', 'Diaphragmatic elevation'), short: bi('Elevación', 'Elevation'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.4, at: (p, A) => { const d = dome(A, p.side); return [d[0] - Math.round(vox(A, p.h) * 0.5), d[1], d[2]]; }, examPlane: 'coronal' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'L', recentre: true }, { id: 'causa', type: 'select', label: bi('Causa', 'Cause'), options: [opt('paralisis', 'Parálisis frénica', 'Phrenic palsy'), opt('lobul', 'Lobulación', 'Lobulation')], value: 'paralisis' }, { id: 'h', type: 'range', label: bi('Elevación', 'Elevation'), min: 10, max: 60, step: 5, value: 40, unit: 'mm', examMin: 25 }],
    techniques: [T.rxPA('best', 'Cúpula más alta de lo normal (compárala con la otra).', 'Dome higher than normal (compare with the other).'), tq('ct', 'ct', 'ok', bi('TC (coronal)', 'CT (coronal)'), bi('El órgano subdiafragmático sube con la cúpula; el contorno es continuo.', 'The subdiaphragmatic organ rises with the dome; the outline is continuous.'), { window: 'soft', default: true })],
    compare: ['subpulmonar', 'hernia-traumatica'],
    build: (p, A) => {
      const d = dome(A, p.side), lobR = vox(A, 35), lat = p.causa === 'lobul' ? (z, y, x) => 1 - Math.hypot(y - (d[1] - vox(A, 20)), x - d[2]) / lobR : null;
      return [raiseBase(A, p.side, p.h, { label: 'lesion', lateral: lat }), mark([d[0] - vox(A, p.h) * 0.5, d[1], d[2]], p.causa === 'lobul' ? 'Lobulación' : 'Hemidiafragma elevado', p.causa === 'lobul' ? 'Lobulation' : 'Raised hemidiaphragm', { dx: 80, dy: -40 })];
    },
    readouts: p => [{ label: bi('Elevación simulada', 'Simulated elevation'), value: `${p.h} mm` }, { label: bi('Significado', 'Meaning'), value: p.causa === 'lobul' ? bi('Lobulación: sin significado patológico', 'Lobulation: no pathological meaning') : bi('Parálisis diafragmática por lesión del nervio frénico', 'Diaphragmatic palsy from phrenic nerve injury') }],
    info: {
      where: bi('Un hemidiafragma (todo o una parte).', 'One hemidiaphragm (all or part of it).'),
      see: bi('Puede indicar <b>parálisis diafragmática por lesión del nervio frénico</b>, o <b>lobulaciones</b> (sin significado patológico).', 'May mean <b>diaphragmatic palsy from phrenic nerve injury</b>, or <b>lobulations</b> (no pathological meaning).'),
      differential: bi('Derrame subpulmonar: simula una elevación. Recuerda que la derecha ya es normalmente más alta.', 'Subpulmonary effusion: mimics elevation. Remember the right is normally higher.'),
    },
  },
];

function lipC(A) { const z = A.vertebra(VK('T7')).body.c[0], c = A.centroidAt('autochthon_right', z); return [z, Math.round(c.y), Math.round(c.x)]; }
function bochC(A, size) {
  if (!A.cache.has('boch')) {
    const C = colsZ(A, 'lungL', SIDE_LUNG.L), b = unionBox(A, SIDE_LUNG.L); let best = null;
    for (let y = Math.round((b[2] + b[3]) / 2); y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) { const bt = C.bot(y, x); if (bt >= 0 && (!best || bt > best[0])) best = [bt, y, x]; }
    A.cache.set('boch', best);
  }
  const q = A.cache.get('boch'), rv = vox(A, size * 5); return [Math.round(q[0] - rv * 0.55), Math.round(q[1] - rv * 0.35), Math.round(q[2] - rv * 0.2)];
}
function traumaC(A, size) {
  const d = dome(A, 'L'), st = A.extreme('stomach', 'superior'), rv = vox(A, size * 5);
  return [Math.round(Math.min(d[0], st[0]) - rv * 0.75), Math.round(st[1] - 2), Math.round((st[2] + d[2]) / 2)];
}
