// Pathology modules: registry and pure helpers (no DOM). A module is plain data + build functions in
// modules/<slug>/module.js; this file validates it, resolves parameters and generates exam questions.
// Shared by the viewer (src/modui.js) and the tests.

import { PHASES, MODALITIES } from './pathology.js';

/** Registered modules, in teaching order. path is relative to src/. */
export const REGISTRY = [
  { slug: 'columna', path: '../modules/columna/module.js', es: 'Columna y médula', en: 'Spine and cord' },
  { slug: 'pulmon', path: '../modules/pulmon/module.js', es: 'Parénquima pulmonar', en: 'Lung parenchyma' },
  { slug: 'mediastino', path: '../modules/mediastino/module.js', es: 'Mediastino y pleura', en: 'Mediastinum and pleura' },
  { slug: 'higado', path: '../modules/higado/module.js', es: 'Hígado, vía biliar y páncreas', en: 'Liver, biliary tree and pancreas' },
  { slug: 'urinario', path: '../modules/urinario/module.js', es: 'Urinario, suprarrenales y próstata', en: 'Urinary tract, adrenals and prostate' },
];

/** Coverage tags (how each entity can be shown on this platform). */
export const TAGS = {
  'ct-real':  { es: 'TC real', en: 'Real CT', hint: { es: 'Lesión dibujada en su sitio real, sobre las máscaras de este estudio', en: 'Lesion drawn at its real site, on this study\'s masks' } },
  'ct-aprox': { es: 'TC aprox.', en: 'Approx. CT', hint: { es: 'TC real, pero la localización se estima (no hay máscara de esa estructura)', en: 'Real CT, but the location is estimated (no mask for that structure)' } },
  'kit':      { es: 'Necesita data kit', en: 'Needs data kit', hint: { es: 'Necesita otra máscara u otro caso que aún no existen', en: 'Needs another mask or case that does not exist yet' } },
  'sim':      { es: 'Simulación', en: 'Simulation', hint: { es: 'Rx, RM o fase de contraste simuladas a partir del TC', en: 'Plain film, MR or contrast phase simulated from the CT' } },
  'esquema':  { es: 'Esquema', en: 'Diagram', hint: { es: 'Un TC de adulto no puede mostrarlo: se explica con un esquema', en: 'An adult CT cannot show it: explained with a diagram' } },
};
export const FLAG_KINDS = ['apuntes', 'ampliacion', 'revisar'];
export const VERDICTS = ['best', 'ok', 'bad'];

const SLUG = /^[a-z0-9-]{1,40}$/, EID = /^[a-z0-9-]{1,40}$/;
const isBi = o => o && typeof o.es === 'string' && o.es && typeof o.en === 'string' && o.en;

/** Default parameter values of an entity. */
export function defaults(ent) {
  const p = {};
  for (const q of ent.params || []) p[q.id] = q.value !== undefined ? q.value : q.type === 'toggle' ? false : q.type === 'select' ? q.options[0].v : q.min;
  return p;
}

/** Clamp / validate one parameter value; returns the default when invalid. */
export function coerce(q, v) {
  if (q.type === 'range') {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return q.value;
    const k = Math.round((Math.min(q.max, Math.max(q.min, n)) - q.min) / q.step);
    return +(q.min + k * q.step).toFixed(6);
  }
  if (q.type === 'toggle') return v === true || v === 1 || v === '1' || v === 'true';
  if (q.type === 'select') return q.options.some(o => String(o.v) === String(v)) ? q.options.find(o => String(o.v) === String(v)).v : q.value !== undefined ? q.value : q.options[0].v;
  return v;
}

/** "a:1,b:x" -> validated params (unknown keys ignored, missing ones default). */
export function parseParamString(str, ent) {
  const p = defaults(ent);
  if (!str) return p;
  for (const part of String(str).split(',')) {
    const i = part.indexOf(':'); if (i < 1) continue;
    const k = part.slice(0, i), v = decodeURIComponent(part.slice(i + 1)), q = (ent.params || []).find(x => x.id === k);
    if (q) p[k] = coerce(q, v);
  }
  return p;
}
/** Params -> "a:1,b:x", only the values that differ from the defaults. */
export function paramString(p, ent) {
  const d = defaults(ent), out = [];
  for (const q of ent.params || []) if (p[q.id] !== undefined && String(p[q.id]) !== String(d[q.id])) out.push(q.id + ':' + encodeURIComponent(q.type === 'toggle' ? (p[q.id] ? 1 : 0) : p[q.id]));
  return out.join(',');
}

