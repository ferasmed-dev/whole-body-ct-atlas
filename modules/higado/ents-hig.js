// Liver entities: techniques and anatomy, diffuse disease, focal lesions (benign, intermediate, malignant).
// Backbone: the dynamic enhancement pattern, driven by the global phase slider.
import { bi, opt, tq, mark, flag, PH4, PHL, BG, contrastRO, ecoRO, MR, pv } from './common.js';
import { LIV, SITES, liverSite, bestSite, depth, liverPoints, hilum, segCentres, segmentOf, segPlanes, sphere, rbox, NZ, grid, ductTubes, width, portalDiameter } from './geo.js';
import * as L from './lesions.js';
import { enhancementDiagram, couinaudDiagram, ironDiagram, mriTable, livAlgorithm } from './diagrams.js';

const fx = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('es-ES');
const sizeP = (value = 30, min = 10, max = 60) => ({ id: 'size', type: 'range', label: bi('Diámetro', 'Diameter'), min, max, step: 5, value, unit: 'mm' });
const siteP = (value = 'der') => ({ id: 'site', type: 'select', label: bi('Localización', 'Location'), options: SITES, value, recentre: true });
/** Radius (mm) that fits at the site (the lesion stays mostly inside the liver). */
const fitR = (A, c, size) => Math.min(size / 2, depth(A, LIV, ...c) + 4);
const at = p => (pp, A) => liverSite(A, pp.site || p);
const view = (site, zoom = 2.2, extra = {}) => ({ plane: 'axial', window: 'liver', zoom, at: (p, A) => liverSite(A, p.site || site), examPlane: 'axial', ...extra });
const tech = {
  ct: (verdict, es, en, x = {}) => tq('ct', 'ct', verdict, bi('TC multifásico', 'Multiphase CT'), bi(es, en), { window: 'liver', ...x }),
  t1: (verdict, es, en, x = {}) => tq('t1', 't1', verdict, bi('RM T1', 'T1 MR'), bi(es, en), x),
  t2: (verdict, es, en, x = {}) => tq('t2', 't2', verdict, bi('RM T2', 'T2 MR'), bi(es, en), x),
  gin: (verdict, es, en) => tq('gre-in', 't1', verdict, bi('RM T1 en fase', 'T1 MR in phase'), bi(es, en)),
  gout: (verdict, es, en) => tq('gre-out', 't1', verdict, bi('RM T1 fuera de fase', 'T1 MR out of phase'), bi(es, en)),
};
const techId = env => (env.technique && env.technique.id) || null;
const lm = (c, es, en, x = {}) => mark(c, es, en, { dx: 60, dy: -46, ...x });
const ALGO_FLAG = flag('apuntes', 'Ante una lesión hepática: primero eco; si no es quiste ni hemangioma, TC-RM dinámico (captación arterial y lavado → HCC o adenoma; captación arterial que se mantiene como el hígado → HNF).', 'Faced with a liver lesion: ultrasound first; if it is not a cyst or a haemangioma, dynamic CT-MR (arterial enhancement and washout → HCC or adenoma; arterial enhancement that then matches the liver → FNH).');

/* ---------------- multiphase demo: four typical lesions on one slice ---------------- */
function demoSites(A) {
  const k = 'hig:demo'; if (A.cache.has(k)) return A.cache.get(k);
  const z = [334, 344];
  const s = { hcc: bestSite(A, LIV, { z, x: [115, 165] }), meta: bestSite(A, LIV, { z, y: [100, 140], x: [45, 80] }), hema: bestSite(A, LIV, { z, y: [40, 68], x: [50, 82] }), quiste: bestSite(A, LIV, { z, y: [50, 75], x: [92, 112] }) };
  A.cache.set(k, s); return s;
}
function demoLesions(A, ph, which) {
  const s = demoSites(A), out = [];
  const add = (key, prims, es, en) => { if (which && which !== key) return; out.push(...prims, lm(s[key], es, en)); };
  add('hcc', L.hcc(A, s.hcc, 13, ph, { capsule: false }), 'Hipervascular (HCC/adenoma)', 'Hypervascular (HCC/adenoma)');
  add('meta', L.meta(A, s.meta, 12, ph), 'Hipovascular: anillo (metástasis)', 'Hypovascular: ring (metastasis)');
  add('hema', L.hemangioma(A, s.hema, 13, ph), 'Captación lenta (hemangioma)', 'Slow enhancement (haemangioma)');
  add('quiste', L.quiste(A, s.quiste, 9), 'No capta (quiste)', 'No enhancement (cyst)');
  return out;
}
const PHASE_RO = {
  sin: bi('Sin contraste (antes de inyectar): ver calcio, sangre y la densidad de base', 'No contrast (before injection): calcium, blood and baseline density'),
  arterial: bi('~10 s tras llegar a la aorta: hipervasculares (hepatocarcinoma, adenoma)', '~10 s after reaching the aorta: hypervascular lesions (HCC, adenoma)'),
  portal: bi('~60 s: realza todo el parénquima → hipovasculares (quistes; metástasis en anillo)', '~60 s: the whole parenchyma enhances → hypovascular lesions (cysts; ring-enhancing metastases)'),
  tardia: bi('~90 s (suprahepáticas → cava): lesiones que tardan en captar (hemangioma, colangiocarcinoma)', '~90 s (hepatic veins → IVC): slowly enhancing lesions (haemangioma, cholangiocarcinoma)'),
};

/* ---------------- liver MR signal overrides (pseudo-MR) ---------------- */
function liverMR(A, tissue, tid, gdph) {
  const out = [];
  if (tid === 'gre-in' || tid === 'gre-out' || tid === 't1' || tid === 't2') {
    let t1 = 0.5, t2 = 0.4;
    if (tissue === 'grasa') { t1 = tid === 'gre-out' ? 0.18 : 0.6; t2 = 0.5; }
    if (tissue === 'hierro') { t1 = tid === 'gre-in' ? 0.12 : tid === 'gre-out' ? 0.42 : 0.3; t2 = 0.1; }
    out.push({ t: 'fill', s: LIV, label: 'keep', mr: { t1, t2, stir: t2 * 0.8 } });
  }
  if (tid === 'gd' || tid === 'gd-t2') {
    const L1 = { sin: 0.48, arterial: 0.55, portal: 0.72, tardia: 0.66 }, ART = { sin: 0.1, arterial: 0.96, portal: 0.75, tardia: 0.62 }, VEN = { sin: 0.1, arterial: 0.3, portal: 0.9, tardia: 0.75 };
    const t2 = tid === 'gd-t2' ? (gdph === 'sin' ? null : 0.05) : null, lb = A.s(LIV).bbox, reg = { c: [Math.round((lb[0] + lb[1]) / 2), 95, 130], r: [110, 120, 220] };
    const m = v => (t2 !== null ? { t2, t1: v } : { t1: v });
    out.push({ t: 'fill', s: LIV, label: 'keep', mr: m(L1[gdph]) });
    out.push({ t: 'fill', s: 'spleen', label: 'keep', mr: m(L1[gdph] + 0.08) });
    out.push({ t: 'fill', s: 'aorta', region: reg, label: 'keep', mr: m(ART[gdph]) });
    out.push({ t: 'fill', s: ['portal_vein_and_splenic_vein', 'inferior_vena_cava'], region: reg, label: 'keep', mr: m(VEN[gdph]) });
  }
  return out;
}

