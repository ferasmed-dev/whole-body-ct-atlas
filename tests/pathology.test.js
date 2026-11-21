// Pathology engine: primitives, patches, phases, pseudo-MR, simulated film and anatomy helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { index3, planeInfo, extractSlice } from '../src/core.js';
import { LESION_ID, makeNoise, phaseValue, phaseShift, phaseFamily, labelMeans, mrSignal, mrClass, mu, filmGrey,
  projectVolume, projectPatch, Anatomy, buildPatch, applyPatch, distanceOutside, patchVoxels, lesionCentre } from '../src/pathology.js';

/* tiny synthetic study: a 20×20×20 box of soft tissue with a "bone" cube (label 1) in the middle */
function tiny() {
  const dims = [20, 20, 20], N = 8000, vol = new Int16Array(N).fill(40), lab = new Uint8Array(N);
  for (let z = 7; z < 13; z++) for (let y = 7; y < 13; y++) for (let x = 7; x < 13; x++) { const i = index3(dims, z, y, x); vol[i] = 300; lab[i] = 1; }
  const atlas = { dims, structures: [{ id: 1, key: 'bone_cube', bbox: [7, 12, 7, 12, 7, 12], center: [10, 10, 10] }], levels: Array(20).fill(null) };
  return { dims, vol, lab, atlas, A: new Anatomy(atlas, lab, dims, [1.5, 1.5, 1.5]) };
}

test('noise is deterministic and bounded', () => {
  const n1 = makeNoise(3), n2 = makeNoise(3), n3 = makeNoise(4);
  let diff = 0;
  for (let i = 0; i < 200; i++) {
    const p = [i * 0.37, i * 0.11, i * 0.73], a = n1(...p);
    assert.ok(a >= -1 && a <= 1); assert.equal(a, n2(...p)); diff += Math.abs(a - n3(...p));
  }
  assert.ok(diff > 1, 'different seeds differ');
});

test('phase values and per-structure phase shifts', () => {
  assert.equal(phaseValue(55, 'arterial'), 55);
  assert.equal(phaseValue({ sin: 30, portal: 90 }, 'sin'), 30);
  assert.equal(phaseValue({ sin: 30, portal: 90 }, 'tardia'), 90, 'falls back to portal');
  assert.equal(phaseFamily('aorta'), 'artery'); assert.equal(phaseFamily('portal_vein_and_splenic_vein'), 'portal'); assert.equal(phaseFamily('vertebrae_L1'), null);
  const structs = [{ id: 3, key: 'aorta' }, { id: 43, key: 'liver' }, { id: 98, key: 'vertebrae_L1' }];
  const means = new Float64Array(256).fill(NaN); means[3] = 235; means[43] = 101; means[98] = 250;
  assert.ok(phaseShift(structs, means, 'portal').every(v => v === 0), 'portal = as acquired');
  const sin = phaseShift(structs, means, 'sin');
  assert.equal(means[3] + sin[3], 40, 'unenhanced blood ≈ 40 HU'); assert.equal(sin[98], 0, 'bone unchanged');
  const art = phaseShift(structs, means, 'arterial');
  assert.ok(means[3] + art[3] > 300, 'arterial aorta is bright');
  const t = tiny(), m = labelMeans(t.vol, t.lab);
  assert.equal(m[1], 300); assert.ok(Number.isNaN(m[2]));
});

test('pseudo-MR contrasts: fat, fluid, marrow, oedema-free continuity', () => {
  assert.ok(mrSignal('t1', -100, 'none') > 0.8 && mrSignal('stir', -100, 'none') < 0.1, 'fat: bright T1, dark STIR');
  assert.ok(mrSignal('t2', 10, 'fluid') > 0.9 && mrSignal('t1', 10, 'fluid') < 0.2, 'fluid: bright T2, dark T1');
  assert.ok(mrSignal('t1', 250, 'bone') > 0.6 && mrSignal('stir', 250, 'bone') < 0.2, 'fatty marrow');
  assert.ok(mrSignal('t2', 120, 'vessel') < 0.2, 'flow void');
  for (const seq of ['t1', 't2', 'stir']) for (let hu = -200; hu < 900; hu++) {
    assert.ok(Math.abs(mrSignal(seq, hu + 1, 'none') - mrSignal(seq, hu, 'none')) < 0.02, `no jump at ${hu} (${seq})`);
    assert.ok(Math.abs(mrSignal(seq, hu + 1, 'bone') - mrSignal(seq, hu, 'bone')) < 0.02, `no bone jump at ${hu} (${seq})`);
  }
  assert.equal(mrClass('urinary_bladder'), 'fluid'); assert.equal(mrClass('vertebrae_T4'), 'bone'); assert.equal(mrClass('aorta'), 'vessel');
});

