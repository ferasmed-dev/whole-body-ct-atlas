// Pathology modules: every registered module validates against the atlas, every entity builds a lesion at
// its site, deep links round-trip, exam questions are well formed, and the interface strings are complete.
// Uses the label map and the CT (some lesions depend on tissue density, e.g. lung septa only where there is lung).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Anatomy, buildPatch, patchVoxels, lesionCentre, MODALITIES } from '../src/pathology.js';
import { unshuffleInt16 } from '../src/core.js';
import { REGISTRY, TAGS, validateModule, defaults, coerce, parseParamString, paramString, parseModuleParams, buildModuleParams,
  randomParams, rng, makeQuestion, levelOptions } from '../src/modules.js';
import { STRINGS } from '../src/i18n.js';

const atlas = JSON.parse(readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const lab = gunzipSync(readFileSync(new URL('../data/labels.bin', import.meta.url)));
const vol = unshuffleInt16(gunzipSync(readFileSync(new URL('../data/ct.bin', import.meta.url))), lab.length);
const A = new Anatomy(atlas, lab, atlas.dims, atlas.spacing);
const defs = {};
for (const r of REGISTRY) defs[r.slug] = (await import(new URL('../src/' + r.path, import.meta.url))).default;

test('registry: every module loads, matches its slug and validates against the atlas', () => {
  assert.ok(REGISTRY.length >= 1);
  for (const r of REGISTRY) {
    const d = defs[r.slug];
    assert.equal(d.slug, r.slug);
    assert.deepEqual(validateModule(d, atlas), [], r.slug);
    assert.ok(d.entities.length >= 5, r.slug + ' covers the topic');
    assert.ok(d.questions.length >= 5, r.slug + ' has written exam questions');
  }
});

test('no course-material references in module text (topic-framed app)', () => {
  for (const r of REGISTRY) {
    const txt = readFileSync(new URL('../src/' + r.path, import.meta.url), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/apuntes/i.test(txt.replace(/kind: 'apuntes'/g, '')), r.slug + ': "apuntes"');
    assert.ok(!/@SobreValiente|\bTema \d/i.test(txt), r.slug + ': author or "Tema N"');
    assert.ok(!/\bnotes\b/i.test(txt), r.slug + ': "notes"');
  }
});

for (const r of REGISTRY) {
  test(`${r.slug}: every entity builds at its site, with defaults and random parameters`, () => {
    const d = defs[r.slug], R = rng(1234);
    for (const ent of d.entities) {
      if (typeof ent.build !== 'function') continue;
      const sets = [defaults(ent), randomParams(ent, R), randomParams(ent, R)];
      for (const p of sets) for (const env of [{ phase: 'portal', treated: false, modality: 'ct' }, { phase: 'sin', treated: true, modality: 't2' }]) {
        const prims = ent.build(p, A, env);
        assert.ok(Array.isArray(prims), `${ent.id} builds primitives`);
        const P = buildPatch(prims, A, { vol, lab }, { phase: env.phase });
        if (ent.tag !== 'esquema') assert.ok(P && P.box, `${ent.id} produces a patch`);
        if (!P || !P.box) continue;
        const les = patchVoxels(P);
        if (ent.exam !== false) assert.ok(les.length > 0, `${ent.id} ${JSON.stringify(p)} has lesion voxels for exam questions`);
        // lesion sits near where the entity's view looks
        if (ent.view && ent.view.at && les.length) {
          const c = lesionCentre(P), at = ent.view.at(p, A);
          const dmm = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]) * atlas.spacing[0];
          assert.ok(dmm < 80, `${ent.id} lesion ${dmm.toFixed(0)} mm from the view centre`);
        }
        if (ent.readouts) assert.ok(Array.isArray(ent.readouts(p, A, env, P)));
        for (const t of ent.techniques || []) assert.ok(MODALITIES.includes(t.mod));
      }
      if (ent.examLevel) assert.ok(atlas.levels.includes(ent.examLevel(defaults(ent))), ent.id + ' exam level exists');
    }
  });
}

