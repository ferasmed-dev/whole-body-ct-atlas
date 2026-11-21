// Módulo «Columna y médula»: fracturas vertebrales, espondilodiscitis piógena, artrosis y hernia discal,
// dibujadas sobre el TC real (caso s0591) a partir de las máscaras de vértebras y médula.
// Every value comes from the course topic; anything beyond it is flagged 'ampliacion'.

/* ---------------- helpers (anatomy → lesion geometry) ---------------- */
const VKEY = l => 'vertebrae_' + l;
const LV = (from, to, all) => { const i = all.indexOf(from), j = all.indexOf(to); return all.slice(i, j + 1); };
const ALL = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1'];
const opt = l => ({ v: l, es: l, en: l });
const mm = (A, vox) => vox * A.sp[0];

/** Posterior wall of the vertebral body along the canal centre at slice z (y of the last body voxel). */
function postWall(A, v, z) {
  const c = A.cordAt(z), xc = Math.round(c ? c.xc : v.body.c[2]);
  let y = null; for (let yy = v.body.y0; yy < (c ? c.y0 : v.body.y1 + 1); yy++) if (A.at(z, yy, xc) === v.id) y = yy;
  return y !== null ? y : v.body.y1;
}
/** Mean body height (mm) of anterior (t<0.25) and posterior (t>0.75) columns. */
function bodyHeights(A, v) {
  const b = v.body; let ha = 0, na = 0, hp = 0, np = 0;
  for (const [k, c] of v.cols) {
    const y = +k.split(',')[0], t = (y - b.y0) / Math.max(1, b.y1 - b.y0);
    if (t < 0.25) { ha += c[1] - c[0] + 1; na++; } else if (t > 0.75) { hp += c[1] - c[0] + 1; np++; }
  }
  return { ant: mm(A, ha / Math.max(1, na)), post: mm(A, hp / Math.max(1, np)) };
}
/**
 * Height loss of a vertebral body, collapsing from the superior endplate (the topic: "parte anterior y superior").
 * lossAnt / lossPost: fraction lost at the anterior / posterior wall (linear in between).
 */
function compress(A, v, lossAnt, lossPost, fill) {
  const b = v.body;
  return {
    t: 'warp', s: v.key, fill: fill || { hu: 80, label: 'lesion', mr: { t1: 0.4, t2: 0.55, stir: 0.45 } },
    map: (z, y, x) => {
      const c = v.cols.get(y + ',' + x); if (!c || z < c[0] || z > c[1]) return null;
      const t = Math.min(1, Math.max(0, (y - b.y0) / Math.max(1, b.y1 - b.y0)));
      const loss = lossAnt + (lossPost - lossAnt) * t, H = c[1] - c[0] + 1, top = c[0] + loss * H;
      if (z < top) return [-1, -1, -1];
      return [c[1] - (c[1] - z) * H / Math.max(1, c[1] - top + 1), y, x];
    },
  };
}
/** Marrow oedema of a vertebral body (pseudo-MR only; no CT change). */
function bodyOedema(A, v, mr) {
  const b = v.body, r = [mm(A, (b.z1 - b.z0) / 2 + 1), mm(A, (b.y1 - b.y0) / 2 + 1), mm(A, (b.x1 - b.x0) / 2 + 1)];
  return { t: 'fill', s: v.key, region: { c: b.c, r }, label: 'keep', mr: mr || { t1: 0.25, t2: 0.75, stir: 0.92 } };
}
/** Osteoporosis: lower trabecular density of the vertebrae around a level (cortex kept). */
function osteoporosis(A, level) {
  const i = ALL.indexOf(level), keys = ALL.slice(Math.max(0, i - 2), Math.min(ALL.length, i + 3)).map(VKEY).filter(k => A.has(k));
  return { t: 'fill', s: keys, huRange: [80, 650], scale: 0.6, label: 'keep' };
}
/** Normal disc signal for the pseudo-MR (hydrated nucleus bright on T2) for discs near a level. */
function discsMR(A, level, n = 2) {
  const i = ALL.indexOf(level), out = [];
  for (let k = Math.max(0, i - n); k < Math.min(ALL.length - 1, i + n); k++) {
    const d = A.has(VKEY(ALL[k])) && A.has(VKEY(ALL[k + 1])) ? A.disc(VKEY(ALL[k]), VKEY(ALL[k + 1])) : null; if (!d) continue;
    out.push({ t: 'cols', box: [d.z0, d.z1, d.y0, d.y1, d.x0, d.x1], label: 'keep', fn: (z, y, x, cur) => {
      const c = d.cols.get(y + ',' + x); return c && z >= c[0] && z <= c[1] && cur.orig === 0 ? { hu: cur.hu, label: 'keep', mr: { t1: 0.42, t2: 0.78, stir: 0.62 } } : null; } });
  }
  return out;
}
const discOf = (A, name) => { const [u, l] = name.split('-'); return A.disc(VKEY(u), VKEY(l)); };
/** Facet (interapophyseal) joint between two vertebrae, one side ('R' patient right / 'L'): where the masks touch behind the canal. */
function facet(A, uk, lk, side) {
  const ck = 'facet:' + uk + lk + side; if (A.cache.has(ck)) return A.cache.get(ck);
  const U = A.id(uk), Lw = A.id(lk), bu = A.s(uk).bbox, bl = A.s(lk).bbox, s = [0, 0, 0]; let n = 0;
  const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]];
  for (let z = Math.max(bu[0], bl[0]) - 1; z <= Math.min(bu[1], bl[1]) + 1; z++) {
    const c = A.cordAt(z); if (!c) continue;
    for (let y = Math.max(bu[2], bl[2]); y <= Math.min(bu[3], bl[3]); y++) for (let x = Math.min(bu[4], bl[4]); x <= Math.max(bu[5], bl[5]); x++) {
      if (A.at(z, y, x) !== U || y < c.y0 || (side === 'R' ? x > c.xc - 3 : x < c.xc + 3)) continue;
      if (nb.some(([a, b, d]) => A.at(z + a, y + b, x + d) === Lw)) { s[0] += z; s[1] += y; s[2] += x; n++; }
    }
  }
  const r = n ? s.map(v => Math.round(v / n)) : null; A.cache.set(ck, r); return r;
}
const mark = (at, es, en, extra = {}) => ({ t: 'mark', at: at.map(Math.round), text: { es, en }, ...extra });

/* ---------------- shared builders ---------------- */
function buildCompression(p, A, env, { treated = false, trocars = true, cement = 0.4, cementLabel = 'keep' } = {}) {
  const v = A.vertebra(VKEY(p.level)), b = v.body, out = [];
  if (p.osteo) out.push(osteoporosis(A, p.level));
  out.push(...discsMR(A, p.level, 1));
  out.push(compress(A, v, p.loss / 100, p.loss / 200));
  if (p.age === 'aguda') out.push(bodyOedema(A, v));
  const top = [b.z0 + Math.round((b.z1 - b.z0) * p.loss / 200), b.y0 + 2, b.c[2]];
  out.push(mark(top, 'Cuña anterior y superior', 'Anterior-superior wedge', { dx: -150, dy: -30, planes: ['sagittal'] }));
  if (p.age === 'aguda' && (env.modality === 'stir' || env.modality === 't2')) out.push(mark(b.c, 'Edema: fractura aguda', 'Oedema: acute fracture', { dx: -170, dy: 30 }));
  if (treated) {
    const c = [b.c[0] + 1, Math.round(b.y0 + (b.y1 - b.y0) * 0.45), b.c[2]];
    const r = [mm(A, (b.z1 - b.z0) / 2) * (0.35 + cement * 0.6), mm(A, (b.y1 - b.y0) / 2) * (0.35 + cement * 0.6), mm(A, (b.x1 - b.x0) / 2) * (0.35 + cement * 0.6)];
    out.push({ t: 'blob', c, r, hu: 2200, irregular: 0.55, edge: 0.6, within: [v.key], label: cementLabel, mr: { t1: 0.04, t2: 0.04, stir: 0.04 } });
    out.push(mark(c, 'Cemento (vertebroplastia)', 'Cement (vertebroplasty)', { dx: 60, dy: -40 }));
    if (trocars) for (const side of ['R', 'L']) {
      const ped = v.ped[side]; if (!ped) continue;
      const dir = [0, ped[1] - c[1], ped[2] - c[2]], len = Math.hypot(...dir) || 1, ext = 34 / A.sp[0];
      const start = [ped[0], ped[1] + dir[1] / len * ext, ped[2] + dir[2] / len * ext], end = [c[0], c[1] - 2, c[2] + (side === 'R' ? -3 : 3)];
      out.push({ t: 'tube', pts: [start, ped, end], r: 1.4, hu: 3000, label: 'keep', mr: { t1: 0.02, t2: 0.02, stir: 0.02 } });
      if (side === 'R') out.push(mark(ped, 'Trócar transpedicular', 'Transpedicular trocar', { dx: -150, dy: 40, planes: ['axial'] }));
    }
  }
  return out;
}