test('simulated film: attenuation and grey levels are monotonic', () => {
  for (let hu = -1000; hu < 2000; hu += 10) assert.ok(mu(hu + 10) >= mu(hu));
  assert.equal(mu(-1000), 0);
  assert.ok(mu(1000) > 2 * mu(0), 'bone weighted up');
  for (let s = 0; s < 12; s += 0.1) assert.ok(filmGrey(s + 0.1) >= filmGrey(s));
  assert.equal(filmGrey(0), 0); assert.equal(filmGrey(20), 255);
});

test('projection of a patched volume equals base projection plus the patch', () => {
  const t = tiny();
  const P = buildPatch([{ t: 'blob', c: [10, 10, 10], r: 3, hu: 2000 }], t.A, t, { grain: 0 });
  const patched = Int16Array.from(t.vol);
  const [z0, , y0, , x0] = P.box, [nz, ny, nx] = P.n;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = (k * ny + j) * nx + i; if (P.set[p]) patched[index3(t.dims, z0 + k, y0 + j, x0 + i)] = P.hu[p]; }
  for (const plane of ['coronal', 'sagittal']) {
    const a = projectPatch(projectVolume(t.vol, t.dims, [1.5, 1.5, 1.5], plane), t.vol, t.dims, [1.5, 1.5, 1.5], plane, P);
    const b = projectVolume(patched, t.dims, [1.5, 1.5, 1.5], plane);
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-3, plane + ' ' + i);
  }
  assert.throws(() => projectVolume(t.vol, t.dims, [1.5, 1.5, 1.5], 'axial'));
});

test('blob: radius, label, within/outside, rim and core', () => {
  const t = tiny();
  const P = buildPatch([{ t: 'blob', c: [10, 10, 10], r: 4.5, hu: 900, rim: { w: 1.5, hu: 100 }, core: { f: 0.3, hu: -5 } }], t.A, t, { grain: 0 });
  const v = patchVoxels(P);
  assert.ok(v.length > 60 && v.length < 200, 'about a 3-voxel-radius sphere: ' + v.length);
  assert.deepEqual(lesionCentre(P), [10, 10, 10]);
  const at = (z, y, x) => P.hu[((z - P.box[0]) * P.n[1] + y - P.box[2]) * P.n[2] + x - P.box[4]];
  assert.equal(at(10, 10, 10), -5, 'core'); assert.equal(at(10, 10, 13), 100, 'rim'); assert.equal(at(10, 10, 12), 900, 'body');
  const inside = buildPatch([{ t: 'blob', c: [10, 10, 13], r: 6, hu: 500, within: ['bone_cube'] }], t.A, t, { grain: 0 });
  for (const [z, y, x] of patchVoxels(inside)) assert.equal(t.lab[index3(t.dims, z, y, x)], 1, 'within keeps it in the structure');
  const outside = buildPatch([{ t: 'blob', c: [10, 10, 13], r: 6, hu: 500, outside: ['bone_cube'] }], t.A, t, { grain: 0 });
  for (const [z, y, x] of patchVoxels(outside)) assert.equal(t.lab[index3(t.dims, z, y, x)], 0, 'outside avoids the structure');
});

