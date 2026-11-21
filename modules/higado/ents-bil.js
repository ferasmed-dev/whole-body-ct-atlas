// Gallbladder and biliary-tree entities. The biliary tree is not segmented on s0591: ducts are estimated tubes from the
// hilum (hepatic duct confluence) to the gallbladder neck, the pancreatic head and the papilla in D2 (see geo.js tree()).
// Backbone: the biliary clinical triad (pain · pain + jaundice · painless jaundice) and ultrasound first.
import { bi, opt, tq, mark, flag, PH4, PHL, contrastRO, ecoRO, MR, pv } from './common.js';
import { LIV, GB, PAN, PV, DUO, IVC, tree, ductTubes, cbdAt, gbParts, grid, depth, sphere, rbox, NZ, NZ2, hilum } from './geo.js';
import { biliaryDiagram, triadDiagram } from './diagrams.js';

const P4 = (sin, arterial, portal, tardia) => ({ sin, arterial, portal, tardia });
const lm = (c, es, en, x = {}) => mark(c, es, en, { dx: 60, dy: -46, ...x });
const tid = (env, d = 'ct') => (env.technique && env.technique.id) || d;
const CONTRAST = 1400, BILE_MR = { t1: 0.1, t2: 0.98, stir: 0.95 };
const VESSELS = [PV, IVC, 'aorta'];
const NOTSOFT = [PV, IVC, 'aorta', DUO, 'stomach', 'colon', 'small_bowel', 'kidney_right', 'pancreas'];

/* ---------------- techniques ---------------- */
const BT = {
  eco: (verdict, es, en) => tq('eco', 'ct', verdict, bi('Ecografía (no simulada)', 'Ultrasound (not simulated)'), bi(es + ' Se muestra el TC; el hallazgo ecográfico está en las lecturas.', en + ' The CT is shown; the ultrasound finding is in the read-outs.'), { window: 'liver' }),
  ct: (verdict, es, en, x = {}) => tq('ct', 'ct', verdict, bi('TC con contraste', 'Contrast CT'), bi(es, en), { window: 'liver', default: true, ...x }),
  crm: (verdict, es, en) => tq('crm', 't2', verdict, bi('Colangio-RM (3D T2)', 'MR cholangiography (3D T2)'), bi(es, en), { plane: 'coronal' }),
  cpre: (verdict, es, en) => tq('cpre', 'rx', verdict, bi('CPRE (colangiografía)', 'ERCP (cholangiogram)'), bi(es, en), { plane: 'coronal' }),
  ctph: (verdict, es, en) => tq('ctph', 'rx', verdict, bi('CTPH (percutánea)', 'PTC (percutaneous)'), bi(es, en), { plane: 'coronal' }),
};

/* ---------------- duct drawing per technique ---------------- */
/** Heavily T2-weighted slab (MR cholangiography): everything dark except static fluid (bile, gallbladder, bowel content). */
function mrcpBg(A) {
  const h = hilum(A), pap = tree(A).pap, [, Y, X] = A.dims, gb = A.id(GB), du = A.id(DUO), st = A.id('stomach');
  return { t: 'cols', box: rbox([h[0] - 20, pap[0] + 24, 20, Y - 30, 15, X - 15]), label: 'keep', fn: (z, y, x, cur) => {
    const o = cur.orig;
    if (o === gb) return { hu: cur.hu, mr: { t1: 0.1, t2: 0.92, stir: 0.9 } };
    if (o === du || o === st) return { hu: cur.hu, mr: { t1: 0.2, t2: 0.42, stir: 0.4 } };
    return { hu: cur.hu, mr: { t2: 0.05 + 0.03 * NZ(x * 0.2, y * 0.2, z * 0.2), stir: 0.04 } };
  } };
}
/** Percutaneous transhepatic needle / catheter from the right flank into a right intrahepatic duct. */
function ctphNeedle(A) {
  const t = tree(A).ihR[0][2], xmin = A.s(LIV).bbox[4];
  return { t: 'tube', pts: [[t[0], t[1] + 6, Math.max(2, xmin - 18)], [t[0], t[1] + 2, xmin + 6], t], r: 0.9, hu: 2500, label: 'keep', mr: MR.gas };
}
/** Ducts as the technique shows them: bile on CT and MR, iodinated contrast on ERCP / PTC (film). */
function study(A, t, radii, o = {}) {
  const out = [];
  if (t === 'crm') out.push(mrcpBg(A));
  const opac = t === 'cpre' || t === 'ctph';
  if (opac && o.gb !== false) out.push({ t: 'fill', s: GB, hu: 650, label: 'keep' });
  out.push(...ductTubes(A, radii, { hu: opac ? CONTRAST : 8, label: 'lesion', mr: BILE_MR }));
  if (t === 'ctph') out.push(ctphNeedle(A));
  return out;
}
/** Intrahepatic branches only (for hilar obstruction: the common hepatic duct below is not drawn dilated). */
function ihOnly(A, r, hu = 8) {
  const T = tree(A);
  return [...T.ihR, ...T.ihL].map(br => ({ t: 'tube', pts: br, r: r * (br[0] === T.conf ? 1 : 0.8), hu, label: 'lesion', mr: BILE_MR, within: [LIV, 'lesion'] }));
}
const ductHU = t => (t === 'cpre' || t === 'ctph' ? CONTRAST : 8);