/* ---------------- entities ---------------- */
export const TEC = [
  {
    id: 'multifasico', group: 'tec', tag: 'kit', extraTags: ['sim'], exam: false,
    name: bi('TC multifásico: basal, arterial, portal y tardía', 'Multiphase CT: unenhanced, arterial, portal and delayed'),
    short: bi('TC multifásico', 'Multiphase CT'),
    kitNote: bi('Las fases se simulan sobre este estudio portal con densidades por órgano; un TC multifásico real (las cuatro adquisiciones) necesitaría otro caso del conjunto de datos.', 'The phases are simulated on this portal study with per-organ densities; a real multiphase CT (all four acquisitions) would need another case of the dataset.'),
    view: { plane: 'axial', window: 'liver', zoom: 1.7, at: (p, A) => { const s = demoSites(A); return [Math.round((s.hcc[0] + s.meta[0]) / 2), 90, 100]; } },
    phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    params: [{ id: 'demo', type: 'select', label: bi('Lesiones de ejemplo', 'Example lesions'), options: [opt('todas', 'Las cuatro', 'All four'), opt('hcc', 'Hipervascular', 'Hypervascular'), opt('meta', 'Anillo', 'Ring'), opt('hema', 'Lenta', 'Slow'), opt('quiste', 'No capta', 'None'), opt('ninguna', 'Ninguna', 'None (organs only)')], value: 'todas' }],
    techniques: [
      tech.ct('best', 'Caracteriza lesiones focales: el contraste yodado llega por la arteria hepática y, algo más tarde, por la porta; cada fase «ve» un tipo de lesión.', 'Characterises focal lesions: iodinated contrast arrives through the hepatic artery and, a little later, the portal vein; each phase "sees" one kind of lesion.'),
      tq('ct-sin', 'ct', 'ok', bi('TC basal', 'Unenhanced CT'), bi('Antes de inyectar. Solo no basta para caracterizar (muchas lesiones son isodensas).', 'Before injection. On its own it cannot characterise (many lesions are isodense).'), { window: 'liver', phase: 'sin' }),
    ],
    build: (p, A, env) => (p.demo === 'ninguna' ? [{ t: 'fill', s: LIV, label: 'keep', delta: 0 }] : demoLesions(A, env.phase, p.demo === 'todas' ? null : p.demo)),
    readouts: (p, A, env) => [{ label: bi('Fase', 'Phase'), value: PHASE_RO[env.phase] }, { label: bi('Hígado / aorta / porta (simulado)', 'Liver / aorta / portal vein (simulated)'), value: `${BG.liver[env.phase]} / ${BG.aorta[env.phase]} / ${BG.portal[env.phase]} HU` }],
    info: {
      where: bi('Estudio dinámico del hígado: inyección en una vena periférica y adquisiciones a tiempos fijos.', 'Dynamic liver study: injection into a peripheral vein and acquisitions at fixed times.'),
      see: bi('<b>Basal</b> (sin contraste) · <b>arterial</b> ~10 s tras la aorta: hipervasculares (HCC, adenoma) · <b>portal</b> ~60 s: realza todo el parénquima y destaca las hipovasculares (quistes, metástasis en anillo) · <b>venosa tardía</b> ~90 s: las que tardan en captar (hemangioma, colangiocarcinoma).', '<b>Unenhanced</b> · <b>arterial</b> ~10 s after the aorta: hypervascular lesions (HCC, adenoma) · <b>portal</b> ~60 s: the whole parenchyma enhances and hypovascular lesions stand out (cysts, ring-enhancing metastases) · <b>delayed venous</b> ~90 s: slowly enhancing lesions (haemangioma, cholangiocarcinoma).'),
      technique: bi('TC: valora el parénquima sin depender del paciente ni del gas, es corta y no necesita colaboración; problema: la irradiación. Necesita contraste yodado IV. La RM dinámica sigue el mismo orden (basal – arterial – portal – venosa).', 'CT: assesses the parenchyma regardless of the patient or bowel gas, is quick and needs no cooperation; drawback: radiation. It needs IV iodinated contrast. Dynamic MR follows the same order (unenhanced – arterial – portal – venous).'),
      tip: bi('Mueve el selector de fase con «Las cuatro»: en arterial solo brilla la hipervascular; en portal aparece el anillo; en tardía el hemangioma se rellena; el quiste nunca cambia.', 'Move the phase selector with "All four": in arterial only the hypervascular one lights up; in portal the ring appears; in delayed the haemangioma fills in; the cyst never changes.'),
    },
    diagram: enhancementDiagram,
    flags: [
      flag('revisar', 'El temario pone «SOLO EN T1» junto al TC multifásico; T1/T2 son secuencias de RM (la RM dinámica sí se hace siempre en T1).', 'The syllabus writes "ONLY ON T1" next to multiphase CT; T1/T2 are MR sequences (dynamic MR is indeed always T1).'),
      flag('revisar', 'Dice que por la porta llega el contraste «algo más tarde y en menor cantidad», pero la porta aporta la mayor parte del flujo hepático (≈ 75 %).', 'It says contrast arrives through the portal vein "a little later and in a smaller amount", but the portal vein supplies most of the liver blood flow (≈ 75 %).'),
      flag('ampliacion', 'La fase tardía de «~90 s» del temario es corta: en la práctica la fase tardía (de equilibrio) se adquiere a los 3–5 min.', 'The "~90 s" delayed phase of the syllabus is short: in practice the delayed (equilibrium) phase is acquired at 3–5 min.'),
    ],
  },
  {
    id: 'rm-secuencias', group: 'tec', tag: 'sim', exam: false,
    name: bi('RM hepática: T1, T2, en fase / fuera de fase y gadolinio', 'Liver MR: T1, T2, in / out of phase and gadolinium'),
    short: bi('RM hepática', 'Liver MR'),
    view: { plane: 'axial', window: 'liver', zoom: 1.6, focus: LIV, at: (p, A) => { const s = demoSites(A); return [s.hcc[0], 90, 110]; } },
    params: [
      { id: 'tissue', type: 'select', label: bi('Hígado', 'Liver'), options: [opt('normal', 'Normal', 'Normal'), opt('grasa', 'Con grasa (esteatosis)', 'Fatty (steatosis)'), opt('hierro', 'Con hierro (hemocromatosis)', 'Iron (haemochromatosis)')], value: 'normal' },
      { id: 'gdph', type: 'select', label: bi('Fase del gadolinio (técnicas con Gd)', 'Gadolinium phase (Gd techniques)'), options: [opt('sin', 'Basal', 'Unenhanced'), opt('arterial', 'Arterial', 'Arterial'), opt('portal', 'Portal', 'Portal'), opt('tardia', 'Venosa', 'Venous')], value: 'arterial' },
      { id: 'lesion', type: 'toggle', label: bi('Lesión hipervascular de ejemplo', 'Example hypervascular lesion'), value: true },
    ],
    techniques: [
      tech.t1('ok', 'Spin echo T1: el agua se ve negra (bilis, quistes).', 'Spin-echo T1: water is black (bile, cysts).', { default: true }),
      tech.t2('ok', 'T2: el agua se ve blanca.', 'T2: water is white.'),
      tech.gin('best', 'Eco de gradiente T1 en fase: la grasa no cae; el hierro oscurece el hígado.', 'Gradient-echo T1 in phase: fat does not drop; iron darkens the liver.'),
      tech.gout('best', 'Fuera de fase (fase opuesta): la grasa mezclada con el tejido pierde señal → esteatosis.', 'Out of phase (opposed phase): fat mixed with tissue loses signal → steatosis.'),
      tq('gd', 't1', 'best', bi('T1 + gadolinio (dinámico)', 'T1 + gadolinium (dynamic)'), bi('Dinámico siempre en T1: basal – arterial – portal – venosa (elige la fase arriba).', 'Dynamic study always on T1: unenhanced – arterial – portal – venous (pick the phase above).')),
      tq('gd-t2', 't2', 'bad', bi('T2 + gadolinio', 'T2 + gadolinium'), bi('No se hace: el gadolinio en T2 se ve totalmente negro.', 'Not done: gadolinium looks completely black on T2.')),
    ],
    build: (p, A, env) => {
      const tid = techId(env) || 't1', out = liverMR(A, p.tissue, tid, p.gdph), s = demoSites(A);
      if (p.lesion) {
        const g = p.gdph, t1 = tid === 'gd' ? { sin: 0.3, arterial: 0.92, portal: 0.4, tardia: 0.35 }[g] : 0.3, t2 = tid === 'gd-t2' && g !== 'sin' ? 0.04 : 0.62;
        out.push(sphere(A, s.hcc, 13, () => ({ hu: pv(L.HUT.hcc.body, env.phase), mr: { t1, t2, stir: 0.55 } }), { within: [LIV] }), lm(s.hcc, 'Lesión hipervascular', 'Hypervascular lesion'));
      }
      return out;
    },
    readouts: (p, A, env) => [{ label: bi('Secuencia', 'Sequence'), value: { 't1': bi('T1: agua negra', 'T1: water black'), 't2': bi('T2: agua blanca', 'T2: water white'), 'gre-in': bi('T1 en fase', 'T1 in phase'), 'gre-out': bi('T1 fuera de fase', 'T1 out of phase'), gd: bi('T1 dinámico con gadolinio', 'Dynamic T1 with gadolinium'), 'gd-t2': bi('T2 con gadolinio: negro', 'T2 with gadolinium: black') }[techId(env) || 't1'] || bi('—', '—') }],
    info: {
      where: bi('Todo el hígado.', 'The whole liver.'),
      see: bi('Ventajas: no irradia, alta resolución de contraste, cuantifica <b>hierro y grasa</b> → la mejor para la patología difusa. Inconvenientes: lenta, requiere colaboración (apneas), contraindicaciones (marcapasos, materiales no compatibles). Secuencias: spin echo (T1, T2), gradiente (T1 en fase y fuera de fase, T2) y dinámico con gadolinio siempre en T1.', 'Advantages: no radiation, high contrast resolution, quantifies <b>iron and fat</b> → best for diffuse disease. Drawbacks: slow, needs cooperation (breath-holds), contraindications (pacemakers, non-compatible materials). Sequences: spin echo (T1, T2), gradient (T1 in and out of phase, T2) and dynamic gadolinium study, always on T1.'),
      technique: bi('Contrastes paramagnéticos: el más importante es el gadolinio (excreción renal); otros tienen excreción biliar (hepatoespecíficos).', 'Paramagnetic agents: the most important is gadolinium (renal excretion); others have biliary excretion (liver-specific).'),
      tip: bi('Con «Con grasa» compara T1 en fase y fuera de fase; con «Con hierro» ocurre lo contrario.', 'With "Fatty" compare T1 in and out of phase; with "Iron" the opposite happens.'),
    },
    diagram: mriTable,
    flags: [flag('ampliacion', 'La RM es una simulación hecha a partir del TC: reproduce los contrastes del temario, no la física de la RM.', 'The MR is a simulation made from the CT: it reproduces the contrasts of the syllabus, not MR physics.')],
  },
  {
    id: 'hepatoespecificos', group: 'tec', tag: 'sim', exam: false,
    name: bi('Contrastes hepatoespecíficos y de hierro (Fe)', 'Liver-specific and iron (Fe) contrast agents'),
    short: bi('Hepatoespecíficos / Fe', 'Liver-specific / Fe'),
    view: view('der', 2.2),
    params: [{ id: 'lesion', type: 'select', dropdown: true, label: bi('Lesión', 'Lesion'), options: [opt('hemangioma', 'Hemangioma', 'Haemangioma'), opt('hnf', 'HNF', 'FNH'), opt('adenoma', 'Adenoma', 'Adenoma'), opt('hcc', 'Hepatocarcinoma', 'HCC'), opt('meta', 'Metástasis / colangiocarcinoma', 'Metastasis / cholangiocarcinoma')], value: 'hnf' }],
    techniques: [
      tq('hb', 't1', 'best', bi('RM T1 · hepatoespecífico', 'T1 MR · liver-specific'), bi('El hígado sano lo capta (brilla en T1); la lesión lo capta solo si tiene hepatocitos.', 'The healthy liver takes it up (bright on T1); the lesion does only if it contains hepatocytes.'), { default: true }),
      tq('fe', 't2', 'best', bi('RM T2 · partículas de hierro', 'T2 MR · iron particles'), bi('Lo captan las células de Kupffer: el hígado se oscurece en T2; la lesión que no lo capta queda clara.', 'Kupffer cells take it up: the liver darkens on T2; a lesion that does not stays bright.')),
      tech.ct('ok', 'TC portal: ve la lesión pero no informa del contenido celular.', 'Portal CT: shows the lesion but says nothing about its cells.', { phase: 'portal' }),
    ],
    build: (p, A, env) => {
      const tid = techId(env) || 'hb', c = liverSite(A, 'der'), row = IRON[p.lesion], out = [];
      if (tid === 'hb') out.push({ t: 'fill', s: LIV, label: 'keep', mr: { t1: 0.86 } });
      if (tid === 'fe') out.push({ t: 'fill', s: LIV, label: 'keep', mr: { t2: 0.12, stir: 0.1 } });
      const t1 = row.hb ? 0.86 : 0.22, t2 = row.fe ? 0.14 : 0.8;
      out.push(sphere(A, c, 15, () => ({ hu: pv(L.HUT[p.lesion === 'meta' ? 'meta' : p.lesion].body || L.HUT.meta.core, 'portal'), mr: { t1, t2, stir: t2 * 0.9 } }), { within: [LIV], irregular: 0.1 }));
      out.push(lm(c, row.es[0], row.en[0]));
      return out;
    },
    readouts: p => { const r = IRON[p.lesion], yn = v => (v ? bi('Sí', 'Yes') : bi('No', 'No')); return [{ label: bi('Capta hepatoespecífico', 'Takes up liver-specific agent'), value: yn(r.hb) }, { label: bi('Capta Fe', 'Takes up Fe'), value: yn(r.fe) }, { label: bi('Por qué', 'Why'), value: bi(r.es[1], r.en[1]) }]; },
    info: {
      where: bi('RM con contrastes que captan las células hepáticas: hepatoespecíficos (hepatocitos, excreción biliar) y partículas de hierro (células de Kupffer).', 'MR with agents taken up by liver cells: liver-specific (hepatocytes, biliary excretion) and iron particles (Kupffer cells).'),
      see: bi('Tabla del temario: hemangioma (hepatoesp. No · Fe Sí) · HNF (Sí · Sí: contiene hepatocitos) · adenoma (No · No) · hepatocarcinoma (No · No: células indiferenciadas) · metástasis y colangiocarcinoma (No · No: otra estirpe celular).', 'Syllabus table: haemangioma (liver-specific No · Fe Yes) · FNH (Yes · Yes: contains hepatocytes) · adenoma (No · No) · HCC (No · No: undifferentiated cells) · metastasis and cholangiocarcinoma (No · No: another cell line).'),
      tip: bi('La HNF es la única que se comporta como hígado con los dos contrastes: «son hepatocitos».', 'FNH is the only one that behaves like liver with both agents: "they are hepatocytes".'),
    },
    diagram: ironDiagram,
    flags: [
      flag('ampliacion', 'El temario no aclara qué es «Fe»: son contrastes de RM de partículas de óxido de hierro, que captan las células de Kupffer.', 'The syllabus does not explain "Fe": these are MR iron-oxide particle agents, taken up by Kupffer cells.'),
      flag('revisar', 'Hemangioma «Fe: Sí» contradice su propia justificación («no tiene hepatocitos, es una malformación vascular»): sin células de Kupffer no debería captar Fe. La simulación sigue la tabla.', 'Haemangioma "Fe: Yes" contradicts its own reason ("no hepatocytes, it is a vascular malformation"): without Kupffer cells it should not take up Fe. The simulation follows the table.'),
      flag('ampliacion', 'Los adenomas pueden captar parcialmente el contraste hepatoespecífico según el subtipo; las partículas de hierro apenas se usan hoy.', 'Adenomas can take up liver-specific contrast partly depending on the subtype; iron particles are hardly used today.'),
    ],
  },
  {
    id: 'eco-contraste', group: 'tec', tag: 'sim', exam: false,
    name: bi('Ecografía con contraste (microburbujas)', 'Contrast-enhanced ultrasound (microbubbles)'),
    short: bi('Eco con contraste', 'Contrast ultrasound'),
    view: view('der', 2.2),
    phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    params: [{ id: 'lesion', type: 'select', label: bi('Lesión', 'Lesion'), options: [opt('hcc', 'HCC', 'HCC'), opt('hemangioma', 'Hemangioma', 'Haemangioma'), opt('hnf', 'HNF', 'FNH'), opt('meta', 'Metástasis', 'Metastasis')], value: 'hemangioma' }],
    techniques: [tq('ct', 'ct', 'ok', bi('Patrón (mostrado sobre TC)', 'Pattern (shown on CT)'), bi('La eco no se puede simular: se muestra el mismo patrón de captación sobre el TC, porque con microburbujas es igual que en TC y RM.', 'Ultrasound cannot be simulated: the same enhancement pattern is shown on the CT, because with microbubbles it is the same as on CT and MR.'), { window: 'liver' })],
    build: (p, A, env) => { const c = liverSite(A, 'der'), f = { hcc: L.hcc, hemangioma: L.hemangioma, hnf: L.hnf, meta: L.meta }[p.lesion]; return [...f(A, c, 15, env.phase), lm(c, 'Mismo patrón que en TC/RM', 'Same pattern as on CT/MR')]; },
    info: {
      where: bi('Hígado, como complemento de la ecografía.', 'Liver, as a complement to ultrasound.'),
      see: bi('Contraste IV de <b>microburbujas</b> rodeadas por una cápsula que las estabiliza (no es yodo ni gadolinio). Aumenta la señal; los patrones de captación son los mismos que en TC y RM.', 'IV contrast of <b>microbubbles</b> wrapped in a stabilising shell (neither iodine nor gadolinium). It boosts the signal; the enhancement patterns are the same as on CT and MR.'),
      technique: bi('En los últimos años la eco se ha completado con contraste. En el páncreas no se usa eco con contraste.', 'In recent years ultrasound has been completed with contrast. Contrast ultrasound is not used for the pancreas.'),
    },
    flags: [flag('ampliacion', 'Las microburbujas son puramente intravasculares (no pasan al intersticio): por eso la fase tardía de la eco con contraste no equivale exactamente a la del TC.', 'Microbubbles stay purely intravascular (they do not leak into the interstitium), so the late phase of contrast ultrasound is not exactly the CT one.')],
  },
  {
    id: 'couinaud', group: 'tec', tag: 'kit', exam: false,
    name: bi('Segmentación hepática (Couinaud)', 'Liver segments (Couinaud)'),
    short: bi('Segmentos de Couinaud', 'Couinaud segments'),
    kitNote: bi('No hay máscara de segmentos ni de venas suprahepáticas: aquí se aproximan con planos (cava → fosa vesicular, cava → borde derecho, cava → porción umbilical de la porta, plano portal). La máscara liver_segments (licencia abierta) daría los segmentos reales.', 'There is no mask of segments or hepatic veins: they are approximated here with planes (IVC → gallbladder fossa, IVC → right edge, IVC → umbilical portal vein, portal plane). The liver_segments mask (open licence) would give the real segments.'),
    view: { plane: 'axial', window: 'liver', zoom: 1.7, at: (p, A) => { const h = hilum(A); return [p.level === 'sup' ? h[0] - 12 : h[0] + 12, 90, 100]; } },
    params: [
      { id: 'level', type: 'select', label: bi('Corte', 'Slice'), options: [opt('sup', 'Por encima de la porta', 'Above the portal vein'), opt('inf', 'Por debajo de la porta', 'Below the portal vein')], value: 'sup', recentre: true },
      { id: 'lines', type: 'toggle', label: bi('Dibujar los límites (venas suprahepáticas aprox.)', 'Draw the boundaries (approx. hepatic veins)'), value: true },
    ],
    techniques: [tech.ct('ok', 'TC portal: las venas suprahepáticas y la porta son los límites de los segmentos (eco y TC).', 'Portal CT: the hepatic veins and the portal vein are the segment boundaries (US and CT).', { phase: 'portal' })],
    build: (p, A) => {
      const h = hilum(A), z = p.level === 'sup' ? h[0] - 12 : h[0] + 12, out = [], li = A.id(LIV), P = segPlanes(A), bb = A.s(LIV).bbox;
      if (p.lines) out.push({ t: 'cols', box: rbox(bb), label: 'keep', fn: (zz, y, x, cur) => {
        if (cur.orig !== li) return null;
        const s = segmentOf(A, zz, y, x);
        const edge = segmentOf(A, zz, y, x + 1) !== s || segmentOf(A, zz, y + 1, x) !== s;
        return edge ? { hu: 175 } : null;
      } });
      const c = segCentres(A, z);
      for (const [s, q] of Object.entries(c)) out.push(mark(q, s === '1' ? 'Segmento 1 (caudado)' : 'Segmento ' + s, s === '1' ? 'Segment 1 (caudate)' : 'Segment ' + s, { dx: 40, dy: -30 }));
      out.push(mark([P.zp, h[1], h[2]], 'Porta: división transversal', 'Portal vein: transverse division', { planes: ['coronal', 'sagittal'], dx: 60, dy: 50 }));
      return out;
    },
    info: {
      where: bi('Cada segmento es una unidad funcional con aporte arterial, drenaje venoso y vía biliar independientes. División radiológica y quirúrgica.', 'Each segment is a functional unit with its own arterial supply, venous drainage and bile duct. Radiological and surgical division.'),
      see: bi('1) La suprahepática media separa lóbulo derecho e izquierdo. 2) La izquierda divide en dos el lóbulo izquierdo y la derecha el derecho → 4 partes. 3) La vena porta hace una división transversal → 8 segmentos. El caudado (1, y el «9» del temario) drena directamente a la cava inferior, no a las suprahepáticas.', '1) The middle hepatic vein separates right and left lobes. 2) The left one splits the left lobe and the right one the right lobe → 4 parts. 3) The portal vein makes a transverse division → 8 segments. The caudate (1, and the syllabus\' "9") drains directly into the IVC, not into the hepatic veins.'),
      tip: bi('Cambia de «por encima» a «por debajo de la porta»: 2-4-7-8 arriba, 3-4-5-6 abajo.', 'Switch from "above" to "below the portal vein": 2-4-7-8 above, 3-4-5-6 below.'),
    },
    diagram: couinaudDiagram,
    flags: [
      flag('revisar', 'El temario habla de «9 segmentos» y luego dice que la división da «8 segmentos». Encaja si se cuentan 8 más el caudado (1/9); la clasificación habitual de Couinaud tiene 8 (el 9 es una subdivisión del caudado que pocos usan).', 'The syllabus speaks of "9 segments" and then says the division gives "8 segments". It fits if 8 plus the caudate (1/9) are counted; the usual Couinaud scheme has 8 (9 is a subdivision of the caudate few use).'),
      flag('ampliacion', 'Se numeran indistintamente con números romanos (I–VIII) o arábigos (1–8).', 'They are numbered with Roman (I–VIII) or Arabic (1–8) numerals interchangeably.'),
    ],
  },
];