test('fill, shell, layer, plane, tube and cols primitives', () => {
  const t = tiny();
  const F = buildPatch([{ t: 'fill', s: 'bone_cube', delta: -100 }], t.A, t, { grain: 0 });
  assert.equal(F.set.reduce((a, b) => a + b, 0), 216); assert.ok([...F.hu].filter((_, i) => F.set[i]).every(h => h === 200)); assert.equal(patchVoxels(F).length, 0, 'fill keeps labels');
  const S = buildPatch([{ t: 'shell', s: 'bone_cube', d0: 0, d1: 3.2, hu: 10 }], t.A, t, { grain: 0 });
  for (const [z, y, x] of patchVoxels(S)) { assert.equal(t.lab[index3(t.dims, z, y, x)], 0); const d = Math.max(7 - z, z - 12, 7 - y, y - 12, 7 - x, x - 12, 0); assert.ok(d >= 1 && d <= 3, 'band 1–2 voxels out'); }
  const L = buildPatch([{ t: 'layer', s: 'bone_cube', depth: 3, hu: 20 }], t.A, t, { grain: 0 });
  for (const [, y] of patchVoxels(L)) assert.ok(y >= 11, 'dependent (posterior) layer');
  const Pl = buildPatch([{ t: 'plane', s: 'bone_cube', p: [10, 10, 10], n: [0, 0, 1], w: 1.5, hu: 60 }], t.A, t, { grain: 0 });
  for (const [, , x] of patchVoxels(Pl)) assert.equal(x, 10, 'one-voxel slab');
  const Tu = buildPatch([{ t: 'tube', pts: [[2, 2, 2], [2, 2, 17]], r: 1.5, hu: 3000 }], t.A, t, { grain: 0 });
  const tv = patchVoxels(Tu); assert.ok(tv.length >= 16 && tv.every(([z, y]) => Math.abs(z - 2) <= 1 && Math.abs(y - 2) <= 1));
  const C = buildPatch([{ t: 'cols', box: [0, 1, 0, 1, 0, 1], fn: (z, y, x) => (x === 0 ? { hu: 7 } : null) }], t.A, t, { grain: 0 });
  assert.equal(patchVoxels(C).length, 4);
});

test('rind, dilate and anterior layer', () => {
  const t = tiny();
  const R = buildPatch([{ t: 'rind', s: 'bone_cube', d0: 0, d1: 1.5, hu: 999, label: 'lesion' }], t.A, t, { grain: 0 });
  const rv = patchVoxels(R); assert.equal(rv.length, 216 - 64, 'outer shell of the 6×6×6 cube (inner 4×4×4 untouched)');
  const D = buildPatch([{ t: 'dilate', s: 'bone_cube', scale: 1.5 }], t.A, t, { grain: 0 });
  let n = 0; for (let p = 0; p < D.lab.length; p++) if (D.lab[p] === 1) n++;
  assert.ok(n > 216 * 1.8, 'dilated in-plane by 1.5 (area × 2.25): ' + n);
  const Sh = buildPatch([{ t: 'dilate', s: 'bone_cube', scale: 0.5, fill: { hu: 0, label: 'lesion' } }], t.A, t, { grain: 0 });
  assert.ok(patchVoxels(Sh).length > 100, 'shrinkage leaves filled tissue');
  const La = buildPatch([{ t: 'layer', s: 'bone_cube', depth: 3, hu: -1000, from: 'anterior' }], t.A, t, { grain: 0 });
  for (const [, y] of patchVoxels(La)) assert.ok(y <= 8, 'non-dependent (anterior) layer');
  assert.deepEqual(t.A.centroidAt('bone_cube', 10), { y: 9.5, x: 9.5, n: 36 }); assert.equal(t.A.centroidAt('bone_cube', 0), null);
  assert.deepEqual(t.A.extreme('bone_cube', 'anterior').slice(1, 2), [7]); assert.equal(t.A.sliceVoxels('bone_cube', 8).length, 36);
});

test('warp moves a structure and fills what it leaves', () => {
  const t = tiny();
  const P = buildPatch([{ t: 'warp', s: 'bone_cube', box: [6, 13, 6, 13, 6, 14], fill: { hu: 0, label: 'lesion' }, map: (z, y, x) => [z, y, x - 1] }], t.A, t, { grain: 0 });
  const lab = (z, y, x) => P.lab[((z - P.box[0]) * P.n[1] + y - P.box[2]) * P.n[2] + x - P.box[4]];
  assert.equal(lab(10, 10, 13), 1, 'cube shifted one voxel in +x');
  assert.equal(lab(10, 10, 7), LESION_ID, 'vacated column filled');
});