const STAGES = [{ v: 'inicio', es: 'Inicio', en: 'Onset' }, { v: '2sem', es: '2 semanas', en: '2 weeks' }, { v: '8-12', es: '8–12 semanas', en: '8–12 weeks' }];
const DISCS_L = ['T12-L1', 'L1-L2', 'L2-L3', 'L3-L4', 'L4-L5'].map(d => ({ v: d, es: d.replace('-', '–'), en: d.replace('-', '–') }));
function psoasCentre(A, z, side) {
  const key = side === 'R' ? 'iliopsoas_right' : 'iliopsoas_left', id = A.id(key), [, Y, X] = A.dims; let sy = 0, sx = 0, n = 0;
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) if (A.at(z, y, x) === id) { sy += y; sx += x; n++; }
  return n ? [z, Math.round(sy / n), Math.round(sx / n), key] : null;
}
function buildDiscitis(p, A, env, { infant = false } = {}) {
  const d = discOf(A, p.disc), U = d.upper, Lo = d.lower, out = [], con = env.phase !== 'sin';
  const [u, l] = p.disc.split('-'); out.push(...discsMR(A, u, 1));
  const k = Math.round(4 / A.sp[0]), resp = env.treated ? 0.45 : 1;
  const box = [d.z0 - k - 2, d.z1 + k + 2, d.y0, d.y1, d.x0, d.x1];
  const inEnd = (z, y, x, dist) => { const c = d.cols.get(y + ',' + x); if (!c) return 0; if (z < c[0] && z >= c[0] - dist) return 1; if (z > c[1] && z <= c[1] + dist) return 2; return 0; };
  const inDisc = (z, y, x) => { const c = d.cols.get(y + ',' + x); return c && z >= c[0] && z <= c[1]; };
  const stage = infant ? 'inicio' : p.stage;
  // the disc itself: low T1 / high T2 and enhancing (topic), sclerosed bone bridge once it repairs (8–12 weeks)
  out.push({ t: 'cols', box, fn: (z, y, x, cur) => {
    if (inDisc(z, y, x) && cur.orig === 0) {
      if (stage === '8-12') return { hu: 520, label: 'lesion', mr: { t1: 0.62, t2: 0.42, stir: 0.18 } };
      return { hu: cur.hu + (con && env.modality === 'ct' ? 22 : 0), label: 'lesion', mr: { t1: 0.16, t2: 0.93, stir: 0.9 } };
    }
    if (infant) return null;
    const e = inEnd(z, y, x, k + 1); if (!e || (cur.orig !== U.id && cur.orig !== Lo.id)) return null;
    if (stage === 'inicio') return { hu: cur.hu, label: 'keep', mr: { t1: 0.3, t2: 0.7, stir: 0.82 } };
    if (stage === '2sem') {       // poorly defined endplates, bone destruction
      const c = d.cols.get(y + ',' + x), depth = e === 1 ? c[0] - z : z - c[1];
      const n = Math.sin(x * 1.7 + y * 0.9) + Math.cos(y * 1.3 - x * 0.7 + z);
      return depth <= 1 + (n > 0.3 ? 2 : 0) ? { hu: 45, label: 'lesion', mr: { t1: 0.25, t2: 0.78, stir: 0.86 } } : { hu: cur.hu, label: 'keep', mr: { t1: 0.3, t2: 0.7, stir: 0.82 } };
    }
    return { hu: cur.hu + 380, label: 'keep', mr: { t1: 0.15, t2: 0.12, stir: 0.1 } };      // 8–12 weeks: sclerosis
  } });
  // paravertebral / epidural soft tissue (shrinks with treatment = good response)
  if (!infant && stage !== '8-12') {
    const sz = (stage === 'inicio' ? 0.6 : 1) * resp, cz = d.c[0], yA = d.y0 - Math.round(5 / A.sp[0]);
    out.push({ t: 'blob', c: [cz, yA + 2, d.c[2]], r: [16 * sz, 7 * sz, 22 * sz], hu: con ? 52 : 38, edge: 3, irregular: 0.6, texture: 12, label: 'lesion',
      outside: ['aorta', 'inferior_vena_cava', 'iliac_artery_left', 'iliac_artery_right', 'iliac_vena_left', 'iliac_vena_right', 'kidney_left', 'kidney_right', 'small_bowel', 'colon', 'duodenum', U.key, Lo.key],
      mr: { t1: 0.3, t2: 0.75, stir: 0.82 } });
    if (p.abscess === 'para') {
      const pc = psoasCentre(A, cz, 'L') || psoasCentre(A, cz + 8, 'L');
      if (pc) {
        out.push({ t: 'blob', c: pc.slice(0, 3), r: [26 * resp, 10 * resp, 10 * resp], hu: 15, rim: { w: 3, hu: con ? 95 : 38 }, edge: 1, within: [pc[3]], label: 'lesion', mr: { t1: 0.12, t2: 0.96, stir: 0.92 } });
        out.push(mark(pc, 'Absceso en el psoas', 'Psoas abscess', { dx: 60, dy: 40 }));
      }
    }
    if (p.abscess === 'epi') {
      const c = A.cordAt(cz), y0 = postWall(A, U, Math.min(U.body.z1, cz));
      if (c) {
        out.push({ t: 'blob', c: [cz, y0 + 3, Math.round(c.xc)], r: [14 * resp, 3.6 * resp, 7 * resp], hu: 20, rim: { w: 1.5, hu: con ? 90 : 35 }, edge: 0.6, label: 'lesion', mr: { t1: 0.15, t2: 0.95, stir: 0.9 } });
        out.push(mark([cz, y0 + 3, c.xc], 'Absceso epidural', 'Epidural abscess', { dx: 70, dy: -40 }));
      }
    }
  }
  out.push(mark(d.c, infant ? 'Disco afectado, cuerpos respetados' : 'Disco y plataformas', infant ? 'Disc involved, bodies spared' : 'Disc and endplates', { dx: -160, dy: -40, planes: ['sagittal', 'coronal'] }));
  return out;
}

/* ---------------- module ---------------- */
const FRACT_LEVELS = LV('T6', 'L5', ALL).map(opt);