/* ---------------- diffuse ---------------- */
const IRON = {
  hemangioma: { hb: false, fe: true, es: ['Hemangioma', 'No tiene hepatocitos (malformación vascular)'], en: ['Haemangioma', 'No hepatocytes (vascular malformation)'] },
  hnf: { hb: true, fe: true, es: ['HNF: se comporta como hígado', 'Contiene hepatocitos (desordenados)'], en: ['FNH: behaves like liver', 'Contains hepatocytes (disorganised)'] },
  adenoma: { hb: false, fe: false, es: ['Adenoma', '—'], en: ['Adenoma', '—'] },
  hcc: { hb: false, fe: false, es: ['Hepatocarcinoma', 'Células indiferenciadas, neoplásicas'], en: ['HCC', 'Undifferentiated, neoplastic cells'] },
  meta: { hb: false, fe: false, es: ['Metástasis / colangiocarcinoma', 'Tumores de otra estirpe celular'], en: ['Metastasis / cholangiocarcinoma', 'Tumours of another cell line'] },
};
const steatHU = (g, ph) => BG.liver[ph] - 16 * g;
export const DIF = [
  {
    id: 'esteatosis', group: 'difusa', tag: 'ct-real', extraTags: ['sim'],
    name: bi('Esteatosis hepática', 'Hepatic steatosis'), short: bi('Esteatosis', 'Steatosis'),
    view: { plane: 'axial', window: 'liver', zoom: 1.4, at: (p, A) => { const s = A.s('spleen').bbox; return [Math.round((s[0] + s[1]) / 2) + 4, 96, 112]; }, examPlane: 'axial' },
    params: [{ id: 'grade', type: 'range', label: bi('Grado', 'Grade'), min: 0, max: 3, step: 1, value: 2, examMin: 2 }],
    techniques: [
      tq('ct-sin', 'ct', 'ok', bi('TC sin contraste', 'Unenhanced CT'), bi('Más hipodensa (gris más oscuro): compárala con el bazo.', 'More hypodense (darker grey): compare it with the spleen.'), { window: 'liver', phase: 'sin', default: true }),
      tq('ct', 'ct', 'ok', bi('TC portal', 'Portal CT'), bi('Con contraste la comparación hígado–bazo no sirve: en fase portal el bazo ya es más denso que el hígado normal.', 'With contrast the liver–spleen comparison fails: in the portal phase the spleen is already denser than a normal liver.'), { window: 'liver', phase: 'portal' }),
      tech.gin('ok', 'En fase: la grasa no pierde señal.', 'In phase: fat keeps its signal.'),
      tech.gout('best', 'Fuera de fase: cae la señal del hígado graso. La RM es la que mejor la detecta.', 'Out of phase: the fatty liver loses signal. MR detects it best.'),
    ],
    build: (p, A, env) => {
      const tid = techId(env), out = [];
      if (p.grade > 0) out.push({ t: 'fill', s: LIV, delta: -16 * p.grade, label: 'lesion', mr: { t1: tid === 'gre-out' ? 0.5 - 0.11 * p.grade : 0.5 + 0.03 * p.grade, t2: 0.42 + 0.03 * p.grade } });
      else out.push({ t: 'fill', s: LIV, delta: 0, label: 'keep' });
      return out;
    },
    readouts: (p, A, env) => {
      const lh = steatHU(p.grade, env.phase), sh = BG.spleen[env.phase];
      return [{ label: bi('Hígado / bazo', 'Liver / spleen'), value: `${lh} / ${sh} HU (${lh - sh > 0 ? '+' : ''}${lh - sh})` },
        { label: bi('Lectura', 'Reading'), value: env.phase !== 'sin' ? bi('Con contraste no vale la comparación', 'With contrast the comparison is not valid') : lh < sh ? bi('Hígado más oscuro que el bazo → esteatosis', 'Liver darker than spleen → steatosis') : bi('Hígado igual o más denso que el bazo: normal', 'Liver as dense as or denser than spleen: normal') },
        { label: bi('Progresión', 'Progression'), value: bi('Grado 1 → 2 → 3 → esteatohepatitis → cirrosis', 'Grade 1 → 2 → 3 → steatohepatitis → cirrhosis') },
        ecoRO('↑ ecogenicidad (más blanco) del parénquima', '↑ echogenicity (whiter) of the parenchyma')];
    },
    info: {
      where: bi('Difusa, todo el hígado (la causa más frecuente de patología hepática difusa).', 'Diffuse, the whole liver (the commonest cause of diffuse liver disease).'),
      see: bi('Acumulación de grasa que progresa por grados hasta la cirrosis. <b>TC</b>: hígado más hipodenso. <b>RM</b> eco de gradiente T1: disminución de señal en fase opuesta. <b>Eco</b>: aumento de ecogenicidad.', 'Fat accumulation that progresses by grades to cirrhosis. <b>CT</b>: more hypodense liver. <b>MR</b> T1 gradient echo: signal loss on opposed phase. <b>US</b>: increased echogenicity.'),
      technique: bi('Se detecta con eco, TC y sobre todo RM.', 'Detected with US, CT and above all MR.'),
      tip: bi('Sube el grado en TC sin contraste y mira cuándo el hígado se vuelve más oscuro que el bazo; luego pasa a T1 fuera de fase.', 'Raise the grade on unenhanced CT and watch when the liver turns darker than the spleen; then switch to T1 out of phase.'),
    },
    flags: [
      flag('revisar', 'El temario compara la TC con el riñón («más hipodensa que el riñón»). En TC la referencia es el bazo: sin contraste el hígado normal es igual o más denso que el bazo; esteatosis si es más hipodenso (≈ 10 HU menos). El riñón es la referencia de la eco.', 'The syllabus compares CT with the kidney ("more hypodense than the kidney"). On CT the reference is the spleen: unenhanced, a normal liver is as dense as or denser than the spleen; steatosis if it is more hypodense (≈ 10 HU less). The kidney is the ultrasound reference.'),
      flag('ampliacion', 'Las cifras de densidad por grado son orientativas (simulación).', 'The density per grade is indicative (simulation).'),
    ],
  },
  {
    id: 'hemocromatosis', group: 'difusa', tag: 'sim',
    name: bi('Hemocromatosis', 'Haemochromatosis'), short: bi('Hemocromatosis', 'Haemochromatosis'),
    view: { plane: 'axial', window: 'liver', zoom: 1.4, at: (p, A) => { const s = A.s('spleen').bbox; return [Math.round((s[0] + s[1]) / 2), 96, 112]; }, examPlane: 'axial' },
    params: [
      { id: 'heart', type: 'toggle', label: bi('Hierro también en el corazón', 'Iron in the heart too'), value: true },
      { id: 'cirr', type: 'toggle', label: bi('Estadio final: cirrosis', 'End stage: cirrhosis'), value: false },
    ],
    techniques: [
      tech.gin('best', 'RM eco de gradiente: la más específica; en fase el hígado se ve oscuro. Además cuantifica exactamente el hierro.', 'Gradient-echo MR: the most specific; in phase the liver is dark. It also quantifies the iron exactly.'),
      tech.gout('ok', 'Fuera de fase el hígado se ve claro (al revés que la esteatosis).', 'Out of phase the liver looks bright (the reverse of steatosis).'),
      tech.t2('ok', 'T2: hígado oscuro por el hierro.', 'T2: dark liver from the iron.'),
      tq('ct', 'ct', 'bad', bi('TC', 'CT'), bi('Eco y TC no la detectan: no hay alteraciones hasta la fase de cirrosis.', 'US and CT miss it: no changes until the cirrhosis stage.'), { window: 'liver' }),
    ],
    build: (p, A, env) => {
      const tid = techId(env) || 'gre-in', t1 = tid === 'gre-in' ? 0.12 : tid === 'gre-out' ? 0.42 : 0.3, out = [];
      if (p.cirr) out.push(...L.cirrhosis(A, 0.6));
      out.push({ t: 'fill', s: LIV, delta: 0, label: 'lesion', mr: { t1, t2: 0.1, stir: 0.08 } });
      if (p.heart) out.push({ t: 'fill', s: 'heart', region: { c: [A.s(LIV).bbox[0], 110, 140], r: [40, 80, 120] }, label: 'keep', mr: { t1: t1 + 0.05, t2: 0.12, stir: 0.1 } });
      return out;
    },
    readouts: () => [{ label: bi('Eco de gradiente T1', 'T1 gradient echo'), value: bi('En fase: oscuro · fuera de fase: claro', 'In phase: dark · out of phase: bright') }, { label: bi('Riesgo', 'Risk'), value: bi('Como en la cirrosis, ↑ hepatocarcinoma → la imagen también descarta tumor', 'As in cirrhosis, ↑ HCC → imaging also rules out tumour') }],
    info: {
      where: bi('Hígado y corazón sobre todo (exceso de absorción de hierro).', 'Mainly liver and heart (excess iron absorption).'),
      see: bi('Enfermedad hereditaria <b>autosómica recesiva</b>; estadio final: cirrosis. <b>RM</b> eco de gradiente: hígado oscuro en fase y claro fuera de fase (al revés que la esteatosis).', 'Hereditary, <b>autosomal recessive</b> disease; end stage: cirrhosis. Gradient-echo <b>MR</b>: liver dark in phase and bright out of phase (the reverse of steatosis).'),
      technique: bi('Eco y TC: normales hasta la cirrosis. RM: la más específica y cuantifica el hierro.', 'US and CT: normal until cirrhosis. MR: the most specific, and it quantifies the iron.'),
      differential: bi('Esteatosis: claro en fase, negro fuera de fase.', 'Steatosis: bright in phase, black out of phase.'),
    },
    diagram: mriTable,
    flags: [
      flag('ampliacion', 'En la práctica, la sobrecarga de hierro marcada puede subir la densidad del hígado en el TC sin contraste (> 70 HU); el temario dice que TC y eco no la detectan, y así se simula.', 'In practice, marked iron overload can raise liver density on unenhanced CT (> 70 HU); the syllabus says CT and US miss it, and that is what is simulated.'),
      flag('ampliacion', 'El hierro acorta el T2*: cae la señal en el eco más largo (en fase a 1,5 T); por eso es oscuro «en fase».', 'Iron shortens T2*: signal drops on the longer echo (in phase at 1.5 T); hence it is dark "in phase".'),
    ],
  },
  {
    id: 'cirrosis', group: 'difusa', tag: 'ct-aprox',
    name: bi('Cirrosis', 'Cirrhosis'), short: bi('Cirrosis', 'Cirrhosis'),
    view: { plane: 'axial', window: 'liver', zoom: 1.5, at: (p, A) => { const h = hilum(A); return [h[0] + 4, 90, 110]; }, examPlane: 'axial' },
    params: [
      { id: 'sev', type: 'select', label: bi('Grado', 'Grade'), options: [opt(0.6, 'Inicial', 'Early'), opt(1, 'Avanzada', 'Advanced')], value: 1 },
      { id: 'nodular', type: 'toggle', label: bi('Superficie nodular', 'Nodular surface'), value: true },
      { id: 'morph', type: 'toggle', label: bi('Hipertrofia LI + caudado, atrofia LD', 'Left lobe + caudate hypertrophy, right lobe atrophy'), value: true },
      { id: 'hetero', type: 'toggle', label: bi('Patrón grosero y heterogéneo', 'Coarse heterogeneous pattern'), value: true },
      { id: 'htp', type: 'toggle', label: bi('Hipertensión portal', 'Portal hypertension'), value: false },
    ],
    techniques: [
      tq('ct', 'ct', 'ok', bi('TC portal', 'Portal CT'), bi('Morfología (borde nodular, tamaño de lóbulos) y signos de hipertensión portal.', 'Morphology (nodular edge, lobe size) and signs of portal hypertension.'), { window: 'liver' }),
      tech.t2('ok', 'RM: mismas alteraciones morfológicas.', 'MR: same morphological changes.'),
    ],
    build: (p, A, env) => {
      const s = +p.sev, out = L.cirrhosis(A, s, { morph: p.morph, nodular: p.nodular, hetero: false });
      out.push({ t: 'fill', s: LIV, delta: -3, texture: p.hetero ? 14 * s : 0, label: 'lesion', mr: { t1: 0.46, t2: 0.42 } });
      if (p.htp) out.push(...L.htp(A, env.phase, { rings: 1, spleen: 1.25, collat: true }));
      const h = hilum(A), bb = A.s(LIV).bbox;
      out.push(mark([h[0] + 4, bb[2] + 12, bb[4] + 20], 'Borde nodular', 'Nodular edge', { dx: -110, dy: -40 }));
      out.push(mark([h[0] + 4, h[1] + 10, h[2] + 8], 'Caudado hipertrófico', 'Hypertrophied caudate', { dx: 60, dy: 50 }));
      return out;
    },
    readouts: p => [{ label: bi('Signos morfológicos', 'Morphological signs'), value: bi([p.nodular && 'superficie nodular', p.morph && 'LI + caudado ↑, LD ↓', p.hetero && 'heterogéneo'].filter(Boolean).join(' · ') || '—', [p.nodular && 'nodular surface', p.morph && 'LL + caudate ↑, RL ↓', p.hetero && 'heterogeneous'].filter(Boolean).join(' · ') || '—') },
      { label: bi('Cribado', 'Screening'), value: bi('Eco cada 6 meses (descartar hepatocarcinoma)', 'Ultrasound every 6 months (rule out HCC)') }, ecoRO('Borde nodular, parénquima heterogéneo', 'Nodular edge, heterogeneous parenchyma')],
    info: {
      where: bi('Estadio final, irreversible, de toda hepatopatía crónica (fibrosis → cirrosis).', 'Irreversible end stage of every chronic liver disease (fibrosis → cirrhosis).'),
      see: bi('<b>Nodularidad de superficie</b> (borde nodular) · <b>tamaño</b>: hipertrofia del lóbulo izquierdo y del caudado con atrofia del derecho · <b>estructura</b>: patrón grosero y heterogéneo. Al avanzar → hipertensión portal.', '<b>Surface nodularity</b> (nodular edge) · <b>size</b>: hypertrophy of the left lobe and caudate with atrophy of the right · <b>structure</b>: coarse heterogeneous pattern. As it advances → portal hypertension.'),
      technique: bi('Papel de la radiología: detectar alteraciones morfológicas, buscar hipertensión portal y descartar hepatocarcinoma (eco cada 6 meses).', 'Role of imaging: detect morphological changes, look for portal hypertension and rule out HCC (ultrasound every 6 months).'),
      tip: bi('Apaga y enciende «Hipertrofia LI + caudado» para ver el cambio de proporciones.', 'Toggle "Left lobe + caudate hypertrophy" to see the change in proportions.'),
    },
    flags: [
      flag('ampliacion', 'La atrofia y la hipertrofia se simulan deformando el hígado a ambos lados de una línea cava–fosa vesicular (no hay máscara de segmentos); el lóbulo izquierdo crecido puede invadir el estómago en la imagen.', 'Atrophy and hypertrophy are simulated by warping the liver on both sides of an IVC–gallbladder-fossa line (no segment mask); the enlarged left lobe can overrun the stomach on the image.'),
      flag('revisar', '«En España la causa más frecuente de cirrosis es el VHC, seguido del alcohol»: con los antivirales de acción directa el VHC está bajando y el alcohol y la enfermedad hepática metabólica (MASLD) ganan peso; confirma el dato vigente.', '"In Spain the commonest cause of cirrhosis is HCV, followed by alcohol": with direct-acting antivirals HCV is falling and alcohol and metabolic liver disease (MASLD) are rising; check the current figure.'),
    ],
  },
  {
    id: 'htp', group: 'difusa', tag: 'ct-aprox',
    name: bi('Hipertensión portal', 'Portal hypertension'), short: bi('Hipertensión portal', 'Portal hypertension'),
    view: { plane: 'coronal', window: 'soft', zoom: 1.3, at: (p, A) => { const h = hilum(A); return p.medusa ? [h[0] + 20, h[1] - 8, h[2] + 34] : [h[0] + 8, h[1] + 4, h[2] + 30]; }, examPlane: 'axial' },
    params: [
      { id: 'portal', type: 'select', label: bi('Calibre de la porta', 'Portal vein calibre'), options: [opt(0, '≈ 12 mm (normal)', '≈ 12 mm (normal)'), opt(1, '≈ 15 mm', '≈ 15 mm'), opt(2, '≈ 18 mm', '≈ 18 mm')], value: 1, examOptions: [1, 2] },
      { id: 'spleen', type: 'range', label: bi('Bazo (aumento en el plano axial)', 'Spleen (axial-plane enlargement)'), min: 1, max: 1.6, step: 0.1, value: 1.4, unit: '×' },
      { id: 'collat', type: 'toggle', label: bi('Colaterales', 'Collaterals'), value: true },
      { id: 'medusa', type: 'toggle', label: bi('Cabeza de medusa', 'Caput medusae'), value: true },
      { id: 'cirr', type: 'toggle', label: bi('Hígado cirrótico', 'Cirrhotic liver'), value: true },
    ],
    techniques: [
      tq('ct', 'ct', 'best', bi('TC portal', 'Portal CT'), bi('Porta dilatada, esplenomegalia, colaterales y signo en cabeza de medusa.', 'Dilated portal vein, splenomegaly, collaterals and the caput medusae sign.'), { window: 'soft' }),
      tq('ct-ax', 'ct', 'ok', bi('TC axial', 'Axial CT'), bi('Corte axial: mide la porta y busca varices junto al estómago.', 'Axial slice: measure the portal vein and look for varices by the stomach.'), { window: 'soft', plane: 'axial' }),
    ],
    build: (p, A, env) => {
      const out = [];
      if (p.cirr) out.push(...L.cirrhosis(A, 0.8));
      out.push(...L.htp(A, env.phase, { rings: +p.portal, spleen: p.spleen, collat: p.collat, medusa: p.medusa }));
      const h = hilum(A); out.push(mark([h[0] + 6, h[1] + 4, h[2] + 14], 'Porta', 'Portal vein', { dx: 60, dy: 40 }));
      if (p.spleen > 1) { const s = A.s('spleen').bbox; out.push(mark([Math.round((s[0] + s[1]) / 2), Math.round((s[2] + s[3]) / 2), s[5]], 'Esplenomegalia', 'Splenomegaly', { dx: 30, dy: -50 })); }
      if (!p.collat && !p.medusa && p.portal === 0 && p.spleen <= 1) out.push({ t: 'fill', s: 'spleen', delta: 0, label: 'lesion' });
      if (+p.portal === 0 && p.spleen > 1 && !p.collat && !p.medusa) out.push({ t: 'fill', s: 'spleen', delta: 0, label: 'lesion' });
      if (+p.portal === 0 && p.spleen > 1 && (p.collat || p.medusa)) out.push({ t: 'rind', s: 'spleen', d0: 0, d1: 3, label: 'lesion' });
      return out;
    },
    readouts: (p, A) => {
      const d = portalDiameter(A) + 3 * p.portal, w = width(A, 'spleen') * p.spleen;
      return [{ label: bi('Porta (simulada)', 'Portal vein (simulated)'), value: bi(`${fx(d, 1)} mm ${d > 13 ? '> 13 mm → signo de HTP' : '(≤ 13 mm)'}`, `${fx(d, 1)} mm ${d > 13 ? '> 13 mm → PH sign' : '(≤ 13 mm)'}`) },
        { label: bi('Bazo, anchura máxima axial', 'Spleen, max axial width'), value: `${fx(w)} mm` },
        { label: bi('Doppler (eco, no simulado)', 'Doppler (US, not simulated)'), value: bi('Menor velocidad del flujo portal; pérdida de la onda trifásica en las suprahepáticas', 'Slower portal flow; loss of the triphasic wave in the hepatic veins') }];
    },
    info: {
      where: bi('Sistema portal: porta, esplénica, bazo y colaterales portosistémicas.', 'Portal system: portal and splenic veins, spleen and portosystemic collaterals.'),
      see: bi('<b>Esplenomegalia</b> · <b>porta > 13 mm</b> · <b>colaterales</b> · Doppler: menor velocidad del flujo portal y pérdida de la onda trifásica · TC: signo en <b>cabeza de medusa</b>.', '<b>Splenomegaly</b> · <b>portal vein > 13 mm</b> · <b>collaterals</b> · Doppler: slower portal flow and loss of the triphasic wave · CT: <b>caput medusae</b> sign.'),
      technique: bi('Eco-Doppler para el flujo; TC para las colaterales y la cabeza de medusa.', 'Doppler US for flow; CT for collaterals and caput medusae.'),
      tip: bi('En coronal se ve la cabeza de medusa en la pared anterior; pasa a «TC axial» para la porta y las varices.', 'The coronal view shows the caput medusae in the anterior wall; switch to "Axial CT" for the portal vein and varices.'),
    },
    flags: [
      flag('revisar', 'El temario dice «onda trifásica en las arterias suprahepáticas»; lo habitual es hablar de las venas suprahepáticas.', 'The syllabus says "triphasic wave in the hepatic arteries"; it is usually the hepatic veins.'),
      flag('ampliacion', 'La porta se ensancha en anillos de 1,5 mm (tamaño de vóxel), las colaterales y la vena paraumbilical se trazan a mano (no hay máscara) y el bazo solo crece en el plano axial.', 'The portal vein widens in 1.5 mm rings (voxel size), the collaterals and paraumbilical vein are hand-drawn (no mask) and the spleen only grows in the axial plane.'),
    ],
  },
];

