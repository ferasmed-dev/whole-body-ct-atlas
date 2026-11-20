import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOWS, unshuffleInt16, base64ToBytes, isGzip, buildLUT, planeInfo, sliceOf, withSlice, voxelAt, pixelOf, index3,
  extractSlice, sliceLabels, layoutColumn, levelRange, normalize, searchStructures, nearestVoxel, parseParams, buildParams } from '../src/core.js';

test('unshuffleInt16 restores signed values from split byte planes', () => {
  const vals = [-1024, -1, 0, 1, 40, 3071, -32768, 32767];
  const n = vals.length, b = new Uint8Array(2 * n);
  vals.forEach((v, i) => { const u = v & 0xffff; b[i] = u & 0xff; b[n + i] = u >> 8; });
  assert.deepEqual([...unshuffleInt16(b, n)], vals);
  assert.throws(() => unshuffleInt16(new Uint8Array(3), 2));
});

test('base64ToBytes and gzip magic detection', () => {
  assert.deepEqual([...base64ToBytes('AAEC/w==')], [0, 1, 2, 255]);
  assert.equal(isGzip(new Uint8Array([0x1f, 0x8b, 8])), true);
  assert.equal(isGzip(new Uint8Array([0x3c, 0x21, 0])), false);
});

test('window presets are the standard radiology values', () => {
  assert.deepEqual(WINDOWS.soft, { c: 40, w: 400 });
  assert.deepEqual(WINDOWS.lung, { c: -600, w: 1500 });
  assert.deepEqual(WINDOWS.bone, { c: 400, w: 1800 });
  assert.deepEqual(WINDOWS.brain, { c: 40, w: 80 });
});

test('buildLUT maps the window linearly and clamps outside it', () => {
  const lut = buildLUT(40, 400);
  const at = hu => lut[hu + 1024];
  assert.equal(at(-160), 0);          // lower edge
  assert.equal(at(240), 255);         // upper edge
  assert.ok(Math.abs(at(40) - 127.5) <= 0.5);   // centre
  assert.equal(at(-1000), 0); assert.equal(at(1500), 255);
  for (let i = 1; i < 4096; i++) assert.ok(lut[i] >= lut[i - 1], 'monotonic');
  const narrow = buildLUT(40, 80);    // brain window: grey matter vs white matter contrast
  assert.ok(narrow[40 + 1024] - narrow[25 + 1024] > 40);
});

test('planeInfo / slice helpers agree on the [z][y][x] layout', () => {
  const dims = [10, 6, 8], sp = [2, 1, 1.5];
  assert.deepEqual(planeInfo('axial', dims, sp), { w: 8, h: 6, pw: 1.5, ph: 1, n: 10 });
  assert.deepEqual(planeInfo('coronal', dims, sp), { w: 8, h: 10, pw: 1.5, ph: 2, n: 6 });
  assert.deepEqual(planeInfo('sagittal', dims, sp), { w: 6, h: 10, pw: 1, ph: 2, n: 8 });
  const cur = { z: 3, y: 2, x: 5 };
  assert.equal(sliceOf('axial', cur), 3); assert.equal(sliceOf('coronal', cur), 2); assert.equal(sliceOf('sagittal', cur), 5);
  assert.deepEqual(withSlice('axial', cur, 99, dims), { z: 9, y: 2, x: 5 });
  assert.deepEqual(withSlice('sagittal', cur, -4, dims), { z: 3, y: 2, x: 0 });
  for (const plane of ['axial', 'coronal', 'sagittal']) {
    const p = voxelAt(plane, 4, 1, cur), { u, v } = pixelOf(plane, p);
    assert.deepEqual([u, v], [4, 1], plane + ' round trip');
  }
});

test('extractSlice reads the right voxels in every plane', () => {
  const dims = [4, 3, 5], n = 60, vol = new Int16Array(n), lab = new Uint8Array(n);
  for (let z = 0; z < 4; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) { const i = index3(dims, z, y, x); vol[i] = z * 100 + y * 10 + x; lab[i] = (x + y + z) % 7; }
  const cur = { z: 2, y: 1, x: 3 };
  for (const plane of ['axial', 'coronal', 'sagittal']) {
    const { w, h } = planeInfo(plane, dims, [1, 1, 1]), hu = new Int16Array(w * h), lb = new Uint8Array(w * h);
    extractSlice(plane, vol, lab, dims, cur, hu, lb);
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      const p = voxelAt(plane, u, v, cur), i = index3(dims, p.z, p.y, p.x);
      assert.equal(hu[v * w + u], vol[i]); assert.equal(lb[v * w + u], lab[i]);
    }
  }
});