/** Module deep-link parameters (validated against a loaded module when given). */
export function parseModuleParams(search, def) {
  const q = new URLSearchParams(search), out = {};
  const m = q.get('module'); if (!m || !SLUG.test(m)) return out;
  out.module = m;
  if (def && def.slug !== m) return out;
  const e = q.get('e');
  if (e && EID.test(e) && (!def || def.entities.some(x => x.id === e))) out.entity = e;
  const ent = def && out.entity ? def.entities.find(x => x.id === out.entity) : null;
  if (ent) {
    if (q.get('p')) out.params = parseParamString(q.get('p'), ent);
    const t = q.get('t'); if (t && (ent.techniques || []).some(x => x.id === t)) out.technique = t;
    const cmp = q.get('cmp'); if (cmp && (ent.compare || []).includes(cmp)) out.compare = cmp;
    if (q.get('tx') === '1' && ent.treatment) out.treated = true;
  }
  const ph = q.get('ph'); if (ph && PHASES.includes(ph)) out.phase = ph;
  if (q.get('exam') === '1') out.exam = true;
  return out;
}
export function buildModuleParams(st) {
  const q = new URLSearchParams();
  if (!st.module) return '';
  q.set('module', st.module);
  if (st.entity) q.set('e', st.entity);
  if (st.params) q.set('p', st.params);
  if (st.technique) q.set('t', st.technique);
  if (st.compare) q.set('cmp', st.compare);
  if (st.treated) q.set('tx', '1');
  if (st.phase && st.phase !== 'portal') q.set('ph', st.phase);
  if (st.exam) q.set('exam', '1');
  return q.toString();
}

/**
 * Check a module definition against the atlas. Returns a list of problems (empty = valid).
 * Every entity must be bilingual, tagged, placed on existing structures and have valid params/techniques.
 */
export function validateModule(def, atlas) {
  const errs = [], keys = new Set(atlas.structures.map(s => s.key));
  const e = (m) => errs.push(m);
  if (!SLUG.test(def.slug || '')) e('bad slug');
  if (!isBi(def.title)) e('title not bilingual');
  const groups = new Set((def.groups || []).map(g => g.id));
  for (const g of def.groups || []) if (!isBi(g)) e('group ' + g.id + ' not bilingual');
  const ids = new Set();
  for (const ent of def.entities || []) {
    const w = m => e(ent.id + ': ' + m);
    if (!EID.test(ent.id || '')) w('bad id');
    if (ids.has(ent.id)) w('duplicate id'); ids.add(ent.id);
    if (!isBi(ent.name)) w('name not bilingual');
    if (!groups.has(ent.group)) w('unknown group ' + ent.group);
    if (!TAGS[ent.tag]) w('unknown tag ' + ent.tag);
    if (ent.view) {
      if (ent.view.focus && !keys.has(ent.view.focus)) w('focus ' + ent.view.focus + ' not in atlas');
      if (ent.view.plane && !['axial', 'coronal', 'sagittal'].includes(ent.view.plane)) w('bad plane');
    }
    for (const sec of ['where', 'see', 'technique', 'differential', 'tip']) if (ent.info && ent.info[sec] && !isBi(ent.info[sec])) w('info.' + sec + ' not bilingual');
    if (!ent.info || !isBi(ent.info.see)) w('info.see missing');
    for (const f of ent.flags || []) { if (!FLAG_KINDS.includes(f.kind)) w('bad flag kind ' + f.kind); if (!isBi(f)) w('flag not bilingual'); }
    for (const q of ent.params || []) {
      if (!q.id || !isBi(q.label)) w('param ' + q.id + ' needs id + bilingual label');
      if (q.type === 'range' && !(q.min < q.max && q.step > 0 && q.value >= q.min && q.value <= q.max)) w('param ' + q.id + ' bad range');
      if (q.type === 'select' && !(q.options && q.options.length && q.options.every(o => o.v !== undefined && isBi(o)))) w('param ' + q.id + ' bad options');
      if (!['range', 'select', 'toggle'].includes(q.type)) w('param ' + q.id + ' bad type');
    }
    for (const t of ent.techniques || []) {
      if (!t.id || !isBi(t.label) || !isBi(t.note)) w('technique needs id, label, note');
      if (!VERDICTS.includes(t.verdict)) w('technique ' + t.id + ' bad verdict');
      if (!MODALITIES.includes(t.mod)) w('technique ' + t.id + ' bad modality');
    }
    if (ent.treatment && (!isBi(ent.treatment.label) || !isBi(ent.treatment.note))) w('treatment not bilingual');
    if (ent.phases && !ent.phases.every(p => PHASES.includes(p))) w('bad phases');
    for (const k of Object.keys(ent.phaseLabels || {})) if (!PHASES.includes(k) || !isBi(ent.phaseLabels[k])) w('bad phaseLabels.' + k);
    for (const c of ent.compare || []) if (!(def.entities || []).some(x => x.id === c)) w('compare ' + c + ' unknown');
    if (ent.tag !== 'esquema' && typeof ent.build !== 'function') w('build() missing');
    if (ent.tag === 'esquema' && !ent.diagram && typeof ent.build !== 'function') w('esquema needs diagram or build');
  }
  for (const q of def.questions || []) {
    if (!isBi(q.prompt)) e('question not bilingual');
    if (q.type === 'mcq' && !(q.options && q.options.length >= 2 && q.options.every(isBi) && q.answer >= 0 && q.answer < q.options.length && isBi(q.explain))) e('bad mcq: ' + q.prompt.es);
  }
  return errs;
}