/* ---------------- focal: benign ---------------- */
const dynTech = (es, en, extra = []) => [tech.ct('best', es, en), ...extra];
export const BEN = [
  {
    id: 'quiste', group: 'benigna', tag: 'ct-real', name: bi('Quiste hepático simple', 'Simple liver cyst'), short: bi('Quiste simple', 'Simple cyst'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [sizeP(30, 10, 60), siteP('der')],
    techniques: [
      tech.ct('ok', 'Hipodenso, sin captación en ninguna fase: no hace falta estudio dinámico.', 'Hypodense, no enhancement in any phase: no dynamic study needed.'),
      tech.t2('ok', 'Hiperintenso en T2.', 'Hyperintense on T2.'), tech.t1('ok', 'Hipointenso en T1.', 'Hypointense on T1.'),
    ],
    compare: ['hidatidico', 'metastasis'],
    build: (p, A) => { const c = liverSite(A, p.site); return [...L.quiste(A, c, fitR(A, c, p.size)), lm(c, 'No capta', 'No enhancement')]; },
    readouts: (p, A, env) => [contrastRO(5, env.phase), ecoRO('Anecoico (negro) con refuerzo posterior', 'Anechoic (black) with posterior enhancement'), { label: bi('Manejo', 'Management'), value: bi('Visto en eco: nada más (ni TC, ni RM, ni seguimiento)', 'Seen on US: nothing else (no CT, MR or follow-up)') }],
    info: {
      where: bi('La lesión hepática más frecuente. Congénito, por una anomalía del árbol biliar intrahepático; las poliquistosis dan quistes renales y a veces hepáticos.', 'The commonest liver lesion. Congenital, from an anomaly of the intrahepatic bile ducts; polycystic disease gives renal and sometimes liver cysts.'),
      see: bi('Líquido: <b>TC</b> hipodenso sin captación · <b>RM</b> hiperintenso en T2, hipointenso en T1 · <b>eco</b> anecoico con refuerzo posterior. No capta en ninguna técnica (no tiene vasos).', 'Fluid: <b>CT</b> hypodense, no enhancement · <b>MR</b> hyperintense on T2, hypointense on T1 · <b>US</b> anechoic with posterior enhancement. It never enhances (no vessels).'),
      technique: bi('Eco y nada más: totalmente benigno.', 'Ultrasound and nothing else: completely benign.'),
      differential: bi('Hidatídico: septos y pared que capta. Metástasis quística: anillo que capta.', 'Hydatid: septa and an enhancing wall. Cystic metastasis: enhancing ring.'),
      tip: bi('Recorre las cuatro fases: la densidad del quiste no se mueve (≈ 5 HU).', 'Go through the four phases: the cyst density does not move (≈ 5 HU).'),
    },
    flags: [ALGO_FLAG],
  },
  {
    id: 'hidatidico', group: 'benigna', tag: 'ct-real', name: bi('Quiste hidatídico', 'Hydatid cyst'), short: bi('Quiste hidatídico', 'Hydatid cyst'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [sizeP(50, 30, 70), siteP('der'), { id: 'calc', type: 'toggle', label: bi('Calcificación periférica', 'Peripheral calcification'), value: true }],
    techniques: [tech.ct('best', 'Hipodenso con septos; solo capta la pared; puede tener calcificaciones periféricas.', 'Hypodense with septa; only the wall enhances; may show peripheral calcification.'), tech.t2('ok', 'Quistes hijos hiperintensos separados por tabiques.', 'Bright daughter cysts separated by septa.')],
    compare: ['quiste', 'absceso'],
    build: (p, A, env) => { const c = liverSite(A, p.site); return [...L.hidatidico(A, c, fitR(A, c, p.size), env.phase, { calc: p.calc }), lm(c, 'Septos (quistes hijos)', 'Septa (daughter cysts)')]; },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.hidatidico.wall, env.phase), env.phase), ecoRO('Anecoico con septos', 'Anechoic with septa'), { label: bi('Manejo', 'Management'), value: bi('Seguimiento: si se rompe da clínica (anafilaxia)', 'Follow-up: rupture gives symptoms (anaphylaxis)') }],
    info: {
      where: bi('Zoonosis. Clínica: dolor y anafilaxia recurrente.', 'Zoonosis. Symptoms: pain and recurrent anaphylaxis.'),
      see: bi('Como el quiste simple pero <b>con tabiques</b>; solo capta en las paredes. TC: hipodenso con septos; puede tener <b>calcificaciones periféricas</b>.', 'Like a simple cyst but <b>with septa</b>; only the walls enhance. CT: hypodense with septa; may have <b>peripheral calcification</b>.'),
      technique: bi('Eco: anecoico con septos. Sí requiere seguimiento.', 'US: anechoic with septa. It does need follow-up.'),
      differential: bi('Quiste simple (sin septos, no capta), absceso (anillo grueso, contenido ecogénico).', 'Simple cyst (no septa, no enhancement), abscess (thick ring, echogenic content).'),
    },
    flags: [flag('ampliacion', 'Los «quistes hijos» dentro de la matriz son el aspecto típico (tipo multivesicular); la simulación los dibuja así.', 'The "daughter cysts" inside the matrix are the typical (multivesicular) look; the simulation draws them that way.')],
  },
  {
    id: 'absceso', group: 'benigna', tag: 'ct-real', name: bi('Absceso hepático', 'Liver abscess'), short: bi('Absceso hepático', 'Liver abscess'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [sizeP(45, 20, 70), siteP('der'), { id: 'gas', type: 'toggle', label: bi('Gas (anaerobios)', 'Gas (anaerobes)'), value: true }],
    techniques: [tech.ct('best', 'Captación en anillo (la pared capta = infectado); puede tener gas.', 'Ring enhancement (the wall enhances = infected); may contain gas.'), tech.t2('ok', 'RM: igual, anillo que capta.', 'MR: same, enhancing ring.')],
    treatment: { label: bi('Drenaje percutáneo', 'Percutaneous drainage'), note: bi('Tratamiento: drenaje percutáneo guiado por imagen; la cavidad se reduce.', 'Treatment: image-guided percutaneous drainage; the cavity shrinks.') },
    compare: ['metastasis', 'hidatidico'],
    build: (p, A, env) => {
      const c = liverSite(A, p.site), r = fitR(A, c, p.size), out = [...L.absceso(A, c, r, env.phase, { gas: p.gas && !env.treated, resp: env.treated ? 0.45 : 1 }), lm(c, 'Anillo que capta', 'Enhancing ring')];
      if (env.treated) out.push(...L.drain(A, c));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.absceso.rim, env.phase), env.phase), ecoRO('Colección irregular, anfractuosa, con líquido ecogénico (= complicación: infección o sangrado)', 'Irregular, ragged collection with echogenic fluid (= complication: infection or bleeding)')],
    info: {
      where: bi('Colección purulenta que destruye el parénquima; suele venir por extensión directa de infecciones, sobre todo biliares.', 'Purulent collection destroying the parenchyma; usually spreads directly from infections, mainly biliary.'),
      see: bi('TC y RM: la pared capta → <b>captación en anillo</b> (inflamación = infectado). Puede tener <b>gas</b> (anaerobios).', 'CT and MR: the wall enhances → <b>ring enhancement</b> (inflammation = infected). May contain <b>gas</b> (anaerobes).'),
      technique: bi('Eco: colección irregular con líquido ecogénico. Tratamiento: drenaje percutáneo.', 'US: irregular collection with echogenic fluid. Treatment: percutaneous drainage.'),
      differential: bi('Metástasis (también anillo, pero con primario conocido y sin clínica infecciosa).', 'Metastasis (ring too, but known primary and no infection).'),
      tip: bi('Activa «Drenaje percutáneo» para ver el catéter y la cavidad reducida.', 'Turn on "Percutaneous drainage" to see the catheter and the smaller cavity.'),
    },
    flags: [flag('ampliacion', 'El gas se coloca en la parte no declive (anterior, paciente en supino).', 'Gas is placed in the non-dependent (anterior, supine patient) part.')],
  },
  {
    id: 'hemangioma', group: 'benigna', tag: 'ct-real', name: bi('Hemangioma', 'Haemangioma'), short: bi('Hemangioma', 'Haemangioma'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [sizeP(40, 15, 60), siteP('der'), { id: 'onco', type: 'toggle', label: bi('Antecedente de neoplasia', 'History of cancer'), value: false }],
    techniques: [tech.ct('best', 'Hipodenso con captación nodular y centrípeta tardía (el estudio dinámico es lo importante).', 'Hypodense with late nodular centripetal enhancement (the dynamic study is what matters).'), tech.t2('ok', 'Hiperintenso en T2.', 'Hyperintense on T2.'), tech.t1('ok', 'Hipointenso en T1; captación nodular.', 'Hypointense on T1; nodular enhancement.')],
    compare: ['metastasis', 'hnf'],
    build: (p, A, env) => { const c = liverSite(A, p.site); return [...L.hemangioma(A, c, fitR(A, c, p.size), env.phase), lm(c, env.phase === 'tardia' ? 'Relleno centrípeto' : 'Captación nodular periférica', env.phase === 'tardia' ? 'Centripetal fill-in' : 'Peripheral nodular enhancement')]; },
    readouts: (p, A, env) => [{ label: bi('Relleno', 'Fill-in'), value: `${Math.round(L.HEMA_FILL[env.phase] * 100)} %` }, contrastRO(pv(L.HUT.hemangioma.pool, env.phase), env.phase), ecoRO('Lesión nodular hiperecogénica', 'Hyperechoic nodular lesion'),
      { label: bi('Manejo', 'Management'), value: p.onco ? bi('Antecedente de neoplasia → completar con TC o RM dinámico (plantear metástasis)', 'History of cancer → complete with dynamic CT or MR (consider metastasis)') : bi('Paciente sano: no más pruebas, control ecográfico cada 6 meses', 'Healthy patient: no more tests, ultrasound follow-up every 6 months') }],
    info: {
      where: bi('La lesión sólida hepática más frecuente; normalmente asintomática → hallazgo casual.', 'The commonest solid liver lesion; usually asymptomatic → incidental finding.'),
      see: bi('TC: hipodenso con <b>captación nodular y centrípeta tardía</b> (se rellena despacio, de fuera a dentro). RM: hiperintenso en T2, hipointenso en T1, captación nodular.', 'CT: hypodense with <b>late nodular centripetal enhancement</b> (it fills slowly, from outside in). MR: hyperintense on T2, hypointense on T1, nodular enhancement.'),
      technique: bi('Eco: nodular hiperecogénica. Típico en paciente sano → control eco cada 6 meses. Solo TC/RM si hay antecedente de neoplasia.', 'US: hyperechoic nodule. Typical in a healthy patient → ultrasound every 6 months. CT/MR only if there is a history of cancer.'),
      differential: bi('Metástasis: anillo en portal sin relleno progresivo.', 'Metastasis: ring in portal phase without progressive fill-in.'),
      tip: bi('Arterial → portal → tardía: los nódulos periféricos (con la densidad de los vasos) van confluyendo hacia el centro.', 'Arterial → portal → delayed: the peripheral nodules (as dense as the vessels) merge towards the centre.'),
    },
    flags: [flag('ampliacion', 'El relleno completo suele verse a los 3–5 min; con la «tardía» de ~90 s del temario puede quedar incompleto en lesiones grandes.', 'Complete fill-in usually shows at 3–5 min; with the syllabus\' ~90 s "delayed" phase it can be incomplete in large lesions.')],
  },
  {
    id: 'hnf', group: 'benigna', tag: 'ct-real', name: bi('Hiperplasia nodular focal (HNF)', 'Focal nodular hyperplasia (FNH)'), short: bi('HNF', 'FNH'),
    view: view('izq'), phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    params: [sizeP(35, 15, 50), siteP('izq')],
    techniques: [tech.ct('best', 'Capta en fase arterial y después se vuelve isodensa → solo se ve en arterial; captación en estrella.', 'Enhances in the arterial phase and then turns isodense → only seen in arterial; stellate pattern.'), tech.t2('ok', 'Casi isointensa (son hepatocitos).', 'Nearly isointense (hepatocytes).')],
    compare: ['adenoma', 'hcc'],
    build: (p, A, env) => { const c = liverSite(A, p.site); return [...L.hnf(A, c, fitR(A, c, p.size), env.phase), lm(c, env.phase === 'arterial' ? 'Capta en arterial; estrella' : 'Isodensa: casi no se ve', env.phase === 'arterial' ? 'Arterial enhancement; star' : 'Isodense: barely visible')]; },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.hnf.body, env.phase), env.phase), ecoRO('Muchas veces no se ve (isoecoica: hepatocitos normales)', 'Often not seen (isoechoic: normal hepatocytes)'), { label: bi('Paciente típico', 'Typical patient'), value: bi('Mujer; progresa con la estimulación hormonal', 'Woman; grows with hormonal stimulation') }],
    info: {
      where: bi('2.ª lesión sólida hepática más frecuente. Respuesta hiperplásica: hepatocitos desordenados (células «buenas»).', '2nd commonest solid liver lesion. Hyperplastic response: disorganised hepatocytes ("good" cells).'),
      see: bi('TC dinámico: <b>capta en fase arterial y después se vuelve isodensa</b> → solo se ve en arterial. Captación <b>en estrella</b> (estrellado por los vasos).', 'Dynamic CT: <b>enhances in the arterial phase and then turns isodense</b> → only seen in arterial. <b>Stellate</b> enhancement (star-shaped by its vessels).'),
      technique: bi('Eco: isoecoica. Capta hepatoespecífico y Fe.', 'US: isoechoic. Takes up liver-specific agent and Fe.'),
      differential: bi('«Llega y se queda como hígado» = HNF; «llega y se va» (lavado) = HCC o adenoma.', '"Arrives and stays like liver" = FNH; "arrives and leaves" (washout) = HCC or adenoma.'),
    },
    flags: [flag('ampliacion', 'La cicatriz central que capta en la fase tardía es un rasgo clásico que el temario no menciona.', 'The central scar enhancing in the delayed phase is a classic feature not mentioned in the syllabus.'), ALGO_FLAG],
  },
];