/* ---------------- gallbladder sites ---------------- */
function gbVox(A) {
  const k = 'hig:gbv'; if (A.cache.has(k)) return A.cache.get(k);
  const id = A.id(GB), b = A.s(GB).bbox, out = [];
  for (let z = b[0]; z <= b[1]; z++) for (let y = b[2]; y <= b[3]; y++) for (let x = b[4]; x <= b[5]; x++) if (A.at(z, y, x) === id) out.push([z, y, x, depth(A, GB, z, y, x)]);
  A.cache.set(k, out); return out;
}
/** n stone centres in the dependent (posterior) part of the gallbladder lumen, r mm; the first one can be in the neck. */
function gbStones(A, n, r, neckFirst = false) {
  const k = `hig:st:${n}:${r}:${neckFirst}`; if (A.cache.has(k)) return A.cache.get(k);
  const cand = gbVox(A).filter(v => v[3] >= Math.min(r + 0.5, 9)), out = [], gp = gbParts(A), minD = (2 * r) / A.sp[0];
  if (neckFirst && cand.length) { let best = cand[0], bd = Infinity; for (const v of cand) { const d = Math.hypot(v[0] - gp.neck[0], v[1] - gp.neck[1], v[2] - gp.neck[2]); if (d < bd) { bd = d; best = v; } } out.push(best.slice(0, 3)); }
  const sorted = cand.slice().sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const v of sorted) { if (out.length >= n) break; if (out.every(q => Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]) >= minD)) out.push(v.slice(0, 3)); }
  A.cache.set(k, out); return out;
}
const STONE = {
  calcificada: () => ({ hu: 620, mr: MR.calc }),
  mixta: d => (d > 0.68 ? { hu: 480, mr: MR.calc } : { hu: 45, mr: MR.calc }),
  colesterol: () => ({ hu: 18, mr: MR.calc }),
};
function stones(A, n, size, type = 'calcificada', neck = false) {
  const r = size / 2;
  return gbStones(A, n, r, neck).map(c => sphere(A, c, r, d => STONE[type](d), { within: [GB, 'lesion'] }));
}
const gbAt = (p, A) => gbParts(A).c;
const bview = (at, zoom = 2.2, extra = {}) => ({ plane: 'axial', window: 'liver', zoom, at, examPlane: 'axial', ...extra });
const ductRO = (es, en) => ({ label: bi('Calibre (simulado)', 'Calibre (simulated)'), value: bi(es, en) });
const TRIAD_FLAG = flag('apuntes', 'Dolor → colelitiasis / colecistitis · dolor + ictericia → coledocolitiasis · ictericia indolora → neoplasia (vesícula, colangiocarcinoma, cabeza de páncreas). La eco siempre va primero.', 'Pain → gallstones / cholecystitis · pain + jaundice → choledocholithiasis · painless jaundice → tumour (gallbladder, cholangiocarcinoma, pancreatic head). Ultrasound always comes first.');
const TREE_FLAG = flag('ampliacion', 'El árbol biliar no está segmentado en este estudio: los conductos son tubos estimados desde el hilio hasta el cuello vesicular, la cabeza del páncreas y la papila en D2.', 'The biliary tree is not segmented on this study: the ducts are estimated tubes from the hilum to the gallbladder neck, the pancreatic head and the papilla in D2.');