test('sliceLabels anchors curved structures on themselves', () => {
  // a "C" shape whose centroid lies in the hole
  const w = 9, h = 9, lb = new Uint8Array(w * h);
  for (let v = 1; v < 8; v++) for (let u = 1; u < 8; u++) if (u <= 2 || v <= 2 || v >= 6) lb[v * w + u] = 5;
  lb[0] = 9;                                    // a 1-pixel speck, below the threshold
  const c = sliceLabels(lb, w, h, 5);
  assert.equal(c.length, 1); assert.equal(c[0].l, 5);
  assert.equal(lb[c[0].av * w + c[0].au], 5, 'anchor pixel belongs to the structure');
});

test('layoutColumn keeps labels ordered, spaced and inside the column', () => {
  const items = [{ ay: 50 }, { ay: 52 }, { ay: 51 }, { ay: 300 }, { ay: 299 }];
  const out = layoutColumn(items, 20, 310, 14);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].y - out[i - 1].y >= 14 - 1e-9);
  assert.ok(out[0].y >= 20 && out.at(-1).y <= 310);
  const many = Array.from({ length: 40 }, (_, i) => ({ ay: i }));
  const o2 = layoutColumn(many, 10, 100, 12);
  assert.equal(o2[0].y, 10, 'overflow keeps the top edge');
  assert.ok(o2.every(o => Number.isFinite(o.y)));
});

test('levelRange summarises vertebral span', () => {
  const levels = [null, 'T11', 'T11–T12', 'T12', 'L1', 'L2', null];
  assert.equal(levelRange(levels, [1, 5, 0, 0, 0, 0]), 'T11 → L2');
  assert.equal(levelRange(levels, [3, 3, 0, 0, 0, 0]), 'T12');
  assert.equal(levelRange(levels, [2, 4, 0, 0, 0, 0]), 'T11 → L1');
  assert.equal(levelRange(levels, [0, 0, 0, 0, 0, 0]), '');
});

test('search is accent- and language-insensitive', () => {
  const structs = [
    { key: 'pancreas', es: 'Páncreas', en: 'Pancreas', short: 'Páncreas', short_en: 'Pancreas' },
    { key: 'kidney_left', es: 'Riñón izquierdo', en: 'Left kidney', short: 'Riñón izq.', short_en: 'L kidney' },
  ];
  assert.equal(normalize('Páncreas'), 'pancreas');
  assert.deepEqual(searchStructures(structs, 'pancreas').map(s => s.key), ['pancreas']);
  assert.deepEqual(searchStructures(structs, 'RIÑON').map(s => s.key), ['kidney_left']);
  assert.deepEqual(searchStructures(structs, 'kidney').map(s => s.key), ['kidney_left']);
  assert.equal(searchStructures(structs, '  ').length, 2);
});

test('nearestVoxel finds a voxel inside the structure', () => {
  const dims = [3, 5, 5], lab = new Uint8Array(75);
  lab[index3(dims, 1, 0, 4)] = 7; lab[index3(dims, 2, 4, 0)] = 7;
  const s = { id: 7, center: [1, 2, 2], bbox: [1, 2, 0, 4, 0, 4] };
  const p = nearestVoxel(lab, dims, s);
  assert.equal(lab[index3(dims, p.z, p.y, p.x)], 7);
  assert.deepEqual(p, { z: 1, y: 0, x: 4 });
});

test('deep links: parse validates, build round-trips', () => {
  const atlas = { dims: [531, 224, 275], keylevels: [{ id: 'carina' }], structures: [{ key: 'pancreas' }] };
  const p = parseParams('?view=coronal&level=carina&s=pancreas&w=lung&lang=en&labels=hover&iso=1', atlas);
  assert.deepEqual(p, { view: 'coronal', level: 'carina', structure: 'pancreas', window: 'lung', lang: 'en', labels: 'hover', iso: true });
  assert.deepEqual(parseParams('?view=x&level=nope&s=../etc&w=neon&lang=fr&z=99999', atlas), {});
  assert.deepEqual(parseParams('?z=246', atlas), { z: 245 });
  const st = { view: 'triple', level: 'carina', structure: 'pancreas', window: 'bone', lang: 'es' };
  assert.deepEqual(parseParams(buildParams(st), atlas), { view: 'triple', level: 'carina', structure: 'pancreas', window: 'bone', lang: 'es' });
  assert.equal(buildParams({ view: 'axial', window: 'soft', labels: 'all' }), '');
});