/* ---------------- intermediate ---------------- */
export const INT = [
  {
    id: 'adenoma', group: 'inter', tag: 'ct-real', name: bi('Adenoma hepático', 'Hepatic adenoma'), short: bi('Adenoma', 'Adenoma'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    params: [sizeP(45, 20, 70), siteP('der'), { id: 'hemo', type: 'toggle', label: bi('Focos de hemorragia', 'Haemorrhagic foci'), value: true }],
    techniques: [tech.ct('best', 'Hiperdenso en arterial y lava en portal; en tardía capta la cápsula. Focos de hemorragia.', 'Hyperdense in arterial and washes out in portal; the capsule enhances late. Haemorrhagic foci.'), tech.t1('ok', 'RM: igual que TC (realce precoz del centro y tardío de la cápsula); sangre brillante en T1.', 'MR: as CT (early central and late capsular enhancement); blood bright on T1.')],
    compare: ['hcc', 'hnf'],
    build: (p, A, env) => { const c = liverSite(A, p.site); return [...L.adenoma(A, c, fitR(A, c, p.size), env.phase, { hemo: p.hemo }), lm(c, env.phase === 'tardia' ? 'Cápsula que capta' : env.phase === 'arterial' ? 'Realce arterial' : 'Lavado', env.phase === 'tardia' ? 'Enhancing capsule' : env.phase === 'arterial' ? 'Arterial enhancement' : 'Washout')]; },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.adenoma.body, env.phase), env.phase), ecoRO('Redondeada, bien delimitada, generalmente encapsulada', 'Round, well defined, usually encapsulated'), { label: bi('Manejo', 'Management'), value: bi('Potencial de malignización y sangrado → a menudo cirugía', 'Malignant and bleeding potential → often surgery') }],
    info: {
      where: bi('Tumor poco frecuente, asociado a anticonceptivos o anabolizantes. Cordones de hepatocitos sin conductos biliares ni espacios portales; suelen ser únicos, bien circunscritos, con cápsula.', 'Uncommon tumour, linked to contraceptives or anabolic steroids. Cords of hepatocytes without bile ducts or portal tracts; usually single, well circumscribed, encapsulated.'),
      see: bi('TC: <b>hiperdenso en arterial y lava</b> en portal; en tardía <b>capta la cápsula</b>. Masas heterogéneas hipervascularizadas con <b>focos de hemorragia</b> (tienden a sangrar).', 'CT: <b>hyperdense in arterial, washes out</b> in portal; the <b>capsule enhances</b> late. Heterogeneous hypervascular masses with <b>haemorrhagic foci</b> (they tend to bleed).'),
      technique: bi('RM: igual que TC. No capta hepatoespecífico ni Fe.', 'MR: as CT. Takes up neither liver-specific agent nor Fe.'),
      differential: bi('DD principal: hepatocarcinoma (también realza en arterial y lava): el contexto decide (mujer joven con ACO frente a cirrótico con AFP ↑).', 'Main differential: HCC (also arterial enhancement and washout): context decides (young woman on the pill vs cirrhotic with ↑ AFP).'),
    },
    flags: [flag('ampliacion', 'El temario dice «lava en fase tardía (portal)»: el lavado ya puede verse en la portal y se confirma en la tardía.', 'The syllabus says "washes out in the delayed (portal) phase": washout can already show in portal and is confirmed in delayed.')],
  },
  {
    id: 'nodulos-cirrotico', group: 'inter', tag: 'sim', name: bi('Lesiones sobre hígado cirrótico', 'Lesions in the cirrhotic liver'), short: bi('Nódulos en cirrótico', 'Cirrhotic nodules'),
    view: { plane: 'axial', window: 'liver', zoom: 1.6, at: (p, A) => noduleSet(A)[0], examPlane: 'axial' },
    params: [
      { id: 'stage', type: 'select', label: bi('Progresión', 'Progression'), options: [opt('regen', 'Regeneración', 'Regeneration'), opt('displ', 'Displásicos', 'Dysplastic'), opt('hcc', 'Hepatocarcinoma', 'HCC')], value: 'displ' },
      { id: 'colapso', type: 'toggle', label: bi('Colapso cirrótico (cuña periférica)', 'Cirrhotic collapse (peripheral wedge)'), value: false },
    ],
    phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    techniques: [
      tech.t1('best', 'Displásicos: hiperintensos en T1 (en eco son iguales que los de regeneración).', 'Dysplastic: hyperintense on T1 (on US they look like regenerative ones).', { default: true }),
      tech.t2('ok', 'Colapsos: hiperintensos en T2 en la periferia, en cuña.', 'Collapse: hyperintense on T2 at the periphery, wedge-shaped.'),
      tech.ct('best', 'Regeneración y displásicos NO captan; el que empieza a captar (arterial + lavado) se ha malignizado.', 'Regenerative and dysplastic nodules do NOT enhance; the one that starts enhancing (arterial + washout) has turned malignant.'),
    ],
    compare: ['hcc'],
    build: (p, A, env) => {
      const out = L.cirrhosis(A, 0.6, { morph: false }), pts = noduleSet(A), ph = env.phase;
      pts.forEach((c, i) => {
        const isH = p.stage === 'hcc' && i === 0, r = isH ? 9 : 5.5 + (i % 3);
        if (isH) out.push(...L.hcc(A, c, r, ph, { capsule: false }));
        else out.push(sphere(A, c, r, (d, z, y, x, cur) => ({ hu: cur.hu + 2, mr: p.stage === 'displ' ? { t1: 0.74, t2: 0.36, stir: 0.3 } : { t1: 0.52, t2: 0.34, stir: 0.3 } }), { within: [LIV] }));
      });
      if (p.colapso) { const R = L.retraction(A, liverSite(A, 'ant'), 26, 3); out.push(...R.prims); out.push(wedge(A, R.at)); out.push(mark(R.at, 'Colapso: cuña periférica', 'Collapse: peripheral wedge', { dx: -150, dy: -30 })); }
      out.push(mark(pts[0], p.stage === 'hcc' ? 'Nódulo que capta → HCC' : p.stage === 'displ' ? 'Displásico: T1 hiperintenso, no capta' : 'Regeneración: no capta', p.stage === 'hcc' ? 'Enhancing nodule → HCC' : p.stage === 'displ' ? 'Dysplastic: T1 bright, no enhancement' : 'Regenerative: no enhancement'));
      return out;
    },
    readouts: p => [{ label: bi('Secuencia', 'Sequence'), value: bi('Colapsos (T2 ↑, cuña) · regeneración (se ven en eco, NO captan) → displásicos (iguales en eco, T1 ↑, NO captan) → HCC (SÍ captan: arterial + lavado)', 'Collapse (T2 ↑, wedge) · regenerative (seen on US, NO enhancement) → dysplastic (same on US, T1 ↑, NO enhancement) → HCC (DO enhance: arterial + washout)') },
      { label: bi('Estadio mostrado', 'Stage shown'), value: { regen: bi('Regeneración', 'Regeneration'), displ: bi('Displásicos', 'Dysplastic'), hcc: bi('Hepatocarcinoma (un nódulo)', 'HCC (one nodule)') }[p.stage] }],
    info: {
      where: bi('Hígado cirrótico: nódulos frecuentes de regeneración, que pueden degenerar.', 'Cirrhotic liver: frequent regenerative nodules, which can degenerate.'),
      see: bi('<b>En el cirrótico, el nódulo que empieza a captar es el que se ha malignizado.</b> Regeneración → displásicos (hiperintensos en T1, no captan) → hepatocarcinoma (realce arterial + lavado portal).', '<b>In the cirrhotic liver, the nodule that starts enhancing is the one that has turned malignant.</b> Regenerative → dysplastic (T1 bright, no enhancement) → HCC (arterial enhancement + portal washout).'),
      technique: bi('Eco cada 6 meses como cribado; TC/RM dinámico para el nódulo sospechoso.', 'Ultrasound every 6 months as screening; dynamic CT/MR for the suspicious nodule.'),
      tip: bi('Con «Hepatocarcinoma» y TC: en arterial solo brilla uno; en T1 los displásicos brillan pero en TC no captan.', 'With "HCC" on CT: in arterial only one lights up; on T1 the dysplastic ones are bright but do not enhance on CT.'),
    },
    flags: [flag('ampliacion', 'Los nódulos se dibujan sobre una cirrosis simulada; el aspecto en T2 de regeneración y displásicos (discretamente hipointensos) es ampliación.', 'The nodules are drawn on a simulated cirrhosis; the T2 look of regenerative and dysplastic nodules (slightly hypointense) is beyond the syllabus.')],
  },
];
function noduleSet(A) { const k = 'hig:nod'; if (!A.cache.has(k)) { const h = liverSite(A, 'der'); const pts = [h, ...liverPoints(A, 12, 10, 11).filter(p => Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]) > 14)].slice(0, 12); A.cache.set(k, pts); } return A.cache.get(k); }
/** Wedge of T2-bright fibrosis under a surface point (pseudo-MR + slightly hypodense on CT). */
function wedge(A, s) {
  const li = A.id(LIV), R = 18 / A.sp[0];
  return { t: 'cols', box: rbox([s[0] - R, s[0] + R, s[1] - R, s[1] + R, s[2] - R, s[2] + R]), label: 'lesion', fn: (z, y, x, cur) => {
    if (cur.orig !== li || cur.lab === 0) return null;
    const t = Math.hypot(z - s[0], y - s[1], x - s[2]) * A.sp[0]; if (t > 18) return null;
    return depth(A, LIV, z, y, x) < 14 * (1 - t / 18) ? { hu: cur.hu - 12, mr: { t1: 0.3, t2: 0.78, stir: 0.72 } } : null;
  } };
}