/* ================= anatomy, techniques, clinical triad ================= */
export const BIL = [
  {
    id: 'via-biliar', group: 'bil-tec', tag: 'ct-aprox', extraTags: ['sim'], exam: false,
    name: bi('Vía biliar: anatomía y técnicas', 'Biliary tree: anatomy and techniques'), short: bi('Anatomía de la vía biliar', 'Biliary anatomy'),
    view: bview((p, A) => tree(A).cj, 2),
    params: [{ id: 'dil', type: 'toggle', label: bi('Vía dilatada (para verla)', 'Dilated ducts (to see them)'), value: false }],
    techniques: [
      BT.eco('best', 'De elección para vesícula y vía biliar (diferencia muy bien las piedras). Ayunas de 4–6 h para que la vesícula esté distendida.', 'Of choice for gallbladder and ducts (tells stones apart very well). Fast 4–6 h so the gallbladder is distended.'),
      BT.crm('best', 'Secuencia 3D potenciada en T2: el líquido se ve muy blanco y se ve el interior de los conductos. Busca sobre todo litiasis en el colédoco.', '3D T2-weighted sequence: fluid is very bright and the inside of the ducts is seen. Mainly looks for stones in the common bile duct.'),
      BT.ct('ok', 'Sobre todo en neoplasias: metástasis a distancia (estadiaje). La vía normal apenas se ve.', 'Mainly for tumours: distant metastases (staging). Normal ducts are barely seen.'),
      BT.cpre('ok', 'La hace Digestivo; objetivo terapéutico: eliminar la coledocolitiasis (las piedras drenan al duodeno). Contraste por la papila.', 'Done by Gastroenterology; therapeutic aim: clear choledocholithiasis (stones drain into the duodenum). Contrast through the papilla.'),
      BT.ctph('bad', 'Acceso percutáneo hasta el colédoco para desobstruirlo. Ya no se usa (muy invasiva).', 'Percutaneous access down to the common bile duct to unblock it. No longer used (very invasive).'),
    ],
    build: (p, A, env) => {
      const t = tid(env), T = tree(A), r = p.dil ? { ih: 2.4, chd: 4, cbd: 4, cystic: 1.8, wirsung: 2 } : { ih: 1.2, chd: 2.4, cbd: 2.6, cystic: 1.4, wirsung: 1.2 };
      const out = study(A, t, r);
      out.push(lm(T.ihR[0][2], 'Hepático derecho', 'Right hepatic duct', { dx: -150, dy: -40 }), lm(T.ihL[0][2], 'Hepático izquierdo', 'Left hepatic duct', { dx: 60, dy: -60 }),
        lm(T.chd[1], 'Hepático común', 'Common hepatic duct', { dx: 70, dy: -20 }), lm(T.cystic[1], 'Cístico (vesícula)', 'Cystic duct (gallbladder)', { dx: -150, dy: 30 }),
        lm(T.cbd[2], 'Colédoco', 'Common bile duct', { dx: 70, dy: 20 }), lm(T.pap, 'Ampolla de Vater (D2)', 'Ampulla of Vater (D2)', { dx: -150, dy: 50 }),
        lm(T.wirsung[Math.min(3, T.wirsung.length - 1)], 'Conducto pancreático', 'Pancreatic duct', { dx: 60, dy: 50 }));
      return out;
    },
    readouts: (p, A, env) => [{ label: bi('Técnica', 'Technique'), value: { eco: bi('Eco: la vía normal no se ve; si se ve junto a la porta («dos tubitos») es patológica', 'US: normal ducts are not seen; if seen beside the portal vein ("two little tubes") it is abnormal'), crm: bi('Colangio-RM: solo brilla el líquido quieto (bilis, vesícula, duodeno)', 'MRCP: only still fluid is bright (bile, gallbladder, duodenum)'), cpre: bi('CPRE: contraste por la papila; se proyecta como una radiografía', 'ERCP: contrast through the papilla; projected like a film'), ctph: bi('CTPH: aguja transhepática desde el flanco derecho', 'PTC: transhepatic needle from the right flank') }[tid(env)] || bi('TC: bilis ≈ 0–20 HU, más oscura que el hígado', 'CT: bile ≈ 0–20 HU, darker than liver') }],
    info: {
      where: bi('1) Hepático derecho (lóbulo derecho) + izquierdo (lóbulo izquierdo) → hepático común. 2) Hepático común + cístico (de la vesícula) → colédoco. 3) Colédoco + conducto pancreático principal → duodeno por la ampolla de Vater.', '1) Right hepatic duct (right lobe) + left (left lobe) → common hepatic duct. 2) Common hepatic + cystic (from the gallbladder) → common bile duct. 3) Common bile duct + main pancreatic duct → duodenum through the ampulla of Vater.'),
      see: bi('<b>Ecografía</b> de elección (ayunas 4–6 h) · <b>colangio-RM</b> (3D T2: litiasis en el colédoco) · <b>TC</b> (neoplasias, estadiaje) · <b>CPRE</b> (Digestivo, terapéutica) · <b>CTPH</b> (ya no se usa).', '<b>Ultrasound</b> of choice (fast 4–6 h) · <b>MRCP</b> (3D T2: common duct stones) · <b>CT</b> (tumours, staging) · <b>ERCP</b> (Gastroenterology, therapeutic) · <b>PTC</b> (no longer used).'),
      technique: bi('Cambia de técnica: colangio-RM y CPRE se ven mejor en coronal.', 'Switch technique: MRCP and ERCP read best in the coronal plane.'),
      tip: bi('Activa «Vía dilatada» para ver el árbol entero en el TC.', 'Turn on "Dilated ducts" to see the whole tree on CT.'),
    },
    diagram: biliaryDiagram,
    flags: [TREE_FLAG, flag('ampliacion', 'En la práctica, el colédoco normal mide hasta ~6 mm (algo más en ancianos y colecistectomizados).', 'In practice the normal common bile duct measures up to ~6 mm (a little more in the elderly and after cholecystectomy).'), flag('ampliacion', 'La colangio-RM y la CPRE se simulan: un corte T2 muy potenciado y una proyección del TC con los conductos opacificados.', 'MRCP and ERCP are simulated: a heavily T2-weighted slice and a CT projection with opacified ducts.')],
  },
  {
    id: 'clinica-biliar', group: 'bil-tec', tag: 'esquema', exam: false,
    name: bi('Clínica biliar: dolor, dolor + ictericia, ictericia indolora', 'Biliary presentation: pain, pain + jaundice, painless jaundice'), short: bi('Tríada clínica biliar', 'Biliary clinical triad'),
    view: bview((p, A) => tree(A).cj, 1.8),
    params: [{ id: 'cuadro', type: 'select', label: bi('Cuadro clínico', 'Presentation'), options: [opt('dolor', 'Dolor abdominal', 'Abdominal pain'), opt('ictericia', 'Dolor + ictericia', 'Pain + jaundice'), opt('indolora', 'Ictericia indolora', 'Painless jaundice')], value: 'dolor' }],
    techniques: [BT.eco('best', 'Siempre primero, en los tres cuadros.', 'Always first, in all three presentations.'), BT.ct('ok', 'Ictericia indolora: estadiaje de la neoplasia.', 'Painless jaundice: tumour staging.')],
    build: (p, A) => {
      const T = tree(A), gp = gbParts(A);
      if (p.cuadro === 'dolor') return [lm(gp.c, 'Vesícula: colelitiasis / colecistitis', 'Gallbladder: gallstones / cholecystitis')];
      if (p.cuadro === 'ictericia') return [lm(T.cbd[3], 'Colédoco: coledocolitiasis', 'Common duct: choledocholithiasis')];
      return [lm(gp.c, 'Vesícula (carcinoma)', 'Gallbladder (carcinoma)', { dx: -150 }), lm(T.conf, 'Hilio (Klatskin)', 'Hilum (Klatskin)'), lm(T.pap, 'Cabeza del páncreas', 'Pancreatic head', { dy: 50 })];
    },
    readouts: p => [{ label: bi('Sospecha', 'Suspect'), value: { dolor: bi('Colelitiasis (sin ictericia) o colecistitis (+ fiebre, escalofríos, leucocitosis)', 'Gallstones (no jaundice) or cholecystitis (+ fever, chills, leucocytosis)'), ictericia: bi('Coledocolitiasis: causa más frecuente de ictericia dolorosa', 'Choledocholithiasis: commonest cause of painful jaundice'), indolora: bi('Neoplasia: carcinoma de vesícula, colangiocarcinoma, adenocarcinoma de cabeza de páncreas', 'Tumour: gallbladder carcinoma, cholangiocarcinoma, pancreatic head adenocarcinoma') }[p.cuadro] },
      { label: bi('Pruebas', 'Tests'), value: { dolor: bi('Eco de elección; colelitiasis: nada más. Enfisematosa: TC', 'US of choice; gallstones: nothing more. Emphysematous: CT'), ictericia: bi('Eco + ingreso → colangio-RM → CPRE (Digestivo)', 'US + admission → MRCP → ERCP (Gastroenterology)'), indolora: bi('Eco + ingreso → TC (estadiaje) + colangio-RM', 'US + admission → CT (staging) + MRCP') }[p.cuadro] }],
    info: {
      where: bi('La clínica orienta la entidad; la eco siempre va primero.', 'The presentation points to the entity; ultrasound always comes first.'),
      see: bi('<b>Dolor</b> = colelitiasis / colecistitis · <b>dolor + ictericia</b> = coledocolitiasis · <b>ictericia indolora</b> = neoplasia. ¡Cuidado con las ictericias indoloras: hay que sospechar neoplasia!', '<b>Pain</b> = gallstones / cholecystitis · <b>pain + jaundice</b> = choledocholithiasis · <b>painless jaundice</b> = tumour. Beware painless jaundice: suspect a tumour!'),
      tip: bi('«Con dolor, piedra; sin dolor, tumor».', '"With pain, a stone; without pain, a tumour".'),
    },
    diagram: triadDiagram,
    flags: [TRIAD_FLAG],
  },

  /* ================= gallbladder ================= */
  {
    id: 'colelitiasis', group: 'vesicula', tag: 'ct-real', name: bi('Colelitiasis', 'Gallstones (cholelithiasis)'), short: bi('Colelitiasis', 'Gallstones'),
    view: bview(gbAt, 2.6),
    params: [{ id: 'n', type: 'range', label: bi('Número de cálculos', 'Number of stones'), min: 1, max: 8, step: 1, value: 3 }, { id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 4, max: 20, step: 2, value: 12, unit: 'mm' },
      { id: 'tipo', type: 'select', label: bi('Composición', 'Composition'), options: [opt('calcificada', 'Calcificados', 'Calcified'), opt('mixta', 'Mixtos (anillo cálcico)', 'Mixed (calcified rim)'), opt('colesterol', 'Colesterol (casi isodensos)', 'Cholesterol (near isodense)')], value: 'calcificada' }],
    techniques: [BT.eco('best', 'Técnica de elección; no hay que hacer nada más: imágenes hiperecogénicas dentro de la vesícula con sombra posterior.', 'Technique of choice; nothing else is needed: echogenic foci in the gallbladder with posterior shadowing.'),
      BT.ct('bad', 'No se pide para esto; los cálculos de colesterol pueden no verse.', 'Not requested for this; cholesterol stones may be missed.'),
      BT.crm('ok', 'Defectos negros dentro de la bilis blanca (en vesícula y vía).', 'Black defects within bright bile (gallbladder and ducts).')],
    compare: ['colecistitis', 'ca-vesicula'],
    build: (p, A, env) => {
      const out = tid(env) === 'crm' ? [mrcpBg(A)] : [], st = stones(A, p.n, p.size, p.tipo);
      out.push(...st);
      const c = gbStones(A, p.n, p.size / 2)[0] || gbParts(A).c;
      out.push(lm(c, p.tipo === 'colesterol' ? 'Cálculo de colesterol: casi invisible en TC' : 'Cálculos en la parte declive', p.tipo === 'colesterol' ? 'Cholesterol stone: nearly invisible on CT' : 'Stones in the dependent part'));
      return out;
    },
    readouts: p => [ecoRO('Hiperecogénicas dentro de la vesícula con sombra acústica posterior (también las de colesterol)', 'Echogenic foci in the gallbladder with posterior acoustic shadowing (cholesterol ones too)'),
      { label: bi('Clínica', 'Presentation'), value: bi('Dolor cólico en hipocondrio derecho, SIN ictericia', 'Colicky right upper quadrant pain, NO jaundice') },
      { label: bi('En TC', 'On CT'), value: p.tipo === 'colesterol' ? bi('≈ 18 HU frente a bilis ≈ 10 HU: no se distinguen', '≈ 18 HU vs bile ≈ 10 HU: indistinguishable') : bi('Hiperdensos (calcio)', 'Hyperdense (calcium)') }],
    info: {
      where: bi('Litiasis dentro de la vesícula.', 'Stones inside the gallbladder.'),
      see: bi('Eco: <b>imágenes hiperecogénicas con sombra posterior</b> dentro de la vesícula (refuerzo = líquido; sombra = litiasis).', 'US: <b>echogenic foci with posterior shadowing</b> in the gallbladder (enhancement = fluid; shadow = stone).'),
      technique: bi('Ecografía y nada más.', 'Ultrasound and nothing else.'),
      differential: bi('Colecistitis (+ fiebre, Murphy, pared gruesa), carcinoma de vesícula (la colelitiasis es su factor de riesgo).', 'Cholecystitis (+ fever, Murphy, thick wall), gallbladder carcinoma (gallstones are its risk factor).'),
      tip: bi('Cambia a «Colesterol»: en el TC desaparecen; por eso la eco es la técnica.', 'Switch to "Cholesterol": they vanish on CT; that is why ultrasound is the test.'),
    },
    flags: [TRIAD_FLAG, flag('ampliacion', 'En la práctica el TC no ve una parte importante de los cálculos (los de colesterol pueden ser isodensos a la bilis); la composición no se trata en el temario.', 'In practice CT misses a sizeable share of stones (cholesterol ones can be isodense to bile); composition is not covered in the syllabus.')],
  },
  {
    id: 'colecistitis', group: 'vesicula', tag: 'ct-real', name: bi('Colecistitis aguda', 'Acute cholecystitis'), short: bi('Colecistitis', 'Cholecystitis'),
    view: bview(gbAt, 2.4),
    params: [{ id: 'wall', type: 'range', label: bi('Grosor de la pared', 'Wall thickness'), min: 3, max: 10, step: 1, value: 6, unit: 'mm' },
      { id: 'hidrops', type: 'toggle', label: bi('Vesícula distendida (hidrops)', 'Distended gallbladder (hydrops)'), value: true },
      { id: 'fluid', type: 'toggle', label: bi('Líquido perivesicular', 'Pericholecystic fluid'), value: true },
      { id: 'neck', type: 'toggle', label: bi('Cálculo enclavado en el infundíbulo', 'Stone impacted in the infundibulum'), value: true }],
    techniques: [BT.eco('best', 'Técnica de elección: colelitiasis, Murphy ecográfico, pared engrosada, líquido perivesicular.', 'Technique of choice: gallstones, sonographic Murphy, thick wall, pericholecystic fluid.'),
      BT.ct('ok', 'Muestra la pared, la distensión y el líquido, pero no es la de elección.', 'Shows the wall, distension and fluid, but is not the test of choice.')],
    compare: ['enfisematosa', 'colelitiasis', 'ca-vesicula'],
    build: (p, A, env) => colecist(A, p, env),
    readouts: p => [ecoRO('Litiasis · Murphy ecográfico (dolor al presionar con el transductor) · pared engrosada · líquido perivesicular', 'Stones · sonographic Murphy (pain on pressing with the probe) · thick wall · pericholecystic fluid'),
      { label: bi('Criterios presentes (simulados)', 'Criteria present (simulated)'), value: bi([p.neck && 'colelitiasis', p.wall >= 4 && 'pared ' + p.wall + ' mm', p.fluid && 'líquido perivesicular', p.hidrops && 'distensión'].filter(Boolean).join(' · ') || '—', [p.neck && 'gallstone', p.wall >= 4 && 'wall ' + p.wall + ' mm', p.fluid && 'pericholecystic fluid', p.hidrops && 'distension'].filter(Boolean).join(' · ') || '—') },
      { label: bi('Clínica', 'Presentation'), value: bi('Dolor cólico + fiebre y escalofríos; leucocitosis con desviación izquierda', 'Colicky pain + fever and chills; leucocytosis with left shift') }],
    info: {
      where: bi('Infección e inflamación de la vesícula como consecuencia de la colelitiasis: la piedra se enclava en el infundíbulo, la vesícula no drena, se distiende y se infecta.', 'Infection and inflammation of the gallbladder after gallstones: the stone impacts in the infundibulum, the gallbladder cannot drain, distends and becomes infected.'),
      see: bi('Criterios: <b>colelitiasis</b>, <b>Murphy ecográfico</b>, <b>engrosamiento de la pared</b> (inespecífico), <b>líquido perivesicular</b>. Hidrops = vesícula muy distendida por obstrucción.', 'Criteria: <b>gallstones</b>, <b>sonographic Murphy</b>, <b>wall thickening</b> (non-specific), <b>pericholecystic fluid</b>. Hydrops = gallbladder very distended by obstruction.'),
      technique: bi('Ecografía de elección.', 'Ultrasound of choice.'),
      differential: bi('Pared gruesa también en neoplasia, adenomiomatosis, hepatitis, insuficiencia cardíaca, ascitis o falta de ayuno. El Murphy falta con analgesia, si el paciente no puede expresar dolor o con necrosis vesicular.', 'A thick wall also in tumour, adenomyomatosis, hepatitis, heart failure, ascites or a non-fasted patient. Murphy is absent with analgesia, if the patient cannot express pain or with gallbladder necrosis.'),
    },
    flags: [TRIAD_FLAG, flag('ampliacion', 'La pared se dibuja con una mucosa que capta y una capa externa edematosa (hipodensa); el temario solo habla de engrosamiento.', 'The wall is drawn with an enhancing mucosa and an oedematous (hypodense) outer layer; the syllabus only mentions thickening.')],
  },
  {
    id: 'enfisematosa', group: 'vesicula', tag: 'ct-real', name: bi('Colecistitis enfisematosa gangrenosa', 'Emphysematous (gangrenous) cholecystitis'), short: bi('Colecistitis enfisematosa', 'Emphysematous cholecystitis'),
    view: bview(gbAt, 2.4),
    params: [{ id: 'gas', type: 'select', label: bi('Gas', 'Gas'), options: [opt('ambos', 'En la luz y en la pared', 'In the lumen and the wall'), opt('luz', 'Solo en la luz (nivel)', 'Lumen only (level)'), opt('pared', 'Solo en la pared', 'Wall only')], value: 'ambos' }],
    techniques: [BT.ct('best', 'Ante la sospecha: gas en la vesícula (luz y/o pared).', 'When suspected: gas in the gallbladder (lumen and/or wall).', { window: 'soft' }), BT.eco('bad', 'No la ve bien: el gas impide valorar la vesícula.', 'Does not see it well: the gas hides the gallbladder.')],
    compare: ['colecistitis'],
    build: (p, A) => {
      const out = colecist(A, { wall: 4, hidrops: false, fluid: true, neck: false }, { phase: 'portal' }), c = gbParts(A).c;
      if (p.gas !== 'pared') out.push({ t: 'layer', s: GB, from: 'anterior', depth: 7, hu: -950, label: 'lesion', mr: MR.gas });
      if (p.gas !== 'luz') { const id = A.id(GB); out.push({ t: 'cols', box: rbox(A.s(GB).bbox), label: 'lesion', fn: (z, y, x, cur) => {
        if (cur.orig !== id) return null; const d = depth(A, GB, z, y, x);
        return d <= 3.2 && NZ2(x * 0.3, y * 0.3, z * 0.3) > -0.15 ? { hu: -850, mr: MR.gas } : null;
      } }); }
      out.push(lm(c, p.gas === 'pared' ? 'Gas en la pared' : 'Gas en la vesícula', p.gas === 'pared' ? 'Gas in the wall' : 'Gas in the gallbladder'));
      return out;
    },
    readouts: () => [{ label: bi('Paciente típico', 'Typical patient'), value: bi('Anciano diabético, cuadro séptico, sin dolor abdominal (anodinia)', 'Elderly diabetic, septic, no abdominal pain') }, ecoRO('No valorable: el gas produce sombra sucia', 'Not assessable: the gas casts dirty shadowing')],
    info: {
      where: bi('No se debe a litiasis. Ancianos diabéticos; infección por anaerobios productores de gas. Poco frecuente pero muy grave.', 'Not due to stones. Elderly diabetics; infection by gas-forming anaerobes. Rare but very serious.'),
      see: bi('TC: <b>gas en la vesícula</b> (en la luz, con nivel, y/o en la pared).', 'CT: <b>gas in the gallbladder</b> (in the lumen, with a level, and/or in the wall).'),
      technique: bi('La eco no la ve bien por el gas → TC ante la sospecha.', 'US does not see it well because of the gas → CT when suspected.'),
      differential: bi('Colecistitis litiásica (dolor, Murphy), aerobilia (gas en la vía biliar, no en la vesícula).', 'Calculous cholecystitis (pain, Murphy), pneumobilia (gas in the ducts, not the gallbladder).'),
      tip: bi('Usa ventana de partes blandas o pulmón para distinguir gas de grasa.', 'Use a soft-tissue or lung window to tell gas from fat.'),
    },
    flags: [flag('ampliacion', 'En la práctica hasta la mitad de los casos tienen litiasis y muchos sí tienen dolor; es más frecuente en varones.', 'In practice up to half the cases have stones and many do have pain; it is commoner in men.')],
  },
  {
    id: 'ca-vesicula', group: 'vesicula', tag: 'ct-real', name: bi('Carcinoma de vesícula biliar', 'Gallbladder carcinoma'), short: bi('Carcinoma de vesícula', 'Gallbladder carcinoma'),
    view: bview(gbAt, 2.2), phases: PH4, phaseLabels: PHL, defaultPhase: 'portal',
    params: [{ id: 'forma', type: 'select', label: bi('Forma', 'Form'), options: [opt('masa', 'Masa que sustituye a la vesícula', 'Mass replacing the gallbladder'), opt('polipoidea', 'Masa polipoidea', 'Polypoid mass'), opt('mural', 'Engrosamiento nodular de la pared', 'Nodular wall thickening')], value: 'masa' },
      { id: 'size', type: 'range', label: bi('Tamaño (masa / pólipo)', 'Size (mass / polyp)'), min: 15, max: 60, step: 5, value: 45, unit: 'mm' },
      { id: 'lit', type: 'toggle', label: bi('Colelitiasis (factor de riesgo)', 'Gallstones (risk factor)'), value: true },
      { id: 'ducts', type: 'toggle', label: bi('Vía intrahepática dilatada (ictericia)', 'Dilated intrahepatic ducts (jaundice)'), value: true }],
    techniques: [BT.eco('best', 'Prueba de elección.', 'Test of choice.'), BT.ct('ok', 'Estadificación y valoración quirúrgica.', 'Staging and surgical assessment.'), BT.crm('ok', 'Para el árbol biliar.', 'For the biliary tree.')],
    compare: ['colecistitis', 'colelitiasis'],
    build: (p, A, env) => {
      const t = tid(env), out = t === 'crm' ? [mrcpBg(A)] : [], gp = gbParts(A), ph = env.phase, H = TUM;
      if (p.ducts) out.push(...ihOnly(A, 2.6, ductHU(t)));
      const fn = (d, z, y, x) => (NZ(x * 0.25 + 5, y * 0.25, z * 0.25) > 0.38 && d < 0.7 ? { hu: 32, mr: MR.fluid } : { hu: pv(H, ph) + 8 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: MR.solidHypoT1 });
      let c = gp.c;
      if (p.forma === 'masa') {
        out.push(sphere(A, gp.c, Math.min(p.size / 2, 30), fn, { within: [GB, LIV, 0, 'lesion'], outside: NOTSOFT.filter(k => k !== 'pancreas'), irregular: 0.4 }));
      } else if (p.forma === 'polipoidea') {
        const r = Math.min(p.size / 2, 12); c = polypSite(A, r);
        out.push(sphere(A, c, r, (d, z, y, x) => ({ hu: pv(H, ph) + 6 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: MR.solidHypoT1 }), { within: [GB, 'lesion'], irregular: 0.25 }));
      } else {
        const id = A.id(GB), b = A.s(GB).bbox;
        out.push({ t: 'cols', box: rbox(b), label: 'lesion', fn: (z, y, x, cur) => {
          if (cur.orig !== id) return null;
          const th = 3 + 7 * Math.max(0, NZ(x * 0.18, y * 0.18, z * 0.18) + 0.25);
          return depth(A, GB, z, y, x) <= th ? { hu: pv(H, ph) + 6 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: MR.solidHypoT1 } : null;
        } });
        c = gbVox(A).filter(v => v[3] <= 3).sort((a, b) => b[1] - a[1])[0] || gp.c; c = c.slice(0, 3);
      }
      if (p.lit) out.push(...stones(A, 1, 12, 'calcificada'));
      out.push(lm(c, { masa: 'La vesícula «se desdibuja»', polipoidea: 'Masa polipoidea', mural: 'Engrosamiento nodular' }[p.forma], { masa: 'The gallbladder "blurs away"', polipoidea: 'Polypoid mass', mural: 'Nodular thickening' }[p.forma]));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(TUM, env.phase), env.phase), { label: bi('Clínica', 'Presentation'), value: bi('Ictericia sin dolor; pacientes mayores; mal pronóstico', 'Painless jaundice; older patients; poor prognosis') }, ecoRO('Masa o engrosamiento que borra los límites de la vesícula', 'Mass or thickening that blurs the gallbladder outline')],
    info: {
      where: bi('Neoplasia más frecuente del árbol biliar. Pacientes mayores; mal pronóstico. FR conocido: colelitiasis.', 'Commonest tumour of the biliary tree. Older patients; poor prognosis. Known risk factor: gallstones.'),
      see: bi('Tres formas: <b>masa que sustituye a la vesícula</b>, <b>masa polipoidea</b> o <b>engrosamiento nodular mural</b> → la vesícula «se desdibuja».', 'Three forms: <b>mass replacing the gallbladder</b>, <b>polypoid mass</b> or <b>nodular wall thickening</b> → the gallbladder "blurs away".'),
      technique: bi('Eco de elección; TC para estadificación y valoración quirúrgica; colangio-RM para el árbol biliar.', 'US of choice; CT for staging and surgical assessment; MRCP for the biliary tree.'),
      differential: bi('Colecistitis (pared gruesa lisa, clínica infecciosa), pólipo benigno.', 'Cholecystitis (smooth thick wall, infection), benign polyp.'),
    },
    flags: [TRIAD_FLAG, flag('ampliacion', 'Es más frecuente en mujeres; la masa que sustituye a la vesícula suele invadir el lecho hepático (segmentos 4b y 5), como se dibuja.', 'It is commoner in women; the mass replacing the gallbladder usually invades the liver bed (segments 4b and 5), as drawn.')],
  },

  /* ================= ducts ================= */
  {
    id: 'coledocolitiasis', group: 'conductos', tag: 'ct-aprox', name: bi('Coledocolitiasis', 'Choledocholithiasis'), short: bi('Coledocolitiasis', 'Choledocholithiasis'),
    view: bview((p, A) => cbdAt(A, 0.5), 2.2),
    params: [{ id: 'size', type: 'range', label: bi('Tamaño de la piedra', 'Stone size'), min: 4, max: 12, step: 2, value: 8, unit: 'mm' },
      { id: 'cbd', type: 'range', label: bi('Diámetro del colédoco', 'Common duct diameter'), min: 8, max: 16, step: 2, value: 12, unit: 'mm' },
      { id: 'tipo', type: 'select', label: bi('Piedra en TC', 'Stone on CT'), options: [opt('calcificada', 'Calcificada', 'Calcified'), opt('iso', 'Poco densa', 'Low density')], value: 'calcificada' },
      { id: 'gb', type: 'toggle', label: bi('Colelitiasis asociada', 'Associated gallstones'), value: true }],
    techniques: [BT.eco('best', 'Muy sensible para la dilatación; la vía normal no se ve: si se ve es patológica («dos tubitos», doble luz). A veces no ve la piedra.', 'Very sensitive for dilatation; normal ducts are not seen: if seen it is abnormal ("two little tubes", double lumen). Sometimes misses the stone.'),
      BT.crm('best', 'Durante el ingreso: cuántas piedras y dónde.', 'During admission: how many stones and where.'),
      BT.cpre('ok', 'Tratamiento (Digestivo): elimina la obstrucción; defecto de repleción endoluminal en «pata de cangrejo».', 'Treatment (Gastroenterology): clears the obstruction; endoluminal filling defect, "crab claw".'),
      BT.ct('ok', 'Ve la dilatación; la piedra solo si es densa.', 'Shows dilatation; the stone only if dense.')],
    treatment: { label: bi('CPRE: extracción de la piedra', 'ERCP: stone extraction'), note: bi('La piedra drena al duodeno y la vía se descomprime.', 'The stone drains into the duodenum and the ducts decompress.') },
    compare: ['klatskin', 'colangio-extra'],
    build: (p, A, env) => {
      const t = tid(env), out = [], sc = cbdAt(A, 0.82), sr = p.size / 2;
      if (env.treated) { out.push(...study(A, t, { ih: 1.2, chd: 2.6, cbd: 3, cystic: 1.4 })); out.push(lm(sc, 'Tras CPRE: colédoco libre', 'After ERCP: duct cleared')); return out; }
      const R = Math.max(p.cbd / 2, sr + 1);
      out.push(...study(A, t, { ih: 2.6, chd: R * 0.9, cbd: R, cystic: 1.6 }));
      const sm = t === 'crm' ? { t1: 0.04, t2: 0.03, stir: 0.03 } : MR.calc;
      out.push(sphere(A, sc, sr, d => ({ hu: t === 'cpre' || t === 'ctph' ? 60 : p.tipo === 'calcificada' ? (d > 0.5 ? 520 : 300) : 45, mr: sm }), { within: ['lesion'] }));
      if (p.gb) out.push(...stones(A, 2, 8, 'calcificada'));
      out.push(lm(sc, t === 'cpre' ? 'Defecto de repleción («pata de cangrejo»)' : 'Litiasis en el colédoco', t === 'cpre' ? 'Filling defect ("crab claw")' : 'Common duct stone'), lm(tree(A).chd[1], 'Doble luz (vía dilatada junto a la porta)', 'Double lumen (dilated duct beside the portal vein)', { dx: -170, dy: -40, planes: ['axial'] }));
      return out;
    },
    readouts: (p, A, env) => [ductRO(env.treated ? 'Colédoco normal tras CPRE' : `Colédoco ≈ ${Math.max(p.cbd, p.size + 2)} mm · vía intrahepática dilatada`, env.treated ? 'Normal duct after ERCP' : `Common duct ≈ ${Math.max(p.cbd, p.size + 2)} mm · dilated intrahepatic ducts`),
      { label: bi('Clínica', 'Presentation'), value: bi('Dolor + ictericia: causa más frecuente de ictericia dolorosa. Se ingresa.', 'Pain + jaundice: commonest cause of painful jaundice. Admitted.') },
      ecoRO('Litiasis en colédoco con sombra; vía intrahepática dilatada («dos tubitos»)', 'Stone in the common duct with shadowing; dilated intrahepatic ducts ("two little tubes")')],
    info: {
      where: bi('Litiasis que obstruye el colédoco → dilatación retrógrada del colédoco y de la vía intrahepática. Suele acompañarse de colelitiasis.', 'A stone blocking the common bile duct → retrograde dilatation of the duct and intrahepatic tree. Usually with gallstones.'),
      see: bi('Eco: vía dilatada (<b>doble luz</b>: «dos tubitos» junto a la porta) y a veces la piedra con sombra. Colangio-RM: defecto negro en la bilis blanca. CPRE: <b>defecto de repleción en «pata de cangrejo»</b>.', 'US: dilated ducts (<b>double lumen</b>: "two little tubes" by the portal vein) and sometimes the shadowing stone. MRCP: black defect in bright bile. ERCP: <b>"crab claw" filling defect</b>.'),
      technique: bi('Eco → ingreso → colangio-RM → CPRE (Digestivo) para eliminar la obstrucción.', 'US → admission → MRCP → ERCP (Gastroenterology) to clear the obstruction.'),
      differential: bi('Colangiocarcinoma y cabeza de páncreas (ictericia indolora); Klatskin (colédoco no dilatado).', 'Cholangiocarcinoma and pancreatic head (painless jaundice); Klatskin (common duct not dilated).'),
      tip: bi('Compara TC, colangio-RM (coronal) y CPRE: la misma piedra, tres aspectos.', 'Compare CT, MRCP (coronal) and ERCP: the same stone, three looks.'),
    },
    flags: [TRIAD_FLAG, TREE_FLAG],
  },
  {
    id: 'klatskin', group: 'conductos', tag: 'ct-aprox', name: bi('Tumor de Klatskin (colangiocarcinoma hiliar)', 'Klatskin tumour (hilar cholangiocarcinoma)'), short: bi('Klatskin', 'Klatskin tumour'),
    view: bview((p, A) => tree(A).conf, 2.2), phases: PH4, phaseLabels: PHL, defaultPhase: 'tardia',
    params: [{ id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 10, max: 30, step: 5, value: 20, unit: 'mm' }, { id: 'ih', type: 'range', label: bi('Vía intrahepática', 'Intrahepatic ducts'), min: 4, max: 8, step: 1, value: 6, unit: 'mm' }],
    techniques: [BT.eco('best', 'Primero: vía intrahepática dilatada pero colédoco NO dilatado.', 'First: dilated intrahepatic ducts but common duct NOT dilated.'),
      BT.ct('best', 'Tras la eco, con ingreso: estudia el tumor y la extensión (con colangio-RM).', 'After US, on admission: studies the tumour and spread (with MRCP).', { default: true }),
      BT.crm('best', 'Estudio del árbol biliar: stop en la confluencia de los hepáticos.', 'Biliary tree study: cut-off at the hepatic duct confluence.'),
      BT.cpre('ok', 'Digestivo: stent biliar que sobrepasa la neoplasia para que drene la bilis.', 'Gastroenterology: biliary stent across the tumour so bile drains.')],
    treatment: { label: bi('Stent biliar (CPRE)', 'Biliary stent (ERCP)'), note: bi('Sobrepasa la neoplasia; la vía intrahepática se descomprime.', 'Crosses the tumour; the intrahepatic ducts decompress.') },
    compare: ['coledocolitiasis', 'colangio-extra', 'colangio-ih'],
    build: (p, A, env) => {
      const t = tid(env), T = tree(A), hu = ductHU(t), out = t === 'crm' ? [mrcpBg(A)] : [];
      out.push(...ihOnly(A, env.treated ? 1.6 : p.ih / 2, hu));
      out.push({ t: 'tube', pts: [T.chd[1], T.cj, ...T.cbd.slice(1)], r: 2.4, hu, label: 'lesion', mr: BILE_MR, outside: VESSELS });
      out.push(hilarMass(A, p.size / 2, env.phase));
      if (env.treated) out.push({ t: 'tube', pts: [T.ihR[0][1], T.conf, ...T.chd.slice(1), ...T.cbd.slice(1), [T.pap[0] + 2, T.pap[1], T.pap[2] - 3]], r: 1.4, hu: 900, label: 'keep', mr: MR.calc }, lm(T.chd[1], 'Stent biliar', 'Biliary stent', { dx: 70, dy: 30 }));
      out.push(lm(T.conf, 'Masa en la confluencia de los hepáticos', 'Mass at the hepatic duct confluence', { dx: 70, dy: -50 }), lm(T.cbd[2], 'Colédoco NO dilatado', 'Common duct NOT dilated', { dx: 70, dy: 40 }));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(HIL, env.phase), env.phase), ductRO(`Intrahepática ≈ ${p.ih} mm (dilatada) · colédoco ≈ 5 mm (normal)`, `Intrahepatic ≈ ${p.ih} mm (dilated) · common duct ≈ 5 mm (normal)`), ecoRO('Vía intrahepática dilatada pero colédoco NO dilatado', 'Dilated intrahepatic ducts but common duct NOT dilated')],
    info: {
      where: bi('El colangiocarcinoma más frecuente. En la confluencia de los dos hepáticos (hilio), con engrosamiento irregular de la pared de los conductos.', 'The commonest cholangiocarcinoma. At the confluence of the two hepatic ducts (hilum), with irregular thickening of the duct wall.'),
      see: bi('<b>Vía intrahepática dilatada con colédoco NO dilatado</b>: la obstrucción está por encima del colédoco. Ictericia indolora; muy mal pronóstico.', '<b>Dilated intrahepatic ducts with a NON-dilated common duct</b>: the block is above the common duct. Painless jaundice; very poor prognosis.'),
      technique: bi('Eco abdominal primero → si se sospecha, ingreso + TC abdominal + colangio-RM. Digestivo: CPRE (stent) o ecoendoscopia para biopsia.', 'Abdominal US first → if suspected, admission + abdominal CT + MRCP. Gastroenterology: ERCP (stent) or endoscopic US for biopsy.'),
      differential: bi('Coledocolitiasis y colangiocarcinoma extrahepático / cabeza de páncreas: dilatan también el colédoco.', 'Choledocholithiasis and extrahepatic cholangiocarcinoma / pancreatic head: they also dilate the common duct.'),
      tip: bi('Compárala con la coledocolitiasis: mira si el colédoco está dilatado.', 'Compare with choledocholithiasis: check whether the common duct is dilated.'),
    },
    flags: [TRIAD_FLAG, TREE_FLAG,
      flag('revisar', 'El temario dice que el Klatskin «afecta a conducto derecho, izquierdo y colédoco», pero a la vez que el colédoco NO está dilatado: lo que afecta es la confluencia y el hepático común; el colédoco queda por debajo de la obstrucción.', 'The syllabus says Klatskin "involves the right, left and common bile duct" yet also that the common duct is NOT dilated: what it involves is the confluence and the common hepatic duct; the common bile duct lies below the block.'),
      flag('ampliacion', 'La extensión hiliar se clasifica con Bismuth-Corlette (I–IV) para decidir la resección; el temario no la incluye.', 'Hilar spread is graded with Bismuth-Corlette (I–IV) to plan resection; the syllabus does not include it.')],
  },
  {
    id: 'colangio-extra', group: 'conductos', tag: 'ct-aprox', name: bi('Colangiocarcinoma extrahepático', 'Extrahepatic cholangiocarcinoma'), short: bi('Colangiocarcinoma extrahepático', 'Extrahepatic cholangiocarcinoma'),
    view: bview((p, A) => cbdAt(A, 0.4), 2.4), phases: PH4, phaseLabels: PHL, defaultPhase: 'tardia',
    params: [{ id: 'size', type: 'range', label: bi('Tamaño', 'Size'), min: 8, max: 20, step: 2, value: 12, unit: 'mm' }],
    techniques: [BT.eco('best', 'Primero: vía intrahepática y colédoco dilatados hasta el tumor.', 'First: intrahepatic ducts and common duct dilated down to the tumour.'),
      BT.ct('best', 'Con ingreso: TC + colangio-RM para estudiar el tumor y el tratamiento.', 'On admission: CT + MRCP to study the tumour and treatment.', { default: true }),
      BT.crm('best', 'Estenosis del colédoco con dilatación por encima.', 'Common duct stricture with dilatation above.'),
      BT.cpre('ok', 'Stent que sobrepasa la neoplasia; permite cepillado o biopsia.', 'Stent across the tumour; allows brushing or biopsy.')],
    compare: ['klatskin', 'coledocolitiasis'],
    build: (p, A, env) => {
      const t = tid(env), T = tree(A), hu = ductHU(t), f = 0.4, c = cbdAt(A, f), out = t === 'crm' ? [mrcpBg(A)] : [];
      out.push(...study(A, t, { ih: 2.6, chd: 4.5, cbd: 4.5, cbdTo: f, cystic: 1.6 }));
      out.push({ t: 'tube', pts: [c, ...T.cbd.filter((q, i) => i / (T.cbd.length - 1) > f)], r: 2, hu, label: 'lesion', mr: BILE_MR, outside: VESSELS });
      out.push(sphere(A, c, p.size / 2, (d, z, y, x) => (d < 0.3 ? null : { hu: pv(HIL, env.phase) + 6 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: MR.solidHypoT1 }), { outside: VESSELS, irregular: 0.3 }));
      out.push(lm(c, 'Engrosamiento / masa del colédoco', 'Common duct thickening / mass'));
      return out;
    },
    readouts: (p, A, env) => [contrastRO(pv(HIL, env.phase), env.phase), ductRO('Colédoco dilatado por encima del tumor, normal por debajo', 'Common duct dilated above the tumour, normal below')],
    info: {
      where: bi('Colangiocarcinoma fuera del hígado (colédoco). 2.º tumor más frecuente del árbol biliar.', 'Cholangiocarcinoma outside the liver (common bile duct). 2nd commonest tumour of the biliary tree.'),
      see: bi('Engrosamiento o masa del colédoco con <b>dilatación de la vía por encima</b> (intrahepática y colédoco proximal). Ictericia indolora.', 'Thickening or mass of the common duct with <b>dilated ducts above</b> (intrahepatic and proximal common duct). Painless jaundice.'),
      technique: bi('Eco → ingreso + TC + colangio-RM; CPRE (stent) o ecoendoscopia para biopsia.', 'US → admission + CT + MRCP; ERCP (stent) or endoscopic US for biopsy.'),
      differential: bi('Coledocolitiasis (dolor), adenocarcinoma de cabeza de páncreas (dilata también el Wirsung), Klatskin (colédoco normal).', 'Choledocholithiasis (pain), pancreatic head adenocarcinoma (also dilates the pancreatic duct), Klatskin (normal common duct).'),
    },
    flags: [TRIAD_FLAG, TREE_FLAG, flag('ampliacion', 'El temario solo dice «fuera del hígado»; el aspecto (estenosis con engrosamiento parietal que realza en tardía) es ampliación.', 'The syllabus only says "outside the liver"; the look (stricture with wall thickening enhancing late) is beyond it.')],
  },
];