export default {
  slug: 'columna',
  title: { es: 'Columna y médula', en: 'Spine and cord' },
  examLength: 8,
  intro: {
    text: {
      es: 'Cuatro patologías, cada una con su técnica clave: <b>fracturas</b> (Rx para diagnosticar; RM STIR o gammagrafía para saber si es aguda; cemento transpedicular), <b>espondilodiscitis piógena</b> (la Rx llega tarde; la RM es la técnica de elección), <b>artrosis</b> (signos en Rx; infiltración si no responde) y <b>hernia discal</b> (protrusión → extrusión → migración → secuestro).',
      en: 'Four conditions, each with its key technique: <b>fractures</b> (plain film to diagnose; STIR MR or bone scan to tell if acute; transpedicular cement), <b>pyogenic spondylodiscitis</b> (the film is late; MR is the technique of choice), <b>osteoarthritis</b> (film signs; injection if it fails to respond) and <b>disc herniation</b> (protrusion → extrusion → migration → sequestration).',
    },
    table: {
      es: [['Fractura', 'Causa', 'Afecta a', 'Déficit'], ['Compresión', 'Osteoporosis', 'Parte anterior y superior del cuerpo', 'No'], ['Jefferson', 'Sobrecarga axial', 'Arcos anterior y posterior de C1', 'No'], ['Ahorcado', 'Hiperextensión', 'Pars y pedículos de C2; luxación C2/C3', '25 %'], ['Estallido', 'Carga axial, alta energía', 'Retropulsión al canal', '50 %']],
      en: [['Fracture', 'Cause', 'Involves', 'Deficit'], ['Compression', 'Osteoporosis', 'Anterior and superior body', 'No'], ['Jefferson', 'Axial load', 'Anterior and posterior arches of C1', 'No'], ['Hangman\'s', 'Hyperextension', 'Pars and pedicles of C2; C2/C3 dislocation', '25 %'], ['Burst', 'High-energy axial load', 'Retropulsion into the canal', '50 %']],
    },
  },
  groups: [
    { id: 'fract', es: 'Fracturas', en: 'Fractures' },
    { id: 'inf', es: 'Infecciosa', en: 'Infection' },
    { id: 'deg', es: 'Degenerativa', en: 'Degenerative' },
    { id: 'hernia', es: 'Hernia discal', en: 'Disc herniation' },
  ],
  entities: [
    /* ===== fracturas ===== */
    {
      id: 'compresion', group: 'fract', tag: 'ct-real', extraTags: ['sim'],
      name: { es: 'Fractura por compresión (en cuña)', en: 'Compression (wedge) fracture' },
      short: { es: 'Fractura en cuña', en: 'Wedge fracture' },
      view: { plane: 'sagittal', window: 'bone', zoom: 2.4, at: (p, A) => { const v = A.vertebra(VKEY(p.level)); const c = A.cordAt(v.body.c[0]); return [v.body.c[0], v.body.c[1], Math.round(c ? c.xc : v.body.c[2])]; }, examPlane: 'sagittal' },
      params: [
        { id: 'level', type: 'select', dropdown: true, label: { es: 'Vértebra', en: 'Vertebra' }, options: FRACT_LEVELS, value: 'L1', recentre: true },
        { id: 'loss', type: 'range', label: { es: 'Pérdida de altura anterior', en: 'Anterior height loss' }, min: 0, max: 60, step: 5, value: 20, unit: '%', examMin: 25 },
        { id: 'age', type: 'select', label: { es: 'Evolución', en: 'Age' }, options: [{ v: 'aguda', es: 'Aguda', en: 'Acute' }, { v: 'cronica', es: 'Crónica', en: 'Chronic' }], value: 'aguda' },
        { id: 'osteo', type: 'toggle', label: { es: 'Osteoporosis (densidad ósea baja)', en: 'Osteoporosis (low bone density)' }, value: true },
      ],
      techniques: [
        { id: 'rx', mod: 'rx', plane: 'sagittal', verdict: 'best', label: { es: 'Rx lateral', en: 'Lateral film' }, note: { es: 'Diagnóstico inicial: la radiografía simple muestra la cuña.', en: 'Initial diagnosis: the plain film shows the wedge.' } },
        { id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'Ve la cuña y su morfología, pero no dice si la fractura es aguda o antigua.', en: 'Shows the wedge and its shape, but cannot tell an acute from an old fracture.' } },
        { id: 'stir', mod: 'stir', plane: 'sagittal', verdict: 'best', label: { es: 'RM STIR', en: 'STIR MR' }, note: { es: 'Edad de la fractura: la aguda es hiperintensa por el edema inflamatorio (o gammagrafía).', en: 'Age of the fracture: an acute one is hyperintense from inflammatory oedema (or bone scan).' } },
        { id: 't1', mod: 't1', plane: 'sagittal', verdict: 'ok', label: { es: 'RM T1', en: 'T1 MR' }, note: { es: 'El edema de la fractura aguda baja la señal de la médula ósea grasa.', en: 'The oedema of an acute fracture lowers the signal of the fatty marrow.' } },
      ],
      treatment: { label: { es: 'Cemento transpedicular', en: 'Transpedicular cement' }, note: { es: 'Guiado por imagen: por vía transpedicular se insertan trócares (con escopia o TC) y se inyecta cemento en la vértebra → se resuelve el dolor.', en: 'Image-guided: trocars are inserted through the pedicles (under fluoroscopy or CT) and cement is injected into the vertebra → the pain resolves.' } },
      compare: ['estallido', 'vertebroplastia'],
      examLevel: p => p.level,
      build: (p, A, env) => buildCompression(p, A, env, { treated: env.treated }),
      readouts: (p, A) => {
        const v = A.vertebra(VKEY(p.level)), h = bodyHeights(A, v), ant = h.ant * (1 - p.loss / 100), post = h.post * (1 - p.loss / 200);
        const wedge = h.ant * p.loss / 100 - h.post * p.loss / 200;      // what the wedge adds to this body's own shape
        return [
          { label: { es: 'Altura anterior / posterior', en: 'Anterior / posterior height' }, value: `${ant.toFixed(1)} / ${post.toFixed(1)} mm` },
          { label: { es: 'Diferencia ant.–post. que crea la cuña', en: 'Ant.–post. difference made by the wedge' }, value: `${wedge.toFixed(1)} mm` },
          { label: { es: 'Déficit neurológico', en: 'Neurological deficit' }, value: { es: 'No', en: 'No' } },
        ];
      },
      info: {
        where: { es: 'Parte anterior y superior del cuerpo vertebral, sobre todo en la columna dorsolumbar de mujeres menopáusicas con osteoporosis.', en: 'Anterior and superior part of the vertebral body, mainly the thoracolumbar spine of postmenopausal women with osteoporosis.' },
        see: { es: 'Deformidad en cuña: unos <b>3 mm</b> de diferencia entre la parte anterior y la posterior, y altura un <b>20 % menor</b> que los cuerpos de encima y de debajo. Aumenta la cifosis dorsal y la lordosis lumbar. Aguda: hiperintensa en STIR por el edema.', en: 'Wedge deformity: about <b>3 mm</b> difference between the anterior and posterior walls, and height <b>20 % lower</b> than the bodies above and below. Increases thoracic kyphosis and lumbar lordosis. Acute: hyperintense on STIR from oedema.' },
        technique: { es: 'Rx para el diagnóstico inicial · RM STIR (o gammagrafía) para saber si es aguda · tratamiento guiado por imagen con cemento transpedicular.', en: 'Plain film for the initial diagnosis · STIR MR (or bone scan) to tell if it is acute · image-guided treatment with transpedicular cement.' },
        differential: { es: 'Frente al estallido: la pared posterior se conserva y no hay retropulsión al canal; por eso no da déficit neurológico.', en: 'Versus burst fracture: the posterior wall is preserved and nothing is pushed into the canal, so there is no neurological deficit.' },
        tip: { es: 'Pasa de TC a RM STIR con la evolución en «Aguda» y luego en «Crónica»: la cuña es igual, solo cambia el edema.', en: 'Switch from CT to STIR MR with the age on "Acute" and then "Chronic": the wedge is the same, only the oedema changes.' },
      },
      flags: [
        { kind: 'apuntes', es: 'Las cifras (3 mm, −20 %) son las del temario; el paciente de este TC es un varón, aunque la fractura típica es de mujer menopáusica.', en: 'The figures (3 mm, −20 %) are those of the syllabus; the patient in this CT is a man, although the typical fracture is in a postmenopausal woman.' },
        { kind: 'ampliacion', es: 'La pérdida de altura se simula aplastando el cuerpo desde la plataforma superior; en la realidad la columna se acorta, aquí el hueco ocupa el espacio discal.', en: 'Height loss is simulated by collapsing the body from the upper endplate; in reality the spine shortens, here the gap shows as disc space.' },
        { kind: 'ampliacion', es: 'Este TC procede de un paciente politraumatizado: revisa que no haya fracturas reales en el nivel elegido antes de interpretar la simulación.', en: 'This CT comes from a trauma patient: check the chosen level for real fractures before reading the simulation.' },
      ],
    },
    {
      id: 'vertebroplastia', group: 'fract', tag: 'ct-real',
      name: { es: 'Vertebroplastia (cemento transpedicular)', en: 'Vertebroplasty (transpedicular cement)' },
      short: { es: 'Vertebroplastia', en: 'Vertebroplasty' },
      view: { plane: 'axial', window: 'bone', zoom: 2.4, at: (p, A) => { const v = A.vertebra(VKEY(p.level)); return v.ped.R ? [v.ped.R[0], v.body.c[1] + 6, v.body.c[2]] : v.body.c; }, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', dropdown: true, label: { es: 'Vértebra', en: 'Vertebra' }, options: FRACT_LEVELS, value: 'L1', recentre: true },
        { id: 'cement', type: 'range', label: { es: 'Volumen de cemento', en: 'Cement volume' }, min: 10, max: 80, step: 10, value: 40, unit: '%' },
        { id: 'trocars', type: 'toggle', label: { es: 'Mostrar los trócares (durante el procedimiento)', en: 'Show the trocars (during the procedure)' }, value: true },
      ],
      techniques: [
        { id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', default: true, label: { es: 'Guía con TC', en: 'CT guidance' }, note: { es: 'Los trócares se insertan por vía transpedicular con escopia o TC.', en: 'Trocars are inserted transpedicularly under fluoroscopy or CT.' } },
        { id: 'rx', mod: 'rx', plane: 'sagittal', verdict: 'ok', label: { es: 'Escopia (Rx)', en: 'Fluoroscopy (film)' }, note: { es: 'La otra opción de guía: proyección lateral simulada.', en: 'The other guidance option: simulated lateral projection.' } },
      ],
      compare: ['compresion'],
      examLevel: p => p.level,
      build: (p, A, env) => buildCompression({ level: p.level, loss: 25, age: 'aguda', osteo: true }, A, env, { treated: true, trocars: p.trocars, cement: p.cement / 100, cementLabel: 'lesion' }),
      info: {
        where: { es: 'Cuerpo vertebral fracturado, accediendo a través de los dos pedículos.', en: 'The fractured vertebral body, reached through both pedicles.' },
        see: { es: 'Trócares que entran por los pedículos hasta el tercio anterior del cuerpo y cemento muy denso (blanco en ventana de hueso) rellenando el cuerpo.', en: 'Trocars entering through the pedicles to the anterior third of the body, and very dense cement (white on the bone window) filling the body.' },
        technique: { es: 'Tratamiento de la fractura por compresión: trócares por vía transpedicular (con escopia o TC) e inyección de cemento → se resuelve el dolor.', en: 'Treatment of the compression fracture: trocars through the pedicles (fluoroscopy or CT) and cement injection → the pain resolves.' },
        tip: { es: 'En el plano axial, a la altura de los pedículos, se ve el trayecto completo del trócar.', en: 'On the axial plane, at the level of the pedicles, the whole trocar path is visible.' },
      },
      flags: [{ kind: 'ampliacion', es: 'Este tratamiento es la vertebroplastia, que aparece en el catálogo del módulo de radiología intervencionista.', en: 'This treatment is vertebroplasty, listed in the catalogue of the interventional radiology module.' }],
    },
    {
      id: 'jefferson', group: 'fract', tag: 'ct-real',
      name: { es: 'Fractura de Jefferson (C1)', en: 'Jefferson fracture (C1)' },
      short: { es: 'Jefferson', en: 'Jefferson' },
      view: { plane: 'axial', window: 'bone', zoom: 3.2, at: (p, A) => { const v = A.vertebra('vertebrae_C1'); return [v.body.c[0], v.body.c[1] + 8, v.canal ? Math.round(v.canal.xc) : v.body.c[2]]; }, examPlane: 'axial' },
      params: [{ id: 'shift', type: 'range', label: { es: 'Desplazamiento de cada masa lateral', en: 'Shift of each lateral mass' }, min: 0, max: 6, step: 1, value: 3, unit: 'mm', examMin: 2 }],
      techniques: [{ id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'El plano axial de C1 muestra los trazos en los arcos anterior y posterior.', en: 'The axial plane of C1 shows the breaks in the anterior and posterior arches.' } }],
      compare: ['ahorcado'],
      examLevel: () => 'C1',
      build: (p, A) => {
        const v = A.vertebra('vertebrae_C1'), xc = v.canal.xc, cord = A.cordAt(v.body.c[0]), cy0 = cord.y0, cy1 = cord.y1, d = Math.round(p.shift / A.sp[0]);
        const ant = (z, y) => y < cy0, post = (z, y) => y > cy1, midA = 5, midP = 7;
        const out = [];
        for (const sgn of [-1, 1]) {
          out.push({ t: 'plane', s: v.key, p: [0, 0, xc + sgn * midA], n: [0, 0, 1], w: 1.6, jag: 1, hu: 60, limit: (z, y) => ant(z, y) });
          out.push({ t: 'plane', s: v.key, p: [0, 0, xc + sgn * midP], n: [0, 0, 1], w: 1.6, jag: 1, hu: 60, limit: (z, y) => post(z, y) });
        }
        if (d) out.push({ t: 'warp', s: v.key, box: [...A.s(v.key).bbox.slice(0, 4), A.s(v.key).bbox[4] - d - 1, A.s(v.key).bbox[5] + d + 1], fill: { hu: 55, label: 'lesion' },
          map: (z, y, x) => {
            const mid = y < cy0 ? midA : y > cy1 ? midP : 0;
            if (Math.abs(x - xc) <= mid + 0.5) return null;
            const sx = x < xc ? x + d : x - d;
            return Math.abs(sx - xc) <= mid + 0.5 ? [-1, -1, -1] : [z, y, sx];
          } });
        const z = v.body.c[0];
        out.push(mark([z, v.body.y0 + 2, xc - midA], 'Arco anterior', 'Anterior arch', { dx: -130, dy: -30, planes: ['axial'] }));
        out.push(mark([z, cy1 + 6, xc + midP], 'Arco posterior', 'Posterior arch', { dx: 60, dy: 40, planes: ['axial'] }));
        return out;
      },
      readouts: p => [
        { label: { es: 'Masas laterales', en: 'Lateral masses' }, value: { es: `${p.shift} mm cada una (${2 * p.shift} mm en total)`, en: `${p.shift} mm each (${2 * p.shift} mm in total)` } },
        { label: { es: 'Canal medular', en: 'Spinal canal' }, value: { es: p.shift ? 'Ensanchado' : 'Sin desplazar', en: p.shift ? 'Widened' : 'Undisplaced' } },
        { label: { es: 'Déficit neurológico', en: 'Neurological deficit' }, value: { es: 'No suele asociar lesión medular', en: 'Usually no cord injury' } },
      ],
      info: {
        where: { es: 'C1 (atlas): arcos anterior y posterior.', en: 'C1 (atlas): anterior and posterior arches.' },
        see: { es: 'Trazos de fractura en los arcos anterior y posterior; las masas laterales se separan y el canal medular se ensancha.', en: 'Fracture lines in the anterior and posterior arches; the lateral masses spread apart and the spinal canal widens.' },
        technique: { es: 'Mecanismo: sobrecarga axial. No suele asociar lesión medular (déficit neurológico: no).', en: 'Mechanism: axial load. Usually no cord injury (neurological deficit: no).' },
        differential: { es: 'Ahorcado = C2 por hiperextensión, con 25 % de déficit. Jefferson = C1 por carga axial, sin déficit: el canal se ensancha en vez de estrecharse.', en: 'Hangman\'s = C2 from hyperextension, 25 % deficit. Jefferson = C1 from axial load, no deficit: the canal widens instead of narrowing.' },
        tip: { es: '«Jefferson es el 1.er presidente → C1» (regla mnemotécnica).', en: '"Jefferson was the 1st president → C1" (mnemonic).' },
      },
      flags: [{ kind: 'ampliacion', es: 'Los trazos se dibujan en las cuatro partes clásicas (dos en cada arco); el temario solo dice «arcos anterior y posterior».', en: 'The breaks are drawn in the classic four places (two per arch); the syllabus only says "anterior and posterior arches".' }],
    },
    {
      id: 'ahorcado', group: 'fract', tag: 'ct-real',
      name: { es: 'Fractura del ahorcado (C2)', en: 'Hangman\'s fracture (C2)' },
      short: { es: 'Ahorcado', en: 'Hangman\'s' },
      view: { plane: 'sagittal', window: 'bone', zoom: 3, at: (p, A) => { const v = A.vertebra('vertebrae_C2'); return [v.body.c[0], v.body.c[1] + 6, Math.round(v.canal.xc)]; }, examPlane: 'axial' },
      params: [{ id: 'listesis', type: 'range', label: { es: 'Desplazamiento de C2 sobre C3', en: 'Slip of C2 on C3' }, min: 0, max: 6, step: 1, value: 3, unit: 'mm', examMin: 2 }],
      techniques: [{ id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'Axial a la altura de los pedículos de C2 para los trazos; sagital para la espondilolistesis.', en: 'Axial at the C2 pedicles for the breaks; sagittal for the spondylolisthesis.' } }],
      compare: ['jefferson'],
      examLevel: () => 'C2',
      build: (p, A) => {
        const v = A.vertebra('vertebrae_C2'), xc = v.canal.xc, d = Math.round(p.listesis / A.sp[0]), out = [], bb = A.s(v.key).bbox;
        for (const side of ['R', 'L']) {
          const ped = v.ped[side]; if (!ped) continue;
          out.push({ t: 'plane', s: v.key, p: ped, n: [0.15, 1, 0], w: 1.6, jag: 1, hu: 60, limit: (z, y, x) => (side === 'R' ? x < xc - 3 : x > xc + 3) && Math.abs(y - ped[1]) < 5 });
        }
        if (d) out.push({ t: 'warp', s: v.key, box: [bb[0], bb[1], bb[2] - d - 1, bb[3], bb[4], bb[5]], fill: { hu: 55, label: 'lesion' },
          map: (z, y, x) => { const c = A.cordAt(z); if (!c) return null; const lim = c.y0 - 1; if (y >= lim) return null; const sy = y + d; return sy < lim ? [z, sy, x] : [-1, -1, -1]; } });
        out.push(mark(v.ped.R || v.body.c, 'Pars / pedículo', 'Pars / pedicle', { dx: -140, dy: 30, planes: ['axial'] }));
        out.push(mark([v.body.z1, v.body.y0 - d, xc], 'C2 desplazada sobre C3', 'C2 slipped on C3', { dx: -170, dy: 20, planes: ['sagittal'] }));
        return out;
      },
      readouts: p => [
        { label: { es: 'Espondilolistesis C2/C3', en: 'C2/C3 spondylolisthesis' }, value: `${p.listesis} mm` },
        { label: { es: 'Déficit neurológico', en: 'Neurological deficit' }, value: '25 %' },
      ],
      info: {
        where: { es: 'C2 (axis): pars interarticular y pedículos, con luxación de C2 sobre C3.', en: 'C2 (axis): pars interarticularis and pedicles, with dislocation of C2 on C3.' },
        see: { es: 'Trazo bilateral a través de los pedículos que separa el cuerpo del arco posterior; el cuerpo de C2 se desliza hacia delante sobre C3 (espondilolistesis).', en: 'Bilateral break through the pedicles that separates the body from the posterior arch; the C2 body slides forward on C3 (spondylolisthesis).' },
        technique: { es: 'Mecanismo: hiperextensión del cuello (+ compresión). Déficit neurológico: 25 %.', en: 'Mechanism: neck hyperextension (+ compression). Neurological deficit: 25 %.' },
        differential: { es: 'Jefferson (C1, carga axial, sin déficit) frente a ahorcado (C2, hiperextensión, 25 %).', en: 'Jefferson (C1, axial load, no deficit) versus hangman\'s (C2, hyperextension, 25 %).' },
        tip: { es: '«El ahorcado cuelga del cuello → C2».', en: '"The hangman hangs from the neck → C2".' },
      },
      flags: [{ kind: 'ampliacion', es: 'C1 acompaña a C2 cuando esta se desplaza; la simulación solo mueve el cuerpo de C2.', en: 'C1 moves along with C2 when it slips; the simulation only moves the C2 body.' }],
    },
    {
      id: 'estallido', group: 'fract', tag: 'ct-real',
      name: { es: 'Fractura por estallido', en: 'Burst fracture' },
      short: { es: 'Estallido', en: 'Burst' },
      view: { plane: 'axial', window: 'bone', zoom: 2.4, at: (p, A) => { const v = A.vertebra(VKEY(p.level)); const z = v.body.z0 + Math.round((v.body.z1 - v.body.z0) * 0.35); return [z, v.body.c[1] + 8, Math.round(A.cordAt(z) ? A.cordAt(z).xc : v.body.c[2])]; }, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', dropdown: true, label: { es: 'Vértebra', en: 'Vertebra' }, options: LV('T10', 'L4', ALL).map(opt), value: 'L1', recentre: true },
        { id: 'loss', type: 'range', label: { es: 'Pérdida de altura del cuerpo', en: 'Body height loss' }, min: 0, max: 50, step: 5, value: 30, unit: '%' },
        { id: 'retro', type: 'range', label: { es: 'Ocupación del canal por la retropulsión', en: 'Canal occupied by retropulsion' }, min: 0, max: 70, step: 5, value: 40, unit: '%', examMin: 30 },
      ],
      techniques: [
        { id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'El axial muestra el fragmento retropulsado dentro del canal.', en: 'The axial plane shows the retropulsed fragment inside the canal.' } },
        { id: 'rx', mod: 'rx', plane: 'sagittal', verdict: 'ok', label: { es: 'Rx lateral', en: 'Lateral film' }, note: { es: 'Ve el aplastamiento, pero no el canal.', en: 'Shows the collapse, but not the canal.' } },
      ],
      compare: ['compresion'],
      examLevel: p => p.level,
      build: (p, A) => {
        const v = A.vertebra(VKEY(p.level)), b = v.body, out = [];
        out.push(compress(A, v, p.loss / 100, p.loss / 100 * 0.8, { hu: 70, label: 'lesion' }));
        const c = b.c;
        for (const n of [[1, 0.35, 0.2], [0.15, 0.1, 1], [0.3, 1, 0.1]]) out.push({ t: 'plane', s: v.key, p: c, n, w: 1.5, jag: 2.2, hu: 70 });
        const z = b.z0 + Math.round((b.z1 - b.z0) * 0.35), cord = A.cordAt(z) || A.cordAt(c[0]), pw = postWall(A, v, z);
        const ap = v.canal ? v.canal.ap / A.sp[0] : 8, depth = Math.max(0, p.retro / 100 * ap);
        if (depth > 0.5) out.push({ t: 'blob', c: [z, pw + depth / 2, Math.round(cord.xc)], r: [5, Math.max(1.2, depth * A.sp[0] / 2), 7.5], hu: 650, edge: 0.4, irregular: 0.3, label: 'lesion', mr: { t1: 0.1, t2: 0.1, stir: 0.2 } });
        out.push(mark([z, pw + depth, cord.xc], 'Retropulsión al canal', 'Retropulsion into the canal', { dx: 70, dy: 40 }));
        return out;
      },
      readouts: (p, A) => {
        const v = A.vertebra(VKEY(p.level));
        return [
          { label: { es: 'Canal (diámetro AP)', en: 'Canal (AP diameter)' }, value: `${v.canal ? v.canal.ap.toFixed(0) : '—'} mm` },
          { label: { es: 'Ocupado por el fragmento', en: 'Occupied by the fragment' }, value: `${p.retro} %` },
          { label: { es: 'Déficit neurológico', en: 'Neurological deficit' }, value: '50 %' },
        ];
      },
      info: {
        where: { es: 'Cuerpo vertebral, típicamente en la charnela dorsolumbar; el fragmento posterior entra en el canal medular.', en: 'Vertebral body, typically at the thoracolumbar junction; the posterior fragment enters the spinal canal.' },
        see: { es: 'Cuerpo aplastado y conminuto con <b>retropulsión al canal medular</b> de un fragmento de la pared posterior.', en: 'Collapsed, comminuted body with <b>retropulsion into the spinal canal</b> of a fragment of the posterior wall.' },
        technique: { es: 'Mecanismo: sobrecarga axial de alta energía (caída desde altura). Déficit neurológico: 50 %.', en: 'Mechanism: high-energy axial load (fall from height). Neurological deficit: 50 %.' },
        differential: { es: 'Compresión: solo la parte anterior y superior, pared posterior intacta, sin déficit. Estallido: todo el cuerpo y retropulsión, 50 % de déficit.', en: 'Compression: anterior and superior part only, posterior wall intact, no deficit. Burst: the whole body and retropulsion, 50 % deficit.' },
        tip: { es: 'Mira el corte axial: el fragmento blanco dentro del canal es el dato que define el estallido.', en: 'Look at the axial slice: the white fragment inside the canal is what defines the burst fracture.' },
      },
      flags: [{ kind: 'apuntes', es: 'El 50 % es el déficit neurológico que da el temario, no el porcentaje de canal ocupado (ese lo eliges tú con el control).', en: 'The 50 % is the neurological deficit given in the syllabus, not the share of canal occupied (you set that with the slider).' }],
    },
    /* ===== infecciosa ===== */
    {
      id: 'espondilodiscitis', group: 'inf', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Espondilodiscitis piógena', en: 'Pyogenic spondylodiscitis' },
      short: { es: 'Espondilodiscitis', en: 'Spondylodiscitis' },
      view: { plane: 'sagittal', window: 'soft', zoom: 2.2, at: (p, A) => { const d = discOf(A, p.disc); const c = A.cordAt(d.c[0]); return [d.c[0], d.c[1], Math.round(c ? c.xc : d.c[2])]; }, examPlane: 'sagittal' },
      contrast: true,
      params: [
        { id: 'disc', type: 'select', dropdown: true, label: { es: 'Disco', en: 'Disc' }, options: DISCS_L, value: 'L2-L3', recentre: true },
        { id: 'stage', type: 'select', label: { es: 'Tiempo de evolución', en: 'Time since onset' }, options: STAGES, value: '2sem', examOptions: ['2sem', '8-12'] },
        { id: 'abscess', type: 'select', label: { es: 'Absceso', en: 'Abscess' }, options: [{ v: 'no', es: 'No', en: 'No' }, { v: 'para', es: 'Paravertebral', en: 'Paravertebral' }, { v: 'epi', es: 'Epidural', en: 'Epidural' }], value: 'no', exam: false },
      ],
      techniques: [
        { id: 't2', mod: 't2', plane: 'sagittal', verdict: 'best', default: true, label: { es: 'RM T2', en: 'T2 MR' }, note: { es: 'Técnica de elección: disco hiperintenso en T2, extensión paravertebral y epidural.', en: 'Technique of choice: disc hyperintense on T2, paravertebral and epidural spread.' } },
        { id: 't1', mod: 't1', plane: 'sagittal', verdict: 'best', label: { es: 'RM T1', en: 'T1 MR' }, note: { es: 'Disco hipointenso en T1; plataformas con erosiones.', en: 'Disc hypointense on T1; eroded endplates.' } },
        { id: 'ct', mod: 'ct', window: 'soft', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'Más sensible que la Rx (plataformas, cuerpo, partes blandas); con contraste descarta un absceso paravertebral o epidural.', en: 'More sensitive than the film (endplates, body, soft tissue); with contrast it rules out a paravertebral or epidural abscess.' } },
        { id: 'rx', mod: 'rx', plane: 'sagittal', verdict: 'bad', label: { es: 'Rx lateral', en: 'Lateral film' }, note: { es: 'Llega tarde: puede ser normal al inicio; a las 2 semanas ↓ altura discal y plataformas mal definidas; a las 8–12, reparación.', en: 'It is late: may be normal at onset; at 2 weeks ↓ disc height and poorly defined endplates; at 8–12, repair.' } },
      ],
      treatment: { label: { es: 'Tras tratamiento', en: 'After treatment' }, note: { es: 'Respuesta al tratamiento en RM: la disminución del componente de partes blandas es el dato más significativo de buena respuesta.', en: 'Response on MR: the decrease of the soft-tissue component is the most significant sign of a good response.' } },
      compare: ['absceso', 'discitis-infantil'],
      build: (p, A, env) => buildDiscitis(p, A, env),
      readouts: p => [{ label: { es: 'En la Rx', en: 'On the film' }, value: { inicio: { es: 'Puede ser normal', en: 'May be normal' }, '2sem': { es: '↓ altura discal, plataformas mal definidas, destrucción ósea', en: '↓ disc height, poorly defined endplates, bone destruction' }, '8-12': { es: 'Reparación: sin espacio discal, esclerosis, anquilosis', en: 'Repair: no disc space, sclerosis, ankylosis' } }[p.stage] }],
      info: {
        where: { es: 'Cuerpo vertebral y, secundariamente, disco intervertebral (adulto). Llega por vía hematógena desde un foco primario; <i>S. aureus</i> es el agente más frecuente.', en: 'Vertebral body and, secondarily, the intervertebral disc (adult). Arrives through the blood from a primary focus; <i>S. aureus</i> is the commonest agent.' },
        see: { es: 'RM: disco <b>hipointenso en T1 e hiperintenso en T2</b>, ↓ altura del espacio discal, disco que <b>capta contraste</b> (hiperemia reactiva), plataformas con erosiones y realce, extensión paravertebral y epidural.', en: 'MR: disc <b>hypointense on T1 and hyperintense on T2</b>, ↓ disc-space height, disc that <b>enhances</b> (reactive hyperaemia), eroded and enhancing endplates, paravertebral and epidural spread.' },
        technique: { es: 'RM de elección para el diagnóstico y la valoración. Rx: normal al inicio · 2 sem: ↓ altura discal, plataformas mal definidas, destrucción ósea · 8–12 sem: desaparece el espacio, esclerosis, anquilosis. TC con contraste: descartar absceso.', en: 'MR of choice for diagnosis and assessment. Film: normal at onset · 2 weeks: ↓ disc height, poorly defined endplates, bone destruction · 8–12 weeks: the space disappears, sclerosis, ankylosis. Contrast CT: rule out abscess.' },
        tip: { es: 'Pon «Inicio» y cambia a Rx: es normal. Luego a RM T2: el disco ya brilla. Es la pregunta típica: fiebre + dolor lumbar con Rx normal → pide RM.', en: 'Set "Onset" and switch to film: it is normal. Then to T2 MR: the disc already shines. Classic question: fever + back pain with a normal film → order MR.' },
      },
      flags: [
        { kind: 'ampliacion', es: 'La RM es una simulación a partir del TC (no es una RM real); la ↓ de altura discal se representa con la erosión de las plataformas.', en: 'The MR is simulated from the CT (not a real MR); the ↓ disc height is represented by the eroded endplates.' },
      ],
    },
    {
      id: 'absceso', group: 'inf', tag: 'ct-aprox',
      name: { es: 'Absceso paravertebral o epidural', en: 'Paravertebral or epidural abscess' },
      short: { es: 'Absceso', en: 'Abscess' },
      view: { plane: 'axial', window: 'soft', zoom: 2, at: (p, A) => { const d = discOf(A, p.disc); return [d.c[0], d.c[1] + 4, d.c[2]]; }, examPlane: 'axial' },
      contrast: true,
      params: [
        { id: 'disc', type: 'select', dropdown: true, label: { es: 'Disco', en: 'Disc' }, options: DISCS_L.slice(1), value: 'L2-L3', recentre: true },
        { id: 'abscess', type: 'select', label: { es: 'Localización', en: 'Site' }, options: [{ v: 'para', es: 'Paravertebral (psoas)', en: 'Paravertebral (psoas)' }, { v: 'epi', es: 'Epidural', en: 'Epidural' }], value: 'para' },
      ],
      techniques: [
        { id: 'ct', mod: 'ct', window: 'soft', verdict: 'best', default: true, label: { es: 'TC con contraste', en: 'Contrast CT' }, note: { es: 'Con contraste se puede descartar un absceso paravertebral o epidural: pared que realza y centro líquido.', en: 'With contrast a paravertebral or epidural abscess can be ruled out: enhancing wall and fluid centre.' } },
        { id: 't2', mod: 't2', verdict: 'best', label: { es: 'RM T2', en: 'T2 MR' }, note: { es: 'La RM valora la extensión a tejidos adyacentes, paravertebral y epidural.', en: 'MR assesses spread to adjacent tissue, paravertebral and epidural.' } },
      ],
      treatment: { label: { es: 'Tras tratamiento', en: 'After treatment' }, note: { es: 'Buena respuesta = ↓ del componente de partes blandas.', en: 'Good response = ↓ soft-tissue component.' } },
      compare: ['espondilodiscitis'],
      build: (p, A, env) => buildDiscitis({ disc: p.disc, stage: '2sem', abscess: p.abscess }, A, env),
      info: {
        where: { es: 'Partes blandas paravertebrales (psoas) o espacio epidural, junto al disco infectado.', en: 'Paravertebral soft tissue (psoas) or the epidural space, next to the infected disc.' },
        see: { es: 'Colección de centro líquido con pared que realza con contraste. Sin contraste se confunde con el resto de partes blandas.', en: 'Fluid-centred collection with a wall that enhances with contrast. Without contrast it blends with the other soft tissue.' },
        technique: { es: 'TC con contraste para descartarlo; RM para la extensión paravertebral y epidural.', en: 'Contrast CT to rule it out; MR for paravertebral and epidural spread.' },
        tip: { es: 'Alterna «Sin contraste / Con contraste»: el anillo que realza aparece solo con contraste.', en: 'Toggle "Unenhanced / With contrast": the enhancing ring only appears with contrast.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La forma de la colección (centro líquido, anillo que realza) es la habitual de un absceso; el temario solo dice que el TC con contraste puede descartarlo.', en: 'The shape of the collection (fluid centre, enhancing ring) is the usual one for an abscess; the syllabus only says contrast CT can rule it out.' }],
    },
    {
      id: 'discitis-infantil', group: 'inf', tag: 'esquema', extraTags: ['sim'],
      name: { es: 'Discitis infantil', en: 'Childhood discitis' },
      short: { es: 'Discitis infantil', en: 'Childhood discitis' },
      view: { plane: 'sagittal', window: 'soft', zoom: 2.2, at: (p, A) => { const d = discOf(A, p.disc); const c = A.cordAt(d.c[0]); return [d.c[0], d.c[1], Math.round(c ? c.xc : d.c[2])]; } },
      params: [{ id: 'disc', type: 'select', dropdown: true, label: { es: 'Disco', en: 'Disc' }, options: DISCS_L, value: 'L3-L4', recentre: true }],
      techniques: [{ id: 't2', mod: 't2', plane: 'sagittal', verdict: 'best', default: true, label: { es: 'RM T2', en: 'T2 MR' }, note: { es: 'Solo el disco brilla; los cuerpos vertebrales están respetados.', en: 'Only the disc shines; the vertebral bodies are spared.' } }],
      compare: ['espondilodiscitis'],
      exam: false,
      build: (p, A, env) => buildDiscitis({ disc: p.disc, stage: 'inicio', abscess: 'no' }, A, env, { infant: true }),
      info: {
        where: { es: 'Disco intervertebral del niño.', en: 'The child\'s intervertebral disc.' },
        see: { es: 'En niños puede haber <b>discitis de entrada</b>, sin afectar los cuerpos vertebrales (en el adulto se infecta primero el cuerpo y después el disco).', en: 'Children can have <b>discitis from the start</b>, without vertebral body involvement (in adults the body is infected first and then the disc).' },
        tip: { es: 'Compárala con la espondilodiscitis del adulto: aquí las plataformas no se tocan.', en: 'Compare it with adult spondylodiscitis: here the endplates are untouched.' },
      },
      diagram: lang => discDiagram(lang),
      flags: [{ kind: 'apuntes', es: 'Anatomía adulta: el TC es de un adulto; solo cambia qué se afecta (disco sí, cuerpos no).', en: 'Adult anatomy: the CT is an adult\'s; only what is involved changes (disc yes, bodies no).' }],
    },
    /* ===== degenerativa ===== */
    {
      id: 'artrosis', group: 'deg', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Artrosis interapofisaria (facetaria)', en: 'Facet (interapophyseal) osteoarthritis' },
      short: { es: 'Artrosis facetaria', en: 'Facet OA' },
      view: { plane: 'axial', window: 'bone', zoom: 2.6, at: (p, A) => { const [u, l] = p.level.split('-'); const f = facet(A, VKEY(u), VKEY(l), 'R') || A.vertebra(VKEY(u)).body.c; const c = A.cordAt(f[0]); return [f[0], f[1], Math.round(c ? c.xc : f[2])]; }, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', label: { es: 'Nivel', en: 'Level' }, options: ['L3-L4', 'L4-L5', 'L5-S1'].map(l => ({ v: l, es: l.replace('-', '–'), en: l.replace('-', '–') })), value: 'L4-L5', recentre: true },
        { id: 'side', type: 'select', label: { es: 'Lado', en: 'Side' }, options: [{ v: 'both', es: 'Ambos', en: 'Both' }, { v: 'R', es: 'Derecho', en: 'Right' }, { v: 'L', es: 'Izquierdo', en: 'Left' }], value: 'both' },
        { id: 'sev', type: 'range', label: { es: 'Intensidad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 },
      ],
      techniques: [
        { id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', default: true, label: { es: 'TC', en: 'CT' }, note: { es: 'Muestra los mismos signos que la Rx, en el plano axial de la articulación.', en: 'Shows the same signs as the film, in the axial plane of the joint.' } },
        { id: 'rx', mod: 'rx', plane: 'coronal', verdict: 'best', label: { es: 'Rx simple', en: 'Plain film' }, note: { es: 'El temario describe la artrosis en Rx simple: ↓ espacio, esclerosis, geodas, osteofitos.', en: 'The syllabus describes OA on plain film: ↓ space, sclerosis, subchondral cysts, osteophytes.' } },
      ],
      treatment: { label: { es: 'Infiltración', en: 'Injection' }, note: { es: 'Si no responde al tratamiento médico: infiltración articular.', en: 'If it does not respond to medical treatment: joint injection.' } },
      compare: ['quiste-sinovial', 'uncovertebral'],
      build: (p, A, env) => {
        const [u, l] = p.level.split('-'), uk = VKEY(u), lk = VKEY(l), out = [], s = p.sev;
        for (const side of p.side === 'both' ? ['R', 'L'] : [p.side]) {
          const f = facet(A, uk, lk, side); if (!f) continue;
          const away = side === 'R' ? -1 : 1;
          out.push({ t: 'blob', c: f, r: 3.5 + s * 1.5, hu: 1100, within: [uk, lk], label: 'keep', irregular: 0.3, edge: 1.5, mr: { t1: 0.08, t2: 0.08, stir: 0.08 } });       // subchondral sclerosis
          out.push({ t: 'cols', box: [f[0] - 4, f[0] + 4, f[1] - 4, f[1] + 4, f[2] - 4, f[2] + 4], fn: (z, y, x, cur) => {     // joint-space narrowing: gap bridged by bone
            if (cur.orig !== 0 || cur.hu > 300) return null; const d = Math.hypot(z - f[0], y - f[1], x - f[2]); return d < 1 + s * 0.8 ? { hu: 700, label: 'lesion' } : null; } });
          for (let i = 0; i < s; i++) out.push({ t: 'blob', c: [f[0] + (i - 1) * 2, f[1] + 1, f[2] + away * (1 + i)], r: 1.4 + i * 0.3, hu: 25, within: [uk, lk], label: 'lesion', mr: { t1: 0.15, t2: 0.9, stir: 0.85 } });   // geodas
          out.push({ t: 'blob', c: [f[0], f[1] + 3 + s, f[2] + away * 2], r: [3 + s, 2 + s * 0.7, 2.5 + s * 0.6], hu: 750, outside: [uk, lk, 'spinal_cord'], label: 'lesion', edge: 0.8, irregular: 0.4 });  // osteophyte
          if (side === 'R' || p.side === 'L') out.push(mark(f, 'Esclerosis, geodas y osteofitos', 'Sclerosis, cysts and osteophytes', { dx: side === 'R' ? -200 : 60, dy: 50, planes: ['axial'] }));
          if (env.treated) {
            const start = [f[0] + 2, f[1] + 34 / A.sp[0], f[2] + away * 14 / A.sp[0]];
            out.push({ t: 'tube', pts: [start, f], r: 0.8, hu: 3000, label: 'keep' });
            out.push(mark([(start[0] + f[0]) / 2, (start[1] + f[1]) / 2, (start[2] + f[2]) / 2], 'Aguja de infiltración', 'Injection needle', { dx: 60, dy: 40, planes: ['axial'] }));
          }
        }
        return out;
      },
      info: {
        where: { es: 'Articulaciones interapofisarias (facetarias) de la columna lumbar; en la cervical, también las uncovertebrales.', en: 'Interapophyseal (facet) joints of the lumbar spine; in the cervical spine, also the uncovertebral joints.' },
        see: { es: '↓ espacio articular, esclerosis, quistes o geodas subcondrales y osteofitos (hueso reactivo).', en: '↓ joint space, sclerosis, subchondral cysts and osteophytes (reactive bone).' },
        technique: { es: 'Rx simple. Causa frecuente de dolor de espalda; si no responde al tratamiento médico, infiltración articular.', en: 'Plain film. A common cause of back pain; if it does not respond to medical treatment, joint injection.' },
        tip: { es: 'Sube la intensidad y busca los cuatro signos en el mismo corte axial.', en: 'Raise the severity and look for the four signs on the same axial slice.' },
      },
      flags: [{ kind: 'ampliacion', es: 'La articulación facetaria se localiza donde se tocan las máscaras de las dos vértebras detrás del canal; es una aproximación (no hay máscara de las carillas).', en: 'The facet joint is placed where the two vertebra masks touch behind the canal; an approximation (there is no facet mask).' }],
    },
    {
      id: 'quiste-sinovial', group: 'deg', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Quiste sinovial facetario', en: 'Facet synovial cyst' },
      short: { es: 'Quiste sinovial', en: 'Synovial cyst' },
      view: { plane: 'axial', window: 'soft', zoom: 2.8, at: (p, A) => { const [u, l] = p.level.split('-'); const f = facet(A, VKEY(u), VKEY(l), p.side) || A.vertebra(VKEY(u)).body.c; const c = A.cordAt(f[0]); return [f[0], f[1] - 2, Math.round(c ? c.xc : f[2])]; }, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', label: { es: 'Nivel', en: 'Level' }, options: ['L3-L4', 'L4-L5', 'L5-S1'].map(l => ({ v: l, es: l.replace('-', '–'), en: l.replace('-', '–') })), value: 'L4-L5', recentre: true },
        { id: 'side', type: 'select', label: { es: 'Lado', en: 'Side' }, options: [{ v: 'R', es: 'Derecho', en: 'Right' }, { v: 'L', es: 'Izquierdo', en: 'Left' }], value: 'R' },
        { id: 'size', type: 'range', label: { es: 'Tamaño', en: 'Size' }, min: 4, max: 14, step: 1, value: 9, unit: 'mm', examMin: 8 },
      ],
      techniques: [
        { id: 'ct', mod: 'ct', window: 'soft', verdict: 'ok', default: true, label: { es: 'TC', en: 'CT' }, note: { es: 'Lesión redondeada de densidad líquida junto a la articulación, que entra en el canal.', en: 'Round fluid-density lesion next to the joint, entering the canal.' } },
        { id: 't2', mod: 't2', verdict: 'ok', label: { es: 'RM T2', en: 'T2 MR' }, note: { es: 'Contenido líquido hiperintenso en T2 (simulación).', en: 'Fluid content, hyperintense on T2 (simulation).' } },
      ],
      compare: ['artrosis', 'hernia'],
      build: (p, A) => {
        const [u, l] = p.level.split('-'), uk = VKEY(u), lk = VKEY(l), f = facet(A, uk, lk, p.side); if (!f) return [];
        const c = A.cordAt(f[0]), xc = c ? c.xc : f[2], r = p.size / 2, cx = f[2] + (xc - f[2]) * 0.45, cy = f[1] - 1;
        return [
          { t: 'blob', c: [f[0], cy, cx], r: [r * 1.1, r, r], hu: 15, rim: { w: 1, hu: 70 }, edge: 0.5, outside: [uk, lk], label: 'lesion', mr: { t1: 0.15, t2: 0.96, stir: 0.92 } },
          mark([f[0], cy, cx], 'Quiste sinovial', 'Synovial cyst', { dx: p.side === 'R' ? -160 : 60, dy: -40 }),
        ];
      },
      info: {
        where: { es: 'Junto a una articulación interapofisaria artrósica, más frecuente (60–70 %) en L4–L5.', en: 'Next to an arthritic facet joint, most often (60–70 %) at L4–L5.' },
        see: { es: 'Lesión quística redondeada que sale de la articulación hacia el canal.', en: 'Round cystic lesion arising from the joint towards the canal.' },
        technique: { es: 'Forma parte de la artrosis facetaria (quistes sinoviales o articulares).', en: 'Part of facet osteoarthritis (synovial or articular cysts).' },
        differential: { es: 'Frente a la hernia: el quiste sale de la articulación (posterolateral), la hernia sale del disco (anterior al saco).', en: 'Versus herniation: the cyst arises from the joint (posterolateral), the herniation from the disc (in front of the sac).' },
      },
      flags: [{ kind: 'ampliacion', es: 'Densidad líquida, pared fina y posición posterolateral son los rasgos habituales; el temario solo da la frecuencia en L4–L5.', en: 'Fluid density, thin wall and posterolateral position are the usual features; the syllabus only gives the L4–L5 frequency.' }],
    },
    {
      id: 'uncovertebral', group: 'deg', tag: 'ct-aprox',
      name: { es: 'Artrosis uncovertebral (cervical)', en: 'Uncovertebral osteoarthritis (cervical)' },
      short: { es: 'Uncoartrosis', en: 'Uncovertebral OA' },
      view: { plane: 'axial', window: 'bone', zoom: 3, at: (p, A) => discOf(A, p.level).c, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', label: { es: 'Nivel', en: 'Level' }, options: ['C3-C4', 'C5-C6', 'C6-C7'].map(l => ({ v: l, es: l.replace('-', '–'), en: l.replace('-', '–') })), value: 'C5-C6', recentre: true },
        { id: 'sev', type: 'range', label: { es: 'Intensidad', en: 'Severity' }, min: 1, max: 3, step: 1, value: 2, examMin: 2 },
      ],
      techniques: [{ id: 'ct', mod: 'ct', window: 'bone', verdict: 'ok', default: true, label: { es: 'TC', en: 'CT' }, note: { es: 'Osteofitos en los márgenes posterolaterales de los cuerpos.', en: 'Osteophytes at the posterolateral margins of the bodies.' } },
        { id: 'rx', mod: 'rx', plane: 'coronal', verdict: 'ok', label: { es: 'Rx AP', en: 'AP film' }, note: { es: 'Signos de artrosis en la Rx simple.', en: 'OA signs on the plain film.' } }],
      compare: ['artrosis'],
      build: (p, A) => {
        const d = discOf(A, p.level), s = p.sev, out = [], zc = d.c[0];
        for (const [x, away] of [[d.x0 + 2, -1], [d.x1 - 2, 1]]) {
          const y = d.y1 - 1;
          out.push({ t: 'blob', c: [zc, y, x], r: [2.5 + s, 1.6 + s * 0.8, 1.8 + s * 0.8], hu: 760, outside: ['spinal_cord'], label: 'lesion', edge: 0.6, irregular: 0.4 });
          out.push({ t: 'fill', s: [d.upper.key, d.lower.key], region: { c: [zc, y, x - away], r: 4 + s }, delta: 260, label: 'keep' });
        }
        out.push(mark([zc, d.y1, d.x1 - 2], 'Osteofitos uncovertebrales', 'Uncovertebral osteophytes', { dx: 60, dy: 40, planes: ['axial', 'coronal'] }));
        return out;
      },
      info: {
        where: { es: 'Articulaciones uncovertebrales, propias de la columna cervical (márgenes posterolaterales de los cuerpos).', en: 'Uncovertebral joints, specific to the cervical spine (posterolateral margins of the bodies).' },
        see: { es: 'Esclerosis y osteofitos en los márgenes posterolaterales del cuerpo, hacia el agujero de conjunción.', en: 'Sclerosis and osteophytes at the posterolateral body margins, towards the neural foramen.' },
        technique: { es: 'Rx simple, como el resto de la artrosis.', en: 'Plain film, like the rest of OA.' },
      },
      flags: [
        { kind: 'revisar', es: 'El temario pone «(son las articulaciones facetarias)» detrás de las uncovertebrales. Las facetarias son las interapofisarias; las uncovertebrales son otra articulación, propia de la columna cervical.', en: 'The syllabus puts "(these are the facet joints)" after the uncovertebral joints. Facet joints are the interapophyseal ones; uncovertebral joints are a different joint, specific to the cervical spine.' },
        { kind: 'ampliacion', es: 'La posición de los osteofitos se estima en las esquinas posterolaterales del disco; la orientación al agujero de conjunción es la habitual.', en: 'Osteophyte position is estimated at the posterolateral corners of the disc; the orientation towards the foramen is the usual one.' },
      ],
    },
    /* ===== hernia discal ===== */
    {
      id: 'hernia', group: 'hernia', tag: 'ct-aprox', extraTags: ['sim'],
      name: { es: 'Hernia discal', en: 'Disc herniation' },
      short: { es: 'Hernia discal', en: 'Disc herniation' },
      view: { plane: 'sagittal', window: 'soft', zoom: 2.6, at: (p, A) => { const d = discOf(A, p.level); const c = A.cordAt(d.c[0]); const sx = p.side === 'central' ? 0 : (p.side === 'R' ? -6 : 6) / A.sp[0]; return [d.c[0], d.c[1] + 6, Math.round((c ? c.xc : d.c[2]) + sx)]; }, examPlane: 'axial' },
      params: [
        { id: 'level', type: 'select', label: { es: 'Nivel', en: 'Level' }, options: ['L3-L4', 'L4-L5', 'L5-S1', 'C5-C6'].map(l => ({ v: l, es: l.replace('-', '–'), en: l.replace('-', '–') })), value: 'L4-L5', recentre: true },
        { id: 'type', type: 'select', dropdown: true, label: { es: 'Tipo', en: 'Type' }, options: [
          { v: 'prot-ancha', es: 'Protrusión de base ancha', en: 'Broad-based protrusion' }, { v: 'prot-focal', es: 'Protrusión focal', en: 'Focal protrusion' },
          { v: 'extrusion', es: 'Extrusión', en: 'Extrusion' }, { v: 'migracion', es: 'Migración', en: 'Migration' }, { v: 'secuestro', es: 'Secuestro', en: 'Sequestration' }], value: 'extrusion' },
        { id: 'side', type: 'select', label: { es: 'Posición', en: 'Position' }, options: [{ v: 'central', es: 'Central', en: 'Central' }, { v: 'R', es: 'Paracentral der.', en: 'Right paracentral' }, { v: 'L', es: 'Paracentral izq.', en: 'Left paracentral' }], value: 'R' },
        { id: 'size', type: 'range', label: { es: 'Cuánto sale del borde del cuerpo', en: 'How far beyond the body margin' }, min: 2, max: 10, step: 1, value: 6, unit: 'mm', examMin: 5 },
      ],
      techniques: [
        { id: 't2', mod: 't2', plane: 'sagittal', verdict: 'best', default: true, label: { es: 'RM T2', en: 'T2 MR' }, note: { es: 'Las imágenes del temario son de RM: el material discal (oscuro) indenta el saco tecal (brillante).', en: 'The syllabus images are MR: the disc material (dark) indents the bright thecal sac.' } },
        { id: 'ct', mod: 'ct', window: 'soft', verdict: 'ok', label: { es: 'TC', en: 'CT' }, note: { es: 'El disco herniado (más denso) ocupa la grasa epidural anterior y desplaza el saco.', en: 'The herniated disc (denser) fills the anterior epidural fat and displaces the sac.' } },
      ],
      compare: ['quiste-sinovial'],
      build: (p, A) => {
        const d = discOf(A, p.level), [u] = p.level.split('-'), out = [...discsMR(A, u, 1)];
        const zc = d.c[0], cord = A.cordAt(zc), xc = (cord ? cord.xc : d.c[2]) + (p.side === 'central' ? 0 : (p.side === 'R' ? -6 : 6) / A.sp[0]);
        let yPost = d.y1; for (const [k, c] of d.cols) { const [y, x] = k.split(',').map(Number); if (Math.abs(x - Math.round(xc)) <= 1 && zc >= c[0] - 2 && zc <= c[1] + 2) yPost = Math.max(yPost, y); }
        const dv = p.size / A.sp[0], Dh = d.h * A.sp[0], bones = [d.upper.key, d.lower.key];
        const mat = { hu: 90, label: 'lesion', outside: bones, mr: { t1: 0.4, t2: 0.32, stir: 0.3 }, edge: 0.6 };
        const base = (rx, rz) => ({ t: 'blob', c: [zc, yPost + dv / 2, xc], r: [rz, Math.max(1.5, p.size / 2 + 0.75), rx], ...mat });
        if (p.type === 'prot-ancha') out.push(base(13, Dh * 0.42));
        else if (p.type === 'prot-focal') out.push(base(6, Dh * 0.42));
        else {
          const neck = { t: 'blob', c: [zc, yPost + 1.5, xc], r: [Dh * 0.3, 2.5, 3.5], ...mat };
          const shiftZ = p.type === 'extrusion' ? 0 : p.type === 'migracion' ? 9 / A.sp[0] : 13 / A.sp[0];
          const dome = { t: 'blob', c: [zc + shiftZ, yPost + dv * 0.6, xc], r: [Math.max(Dh * 0.9, p.size * 0.9), Math.max(1.8, p.size * 0.45), 6.5], ...mat, irregular: 0.25 };
          if (p.type !== 'secuestro') out.push(neck);
          if (p.type === 'migracion') out.push({ t: 'tube', pts: [[zc, yPost + 2, xc], [zc + shiftZ, yPost + dv * 0.6, xc]], r: 2.2, ...mat });
          out.push(dome);
        }
        const label = { 'prot-ancha': ['Protrusión: misma altura que el disco', 'Protrusion: same height as the disc'], 'prot-focal': ['Protrusión focal', 'Focal protrusion'], extrusion: ['Extrusión: más alta que el disco', 'Extrusion: taller than the disc'], migracion: ['Migración', 'Migration'], secuestro: ['Fragmento secuestrado', 'Sequestered fragment'] }[p.type];
        const zm = zc + (p.type === 'migracion' ? 9 / A.sp[0] : p.type === 'secuestro' ? 13 / A.sp[0] : 0);
        out.push(mark([zm, yPost + dv * 0.6, xc], label[0], label[1], { dx: 60, dy: -36 }));
        return out;
      },
      readouts: (p, A) => {
        const d = discOf(A, p.level), Dh = d.h * A.sp[0];
        const hh = p.type.startsWith('prot') ? Dh * 0.84 : p.type === 'secuestro' ? 0 : 2 * Math.max(Dh * 0.9, p.size * 0.9);
        return [
          { label: { es: 'Altura del disco', en: 'Disc height' }, value: `${Dh.toFixed(1)} mm` },
          { label: { es: 'Altura del material herniado', en: 'Height of herniated material' }, value: p.type === 'secuestro' ? { es: 'Fragmento separado', en: 'Separate fragment' }
            : p.type.startsWith('prot') ? { es: `${hh.toFixed(1)} mm (≤ disco)`, en: `${hh.toFixed(1)} mm (≤ disc)` } : { es: `${hh.toFixed(1)} mm (> disco)`, en: `${hh.toFixed(1)} mm (> disc)` } },
        ];
      },
      info: {
        where: { es: 'Extensión del disco más allá del margen del cuerpo vertebral, hacia el canal.', en: 'Disc extending beyond the margin of the vertebral body, into the canal.' },
        see: { es: '<b>Protrusión</b>: el fragmento tiene la misma altura que el resto del disco (de base ancha o focal) · <b>Extrusión</b>: el material herniado tiene mayor altura · <b>Migración</b>: además se desplaza · <b>Secuestro</b>: un fragmento se rompe y se separa.', en: '<b>Protrusion</b>: the fragment has the same height as the rest of the disc (broad-based or focal) · <b>Extrusion</b>: the herniated material is taller · <b>Migration</b>: it also moves away · <b>Sequestration</b>: a fragment breaks off and separates.' },
        technique: { es: 'Las imágenes del temario son de RM.', en: 'The syllabus images are MR.' },
        differential: { es: 'Quiste sinovial: sale de la articulación interapofisaria, no del disco.', en: 'Synovial cyst: arises from the facet joint, not from the disc.' },
        tip: { es: 'Recorre los cuatro tipos en el plano sagital y fíjate solo en la altura del material respecto al disco.', en: 'Go through the four types on the sagittal plane and look only at the height of the material relative to the disc.' },
      },
      diagram: lang => herniaDiagram(lang),
      flags: [
        { kind: 'apuntes', es: 'Definiciones tal como vienen en el temario (protrusión = misma altura, extrusión = mayor altura).', en: 'Definitions exactly as in the syllabus (protrusion = same height, extrusion = taller).' },
        { kind: 'ampliacion', es: 'La nomenclatura actual (NASS/ASSR/ASNR, versión 2.0) distingue protrusión y extrusión por la anchura de la base frente a la del extremo, no por la altura. Para el examen, usa la del temario.', en: 'Current nomenclature (NASS/ASSR/ASNR, version 2.0) separates protrusion and extrusion by base width versus dome width, not by height. For the exam, use the syllabus version.' },
        { kind: 'ampliacion', es: 'Que la RM sea la técnica habitual de la hernia es ampliación: el temario solo muestra imágenes de RM.', en: 'MR being the usual technique for herniation goes beyond the syllabus: it only shows MR images.' },
      ],
    },
  ],
  questions: [
    { prompt: { es: 'Ordena las fracturas según su déficit neurológico (de menos a más).', en: 'Order the fractures by neurological deficit (least to most).' },
      options: [{ es: 'Compresión y Jefferson (no) < ahorcado (25 %) < estallido (50 %)', en: 'Compression and Jefferson (none) < hangman\'s (25 %) < burst (50 %)' }, { es: 'Jefferson (no) < compresión (25 %) < estallido (50 %) < ahorcado', en: 'Jefferson (none) < compression (25 %) < burst (50 %) < hangman\'s' }, { es: 'Compresión (no) < estallido (25 %) < ahorcado (50 %)', en: 'Compression (none) < burst (25 %) < hangman\'s (50 %)' }, { es: 'Todas dan el mismo déficit', en: 'All give the same deficit' }],
      answer: 0, explain: { es: '«0-0-25-50»: compresión no, Jefferson no, ahorcado 25 %, estallido 50 %.', en: '"0-0-25-50": compression none, Jefferson none, hangman\'s 25 %, burst 50 %.' } },
    { prompt: { es: '¿Qué vértebra y estructuras afecta la fractura de Jefferson y por qué mecanismo?', en: 'Which vertebra and structures does the Jefferson fracture involve, and by what mechanism?' }, show: 'jefferson',
      options: [{ es: 'C1, arcos anterior y posterior, sobrecarga axial', en: 'C1, anterior and posterior arches, axial load' }, { es: 'C2, pars interarticular, hiperextensión', en: 'C2, pars interarticularis, hyperextension' }, { es: 'C1, apófisis odontoides, flexión', en: 'C1, odontoid process, flexion' }, { es: 'C7, apófisis espinosa, flexión', en: 'C7, spinous process, flexion' }],
      answer: 0, explain: { es: 'C1, arcos anterior y posterior, por sobrecarga axial; canal ensanchado, sin déficit.', en: 'C1, anterior and posterior arches, from axial load; widened canal, no deficit.' } },
    { prompt: { es: 'Accidente con hiperextensión cervical: fractura de la pars interarticular de C2 con luxación sobre C3. ¿Diagnóstico?', en: 'Car crash with neck hyperextension: C2 pars fracture with dislocation on C3. Diagnosis?' }, show: 'ahorcado',
      options: [{ es: 'Fractura del ahorcado', en: 'Hangman\'s fracture' }, { es: 'Fractura de Jefferson', en: 'Jefferson fracture' }, { es: 'Fractura por estallido', en: 'Burst fracture' }, { es: 'Fractura por compresión', en: 'Compression fracture' }],
      answer: 0, explain: { es: 'Ahorcado: 25 % de déficit neurológico, espondilolistesis.', en: 'Hangman\'s: 25 % neurological deficit, spondylolisthesis.' } },
    { prompt: { es: 'Caída desde altura con carga axial y fragmentos en el canal medular. ¿Qué fractura y qué riesgo neurológico?', en: 'Fall from height with axial load and fragments in the spinal canal. Which fracture and what neurological risk?' }, show: 'estallido',
      options: [{ es: 'Estallido, 50 % de déficit', en: 'Burst, 50 % deficit' }, { es: 'Compresión, sin déficit', en: 'Compression, no deficit' }, { es: 'Ahorcado, 25 %', en: 'Hangman\'s, 25 %' }, { es: 'Estallido, sin déficit', en: 'Burst, no deficit' }],
      answer: 0, explain: { es: 'Retropulsión al canal: fractura por estallido, 50 % de déficit neurológico.', en: 'Retropulsion into the canal: burst fracture, 50 % neurological deficit.' } },
    { prompt: { es: 'Mujer de 72 años con osteoporosis, dolor dorsal y vértebra en cuña en la Rx. ¿Cómo sabes si es aguda?', en: '72-year-old woman with osteoporosis, back pain and a wedged vertebra on the film. How do you tell if it is acute?' },
      options: [{ es: 'RM con STIR (hiperintensa por edema) o gammagrafía', en: 'STIR MR (hyperintense from oedema) or bone scan' }, { es: 'Repetir la Rx en 2 semanas', en: 'Repeat the film in 2 weeks' }, { es: 'TC sin contraste', en: 'Unenhanced CT' }, { es: 'Ecografía', en: 'Ultrasound' }],
      answer: 0, explain: { es: 'La fractura aguda es hiperintensa en STIR por el edema (o se ve en la gammagrafía).', en: 'An acute fracture is hyperintense on STIR from oedema (or shows on a bone scan).' } },
    { prompt: { es: '¿Cómo se trata guiado por imagen el dolor de la fractura por compresión?', en: 'How is the pain of a compression fracture treated under image guidance?' }, show: 'vertebroplastia',
      options: [{ es: 'Trócares transpediculares (escopia o TC) e inyección de cemento', en: 'Transpedicular trocars (fluoroscopy or CT) and cement injection' }, { es: 'Infiltración facetaria', en: 'Facet injection' }, { es: 'Drenaje percutáneo', en: 'Percutaneous drainage' }, { es: 'Embolización', en: 'Embolisation' }],
      answer: 0, explain: { es: 'Vía transpedicular con escopia o TC y cemento → se resuelve el dolor.', en: 'Transpedicular route under fluoroscopy or CT and cement → the pain resolves.' } },
    { prompt: { es: '¿Agente más frecuente de la espondilodiscitis piógena y cómo llega a la vértebra?', en: 'Commonest agent of pyogenic spondylodiscitis and how it reaches the vertebra?' },
      options: [{ es: 'S. aureus, por vía hematógena', en: 'S. aureus, through the blood' }, { es: 'M. tuberculosis, por contigüidad', en: 'M. tuberculosis, by contiguity' }, { es: 'E. coli, por vía linfática', en: 'E. coli, through lymphatics' }, { es: 'S. aureus, por inoculación directa', en: 'S. aureus, by direct inoculation' }],
      answer: 0, explain: { es: 'S. aureus, generalmente por vía hematógena desde un foco primario.', en: 'S. aureus, usually through the blood from a primary focus.' } },
    { prompt: { es: 'Fiebre y dolor lumbar intenso desde hace 5 días; la Rx es normal. ¿Qué haces?', en: 'Fever and severe back pain for 5 days; the film is normal. What do you do?' }, show: 'espondilodiscitis',
      options: [{ es: 'No la descarto: pido una RM', en: 'I do not rule it out: I order MR' }, { es: 'La descarto: la Rx es normal', en: 'I rule it out: the film is normal' }, { es: 'Repito la Rx mañana', en: 'I repeat the film tomorrow' }, { es: 'Pido una ecografía', en: 'I order ultrasound' }],
      answer: 0, explain: { es: 'La Rx puede ser normal al inicio (cambios a las 2 semanas). La RM es la técnica de elección.', en: 'The film can be normal at onset (changes at 2 weeks). MR is the technique of choice.' } },
    { prompt: { es: 'Señal del disco infectado en RM:', en: 'Signal of the infected disc on MR:' },
      options: [{ es: 'Hipointenso en T1, hiperintenso en T2, capta contraste', en: 'Hypointense on T1, hyperintense on T2, enhances' }, { es: 'Hiperintenso en T1, hipointenso en T2', en: 'Hyperintense on T1, hypointense on T2' }, { es: 'Normal en T1 y T2, no capta', en: 'Normal on T1 and T2, no enhancement' }, { es: 'Hipointenso en T1 y T2, sin captación', en: 'Hypointense on T1 and T2, no enhancement' }],
      answer: 0, explain: { es: 'Hipo T1, hiper T2 y captación por la hiperemia reactiva.', en: 'Hypo T1, hyper T2 and enhancement from reactive hyperaemia.' } },
    { prompt: { es: 'En el seguimiento de una espondilodiscitis, ¿qué dato de la RM indica buena respuesta?', en: 'In spondylodiscitis follow-up, which MR finding means a good response?' },
      options: [{ es: 'Disminución del componente de partes blandas', en: 'Decrease of the soft-tissue component' }, { es: 'Aumento de la señal del disco en T2', en: 'Increased disc signal on T2' }, { es: 'Aparición de esclerosis', en: 'Appearance of sclerosis' }, { es: 'Normalización de la Rx', en: 'A normal film' }],
      answer: 0, explain: { es: 'La disminución del componente de partes blandas es el dato más significativo de buena respuesta.', en: 'The decrease of the soft-tissue component is the most significant sign of a good response.' } },
    { prompt: { es: 'Signos de artrosis en la Rx simple y dónde son más frecuentes los quistes sinoviales:', en: 'Signs of OA on the plain film, and where synovial cysts are commonest:' }, show: 'artrosis',
      options: [{ es: '↓ espacio, esclerosis, geodas, osteofitos; quistes sinoviales en L4–L5 (60–70 %)', en: '↓ space, sclerosis, cysts, osteophytes; synovial cysts at L4–L5 (60–70 %)' }, { es: 'Ensanchamiento del espacio, osteopenia; quistes en C5–C6', en: 'Widened space, osteopenia; cysts at C5–C6' }, { es: 'Erosiones marginales; quistes en L1–L2', en: 'Marginal erosions; cysts at L1–L2' }, { es: 'Solo osteofitos; quistes en L5–S1 (90 %)', en: 'Only osteophytes; cysts at L5–S1 (90 %)' }],
      answer: 0, explain: { es: '↓ espacio articular, esclerosis, geodas subcondrales y osteofitos; quistes sinoviales sobre todo en L4–L5.', en: '↓ joint space, sclerosis, subchondral cysts and osteophytes; synovial cysts mainly at L4–L5.' } },
    { prompt: { es: '¿Qué diferencia una protrusión de una extrusión discal (según el temario)?', en: 'What separates a disc protrusion from an extrusion (as in the syllabus)?' }, show: 'hernia',
      options: [{ es: 'Protrusión: misma altura que el disco; extrusión: mayor altura', en: 'Protrusion: same height as the disc; extrusion: taller' }, { es: 'Protrusión: fragmento separado; extrusión: unido', en: 'Protrusion: separate fragment; extrusion: attached' }, { es: 'Protrusión: lateral; extrusión: central', en: 'Protrusion: lateral; extrusion: central' }, { es: 'No hay diferencia', en: 'There is no difference' }],
      answer: 0, explain: { es: 'En la protrusión el fragmento tiene la misma altura que el resto del disco; en la extrusión, mayor altura.', en: 'In protrusion the fragment has the same height as the rest of the disc; in extrusion, more.' } },
  ],
};

/* ---------------- diagrams (esquemas) ---------------- */
function herniaDiagram(lang) {
  const T = lang === 'en' ? ['Protrusion', 'Extrusion', 'Migration', 'Sequestration', 'same height', 'taller', 'moves away', 'separate'] : ['Protrusión', 'Extrusión', 'Migración', 'Secuestro', 'misma altura', 'mayor altura', 'se desplaza', 'separado'];
  const panel = (i, extra) => `<g transform="translate(${i * 80},0)"><rect x="8" y="8" width="44" height="22" rx="3" class="db"/><rect x="8" y="34" width="44" height="12" rx="3" class="dd"/><rect x="8" y="50" width="44" height="22" rx="3" class="db"/><rect x="56" y="4" width="14" height="72" rx="6" class="ds"/>${extra}<text x="38" y="90" class="dt">${T[i]}</text><text x="38" y="102" class="dt2">${T[i + 4]}</text></g>`;
  return `<svg viewBox="0 0 320 108" class="dsvg" role="img" aria-label="${T.slice(0, 4).join(', ')}">` +
    panel(0, '<path d="M52 36 q7 4 0 8z" class="dh"/>') + panel(1, '<path d="M52 37 q12 -10 6 6 q6 14 -6 3z" class="dh"/>') +
    panel(2, '<path d="M52 37 q8 2 4 8 l2 16 q-6 4 -6 -2z" class="dh"/>') + panel(3, '<ellipse cx="58" cy="62" rx="3.5" ry="5" class="dh"/>') + '</svg>';
}
function discDiagram(lang) {
  const T = lang === 'en' ? ['Adult', 'Child', 'body first, then disc', 'disc from the start'] : ['Adulto', 'Niño', 'primero el cuerpo, luego el disco', 'disco de entrada'];
  const col = (x, adult) => `<g transform="translate(${x},0)"><rect x="10" y="8" width="60" height="26" rx="4" class="db${adult ? ' inf' : ''}"/><rect x="10" y="38" width="60" height="12" rx="3" class="dd inf"/><rect x="10" y="54" width="60" height="26" rx="4" class="db${adult ? ' inf' : ''}"/><text x="40" y="96" class="dt">${adult ? T[0] : T[1]}</text><text x="40" y="108" class="dt2">${adult ? T[2] : T[3]}</text></g>`;
  return `<svg viewBox="0 0 220 114" class="dsvg" role="img" aria-label="${T[0]} / ${T[1]}">${col(10, true)}${col(120, false)}</svg>`;
}