test('applyPatch writes the same voxels in every plane', () => {
  const t = tiny();
  const P = buildPatch([{ t: 'blob', c: [9, 11, 8], r: [4, 3, 5], hu: 1234, mr: { t2: 0.5 } }], t.A, t, { grain: 0 });
  const cur = { z: 9, y: 11, x: 8 };
  for (const plane of ['axial', 'coronal', 'sagittal']) {
    const { w, h } = planeInfo(plane, t.dims, [1, 1, 1]), hu = new Int16Array(w * h), lb = new Uint8Array(w * h), mr = new Uint8Array(w * h).fill(255);
    extractSlice(plane, t.vol, t.lab, t.dims, cur, hu, lb);
    const n = applyPatch(plane, cur, P, hu, lb, t.dims, 't2', mr);
    assert.ok(n > 0, plane);
    assert.equal(hu.filter(v => v === 1234).length, n, plane + ' count');
    assert.equal(lb.filter(v => v === LESION_ID).length, n);
    assert.equal(mr.filter(v => v === 127).length, n, plane + ' MR override');
  }
  assert.equal(applyPatch('axial', { z: 0, y: 0, x: 0 }, P, new Int16Array(400), new Uint8Array(400), t.dims), 0, 'slice outside the box');
  assert.equal(applyPatch('axial', cur, null, new Int16Array(400), new Uint8Array(400), t.dims), 0);
});

test('chamfer distance outside a structure', () => {
  const t = tiny();
  const P = buildPatch([{ t: 'fill', s: 'bone_cube', delta: 0, region: undefined }, { t: 'blob', c: [10, 10, 2], r: 1.5, hu: 1 }], t.A, t, { grain: 0 });
  const d = distanceOutside(P, new Set([1]));
  const at = (z, y, x) => d[((z - P.box[0]) * P.n[1] + y - P.box[2]) * P.n[2] + x - P.box[4]];
  assert.equal(at(10, 10, 10), 0); assert.equal(at(10, 10, 6), 1); assert.equal(at(10, 10, 4), 3);
});

/* ---------- anatomy helpers on the real label map ---------- */
const atlas = JSON.parse(readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const labels = gunzipSync(readFileSync(new URL('../data/labels.bin', import.meta.url)));
const A = new Anatomy(atlas, labels, atlas.dims, atlas.spacing);

test('vertebral bodies lie in front of the canal, in craniocaudal order', () => {
  let prevZ = -1;
  for (const k of ['vertebrae_C2', 'vertebrae_C5', 'vertebrae_T6', 'vertebrae_T12', 'vertebrae_L1', 'vertebrae_L3', 'vertebrae_L5']) {
    const v = A.vertebra(k), c = A.cordAt(v.body.c[0]);
    assert.ok(c, k + ' has canal'); assert.ok(v.body.c[1] < c.y0, k + ' body anterior to the cord');
    assert.ok(v.body.c[0] > prevZ, k + ' order'); prevZ = v.body.c[0];
    assert.ok(v.canal && v.canal.ap > 5 && v.canal.ap < 30, k + ' canal AP ' + (v.canal && v.canal.ap));
    assert.ok(v.ped.R && v.ped.L && v.ped.R[2] < v.ped.L[2], k + ' pedicles: patient right on screen left');
  }
  assert.deepEqual(A.vertebraKeys().slice(0, 2), ['vertebrae_C1', 'vertebrae_C2']);
  assert.equal(A.below('vertebrae_L4'), 'vertebrae_L5'); assert.equal(A.above('vertebrae_L1'), 'vertebrae_T12');
});

test('intervertebral discs are found between adjacent bodies (lordosis-proof)', () => {
  for (const [u, l] of [['C5', 'C6'], ['L1', 'L2'], ['L3', 'L4'], ['L4', 'L5'], ['L5', 'S1']]) {
    const d = A.disc('vertebrae_' + u, 'vertebrae_' + l);
    assert.ok(d, u + '-' + l);
    const hmm = d.h * atlas.spacing[0];
    assert.ok(hmm >= 3 && hmm <= 15, `${u}-${l} height ${hmm.toFixed(1)} mm`);
    assert.ok(d.c[0] > d.upper.body.c[0] && d.c[0] < d.lower.body.c[0], u + '-' + l + ' between the bodies');
  }
});