/* ---------------- builders shared above ---------------- */
const TUM = P4(40, 72, 84, 80);           // gallbladder carcinoma (soft tissue, moderate enhancement)
const HIL = P4(42, 62, 78, 100);          // hilar / extrahepatic cholangiocarcinoma: delayed enhancement (fibrous)
const WALL = { mucosa: P4(40, 110, 95, 85), oedema: P4(18, 22, 25, 25) };
function colecist(A, p, env) {
  const ph = env.phase || 'portal', out = [], W = p.wall;
  if (p.hidrops) out.push({ t: 'dilate', s: GB, scale: 1.22, label: GB });
  out.push({ t: 'rind', s: GB, d0: 0, d1: Math.max(0.5, W - 1.6), hu: pv(WALL.oedema, ph), label: 'lesion', mr: { t1: 0.25, t2: 0.85, stir: 0.85 } });
  out.push({ t: 'rind', s: GB, d0: Math.max(0.5, W - 1.6), d1: W, hu: pv(WALL.mucosa, ph), label: 'lesion', mr: MR.wall });
  if (p.fluid) out.push({ t: 'shell', s: GB, d0: 0, d1: 5, hu: 12, label: 'lesion', outside: [LIV, ...NOTSOFT], mr: MR.fluid, side: (z, y, x) => NZ(x * 0.2, y * 0.2, z * 0.2) > -0.2 });
  if (p.neck) out.push(...stones(A, 1, 10, 'calcificada', true));
  const c = gbParts(A).c;
  out.push(lm(c, 'Pared engrosada', 'Thickened wall'));
  if (p.neck) out.push(lm(gbStones(A, 1, 5, true)[0] || c, 'Cálculo enclavado en el infundíbulo', 'Stone impacted in the infundibulum', { dx: 70, dy: 40 }));
  return out;
}
function polypSite(A, r) {
  const k = 'hig:polyp:' + r; if (A.cache.has(k)) return A.cache.get(k);
  const gp = gbParts(A), m = gp.c.map((v, i) => (v + gp.fundus[i]) / 2);
  let best = gp.c, bd = Infinity;
  for (const v of gbVox(A)) { if (v[3] < r * 0.45 || v[3] > r * 0.75) continue; const d = Math.hypot(v[0] - m[0], v[1] - m[1], v[2] - m[2]); if (d < bd) { bd = d; best = v.slice(0, 3); } }
  A.cache.set(k, best); return best;
}
/** Hilar mass sleeve around the hepatic duct confluence (spares the portal vein, IVC and aorta). */
function hilarMass(A, r, ph) {
  const T = tree(A);
  return sphere(A, T.conf, [r * 0.9, r, r * 1.2], (d, z, y, x) => ({ hu: pv(HIL, ph) + 7 * NZ2(x * 0.4, y * 0.4, z * 0.4), mr: { t1: 0.3, t2: 0.7, stir: 0.65 } }), { outside: VESSELS, irregular: 0.4, spic: 0.2 });
}
export { grid };