/** Small seeded PRNG (mulberry32) so exam sessions are reproducible in tests. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Random but valid params for an entity (exam variety): each range/select drawn uniformly, toggles kept. */
export function randomParams(ent, r) {
  const p = defaults(ent);
  for (const q of ent.params || []) {
    if (q.exam === false) continue;
    if (q.type === 'range') { const n = Math.round((q.max - q.min) / q.step); const lo = q.examMin !== undefined ? q.examMin : q.min; p[q.id] = coerce(q, lo + Math.floor(r() * (n + 1)) * q.step); if (p[q.id] < lo) p[q.id] = coerce(q, lo); }
    else if (q.type === 'select') p[q.id] = pick(r, q.examOptions ? q.options.filter(o => q.examOptions.includes(o.v)) : q.options).v;
  }
  return p;
}

/**
 * Generate one exam question. Kinds:
 *  identify — a lesion is shown with labels off; choose its name among 4.
 *  find     — the entity is named; click the lesion on the image.
 *  level    — which vertebral level is the lesion at (only entities with examLevel).
 *  mcq      — a written question from the module (based on the tema's self-test).
 * Returns { kind, entity?, params?, prompt, options?, answer?, explain? }.
 */
export function makeQuestion(def, r, kind) {
  const drawable = def.entities.filter(e => e.exam !== false && e.tag !== 'esquema' && typeof e.build === 'function');
  const kinds = ['identify', 'find', 'mcq'].concat(drawable.some(e => e.examLevel) ? ['level'] : []);
  kind = kind || pick(r, kinds);
  if (kind === 'mcq' && (def.questions || []).length) {
    const q = pick(r, def.questions);
    const order = shuffle(r, q.options.map((_, i) => i));
    return { kind, prompt: q.prompt, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer), explain: q.explain, entity: q.show || null, params: null };
  }
  if (kind === 'level') {
    const ent = pick(r, drawable.filter(e => e.examLevel));
    return { kind, entity: ent.id, params: randomParams(ent, r), prompt: { es: '¿A qué nivel vertebral está la lesión?', en: 'At which vertebral level is the lesion?' } };
  }
  const ent = pick(r, drawable), params = randomParams(ent, r);
  if (kind === 'find') return { kind, entity: ent.id, params, prompt: { es: 'Señala con un clic: ' + ent.name.es, en: 'Click on: ' + ent.name.en } };
  // identify: distractors prefer the entity's look-alikes, then same group
  const pool = [...new Set([...(ent.compare || []), ...drawable.filter(e => e.group === ent.group).map(e => e.id), ...drawable.map(e => e.id)])].filter(id => id !== ent.id);
  const opts = shuffle(r, [ent.id, ...pool.slice(0, 3)]);
  return { kind: 'identify', entity: ent.id, params, prompt: { es: '¿Qué lesión es?', en: 'Which lesion is this?' },
    options: opts.map(id => def.entities.find(e => e.id === id).name), answer: opts.indexOf(ent.id) };
}

/** Options for a "level" question: the right level and its neighbours, in craniocaudal order. */
export function levelOptions(level, allLevels) {
  const i = allLevels.indexOf(level);
  if (i < 0) return { options: [level], answer: 0 };
  const lo = Math.max(0, Math.min(i - 1, allLevels.length - 4)), opts = allLevels.slice(lo, lo + 4);
  return { options: opts, answer: opts.indexOf(level) };
}
