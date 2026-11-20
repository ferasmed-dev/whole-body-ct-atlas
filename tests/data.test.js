// Integrity and anatomical sanity checks on the shipped study (data/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { unshuffleInt16, index3 } from '../src/core.js';

const dir = new URL('../data/', import.meta.url);
const atlas = JSON.parse(readFileSync(new URL('atlas.json', dir), 'utf8'));
const [Z, Y, X] = atlas.dims, N = Z * Y * X;
const lab = gunzipSync(readFileSync(new URL('labels.bin', dir)));
const vol = unshuffleInt16(gunzipSync(readFileSync(new URL('ct.bin', dir))), N);
const by = Object.fromEntries(atlas.structures.map(s => [s.key, s]));
const kl = Object.fromEntries(atlas.keylevels.map(k => [k.id, k]));

test('sizes match the declared dimensions', () => {
  assert.equal(lab.length, N);
  assert.equal(vol.length, N);
  assert.equal(atlas.levels.length, Z);
  assert.deepEqual(atlas.spacing, [1.5, 1.5, 1.5]);
});

test('every structure is complete and bilingual', () => {
  const sys = new Set(atlas.systems.map(s => s.id));
  const ids = new Set();
  for (const s of atlas.structures) {
    for (const f of ['key', 'es', 'en', 'short', 'short_en', 'system', 'color']) assert.ok(s[f], `${s.key}.${f}`);
    assert.match(s.color, /^#[0-9a-f]{6}$/);
    assert.ok(sys.has(s.system), s.key + ' system');
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    assert.ok(s.id >= 1 && s.id <= 255);
    const [z0, z1, y0, y1, x0, x1] = s.bbox;
    assert.ok(z0 <= s.center[0] && s.center[0] <= z1 && y0 <= s.center[1] && s.center[1] <= y1 && x0 <= s.center[2] && s.center[2] <= x1);
  }
  assert.ok(atlas.structures.length >= 100);
});

test('voxel counts in atlas.json match the label map', () => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) hist[lab[i]]++;
  for (const s of atlas.structures) assert.equal(hist[s.id], s.voxels, s.key);
  const known = new Set(atlas.structures.map(s => s.id));
  for (let l = 1; l < 256; l++) if (hist[l]) assert.ok(known.has(l), 'unlisted label ' + l);
});

test('HU values are physiological', () => {
  const mean = key => { const s = by[key]; let t = 0, n = 0; for (let i = 0; i < N; i++) if (lab[i] === s.id) { t += vol[i]; n++; } return t / n; };
  const lung = mean('lung_upper_lobe_right'), liver = mean('liver'), aorta = mean('aorta'), femur = mean('femur_left'), bladder = mean('urinary_bladder');
  assert.ok(lung < -600, `lung ${lung}`);
  assert.ok(liver > 60 && liver < 160, `liver (portal phase) ${liver}`);
  assert.ok(aorta > 120, `aorta enhanced ${aorta}`);
  assert.ok(femur > 250, `bone ${femur}`);
  assert.ok(bladder > -10 && bladder < 40, `urine ${bladder}`);
  assert.equal(vol[index3(atlas.dims, 0, 0, 0)], -1000, 'outside the body is air');
});

test('radiological orientation: patient right on screen left, anterior on top, head first', () => {
  assert.ok(by.liver.center[2] < by.spleen.center[2], 'liver (right) left of spleen');
  assert.ok(by.kidney_right.center[2] < by.kidney_left.center[2]);
  assert.ok(by.femur_right.center[2] < by.femur_left.center[2]);
  assert.ok(by.sternum.center[1] < by.spinal_cord.center[1], 'sternum anterior to the cord');
  assert.ok(by.brain.center[0] < by.heart.center[0] && by.heart.center[0] < by.urinary_bladder.center[0], 'craniocaudal order');
});

test('vertebral levels run in order C1 → S1', () => {
  const order = [...Array(7)].map((_, i) => 'C' + (i + 1)).concat([...Array(12)].map((_, i) => 'T' + (i + 1)), [...Array(5)].map((_, i) => 'L' + (i + 1)), ['S1']);
  const firstZ = order.map(v => atlas.levels.indexOf(v));
  assert.ok(firstZ.every(z => z >= 0), 'every vertebra present');
  for (let i = 1; i < firstZ.length; i++) assert.ok(firstZ[i] > firstZ[i - 1], order[i]);
});

test('key levels fall at textbook vertebral levels', () => {
  const lv = id => (kl[id].level || '').split('–')[0];
  const rank = v => { const m = /^([CTLS])(\d+)$/.exec(v); return m ? { C: 0, T: 7, L: 19, S: 24 }[m[1]] + (+m[2]) : NaN; };
  const near = (id, target, tol) => assert.ok(Math.abs(rank(lv(id)) - rank(target)) <= tol, `${id} at ${lv(id)} (expected ~${target})`);
  near('carina', 'T5', 1);              // T4–T5
  near('aortic-arch', 'T4', 1);
  near('gej', 'T11', 1);
  near('renal-hila', 'L1', 1);
  near('aortic-bifurcation', 'L4', 1);
  near('sacral-promontory', 'S1', 1);
  const z = id => kl[id].z;
  assert.ok(z('aortic-arch') < z('carina') && z('carina') < z('gej') && z('gej') < z('renal-hila') && z('renal-hila') < z('aortic-bifurcation'));
  for (const k of atlas.keylevels) { assert.ok(k.name && k.name_en && k.id); assert.ok(k.z >= 0 && k.z < Z); if (k.focus) assert.ok(by[k.focus], k.focus); }
});