test('spine module: the fracture rule "0-0-25-50" and key numbers are shown', () => {
  const d = defs.columna, e = id => d.entities.find(x => x.id === id);
  const ro = id => JSON.stringify(e(id).readouts(defaults(e(id)), A, { phase: 'portal' }, null));
  assert.match(ro('compresion'), /"No"/); assert.match(ro('ahorcado'), /25 %/); assert.match(ro('estallido'), /50 %/);
  assert.match(e('jefferson').info.technique.es, /No suele asociar lesión medular|no/i);
  const comp = ro('compresion'); const diff = +JSON.parse(comp)[1].value.split(' ')[0];
  assert.ok(diff > 1.5 && diff < 5, `default wedge ≈ 3 mm ant.–post. difference (${diff})`);
  assert.match(e('quiste-sinovial').info.where.es, /60–70 %/);
  assert.ok(e('espondilodiscitis').techniques.find(t => t.mod === 'rx').verdict === 'bad', 'film is late for discitis');
  assert.ok(e('compresion').techniques.find(t => t.mod === 'stir').verdict === 'best', 'STIR dates the fracture');
});

test('parameters: coerce, string round trip, deep links', () => {
  const ent = defs.columna.entities.find(e => e.id === 'compresion');
  const q = ent.params.find(p => p.id === 'loss');
  assert.equal(coerce(q, 999), q.max); assert.equal(coerce(q, -5), q.min); assert.equal(coerce(q, 22), 20); assert.equal(coerce(q, 'x'), q.value);
  const lv = ent.params.find(p => p.id === 'level');
  assert.equal(coerce(lv, 'L3'), 'L3'); assert.equal(coerce(lv, 'Z9'), 'L1');
  const p = { ...defaults(ent), loss: 40, level: 'T12', osteo: false };
  const s = paramString(p, ent);
  assert.deepEqual(parseParamString(s, ent), p);
  assert.equal(paramString(defaults(ent), ent), '', 'defaults are not written');
  const link = buildModuleParams({ module: 'columna', entity: 'compresion', params: s, technique: 'stir', treated: true, phase: 'sin' });
  const back = parseModuleParams('?' + link, defs.columna);
  assert.deepEqual(back, { module: 'columna', entity: 'compresion', params: p, technique: 'stir', treated: true, phase: 'sin' });
  assert.deepEqual(parseModuleParams('?module=../x&e=<script>', defs.columna), {});
  assert.deepEqual(parseModuleParams('?module=columna&e=nope&t=zz', defs.columna), { module: 'columna' });
  assert.equal(buildModuleParams({}), '');
});

test('exam questions are well formed and reproducible', () => {
  for (const r of REGISTRY) {
    const d = defs[r.slug], kinds = new Set();
    for (let seed = 1; seed < 60; seed++) {
      const q1 = makeQuestion(d, rng(seed)), q2 = makeQuestion(d, rng(seed));
      assert.deepEqual(JSON.stringify(q1), JSON.stringify(q2), 'same seed, same question');
      kinds.add(q1.kind);
      assert.ok(q1.prompt.es && q1.prompt.en);
      if (q1.options) { assert.ok(q1.options.length >= 2); assert.ok(q1.answer >= 0 && q1.answer < q1.options.length); }
      if (q1.entity) assert.ok(d.entities.some(e => e.id === q1.entity));
      if (q1.kind === 'identify') assert.equal(new Set(q1.options.map(o => o.es)).size, q1.options.length, 'distinct options');
    }
    for (const k of ['identify', 'find', 'mcq']) assert.ok(kinds.has(k), r.slug + ' asks ' + k);
  }
  assert.deepEqual(levelOptions('L1', ['T11', 'T12', 'L1', 'L2', 'L3']), { options: ['T12', 'L1', 'L2', 'L3'], answer: 1 });
  assert.deepEqual(levelOptions('C1', ['C1', 'C2', 'C3', 'C4', 'C5']).answer, 0);
});

test('interface strings: Spanish and English have the same keys; every tag is bilingual', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(STRINGS.es).sort(), keys(STRINGS.en).sort());
  for (const t of Object.values(TAGS)) assert.ok(t.es && t.en && t.hint.es && t.hint.en);
  assert.match(STRINGS.es.disclaimer, /Herramienta docente · no apta para uso clínico/);
});