/* ---------------- malignant ---------------- */
export const MAL = [
  {
    id: 'hcc', group: 'maligna', tag: 'ct-real', name: bi('Hepatocarcinoma (HCC)', 'Hepatocellular carcinoma (HCC)'), short: bi('Hepatocarcinoma', 'HCC'),
    view: view('der'), phases: PH4, phaseLabels: PHL, defaultPhase: 'arterial',
    params: [sizeP(35, 10, 70), siteP('der'),
      { id: 'cirr', type: 'toggle', label: bi('Hígado cirrótico', 'Cirrhotic liver'), value: true },
      { id: 'afp', type: 'toggle', label: bi('Alfa-fetoproteína elevada', 'Raised alpha-fetoprotein'), value: true },
      { id: 'cap', type: 'toggle', label: bi('Cápsula', 'Capsule'), value: true }],
    techniques: [tech.ct('best', 'Captación en fase arterial y lavado precoz en fase portal; sin contraste muchas veces no se ve.', 'Arterial enhancement and early portal washout; often invisible without contrast.'), tech.t1('ok', 'RM: nódulo hipointenso en T1 que capta en arterial y lava en portal; puede tener cápsula.', 'MR: T1-hypointense nodule enhancing in arterial and washing out in portal; may have a capsule.')],
    treatment: { label: bi('Tratamiento según tamaño', 'Treatment by size'), note: bi('Pequeños → cirugía (se muestra el lecho de resección); grandes → conservador: quimioembolización (se muestra el lipiodol), radiofrecuencia, radioterapia selectiva.', 'Small → surgery (resection bed shown); large → conservative: chemoembolisation (lipiodol shown), radiofrequency, selective radiotherapy.') },
    compare: ['adenoma', 'hnf', 'nodulos-cirrotico'],
    build: (p, A, env) => {
      const c = liverSite(A, p.site), r = fitR(A, c, p.size), out = p.cirr ? L.cirrhosis(A, 0.6, { morph: false }) : [];
      if (env.treated) {
        if (p.size <= 30) out.push(sphere(A, c, r + 3, (d) => ({ hu: d > 0.75 ? 60 : -60, mr: { t1: 0.6, t2: 0.6, stir: 0.3 } }), { within: [LIV] }), mark(c, 'Lecho de resección', 'Resection bed'));
        else out.push(...L.hcc(A, c, r, env.phase, { capsule: p.cap }), sphere(A, c, r * 0.85, (d, z, y, x) => (NZ(x * 0.5, y * 0.5, z * 0.5) > -0.1 ? { hu: 900, mr: MR.calc } : null), { within: ['lesion'], irregular: 0.3 }), mark(c, 'Lipiodol (quimioembolización)', 'Lipiodol (chemoembolisation)'));
        return out;
      }
      out.push(...L.hcc(A, c, r, env.phase, { capsule: p.cap }), lm(c, env.phase === 'arterial' ? 'Realce arterial' : env.phase === 'sin' ? 'Casi no se ve sin contraste' : 'Lavado', env.phase === 'arterial' ? 'Arterial enhancement' : env.phase === 'sin' ? 'Barely visible unenhanced' : 'Washout'));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.hcc.body, env.phase), env.phase),
      { label: bi('Diagnóstico sin biopsia (temario)', 'Diagnosis without biopsy (syllabus)'), value: p.cirr && p.afp ? bi('Sí: cirrótico + realce arterial y lavado + AFP ↑', 'Yes: cirrhotic + arterial enhancement and washout + ↑ AFP') : !p.cirr ? bi('Dudar en hígado sano', 'Doubt it in a healthy liver') : bi('Falta la AFP elevada (según el temario)', 'Raised AFP missing (as in the syllabus)') },
      { label: bi('Tratamiento', 'Treatment'), value: p.size <= 30 ? bi('Pequeño → cirugía', 'Small → surgery') : bi('Grande → quimioembolización, radiofrecuencia, radioterapia selectiva', 'Large → chemoembolisation, radiofrequency, selective radiotherapy') },
      ecoRO('Variable, inespecífica (sirve para el cribado, no para el diagnóstico); hipervascular en Doppler', 'Variable, non-specific (for screening, not diagnosis); hypervascular on Doppler')],
    info: {
      where: bi('Tumor maligno primario hepático más frecuente; más en varones. FR: hepatitis crónica y alcohol. Historia natural: cirrótico → regeneración → displásicos → carcinoma. Patrones: único (encapsulado), difuso o múltiple.', 'Commonest primary malignant liver tumour; more in men. Risk factors: chronic hepatitis and alcohol. Natural history: cirrhosis → regenerative → dysplastic → carcinoma. Patterns: single (encapsulated), diffuse or multiple.'),
      see: bi('TC: masa hipodensa en hígado cirrótico con <b>captación en fase arterial y lavado precoz en fase portal</b> (= adenoma). Sin contraste muchas veces no se ve. Clínica tardía: dolor en hipocondrio derecho, ascitis, pérdida de peso, ↑ AFP.', 'CT: hypodense mass in a cirrhotic liver with <b>arterial enhancement and early portal washout</b> (= adenoma). Often invisible unenhanced. Late symptoms: RUQ pain, ascites, weight loss, ↑ AFP.'),
      technique: bi('Ideas clave: 1) pacientes de riesgo, hígados cirróticos (dudar en sanos); 2) realce arterial y lavado portal; 3) AFP aumentada; 4) pequeños → cirugía, grandes → conservador.', 'Key ideas: 1) at-risk patients, cirrhotic livers (doubt it in healthy ones); 2) arterial enhancement and portal washout; 3) raised AFP; 4) small → surgery, large → conservative.'),
      differential: bi('Adenoma (mismo patrón: el contexto decide), HNF (no lava).', 'Adenoma (same pattern: context decides), FNH (no washout).'),
    },
    flags: [
      flag('revisar', 'El criterio del temario «criterio mayor + 3 criterios menores + AFP elevada (imprescindible)» está desfasado: con LI-RADS v2018 el diagnóstico sin biopsia (LR-5) se basa en el realce arterial no periférico + lavado no periférico y/o cápsula según el tamaño (≥ 10 mm), solo en pacientes de alto riesgo, y la AFP no es necesaria.', 'The syllabus rule "major criterion + 3 minor criteria + raised AFP (essential)" is outdated: with LI-RADS v2018 the no-biopsy diagnosis (LR-5) rests on non-rim arterial enhancement + non-peripheral washout and/or capsule by size (≥ 10 mm), only in high-risk patients, and AFP is not required.'),
      flag('revisar', 'En el temario el texto del hepatocarcinoma queda bajo el epígrafe del colangiocarcinoma; aquí se separan.', 'In the syllabus the HCC text sits under the cholangiocarcinoma heading; they are separated here.'),
      flag('ampliacion', 'El umbral «pequeño / grande» no está en el temario (aquí 3 cm, orientativo). En BCLC la radiofrecuencia es tratamiento curativo del HCC pequeño y la quimioembolización es para el estadio intermedio.', 'The "small / large" threshold is not in the syllabus (3 cm here, indicative). In BCLC radiofrequency is curative for small HCC and chemoembolisation is for the intermediate stage.'),
    ],
  },
  {
    id: 'colangio-ih', group: 'maligna', tag: 'ct-real', name: bi('Colangiocarcinoma intrahepático', 'Intrahepatic cholangiocarcinoma'), short: bi('Colangiocarcinoma intrahepático', 'Intrahepatic cholangiocarcinoma'),
    view: { plane: 'axial', window: 'liver', zoom: 2, at: (p, A) => ccaCentre(A), examPlane: 'axial' },
    phases: PH4, phaseLabels: PHL, defaultPhase: 'tardia',
    params: [sizeP(45, 25, 60), { id: 'ducts', type: 'toggle', label: bi('Vía biliar intrahepática dilatada', 'Dilated intrahepatic ducts'), value: true }, { id: 'retr', type: 'toggle', label: bi('Retracción capsular', 'Capsular retraction'), value: true }],
    techniques: [tech.ct('best', 'Masa infiltrativa con retracción capsular; realce retardado persistente.', 'Infiltrative mass with capsular retraction; delayed persistent enhancement.'), tech.t2('ok', 'RM: hiperintensa.', 'MR: hyperintense.')],
    compare: ['metastasis', 'hcc'],
    build: (p, A, env) => {
      const c = ccaCentre(A), out = [];
      if (p.ducts) out.push(...ductTubes(A, { ih: 2.8 }));
      if (p.retr) { const R = L.retraction(A, c, 20, 5); out.push(...R.prims, mark(R.at, 'Retracción capsular', 'Capsular retraction', { dx: -150, dy: -30 })); }
      out.push(...L.colangio(A, c, p.size / 2, env.phase), lm(c, env.phase === 'tardia' ? 'Realce retardado' : 'Masa infiltrativa', env.phase === 'tardia' ? 'Delayed enhancement' : 'Infiltrative mass'));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.colangio.body, env.phase), env.phase), ecoRO('Nódulos grandes de bordes irregulares; suele dilatar la vía biliar', 'Large nodules with irregular edges; usually dilates the bile ducts')],
    info: {
      where: bi('2.ª neoplasia maligna hepática más frecuente (1.ª si el hígado no es cirrótico). Nace del epitelio de la vía biliar; asociado a colangitis esclerosante primaria.', '2nd commonest malignant liver tumour (1st in a non-cirrhotic liver). Arises from bile duct epithelium; linked to primary sclerosing cholangitis.'),
      see: bi('TC: <b>masa infiltrativa con retracción capsular</b> y <b>realce retardado persistente</b>; lesión hipovascular, hipodensa (RM: hiperintensa), grande, cerca del hilio; comprime la vía → dilata la vía intrahepática.', 'CT: <b>infiltrative mass with capsular retraction</b> and <b>delayed persistent enhancement</b>; hypovascular, hypodense (MR: hyperintense), large, near the hilum; compresses the ducts → dilated intrahepatic ducts.'),
      technique: bi('Eco → TC + colangio-RM; CPRE (stent) o ecoendoscopia para biopsia.', 'US → CT + MR cholangiography; ERCP (stent) or endoscopic US for biopsy.'),
      differential: bi('Metástasis (anillo en portal), HCC (lava; cirrótico).', 'Metastasis (portal-phase ring), HCC (washout; cirrhotic).'),
      tip: bi('Compara arterial (apenas un anillo) con tardía: el centro fibroso se va rellenando.', 'Compare arterial (barely a rim) with delayed: the fibrous centre fills in.'),
    },
    flags: [flag('revisar', 'Contradicción del temario: en el hígado dice «realce retardado persistente» y en la vía biliar «lesiones grandes cerca del hilio que NO captan». Lo habitual es un realce periférico precoz con relleno progresivo tardío (estroma fibroso); la simulación sigue el realce retardado.', 'Syllabus contradiction: the liver part says "delayed persistent enhancement" and the biliary part "large lesions near the hilum that do NOT enhance". The usual pattern is early peripheral enhancement with progressive delayed fill-in (fibrous stroma); the simulation follows delayed enhancement.')],
  },
  {
    id: 'metastasis', group: 'maligna', tag: 'ct-real', name: bi('Metástasis hepáticas', 'Liver metastases'), short: bi('Metástasis', 'Metastases'),
    view: { plane: 'axial', window: 'liver', zoom: 1.6, at: (p, A) => metaPts(A, p.n)[0], examPlane: 'axial' },
    phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [
      { id: 'n', type: 'range', label: bi('Número', 'Number'), min: 1, max: 8, step: 1, value: 5 },
      sizeP(25, 10, 40),
      { id: 'aspect', type: 'select', label: bi('Aspecto', 'Appearance'), options: [opt('tipica', 'Anillo', 'Ring'), opt('quistica', 'Centro quístico', 'Cystic centre'), opt('calcificada', 'Calcificada', 'Calcified')], value: 'tipica' },
      { id: 'prim', type: 'toggle', label: bi('Tumor primario conocido', 'Known primary tumour'), value: true },
    ],
    techniques: [tech.ct('best', 'Fase portal: realza el parénquima y destaca las hipovasculares; captación periférica en anillo.', 'Portal phase: the parenchyma enhances and hypovascular lesions stand out; peripheral ring enhancement.', { phase: 'portal' }), tech.t2('ok', 'RM: también realce en anillo.', 'MR: ring enhancement too.')],
    compare: ['absceso', 'hemangioma', 'colangio-ih'],
    build: (p, A, env) => {
      const pts = metaPts(A, p.n), out = [];
      pts.forEach((c, i) => out.push(...L.meta(A, c, Math.min(p.size / 2 * (1 - 0.12 * (i % 3)), depth(A, LIV, ...c) + 3), env.phase, { aspect: p.aspect })));
      out.push(lm(pts[0], 'Anillo periférico', 'Peripheral ring'));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(L.HUT.meta.rim, env.phase), env.phase), { label: bi('Procedimiento', 'Procedure'), value: p.prim ? bi('Primario conocido + lesión sólida nueva con anillo → metástasis', 'Known primary + new solid ring-enhancing lesion → metastasis') : bi('Sin primario conocido, imagen típica → biopsia', 'No known primary, typical image → biopsy') },
      ecoRO('Lo más frecuente hipoecogénicas; hiperecogénicas si origen digestivo o renal. A menudo pasan desapercibidas', 'Usually hypoechoic; hyperechoic if gastrointestinal or renal origin. Often missed')],
    info: {
      where: bi('Los tumores hepáticos más frecuentes. En eco muchas veces pasan desapercibidas (subdiafragmáticas, misma ecogenicidad).', 'The commonest liver tumours. Often missed on US (subdiaphragmatic, same echogenicity).'),
      see: bi('TC y RM: <b>captación periférica, realce en anillo</b>. Pueden calcificar o tener centro quístico.', 'CT and MR: <b>peripheral, ring enhancement</b>. May calcify or have a cystic centre.'),
      technique: bi('a) Primario conocido: lesión sólida nueva con anillo → metástasis. b) Sin primario: imagen típica → biopsia.', 'a) Known primary: new solid ring-enhancing lesion → metastasis. b) No primary: typical image → biopsy.'),
      differential: bi('Absceso (anillo + clínica infecciosa), hemangioma (nodular centrípeto), colangiocarcinoma (retracción capsular). Otros malignos: linfoma.', 'Abscess (ring + infection), haemangioma (nodular centripetal), cholangiocarcinoma (capsular retraction). Other malignancies: lymphoma.'),
    },
    flags: [flag('ampliacion', 'Las metástasis hipervasculares (riñón, neuroendocrinos, melanoma, tiroides) captan en arterial; el temario solo trata las hipovasculares en anillo.', 'Hypervascular metastases (kidney, neuroendocrine, melanoma, thyroid) enhance in arterial; the syllabus only covers hypovascular ring-enhancing ones.')],
  },
];
function ccaCentre(A) { const k = 'hig:cca'; if (!A.cache.has(k)) { const a = liverSite(A, 'ant'), h = hilum(A); A.cache.set(k, a.map((v, i) => Math.round(v + (h[i] - v) * 0.5))); } return A.cache.get(k); }
function metaPts(A, n) { return liverPoints(A, Math.max(1, n), 13, 5); }
export { grid };
