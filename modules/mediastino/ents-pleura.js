// «Mediastino y pleura» — pleura: cisuras, cisura de la ácigos, derrames, engrosamiento, asbesto, mesotelioma, neumotórax.
import { SIDE_LUNG, lungSlice, unionBox, region, fissure, surfacePoint, effusion, pneumo, lens, pleuralRind, raiseBase, shiftMediastinum, diaCols, aoLevels, noise3, vox, idsOf, clamp } from './geo.js';
import { rbox, bi, opt, tq, mark, flag, pv, T, HU, MR, SIDES, SIDES3, sidesOf } from './common.js';

const PLEU = HU.pleura, LB = (A, s) => unionBox(A, SIDE_LUNG[s]);
const lat = s => (s === 'R' ? -1 : 1);
/** A point inside the lung near its posterior base (for marks and view centres). */
function basePoint(A, s, hmm, depth = 0.5) {
  const b = LB(A, s), z = Math.round(b[1] - vox(A, hmm) * depth), r = lungSlice(A, s, z) || lungSlice(A, s, b[1] - 6);
  return [r ? r.z : z, r ? Math.round(r.y1 - 4) : b[3] - 4, r ? Math.round(r.cx) : (b[4] + b[5]) >> 1];
}
const midPoint = (A, s) => { const b = LB(A, s), z = Math.round((b[0] + b[1]) / 2), r = lungSlice(A, s, z); return [z, Math.round(r.cy), Math.round(r.cx)]; };
const FIS = {
  mayorD: A => fissure(A, ['lung_upper_lobe_right', 'lung_middle_lobe_right'], ['lung_lower_lobe_right'], 'RM'),
  menor: A => fissure(A, ['lung_upper_lobe_right'], ['lung_middle_lobe_right'], 'Rm'),
  mayorI: A => fissure(A, ['lung_upper_lobe_left'], ['lung_lower_lobe_left'], 'LM'),
};
function azy(A) {
  if (A.cache.has('azy')) return A.cache.get('azy');
  const k = 'lung_upper_lobe_right', b = A.s(k).bbox, zA = b[0] + 2, zB = Math.min(aoLevels(A).zTop + 6, b[1] - 4), xs = new Map();
  for (let z = zA; z <= zB; z++) {
    const r = region(A, 'rul', [k], z); if (!r) continue;
    const t = (z - zA) / Math.max(1, zB - zA), off = vox(A, 3 + 13 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) ** 0.7);
    xs.set(z, r.x1 - off);
  }
  const tr = A.centroidAt('trachea', zB) || { y: 108 }, rB = region(A, 'rul', [k], zB);
  const g = { zA, zB, xs, vein: [zB, Math.round(tr.y), Math.round((xs.get(zB) || (rB ? rB.x1 - 4 : 120)))], id: A.id(k) };
  A.cache.set('azy', g); return g;
}

/* ---------------- diagram: ultrasound of a loculated effusion ---------------- */
export function ecoDiagram(lang) {
  const t = lang === 'en' ? ['probe', 'chest wall', 'effusion (anechoic)', 'septa', 'lung', 'diaphragm', 'needle → larger cavity'] : ['sonda', 'pared torácica', 'derrame (anecoico)', 'tabiques', 'pulmón', 'diafragma', 'aguja → cavidad mayor'];
  return `<svg viewBox="0 0 320 180" class="dsvg" role="img" aria-label="${t[2]}">
  <path d="M60 30 L260 30 L300 170 L20 170 Z" class="db"/><rect x="130" y="14" width="60" height="14" rx="4" class="dh"/><text x="160" y="10" class="dt2">${t[0]}</text>
  <path d="M60 30 L260 30 L266 50 L54 50 Z" class="dd"/><text x="160" y="44" class="dt2">${t[1]}</text>
  <path d="M54 50 L266 50 L286 130 L34 130 Z" fill="#000" opacity="0.85"/><text x="110" y="95" class="dt2" fill="#fff">${t[2]}</text>
  <path d="M200 52 Q215 90 205 128 M240 52 Q236 90 248 128" class="dh" fill="none" stroke-width="2"/><text x="252" y="74" class="dt2">${t[3]}</text>
  <path d="M34 130 L286 130 L300 170 L20 170 Z" class="dd"/><text x="160" y="152" class="dt2">${t[4]} / ${t[5]}</text>
  <path d="M90 28 L130 100" class="dh" stroke-width="2" stroke-dasharray="5 3"/><text x="70" y="118" class="dt2">${t[6]}</text></svg>`;
}

/* ---------------- entities ---------------- */
export const PLEURA = [
  {
    id: 'cisuras', group: 'pleura', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Cisuras pulmonares', 'Pulmonary fissures'), short: bi('Cisuras', 'Fissures'),
    view: { plane: 'sagittal', window: 'lung', zoom: 1.8, at: (p, A) => { const f = FIS[p.cis === 'todas' ? 'mayorD' : p.cis](A); return f.c; } },
    params: [{ id: 'cis', type: 'select', label: bi('Cisura', 'Fissure'), options: [opt('mayorD', 'Mayor derecha', 'Right major'), opt('menor', 'Menor (derecha)', 'Minor (right)'), opt('mayorI', 'Mayor izquierda', 'Left major'), opt('todas', 'Todas', 'All')], value: 'mayorD', recentre: true }, { id: 'avasc', type: 'toggle', label: bi('Áreas avasculares junto a la cisura', 'Avascular areas next to the fissure'), value: true }],
    techniques: [T.ctLung('best', 'A veces se ven como líneas finas en ventana de pulmón, con áreas avasculares a su lado.', 'Sometimes seen as thin lines on the lung window, with avascular areas beside them.', { default: true }), T.rxLat('ok', 'La cisura mayor izquierda solo es visible en algunas Rx laterales.', 'The left major fissure is only visible on some lateral films.')],
    build: (p, A) => {
      const list = p.cis === 'todas' ? ['mayorD', 'menor', 'mayorI'] : [p.cis], out = [];
      for (const k of list) {
        const f = FIS[k](A); if (!f) continue;
        out.push({ t: 'cols', box: rbox([f.box[0] - 3, f.box[1] + 3, f.box[2] - 3, f.box[3] + 3, f.box[4], f.box[5]]), fn: (z, y, x, cur) => {
          if (f.has(z, y, x)) return { hu: -120, label: 'lesion' };
          if (!p.avasc || cur.hu < -860 || !cur.orig) return null;
          for (let d = 1; d <= 3; d++) if (f.has(z + d, y, x) || f.has(z - d, y, x) || f.has(z, y + d, x) || f.has(z, y - d, x)) return { hu: -870, label: 'keep' };
          return null;
        } });
        out.push(mark(f.c, { mayorD: 'Cisura mayor derecha', menor: 'Cisura menor', mayorI: 'Cisura mayor izquierda' }[k], { mayorD: 'Right major fissure', menor: 'Minor fissure', mayorI: 'Left major fissure' }[k], { dx: 70, dy: -40 }));
      }
      return out;
    },
    readouts: () => [{ label: bi('Pulmón izquierdo', 'Left lung'), value: bi('Una: la mayor (lóbulos superior e inferior)', 'One: the major (upper and lower lobes)') }, { label: bi('Pulmón derecho', 'Right lung'), value: bi('Dos: menor (superior / medio) y mayor (los dos anteriores / inferior)', 'Two: minor (upper / middle) and major (the two anterior / lower)') }],
    info: {
      where: bi('Reflexiones de la pleura visceral que separan los lóbulos.', 'Reflections of the visceral pleura separating the lobes.'),
      see: bi('La pleura tiene dos hojas: la <b>parietal</b> recubre por dentro la cavidad torácica, el mediastino y el diafragma; la <b>visceral</b> cubre el pulmón. El espacio pleural es virtual y no se ve. Las cisuras a veces se ven en ventana de pulmón, junto a áreas avasculares (regiones distales de los lóbulos, menos vascularizadas).', 'The pleura has two layers: the <b>parietal</b> lines the chest cavity, mediastinum and diaphragm; the <b>visceral</b> covers the lung. The pleural space is virtual and not seen. Fissures are sometimes seen on the lung window, next to avascular areas (distal lobar regions, less vascular).'),
      tip: bi('En el sagital derecho se ven a la vez la mayor y la menor.', 'On the right sagittal both the major and minor fissures show.'),
    },
    exam: false,
    flags: [flag('apuntes', 'Las cisuras salen de las máscaras de los lóbulos de este paciente (límite entre lóbulos).', 'The fissures come from this patient\'s lobe masks (boundary between lobes).')],
  },
  {
    id: 'acigos', group: 'pleura', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Cisura de la ácigos', 'Azygos fissure'), short: bi('Cisura de la ácigos', 'Azygos fissure'),
    view: { plane: 'coronal', window: 'lung', zoom: 2.2, at: (p, A) => { const g = azy(A), z = Math.round((g.zA + g.zB) / 2); return [z, g.vein[1], Math.round(g.xs.get(z) || g.vein[2])]; } },
    params: [],
    techniques: [T.rxPA('best', 'Línea fina de convexidad externa en el vértice derecho, con la ácigos en su extremo inferior.', 'Thin, laterally convex line at the right apex, with the azygos at its lower end.'), T.ctLung('ok', 'Línea curva en el lóbulo superior derecho y la vena ácigos más lateral de lo normal.', 'Curved line in the right upper lobe and the azygos vein more lateral than usual.', { default: true })],
    build: (p, A, env) => {
      const g = azy(A), b = A.s('lung_upper_lobe_right').bbox;
      return [{ t: 'cols', box: rbox([g.zA, g.zB, b[2], b[3], b[4], b[5]]), fn: (z, y, x, cur) => { if (cur.orig !== g.id) return null; const xs = g.xs.get(z); return xs !== undefined && Math.abs(x - xs) < 0.8 ? { hu: 60, label: 'lesion' } : null; } },
        { t: 'blob', c: g.vein, r: [6, 5, 5], hu: pv({ sin: 40, arterial: 90, portal: 150, tardia: 125 }, env.phase), edge: 0.5, label: 'lesion' },
        mark([Math.round((g.zA + g.zB) / 2), g.vein[1], g.xs.get(Math.round((g.zA + g.zB) / 2)) || g.vein[2]], 'Cisura de la ácigos', 'Azygos fissure', { dx: -170, dy: -40 }), mark(g.vein, 'Vena ácigos', 'Azygos vein', { dx: -150, dy: 30 })];
    },
    info: {
      where: bi('Lóbulo superior derecho: engloba una parte (el lóbulo accesorio) entre el mediastino y el ápex.', 'Right upper lobe: encloses a part (the accessory lobe) between the mediastinum and the apex.'),
      see: bi('Variante anatómica frecuente sin trascendencia clínica. En la Rx, <b>línea fina de convexidad externa</b> formada por <b>4 hojas pleurales</b> (2 viscerales y 2 parietales). En su porción inferior contiene la <b>vena ácigos</b>.', 'Common anatomical variant of no clinical significance. On the film, a <b>thin, laterally convex line</b> made of <b>4 pleural layers</b> (2 visceral and 2 parietal). Its lower end contains the <b>azygos vein</b>.'),
      tip: bi('Cambia a Rx PA: la línea curva baja desde el vértice hasta la «lágrima» de la ácigos.', 'Switch to the PA film: the curved line runs down from the apex to the azygos "teardrop".'),
    },
    exam: false,
    flags: [flag('ampliacion', 'Ni la ácigos ni la pleura están segmentadas: la cisura y la vena se dibujan en el lóbulo superior derecho real.', 'Neither the azygos nor the pleura are segmented: the fissure and the vein are drawn in the real right upper lobe.')],
  },
  {
    id: 'derrame-libre', group: 'pleura', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Derrame pleural libre', 'Free pleural effusion'), short: bi('Derrame libre', 'Free effusion'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.5, at: (p, A) => { const q = basePoint(A, p.side === 'L' ? 'L' : 'R', p.h, 0.35); if (p.side === 'both') { const c = A.cordAt(q[0]); q[2] = c ? Math.round(c.xc) : 137; } return q; }, examPlane: 'axial' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES3, value: 'R', recentre: true }, { id: 'h', type: 'range', label: bi('Altura del líquido', 'Height of the fluid'), min: 10, max: 120, step: 10, value: 50, unit: 'mm', examMin: 40 }],
    techniques: [
      T.rxPA('ok', 'De pie: opacidad basal con borde superior cóncavo (menisco). Poco sensible para pequeñas cantidades.', 'Standing: basal opacity with a concave upper border (meniscus). Insensitive to small amounts.'),
      T.rxLat('best', 'La Rx lateral es más sensible que la PA para pequeñas cantidades (seno costofrénico posterior).', 'The lateral film is more sensitive than the PA for small amounts (posterior costophrenic recess).'),
      T.ctMed('ok', 'En decúbito el líquido se va a la parte posterior (declive).', 'Supine, the fluid layers posteriorly (dependent).', { default: true }),
    ],
    compare: ['empiema', 'subpulmonar'],
    build: (p, A, env) => {
      const mode = env.modality === 'rx' ? 'upright' : 'supine', out = [];
      for (const s of sidesOf(p.side)) out.push(effusion(A, s, { h: p.h, mode, d: Math.min(60, 8 + p.h * 0.6) }));
      out.push(mark(basePoint(A, p.side === 'L' ? 'L' : 'R', p.h, 0.35), mode === 'upright' ? 'Menisco' : 'Líquido en declive', mode === 'upright' ? 'Meniscus' : 'Dependent fluid', { dx: p.side === 'L' ? 80 : -170, dy: -40 }));
      return out;
    },
    readouts: p => [{ label: bi('Altura del líquido', 'Fluid height'), value: `${p.h} mm` }, { label: bi('Sensibilidad para poco líquido', 'Sensitivity for small amounts'), value: bi('Ecografía > Rx lateral > Rx PA', 'Ultrasound > lateral film > PA film') }],
    info: {
      where: bi('Cavidad pleural; el líquido se moviliza libremente y se acumula en la zona declive.', 'Pleural cavity; the fluid moves freely and collects in the dependent part.'),
      see: bi('De pie: <b>opacidad basal con borde superior cóncavo (menisco)</b>. En la TC en decúbito, semiluna posterior. La <b>Rx lateral es más sensible que la PA</b> para pequeñas cantidades, y la ecografía más que la Rx.', 'Standing: <b>basal opacity with a concave upper border (meniscus)</b>. On supine CT, a posterior crescent. The <b>lateral film is more sensitive than the PA</b> for small amounts, and ultrasound more than film.'),
      technique: bi('Ecografía: más sensible para pequeñas cantidades, sobre todo si está loculado, y guía la punción.', 'Ultrasound: more sensitive for small amounts, especially if loculated, and guides the tap.'),
      differential: bi('Empiema: lenticular, con las dos pleuras engrosadas y realzadas. Subpulmonar: simula elevación del diafragma.', 'Empyema: lenticular, with both pleural layers thickened and enhancing. Subpulmonary: mimics a raised diaphragm.'),
      tip: bi('Baja la altura a 20 mm y compara la Rx PA con la lateral.', 'Lower the height to 20 mm and compare the PA with the lateral film.'),
    },
    flags: [flag('ampliacion', 'La placa simulada redistribuye el líquido como en bipedestación; el TC es en decúbito, como el estudio real.', 'The simulated film redistributes the fluid as when standing; the CT is supine, like the real study.')],
  },
  {
    id: 'subpulmonar', group: 'pleura', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Derrame subpulmonar', 'Subpulmonary effusion'), short: bi('Subpulmonar', 'Subpulmonary'),
    view: { plane: 'coronal', window: 'mediastinum', zoom: 1.6, at: (p, A) => { const d = diaCols(A, p.side).dome; return [d[0] + 4, d[1], d[2]]; }, examPlane: 'coronal' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'd', type: 'range', label: bi('Grosor de la capa', 'Layer thickness'), min: 10, max: 40, step: 5, value: 25, unit: 'mm' }],
    techniques: [T.rxPA('ok', 'Simula una elevación del diafragma (más difícil de ver): la cúpula parece más alta y lateralizada.', 'Mimics a raised diaphragm (harder to see): the dome looks higher and more lateral.'), T.ctMed('best', 'El líquido está entre la base del pulmón y el diafragma.', 'The fluid lies between the lung base and the diaphragm.', { default: true })],
    compare: ['derrame-libre', 'elevacion'],
    build: (p, A) => { const d = diaCols(A, p.side).dome; return [effusion(A, p.side, { mode: 'subpulm', d: p.d }), mark([d[0] + 4, d[1], d[2]], 'Líquido bajo el pulmón', 'Fluid under the lung', { dx: 80, dy: -40 })]; },
    info: {
      where: bi('Entre la base pulmonar y el diafragma.', 'Between the lung base and the diaphragm.'),
      see: bi('Derrame libre que a veces es subpulmonar y <b>simula una elevación del diafragma</b>; es más difícil de ver.', 'Free effusion that is sometimes subpulmonary and <b>mimics a raised diaphragm</b>; harder to see.'),
      differential: bi('Elevación diafragmática real (parálisis frénica, lobulación).', 'True diaphragmatic elevation (phrenic palsy, lobulation).'),
    },
  },
  {
    id: 'encapsulado', group: 'pleura', tag: 'ct-real',
    name: bi('Derrame encapsulado (loculado)', 'Encapsulated (loculated) effusion'), short: bi('Derrame encapsulado', 'Loculated effusion'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => locSeed(A, p), examPlane: 'axial' },
    params: [{ id: 'sitio', type: 'select', label: bi('Localización', 'Site'), options: [opt('perif', 'Periférico', 'Peripheral'), opt('apical', 'Apical (ampliación)', 'Apical (beyond the syllabus)'), opt('seno', 'Seno costofrénico (ampliación)', 'Costophrenic recess (beyond the syllabus)')], value: 'perif', recentre: true }, { id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 3, max: 10, step: 1, value: 6, unit: 'cm' }],
    techniques: [T.ctMed('best', 'Contorno convexo hacia el pulmón; no cambia con la postura.', 'Contour convex towards the lung; does not change with posture.', { default: true }), T.rxPA('ok', 'Simula una masa pleural o extrapleural.', 'Mimics a pleural or extrapleural mass.')],
    compare: ['derrame-libre', 'tumor-fantasma'],
    build: (p, A) => { const s = locSeed(A, p); return [lens(A, p.side, s, p.size * 5, p.size * 2.2, { core: 12, mr: MR.fluid, label: 'lesion' }), mark(s, 'Convexo hacia el pulmón', 'Convex towards the lung', { dx: p.side === 'R' ? -170 : 80, dy: -40 })]; },
    readouts: () => [{ label: bi('Causas de las adherencias', 'Causes of the adhesions'), value: bi('Tumores, neumonías bacterianas, TBC, asbestosis…', 'Tumours, bacterial pneumonia, TB, asbestosis…') }],
    info: {
      where: bi('Bolsa de pleura adherida en la periferia del hemitórax.', 'Pocket of adherent pleura at the periphery of the hemithorax.'),
      see: bi('Líquido rodeado de pleura adherida que forma una bolsa y <b>no se moviliza</b> (loculación). Periférico: <b>contorno convexo hacia el pulmón</b>; <b>simula masas pleurales o extrapleurales</b>.', 'Fluid surrounded by adherent pleura, forming a pocket that <b>does not move</b> (loculation). Peripheral: <b>contour convex towards the lung</b>; <b>mimics pleural or extrapleural masses</b>.'),
      technique: bi('La ecografía es la técnica que mejor ve los tabiques y guía la punción a la cavidad mayor.', 'Ultrasound best shows the septa and guides the tap into the largest cavity.'),
      differential: bi('Libre: menisco y cambia con la postura. Cisural: «tumor fantasma».', 'Free: meniscus and shifts with posture. Fissural: "phantom tumour".'),
    },
    flags: [flag('ampliacion', 'El temario describe el encapsulado periférico y el cisural; las localizaciones apical y del seno costofrénico se añaden como ejemplo.', 'The syllabus describes peripheral and fissural loculation; the apical and costophrenic sites are added as examples.')],
  },
  {
    id: 'tumor-fantasma', group: 'pleura', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Derrame cisural («tumor fantasma»)', 'Fissural effusion ("phantom tumour")'), short: bi('Tumor fantasma', 'Phantom tumour'),
    view: { plane: 'sagittal', window: 'lung', zoom: 2, at: (p, A) => FIS.menor(A).c, examPlane: 'sagittal' },
    params: [{ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min: 3, max: 8, step: 0.5, value: 5, unit: 'cm' }, { id: 'diur', type: 'range', label: bi('Tras diuréticos', 'After diuretics'), min: 0, max: 100, step: 25, value: 0, unit: '%' }],
    techniques: [T.rxPA('best', 'Opacidad redondeada o lenticular en la cisura menor, muy bien delimitada.', 'Round or lenticular opacity in the minor fissure, very well defined.'), T.rxLat('ok', 'En la lateral se ve la forma de lente a lo largo de la cisura.', 'On the lateral film the lens shape along the fissure shows.'), T.ctLung('ok', 'Líquido dentro de la cisura menor.', 'Fluid inside the minor fissure.', { default: true })],
    compare: ['encapsulado'],
    build: (p, A) => {
      const f = FIS.menor(A), k = 1 - 0.85 * p.diur / 100, Rv = vox(A, p.size * 5 * k), Tv = Rv * 0.32, ids = idsOf(A, SIDE_LUNG.R), c = f.c;
      return [{ t: 'cols', box: rbox([c[0] - Rv - 6, c[0] + Rv + 6, c[1] - Rv - 1, c[1] + Rv + 1, c[2] - Rv * 1.2 - 1, c[2] + Rv * 1.2 + 1]), fn: (z, y, x, cur) => {
        if (!ids.has(cur.orig)) return null; const rho = Math.hypot((y - c[1]) / Rv, (x - c[2]) / (Rv * 1.2)); if (rho > 1) return null;
        const zf = f.colZ(y, x) ?? c[0]; return Math.abs(z - zf) <= Tv * Math.sqrt(1 - rho * rho) + 0.5 ? { hu: 12, mr: MR.fluid } : null;
      } }, mark(c, p.diur ? 'Desaparece con diuréticos' : 'Lente en la cisura menor', p.diur ? 'Vanishes with diuretics' : 'Lens in the minor fissure', { dx: 80, dy: -40 })];
    },
    readouts: p => [{ label: bi('Tamaño actual', 'Current size'), value: `${(p.size * (1 - 0.85 * p.diur / 100)).toFixed(1)} cm` }, { label: bi('Comportamiento', 'Behaviour'), value: bi('Desaparece rápido con diuréticos («evanescente»)', 'Disappears quickly with diuretics ("vanishing")') }],
    info: {
      where: bi('Dentro de una cisura (aquí la menor, derecha).', 'Inside a fissure (here the right minor fissure).'),
      see: bi('Derrame encapsulado cisural: <b>opacidad redondeada o lenticular en la cisura, muy bien delimitada</b>: el «tumor fantasma» o «evanescente», que <b>desaparece rápido con diuréticos</b>.', 'Fissural loculated effusion: <b>round or lenticular opacity in the fissure, very well defined</b>: the "phantom" or "vanishing" tumour, which <b>disappears quickly with diuretics</b>.'),
      tip: bi('Sube el control de diuréticos y mira cómo se reduce la «masa» en la Rx PA.', 'Raise the diuretics control and watch the "mass" shrink on the PA film.'),
    },
  },
  {
    id: 'empiema', group: 'pleura', tag: 'ct-real',
    name: bi('Empiema', 'Empyema'), short: bi('Empiema', 'Empyema'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.8, at: (p, A) => empSeed(A, p.side), examPlane: 'axial' },
    contrast: true,
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 5, max: 12, step: 1, value: 9, unit: 'cm' }],
    techniques: [T.ctMed('best', 'Con contraste: engrosamiento liso de las pleuras parietal y visceral, que realzan, alrededor de una colección lenticular.', 'With contrast: smooth thickening of the parietal and visceral pleura, enhancing, around a lenticular collection.', { default: true }), T.rxPA('ok', 'Opacidad pleural que no se comporta como un derrame libre.', 'Pleural opacity that does not behave like a free effusion.')],
    compare: ['derrame-libre', 'hemotorax'],
    build: (p, A, env) => { const s = empSeed(A, p.side); return [lens(A, p.side, s, p.size * 5, p.size * 2.6, { core: 16, rim: pv(PLEU, env.phase), rimW: 2.6, mr: MR.fluid, label: 'lesion' }), mark(s, 'Pleuras engrosadas que realzan', 'Thickened enhancing pleura', { dx: p.side === 'R' ? -180 : 80, dy: 40 })]; },
    readouts: (p, A, env) => [{ label: bi('Pleura / contenido (esta fase)', 'Pleura / content (this phase)'), value: `${pv(PLEU, env.phase)} / 16 UH` }, { label: bi('Contenido', 'Content'), value: bi('Pus: loculación infectada', 'Pus: infected loculation') }],
    info: {
      where: bi('Cavidad pleural, loculado.', 'Pleural cavity, loculated.'),
      see: bi('El líquido es <b>pus</b>, una loculación infectada. Se ve un <b>engrosamiento liso de las pleuras parietal y visceral, con realce</b>.', 'The fluid is <b>pus</b>, an infected loculation. <b>Smooth thickening of the parietal and visceral pleura, with enhancement</b>.'),
      differential: bi('Derrame libre: semiluna en declive, sin pleuras engrosadas.', 'Free effusion: dependent crescent, no thickened pleura.'),
      tip: bi('Alterna sin / con contraste: las dos hojas solo se separan del líquido con contraste.', 'Toggle unenhanced / contrast: both layers only stand out from the fluid with contrast.'),
    },
    flags: [flag('ampliacion', 'La forma lenticular de la colección es la habitual del empiema; el temario describe el engrosamiento liso con realce.', 'The lenticular shape is the usual one of empyema; the syllabus describes the smooth enhancing thickening.')],
  },
  {
    id: 'hemotorax', group: 'pleura', tag: 'ct-real',
    name: bi('Hemotórax', 'Haemothorax'), short: bi('Hemotórax', 'Haemothorax'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.5, at: (p, A) => basePoint(A, p.side, p.h, 0.35), examPlane: 'axial' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'h', type: 'range', label: bi('Altura', 'Height'), min: 20, max: 100, step: 10, value: 60, unit: 'mm' }, { id: 'nivel', type: 'toggle', label: bi('Nivel hematocrito (sangre en reposo)', 'Haematocrit level (settled blood)'), value: true }],
    techniques: [tq('ct-sin', 'ct', 'best', bi('TC sin contraste', 'Unenhanced CT'), bi('Líquido más denso que un derrame simple.', 'Fluid denser than a simple effusion.'), { window: 'mediastinum', phase: 'sin', default: true }), T.rxPA('ok', 'Igual que un derrame: no distingue sangre de agua.', 'Same as an effusion: cannot tell blood from water.')],
    compare: ['derrame-libre', 'empiema'],
    build: (p, A, env) => [effusion(A, p.side, { h: p.h, d: 8 + p.h * 0.6, hu: 45, huDeep: p.nivel ? 72 : undefined, mode: env.modality === 'rx' ? 'upright' : 'supine', mr: MR.blood }), mark(basePoint(A, p.side, p.h, 0.35), 'Sangre (más densa)', 'Blood (denser)', { dx: p.side === 'R' ? -170 : 80, dy: -40 })],
    readouts: p => [{ label: bi('Densidad', 'Density'), value: p.nivel ? '45 / 72 UH' : '45 UH' }, { label: bi('Derrame simple (comparación)', 'Simple effusion (comparison)'), value: '≈ 10 UH' }],
    info: { where: bi('Cavidad pleural.', 'Pleural cavity.'), see: bi('El líquido es <b>sangre</b>: más denso que un derrame simple; en reposo puede verse una capa más densa en declive.', 'The fluid is <b>blood</b>: denser than a simple effusion; when settled a denser dependent layer may show.'), differential: bi('Derrame simple ≈ agua; empiema: pleuras que realzan.', 'Simple effusion ≈ water; empyema: enhancing pleura.') },
    flags: [flag('ampliacion', 'El temario solo dice que el líquido es sangre; las UH y el nivel hematocrito son valores habituales añadidos.', 'The syllabus only says the fluid is blood; the HU and the haematocrit level are usual values added here.')],
  },
  {
    id: 'derrame-maligno', group: 'pleura', tag: 'ct-real',
    name: bi('Derrame pleural maligno', 'Malignant pleural effusion'), short: bi('Derrame maligno', 'Malignant effusion'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.4, at: (p, A) => { const z = Math.round(LB(A, 'R')[1] - vox(A, 40)), c = A.cordAt(z); return [z, 100, c ? Math.round(c.xc) : 137]; }, examPlane: 'axial' },
    contrast: true,
    params: [{ id: 'prim', type: 'select', label: bi('Tumor primario', 'Primary tumour'), options: [opt('pulmon', 'Pulmón', 'Lung'), opt('mama', 'Mama', 'Breast'), opt('linfoma', 'Linfoma', 'Lymphoma'), opt('ovario', 'Ovario', 'Ovary')], value: 'pulmon' }, { id: 'h', type: 'range', label: bi('Altura del derrame', 'Effusion height'), min: 20, max: 90, step: 10, value: 50, unit: 'mm' }],
    techniques: [T.ctMed('best', 'Masas en la superficie pleural que captan contraste, o engrosamiento pleural nodular; habitualmente bilateral.', 'Enhancing masses on the pleural surface, or nodular pleural thickening; usually bilateral.', { default: true }), T.rxPA('ok', 'Derrame bilateral; no muestra los nódulos.', 'Bilateral effusion; does not show the nodules.')],
    compare: ['mesotelioma'],
    build: (p, A, env) => {
      const out = [], hu = pv(PLEU, env.phase);
      for (const s of ['R', 'L']) {
        out.push(effusion(A, s, { h: p.h, d: 8 + p.h * 0.5, mode: env.modality === 'rx' ? 'upright' : 'supine' }));
        const b = LB(A, s);
        out.push(pleuralRind(A, s, { zr: [b[0] + 20, b[1]], hu, label: 'lesion', t: (z, y, x) => { const n = noise3(z, y, x, 0.1, s === 'R' ? 13 : 17); return n > 0.2 ? vox(A, 3 + 14 * (n - 0.2)) : 0; } }));
      }
      const z = Math.round(LB(A, 'R')[1] - vox(A, 40)), q = surfacePoint(A, 'R', z, [0.3, -1]); if (q) out.push(mark(q, 'Nódulos pleurales que captan', 'Enhancing pleural nodules', { dx: -180, dy: -40 }));
      return out;
    },
    readouts: p => [{ label: bi('Causa más frecuente', 'Commonest cause'), value: bi('Metástasis: pulmón > mama > linfoma > ovario', 'Metastases: lung > breast > lymphoma > ovary') }, { label: bi('Este caso', 'This case'), value: { pulmon: bi('Pulmón (1.º)', 'Lung (1st)'), mama: bi('Mama (2.º)', 'Breast (2nd)'), linfoma: bi('Linfoma (3.º)', 'Lymphoma (3rd)'), ovario: bi('Ovario (4.º)', 'Ovary (4th)') }[p.prim] }],
    info: {
      where: bi('Habitualmente bilateral, libre o multiloculado.', 'Usually bilateral, free or multiloculated.'),
      see: bi('Masas en la superficie pleural que <b>captan contraste</b>, o <b>engrosamiento pleural nodular</b>. Causa más frecuente: metástasis de <b>pulmón > mama > linfoma > ovario</b>.', 'Masses on the pleural surface that <b>enhance</b>, or <b>nodular pleural thickening</b>. Commonest cause: metastases from <b>lung > breast > lymphoma > ovary</b>.'),
      differential: bi('DD con el mesotelioma (circunferencial, pleura mediastínica y cisuras, asbesto).', 'DD with mesothelioma (circumferential, mediastinal pleura and fissures, asbestos).'),
      tip: bi('«Para Mí, Las Olas»: Pulmón > Mama > Linfoma > Ovario.', '"Para Mí, Las Olas": Lung (Pulmón) > Breast (Mama) > Lymphoma > Ovary.'),
    },
  },
  {
    id: 'eco-derrame', group: 'pleura', tag: 'sim',
    name: bi('Ecografía del derrame pleural', 'Ultrasound of pleural effusion'), short: bi('Eco del derrame', 'Effusion ultrasound'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 2, at: (p, A) => locSeed(A, { sitio: 'seno', side: 'R' }) },
    params: [{ id: 'tabiques', type: 'toggle', label: bi('Tabiques (loculado)', 'Septa (loculated)'), value: true }],
    techniques: [T.ctMed('ok', 'La TC ve el derrame loculado, pero los tabiques finos se ven peor que con ecografía.', 'CT shows the loculated effusion, but thin septa are seen less well than on ultrasound.', { default: true }), T.rxPA('bad', 'Para un derrame pequeño y loculado, la Rx es la menos sensible.', 'For a small loculated effusion, the film is the least sensitive.')],
    build: (p, A) => {
      const s = locSeed(A, { sitio: 'seno', side: 'R' }), out = [lens(A, 'R', s, 30, 14, { core: 10, mr: MR.fluid, label: 'lesion' })];
      if (p.tabiques) out.push({ t: 'cols', box: rbox([s[0] - 22, s[0] + 22, s[1] - 22, s[1] + 22, s[2] - 22, s[2] + 22]), fn: (z, y, x, cur) => (cur.lab === 250 && Math.abs(Math.sin((x - s[2]) * 0.5 + (z - s[0]) * 0.18)) < 0.12 ? { hu: 55 } : null) });
      out.push(mark(s, 'Derrame loculado con tabiques', 'Loculated effusion with septa', { dx: -190, dy: -40 }));
      return out;
    },
    info: {
      where: bi('A pie de cama, sobre la zona del derrame.', 'At the bedside, over the effusion.'),
      see: bi('La ecografía transcutánea es <b>más sensible que la Rx para pequeñas cantidades</b>, sobre todo si el derrame está loculado, y es la técnica que <b>mejor ve los tabiques</b>: por eso <b>guía la punción hacia la cavidad mayor</b>. Se hace a pie de cama y en tiempo real.', 'Transcutaneous ultrasound is <b>more sensitive than film for small amounts</b>, especially when loculated, and is the technique that <b>best shows the septa</b>: hence it <b>guides the tap into the largest cavity</b>. Done at the bedside, in real time.'),
      technique: bi('La ecografía no se puede simular a partir del TC: el esquema muestra lo que se vería; la imagen es el mismo derrame en TC.', 'Ultrasound cannot be simulated from the CT: the diagram shows what would be seen; the image is the same effusion on CT.'),
    },
    diagram: lang => ecoDiagram(lang),
    exam: false,
  },
  {
    id: 'engrosamiento', group: 'pleura2', tag: 'ct-real',
    name: bi('Engrosamiento pleural (localizado / paquipleuritis)', 'Pleural thickening (localised / diffuse)'), short: bi('Engrosamiento pleural', 'Pleural thickening'),
    view: { plane: 'coronal', window: 'mediastinum', zoom: 1.6, at: (p, A) => thickAt(A, p), examPlane: 'coronal' },
    params: [{ id: 'tipo', type: 'select', dropdown: true, label: bi('Tipo', 'Type'), options: [opt('apical', 'Apical bilateral (cicatricial)', 'Bilateral apical (scarring)'), opt('sulcus', 'Apical irregular, asimétrico o convexo', 'Apical irregular, asymmetric or convex'), opt('seno', 'Senos costofrénicos', 'Costophrenic recesses'), opt('difuso', 'Difuso (paquipleuritis)', 'Diffuse (pachypleuritis)')], value: 'apical', recentre: true }],
    techniques: [T.rxPA('ok', 'Casquete apical, senos borrados o hemitórax con pleura gruesa.', 'Apical cap, blunted recesses or a hemithorax with thick pleura.'), T.ctMed('best', 'Ante la duda (apical irregular, asimétrico o convexo), TC con contraste.', 'When in doubt (irregular, asymmetric or convex apical), contrast CT.', { default: true })],
    compare: ['asbesto', 'mesotelioma'],
    build: (p, A, env) => {
      const out = [], hu = 40;
      if (p.tipo === 'apical') for (const s of ['R', 'L']) { const b = LB(A, s), Z = vox(A, 30); out.push(pleuralRind(A, s, { zr: [b[0], b[0] + Z], hu, label: 'lesion', t: z => vox(A, 1 + 5 * (1 - (z - b[0]) / Z)) })); }
      if (p.tipo === 'sulcus') { const b = LB(A, 'R'), s = surfacePoint(A, 'R', b[0] + 12, [0.6, -0.8]); if (s) out.push(lens(A, 'R', s, 32, 22, { core: pv(HU.tumour, env.phase), nodular: 0.35, mr: MR.solid, label: 'lesion' })); const bl = LB(A, 'L'); out.push(pleuralRind(A, 'L', { zr: [bl[0], bl[0] + vox(A, 15)], hu, label: 'lesion', t: () => vox(A, 2) })); }
      if (p.tipo === 'seno') for (const s of ['R', 'L']) { const b = LB(A, s); out.push(pleuralRind(A, s, { zr: [b[1] - vox(A, 35), b[1]], hu, label: 'lesion', t: (z, y, x, r) => (y > r.cy ? vox(A, 2 + 6 * (z - b[1] + vox(A, 35)) / vox(A, 35)) : 0) })); }
      if (p.tipo === 'difuso') out.push(pleuralRind(A, 'R', { hu, label: 'lesion', t: (z, y, x) => vox(A, 5 + 2 * noise3(z, y, x, 0.08, 21)) }));
      out.push(mark(thickAt(A, p), { apical: 'Casquete apical bilateral', sulcus: 'Convexo hacia el pulmón: ¿sulcus superior?', seno: 'Senos costofrénicos', difuso: 'Paquipleuritis' }[p.tipo], { apical: 'Bilateral apical cap', sulcus: 'Convex to the lung: superior sulcus?', seno: 'Costophrenic recesses', difuso: 'Pachypleuritis' }[p.tipo], { dx: -190, dy: -30 }));
      return out;
    },
    readouts: p => [{ label: bi('Interpretación', 'Interpretation'), value: { apical: bi('Cicatricial (TBC, entre otras); suele ser bilateral', 'Scarring (TB, among others); usually bilateral'), sulcus: bi('Sospechar tumor del sulcus superior → TC con contraste', 'Suspect a superior sulcus tumour → contrast CT'), seno: bi('Engrosamiento localizado de los senos', 'Localised thickening of the recesses'), difuso: bi('Engrosamiento difuso = paquipleuritis', 'Diffuse thickening = pachypleuritis') }[p.tipo] }],
    info: {
      where: bi('Pleura; estado final de infecciones, tumores, hemotórax, asbesto, etc.', 'Pleura; end stage of infections, tumours, haemothorax, asbestos, etc.'),
      see: bi('<b>Localizado</b>: apical (cicatrices de TBC, entre otras; suele ser bilateral) o en los senos costofrénicos. Si el apical es <b>irregular</b> (cambia respecto a estudios previos), <b>asimétrico o convexo hacia el pulmón</b>, sospechar un tumor del «sulcus superior». <b>Difuso</b>: paquipleuritis.', '<b>Localised</b>: apical (TB scars among others; usually bilateral) or at the costophrenic recesses. If the apical one is <b>irregular</b> (changing from previous studies), <b>asymmetric or convex towards the lung</b>, suspect a "superior sulcus" tumour. <b>Diffuse</b>: pachypleuritis.'),
      technique: bi('Ante la duda, TC con contraste.', 'When in doubt, contrast CT.'),
      tip: bi('Compara «Apical bilateral» con «Apical irregular»: lo que alarma es la asimetría y el borde convexo.', 'Compare "Bilateral apical" with "Apical irregular": what alarms is the asymmetry and the convex border.'),
    },
  },
  {
    id: 'asbesto', group: 'pleura2', tag: 'ct-real',
    name: bi('Placas pleurales por asbesto', 'Asbestos pleural plaques'), short: bi('Placas de asbesto', 'Asbestos plaques'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.4, at: (p, A) => { const z = Math.round(LB(A, 'R')[0] + (LB(A, 'R')[1] - LB(A, 'R')[0]) * 0.62), c = A.cordAt(z); return [z, 110, c ? Math.round(c.xc) : 137]; }, examPlane: 'axial' },
    params: [{ id: 'anos', type: 'range', label: bi('Años desde la exposición', 'Years since exposure'), min: 5, max: 40, step: 5, value: 20, examMin: 15 }, { id: 'calc', type: 'toggle', label: bi('Calcificadas', 'Calcified'), value: true }],
    techniques: [T.ctMed('best', 'Placas múltiples y bilaterales, posterolaterales y diafragmáticas; las calcificadas son blancas.', 'Multiple, bilateral plaques, posterolateral and diaphragmatic; calcified ones are white.', { default: true }), T.rxPA('ok', 'Placas calcificadas «en hoja» sobre los campos y el diafragma.', 'Calcified "holly-leaf" plaques over the fields and diaphragm.')],
    compare: ['mesotelioma', 'engrosamiento'],
    build: (p, A) => {
      const g = Math.min(1, p.anos / 20), Tm = 1.5 + 3.5 * g, Rm = 10 + 12 * g, hu = p.calc ? 650 : 70, mr = p.calc ? MR.calc : MR.soft, out = [];
      for (const s of ['R', 'L']) {
        const b = LB(A, s), H = b[1] - b[0];
        [[0.45, [0.8, 0.6]], [0.6, [0.3, 0.95]], [0.72, [0.85, 0.5]], [0.55, [0.95, 0.3]]].forEach(([f, d], i) => {
          const q = surfacePoint(A, s, Math.round(b[0] + H * f), [d[0], lat(s) * d[1]]); if (q) out.push(lens(A, s, q, Rm * (1 - 0.15 * i), Tm, { core: hu, mr, label: 'lesion' }));
        });
        const D = diaCols(A, s), C = D.C, dm = D.dome, ids = idsOf(A, SIDE_LUNG[s]), RV = vox(A, Rm * 1.2), TV = vox(A, Tm);
        out.push({ t: 'cols', box: rbox([dm[0] - 2, b[1], dm[1] - RV - 2, dm[1] + RV + 2, dm[2] - RV - 2, dm[2] + RV + 2]), fn: (z, y, x, cur) => { if (!ids.has(cur.orig) || !D.has(y, x)) return null; const rho = Math.hypot(y - dm[1], x - dm[2]) / RV; if (rho > 1) return null; const bt = C.bot(y, x); return z > bt - TV * Math.sqrt(1 - rho * rho) ? { hu, mr } : null; } });
      }
      const b = LB(A, 'R'), q = surfacePoint(A, 'R', Math.round(b[0] + (b[1] - b[0]) * 0.6), [0.3, -0.95]); if (q) out.push(mark(q, 'Placa pleural', 'Pleural plaque', { dx: -150, dy: -40 }));
      return out;
    },
    readouts: p => [{ label: bi('Latencia de las placas', 'Plaque latency'), value: bi('Hasta 20 años tras la exposición, sin síntomas', 'Up to 20 years after exposure, asymptomatic') }, { label: bi('Mesotelioma', 'Mesothelioma'), value: p.anos >= 30 ? bi('Estamos en su ventana de latencia (30–40 años)', 'Within its latency window (30–40 years)') : bi('Latencia 30–40 años', 'Latency 30–40 years') }],
    info: {
      where: bi('Pleura parietal posterolateral y pleura diafragmática, en los dos lados.', 'Posterolateral parietal pleura and diaphragmatic pleura, on both sides.'),
      see: bi('Engrosamiento pleural localizado o difuso: <b>placas múltiples y bilaterales, que pueden calcificarse</b>, en la región posterolateral y la pleura diafragmática. Latencia: <b>hasta 20 años</b> tras la exposición, sin síntomas.', 'Localised or diffuse pleural thickening: <b>multiple, bilateral plaques that may calcify</b>, posterolateral and on the diaphragmatic pleura. Latency: <b>up to 20 years</b> after exposure, asymptomatic.'),
      differential: bi('Mesotelioma: 30–40 años, engrosamiento nodular y circunferencial con derrame.', 'Mesothelioma: 30–40 years, nodular circumferential thickening with effusion.'),
      tip: bi('Asbesto «20 / 30-40»: las placas tardan hasta 20 años; el mesotelioma, 30–40.', 'Asbestos "20 / 30-40": plaques take up to 20 years; mesothelioma, 30–40.'),
    },
    flags: [flag('ampliacion', 'El crecimiento de las placas con los años es esquemático: el temario solo da la latencia.', 'Plaque growth with the years is schematic: the syllabus only gives the latency.')],
  },
  {
    id: 'mesotelioma', group: 'pleura2', tag: 'ct-real',
    name: bi('Mesotelioma pleural maligno', 'Malignant pleural mesothelioma'), short: bi('Mesotelioma', 'Mesothelioma'),
    view: { plane: 'axial', window: 'mediastinum', zoom: 1.5, at: (p, A) => midPoint(A, p.side), examPlane: 'axial' },
    contrast: true,
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'grosor', type: 'range', label: bi('Grosor de la pleura', 'Pleural thickness'), min: 4, max: 20, step: 2, value: 10, unit: 'mm' }, { id: 'placas', type: 'toggle', label: bi('Placas calcificadas (50 %)', 'Calcified plaques (50 %)'), value: true }],
    techniques: [T.ctMed('best', 'Captación periférica: engrosamiento nodular y circunferencial que incluye la pleura mediastínica y las cisuras; derrame.', 'Peripheral enhancement: nodular, circumferential thickening including the mediastinal pleura and fissures; effusion.', { default: true }), T.rxPA('ok', 'Hemitórax con pleura lobulada y pérdida de volumen.', 'Hemithorax with lobulated pleura and volume loss.')],
    compare: ['derrame-maligno', 'asbesto'],
    build: (p, A, env) => {
      const s = p.side, hu = pv(PLEU, env.phase), out = [raiseBase(A, s, 12, { label: 'keep' })];
      out.push(effusion(A, s, { h: 45, d: 25, mode: env.modality === 'rx' ? 'upright' : 'supine' }));
      out.push(pleuralRind(A, s, { lobewise: true, hu, label: 'lesion', mr: MR.solid, t: (z, y, x) => vox(A, p.grosor * (0.35 + 1.2 * Math.max(0, noise3(z, y, x, 0.22, 9) + 0.2))) }));
      if (p.placas) { const b = LB(A, s), q = surfacePoint(A, s, Math.round(b[0] + (b[1] - b[0]) * 0.7), [0.85, lat(s) * 0.5]); if (q) out.push(lens(A, s, q, 16, 3, { core: 650, mr: MR.calc, label: 'lesion' })); }
      out.push(mark(midPoint(A, s), 'Engrosamiento nodular circunferencial', 'Nodular circumferential thickening', { dx: s === 'R' ? -200 : 80, dy: -40 }));
      return out;
    },
    readouts: () => [{ label: bi('Latencia', 'Latency'), value: bi('30–40 años tras la exposición al asbesto', '30–40 years after asbestos exposure') }, { label: bi('Hallazgos', 'Findings'), value: bi('Pleura mediastínica y cisuras afectadas · derrame · placas calcificadas en el 50 % · pérdida de volumen', 'Mediastinal pleura and fissures involved · effusion · calcified plaques in 50 % · volume loss') }],
    info: {
      where: bi('Toda la pleura de un hemitórax, incluidas la mediastínica y las cisuras.', 'The whole pleura of one hemithorax, including mediastinal pleura and fissures.'),
      see: bi('Tumor pleural raro ligado al asbesto. <b>Captación periférica: engrosamiento nodular y circunferencial</b> que afecta a la <b>pleura mediastínica y las cisuras</b>. Suele haber <b>derrame</b>. En el <b>50 %</b>, placas calcificadas. Puede haber <b>pérdida de volumen</b> del hemitórax.', 'Rare pleural tumour linked to asbestos. <b>Peripheral enhancement: nodular, circumferential thickening</b> involving the <b>mediastinal pleura and fissures</b>. <b>Effusion</b> is usual. Calcified plaques in <b>50 %</b>. The hemithorax may <b>lose volume</b>.'),
      differential: bi('Derrame maligno (metástasis): bilateral, nódulos pleurales; DD con el mesotelioma.', 'Malignant effusion (metastases): bilateral, pleural nodules; DD with mesothelioma.'),
    },
    flags: [flag('ampliacion', 'La pérdida de volumen se representa subiendo el hemidiafragma; el mediastino no se desplaza.', 'Volume loss is shown by raising the hemidiaphragm; the mediastinum is not shifted.')],
  },
  {
    id: 'neumotorax', group: 'pleura2', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Neumotórax', 'Pneumothorax'), short: bi('Neumotórax', 'Pneumothorax'),
    view: { plane: 'axial', window: 'lung', zoom: 1.5, at: (p, A) => { const m = midPoint(A, p.side), r = lungSlice(A, p.side, m[0]); return [m[0], Math.round(r ? r.y0 + 6 + vox(A, p.d) * 0.6 : m[1]), m[2]]; }, examPlane: 'axial' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R', recentre: true }, { id: 'd', type: 'range', label: bi('Tamaño (cámara de aire)', 'Size (air space)'), min: 5, max: 40, step: 5, value: 20, unit: 'mm', examMin: 15 }],
    techniques: [T.rxPA('best', 'Línea fina blanca (pleura visceral) entre el pulmón colapsado y el espacio avascular.', 'Thin white line (visceral pleura) between the collapsed lung and the avascular space.'), T.ctLung('ok', 'En decúbito el aire se acumula delante (zona no declive).', 'Supine, the air collects anteriorly (non-dependent).', { default: true })],
    compare: ['neumotorax-tension', 'neumomediastino'],
    build: (p, A, env) => { const m = midPoint(A, p.side), r = lungSlice(A, p.side, m[0]); return [pneumo(A, p.side, { d: p.d, mode: env.modality === 'rx' ? 'rx' : 'ct', collapse: p.d >= 25 ? 160 : 0 }), mark([m[0], r ? r.y0 + 2 : m[1], m[2]], 'Línea pleural visceral', 'Visceral pleural line', { dx: 80, dy: -40 })]; },
    readouts: () => [{ label: bi('Causas', 'Causes'), value: bi('Sobre todo traumatismos; muchos yatrogénicos; otros espontáneos (con o sin enfermedad pulmonar previa)', 'Mostly trauma; many iatrogenic; others spontaneous (with or without lung disease)') }],
    info: {
      where: bi('Cavidad pleural: en decúbito, delante; de pie, en el vértice y lateral.', 'Pleural cavity: supine, anterior; standing, apical and lateral.'),
      see: bi('Aire en la cavidad pleural: <b>línea fina blanca (la pleura visceral) entre el pulmón colapsado y el espacio avascular</b> del neumotórax.', 'Air in the pleural cavity: <b>thin white line (the visceral pleura) between the collapsed lung and the avascular space</b> of the pneumothorax.'),
      differential: bi('A tensión: desplazamiento mediastínico contralateral y aplanamiento diafragmático.', 'Tension: contralateral mediastinal shift and flattened diaphragm.'),
    },
    flags: [flag('apuntes', 'Este TC procede de un paciente traumatizado: revisa los pulmones reales antes de leer la simulación.', 'This CT comes from a trauma patient: check the real lungs before reading the simulation.')],
  },
  {
    id: 'neumotorax-tension', group: 'pleura2', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Neumotórax a tensión', 'Tension pneumothorax'), short: bi('Neumotórax a tensión', 'Tension pneumothorax'),
    view: { plane: 'axial', window: 'lung', zoom: 1.3, at: (p, A) => { const z = A.s('heart').bbox[0] + 10, c = A.cordAt(z); return [z, 95, (c ? Math.round(c.xc) : 137) + (p.side === 'L' ? 32 : -12)]; }, examPlane: 'axial' },
    params: [{ id: 'side', type: 'select', label: bi('Lado', 'Side'), options: SIDES, value: 'R' }],
    techniques: [T.rxPA('ok', 'Hemitórax hiperclaro, mediastino desplazado al otro lado y diafragma aplanado (si da tiempo a hacerla).', 'Hyperlucent hemithorax, mediastinum shifted to the other side and flattened diaphragm (if there is time to take it).'), T.ctLung('ok', 'Pulmón colapsado, desplazamiento mediastínico contralateral, diafragma aplanado.', 'Collapsed lung, contralateral mediastinal shift, flattened diaphragm.', { default: true })],
    treatment: { label: bi('Drenaje urgente', 'Urgent drainage'), note: bi('Hay que drenar el aire de forma urgente; si no, se colapsa el pulmón.', 'The air must be drained urgently, otherwise the lung collapses.') },
    compare: ['neumotorax'],
    build: (p, A, env) => {
      const s = p.side, out = [];
      if (env.treated) {
        out.push(pneumo(A, s, { d: 6, mode: env.modality === 'rx' ? 'rx' : 'ct' }));
        const b = LB(A, s), z = Math.round(b[0] + (b[1] - b[0]) * 0.55), r = lungSlice(A, s, z), xo = s === 'R' ? r.x0 - 14 : r.x1 + 14;
        out.push({ t: 'tube', pts: [[z + 4, r.cy, xo], [z, r.cy, s === 'R' ? r.x0 + 4 : r.x1 - 4], [b[0] + 18, r.cy - 10, s === 'R' ? r.x0 + 14 : r.x1 - 14]], r: 3, hu: 400, label: 'lesion' });
        out.push(mark([z, r.cy, s === 'R' ? r.x0 + 4 : r.x1 - 4], 'Tubo de drenaje', 'Chest drain', { dx: s === 'R' ? -150 : 80, dy: 30 }));
        return out;
      }
      const b = LB(A, s), hb = A.s('heart').bbox;
      out.push(...shiftMediastinum(A, s === 'R' ? 1 : -1, 15, b[0] + 6, hb[1]).map(w => ({ ...w, fill: { hu: -70, label: 0 } })));
      out.push(pneumo(A, s, { d: 70, mode: env.modality === 'rx' ? 'rx' : 'ct', collapse: 380 }));
      const D = diaCols(A, s), C = D.C, dm = D.dome, dep = vox(A, 22), lungIds = idsOf(A, SIDE_LUNG[s]);
      out.push({ t: 'cols', box: rbox([dm[0], dm[0] + dep + vox(A, 30), C.y0, C.y0 + C.h, C.x0, C.x0 + C.w]), fn: (z, y, x, cur) => {
        if (!D.has(y, x)) return null; const bt = C.bot(y, x), w = clamp(1 - ((y - dm[1]) / vox(A, 55)) ** 2 - ((x - dm[2]) / vox(A, 65)) ** 2, 0, 1);
        return z > bt && z <= bt + dep * w && !lungIds.has(cur.orig) ? { hu: -1000, label: 'lesion' } : null;
      } });
      const z = hb[0] + 10, c = A.cordAt(z); out.push(mark([z, 95, c ? c.xc : 137], 'Mediastino desplazado al otro lado', 'Mediastinum shifted to the other side', { dx: 80, dy: -50 }));
      out.push(mark([dm[0] + 4, dm[1], dm[2]], 'Diafragma aplanado', 'Flattened diaphragm', { dx: 80, dy: 40, planes: ['coronal', 'sagittal'] }));
      return out;
    },
    readouts: () => [{ label: bi('Mecanismo', 'Mechanism'), value: bi('Atrapamiento aéreo valvular', 'Valve-like air trapping') }, { label: bi('Signos (persisten en inspiración)', 'Signs (persist on inspiration)'), value: bi('Desplazamiento mediastínico contralateral · aplanamiento diafragmático', 'Contralateral mediastinal shift · diaphragmatic flattening') }, { label: bi('Actitud', 'Action'), value: bi('Drenaje urgente', 'Urgent drainage') }],
    info: {
      where: bi('Cavidad pleural de un lado, con repercusión en el mediastino y el diafragma.', 'One pleural cavity, with effects on the mediastinum and diaphragm.'),
      see: bi('<b>Atrapamiento aéreo en la cavidad pleural por un mecanismo valvular</b>. En inspiración persisten el <b>desplazamiento mediastínico contralateral</b> y el <b>aplanamiento diafragmático</b>.', '<b>Air trapped in the pleural cavity by a valve mechanism</b>. On inspiration the <b>contralateral mediastinal shift</b> and <b>diaphragmatic flattening</b> persist.'),
      technique: bi('Es urgente drenar el aire porque si no se colapsa el pulmón: requiere tratamiento urgente.', 'The air must be drained urgently or the lung collapses: it needs urgent treatment.'),
      differential: bi('Neumotórax simple: sin desplazamiento del mediastino.', 'Simple pneumothorax: no mediastinal shift.'),
      tip: bi('Activa «tras tratamiento»: el tubo de drenaje y el pulmón reexpandido.', 'Turn on "after treatment": the chest drain and the re-expanded lung.'),
    },
    flags: [flag('ampliacion', 'El desplazamiento mueve las estructuras mediastínicas segmentadas; la grasa sin máscara se queda en su sitio.', 'The shift moves the segmented mediastinal structures; the unsegmented fat stays in place.')],
  },
];

/* ---------------- seeds ---------------- */
function locSeed(A, p) {
  const s = p.side, b = LB(A, s), H = b[1] - b[0];
  const [f, d] = p.sitio === 'apical' ? [0.1, [0.2, 1]] : p.sitio === 'seno' ? [0.86, [0.75, 0.66]] : [0.5, [0.15, 1]];
  return surfacePoint(A, s, Math.round(b[0] + H * f), [d[0], lat(s) * d[1]]) || midPoint(A, s);
}
function empSeed(A, s) { const b = LB(A, s); return surfacePoint(A, s, Math.round(b[0] + (b[1] - b[0]) * 0.72), [1, lat(s) * 0.35]) || midPoint(A, s); }
function thickAt(A, p) {
  const b = LB(A, 'R');
  if (p.tipo === 'apical' || p.tipo === 'sulcus') { const r = lungSlice(A, 'R', b[0] + 8); return [b[0] + 8, r ? Math.round(r.cy) : 100, r ? Math.round(r.cx) : 100]; }
  if (p.tipo === 'seno') { const q = basePoint(A, 'R', 30, 0.5), c = A.cordAt(q[0]); q[2] = c ? Math.round(c.xc) : 137; return q; }
  return midPoint(A, 'R');
}
