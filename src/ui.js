// Viewer: loading, rendering (canvas 2D), interaction, sidebar, i18n, deep links.
import { WINDOWS, PLANES, unshuffleInt16, base64ToBytes, isGzip, buildLUT, planeInfo, sliceOf, withSlice, voxelAt, pixelOf,
  index3, extractSlice, sliceLabels, layoutColumn, levelRange, searchStructures, nearestVoxel, parseParams, buildParams } from './core.js';
import { STRINGS, pickLang } from './i18n.js';
import { LESION_ID, applyPatch, mrClass, mrSignal, projectVolume, projectPatch, filmStats, filmImage } from './pathology.js';
import { initModules } from './modui.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const DATA = 'data/';
// Label priority weights: bones and muscles yield to organs and vessels when space is short.
const WEIGHT = { esq_axial: 0.25, esq_apend: 0.4, musculos: 0.55 };

const S = {
  lang: 'es', atlas: null, dims: [0, 0, 0], sp: [1.5, 1.5, 1.5], vol: null, lab: null,
  cur: { z: 0, y: 0, x: 0 }, layout: 'single', active: 'axial',
  winKey: 'soft', wc: 40, ww: 400, overlay: 'fill', opacity: 0.45, labels: 'all', tool: 'mover',
  vis: new Uint8Array(256), sysOn: {}, sel: 0, iso: false, hover: 0, lastLevel: null,
  byId: {}, byKey: {}, R: new Uint8Array(256), G: new Uint8Array(256), B: new Uint8Array(256),
  lut: new Uint8Array(4096), measure: null, savedVis: null,
  // pathology modules (src/modui.js): simulated lesions are laid over the real CT as patches
  patch: { A: null, B: null }, pv: { A: 0, B: 0 }, lesionName: { A: null, B: null },
  phase: 'portal', shift: new Int16Array(256), modality: 'ct', mrCls: [], drrBase: {}, drr: { A: {}, B: {} },
  showMarks: true, onClick: null, mod: null,
};
const T = () => STRINGS[S.lang];
const nm = s => (S.lang === 'es' ? s.es : s.en);
const alt = s => (S.lang === 'es' ? 'EN · ' + s.en : 'ES · ' + s.es);   // the other-language term, tagged
const shortName = s => (S.lang === 'es' ? s.short : s.short_en);
const sysName = id => { if (id === '__lesion') return T().mod.simLesion; const y = S.atlas.systems.find(x => x.id === id); return y ? (S.lang === 'es' ? y.es : y.en) : id; };
const lvlName = l => (l ? (T().level[l] || l) : '');
const klName = k => (S.lang === 'es' ? k.name : k.name_en);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- loading ---------------- */
async function fetchBytes(url, onp) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onp && onp(b.length, b.length); return b; }
  const rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onp && onp(got, total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function gunzip(u8) {
  if (!isGzip(u8)) return u8;                    // the server already decoded it
  const ds = new DecompressionStream('gzip');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
// Binary first (GitHub Pages, any static host); base64 text parts for hosts that refuse .bin files.
async function getData(name, onp) {
  try {
    const b = await fetchBytes(DATA + name + '.bin', onp);
    if (b.length > 1000 && b[0] !== 0x3c) return b;    // not an HTML error page
  } catch (e) { /* fall through to base64 parts */ }
  const parts = (S.atlas.b64 || {})[name];
  if (!parts) throw new Error(name + '.bin');
  const got = parts.map(() => 0);
  const texts = await Promise.all(parts.map((fn, i) => fetchBytes(DATA + fn, (g, t) => { got[i] = g; onp && onp(got.reduce((a, b) => a + b, 0) * 0.75, t ? t * parts.length * 0.75 : 0); })));
  const chunks = texts.map(t => base64ToBytes(new TextDecoder().decode(t)));
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
async function load() {
  S.atlas = await (await fetch(DATA + 'atlas.json')).json();
  S.dims = S.atlas.dims; S.sp = S.atlas.spacing;
  const est = { ct: 16.4e6, lab: 0.63e6 }; let pc = 0, pl = 0;
  const upd = () => { const f = Math.min(1, (pc + pl) / (est.ct + est.lab)); $('#progbar').style.width = (f * 100).toFixed(1) + '%'; $('#progtxt').textContent = Math.round(f * 100) + '%'; };
  const [ctB, labB] = await Promise.all([
    getData('ct', (g, t) => { if (t) est.ct = t; pc = g; upd(); }),
    getData('labels', (g, t) => { if (t) est.lab = t; pl = g; upd(); }),
  ]);
  $('#progtxt').textContent = T().decompressing;
  const ct = await gunzip(ctB), lb = await gunzip(labB);
  const n = S.dims[0] * S.dims[1] * S.dims[2];
  if (lb.length !== n) throw new Error('labels size');
  S.vol = unshuffleInt16(ct, n); S.lab = lb;
}

function hex(c) { const h = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
function setupData() {
  for (const s of S.atlas.structures) { S.byId[s.id] = s; S.byKey[s.key] = s; [S.R[s.id], S.G[s.id], S.B[s.id]] = hex(s.color); S.vis[s.id] = 1; S.mrCls[s.id] = mrClass(s.key); }
  // pseudo-structure for simulated lesions (not in the sidebar; named after the module entity on hover)
  S.byId[LESION_ID] = { id: LESION_ID, key: '__lesion', es: 'Lesión simulada', en: 'Simulated lesion', short: 'Lesión', short_en: 'Lesion', system: '__lesion', color: '#ff4fd8', bbox: [0, 0, 0, 0, 0, 0] };
  [S.R[LESION_ID], S.G[LESION_ID], S.B[LESION_ID]] = hex('#ff4fd8'); S.vis[LESION_ID] = 1; S.mrCls[LESION_ID] = 'soft';
  for (const y of S.atlas.systems) S.sysOn[y.id] = true;
  const k = S.atlas.keylevels.find(k => k.id === 'renal-hila');
  S.cur = { z: k ? k.z : Math.floor(S.dims[0] / 2), y: Math.floor(S.dims[1] * 0.45), x: Math.floor(S.dims[2] / 2) };
  setWindow('soft');
}
function setWindow(key, c, w) {
  S.winKey = key;
  if (key !== 'custom') ({ c: S.wc, w: S.ww } = WINDOWS[key]); else { S.wc = c; S.ww = w; }
  buildLUT(S.wc, S.ww, S.lut);
  $('#winSel').value = key;
}

/* ---------------- views ---------------- */
class View {
  constructor(el) {
    this.el = el; this.plane = el.dataset.plane; this.slot = el.dataset.slot || 'A'; this.cv = el.querySelector('canvas.main'); this.ctx = this.cv.getContext('2d');
    this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d');
    this.zoom = 1; this.px = 0; this.py = 0; this.key = ''; this.hu = null; this.lb = null; this.mr = null; this.img = null; this.cands = null;
    if (this.slot === 'B') {     // compare view: mirrors the active plane, shares its zoom and pan
      for (const k of ['zoom', 'px', 'py']) Object.defineProperty(this, k, { get: () => (views[S.active] ? views[S.active][k] : 1), set: v => { if (views[S.active]) views[S.active][k] = v; } });
    }
  }
  size() { const r = this.el.getBoundingClientRect(); return [r.width, r.height]; }
  geom() {
    const P = planeInfo(this.plane, S.dims, S.sp), [cw, ch] = this.size();
    const iw = P.w * P.pw, ih = P.h * P.ph, s = Math.min(cw / iw, ch / ih) * 0.94 * this.zoom;
    return { cw, ch, s, iw, ih, ox: cw / 2 - iw * s / 2 + this.px, oy: ch / 2 - ih * s / 2 + this.py, ...P };
  }
  toSlice(sx, sy) { const g = this.geom(); return { u: Math.floor((sx - g.ox) / (g.s * g.pw)), v: Math.floor((sy - g.oy) / (g.s * g.ph)), g }; }
  toScreen(u, v, g) { return [g.ox + (u + 0.5) * g.s * g.pw, g.oy + (v + 0.5) * g.s * g.ph]; }
  extract() {
    const P = planeInfo(this.plane, S.dims, S.sp), mrSeq = S.modality === 't1' || S.modality === 't2' || S.modality === 'stir' ? S.modality : null;
    const k = [this.plane, sliceOf(this.plane, S.cur), this.slot, S.pv[this.slot], S.phase, mrSeq].join(':');
    if (this.key === k) return;
    this.key = k; this.cands = null;
    if (!this.hu || this.hu.length !== P.w * P.h) {
      this.hu = new Int16Array(P.w * P.h); this.lb = new Uint8Array(P.w * P.h); this.mr = new Uint8Array(P.w * P.h);
      this.off.width = P.w; this.off.height = P.h; this.img = this.octx.createImageData(P.w, P.h);
    }
    extractSlice(this.plane, S.vol, S.lab, S.dims, S.cur, this.hu, this.lb);
    if (S.phase !== 'portal') { const sh = S.shift, hu = this.hu, lb = this.lb; for (let p = 0; p < hu.length; p++) if (lb[p]) hu[p] += sh[lb[p]]; }
    if (mrSeq) this.mr.fill(255);
    applyPatch(this.plane, S.cur, S.patch[this.slot], this.hu, this.lb, S.dims, mrSeq, mrSeq ? this.mr : null);
  }
  compose() {
    const w = this.off.width, h = this.off.height, d = this.img.data, hu = this.hu, lb = this.lb, lut = S.lut;
    const mode = S.overlay, vis = S.vis, sel = S.sel, hov = S.hover, R = S.R, G = S.G, B = S.B, a0 = S.opacity;
    const seq = S.modality === 't1' || S.modality === 't2' || S.modality === 'stir' ? S.modality : null, mr = this.mr, cls = S.mrCls;
    const drr = S.modality === 'rx' ? drrImage(this.slot, this.plane) : null;
    for (let v = 0, p = 0; v < h; v++) for (let u = 0; u < w; u++, p++) {
      let g;
      if (drr) { const q = p * 4; d[q] = d[q + 1] = d[q + 2] = drr[p]; d[q + 3] = 255; continue; }
      if (seq) g = mr[p] !== 255 ? Math.round(mr[p] * 255 / 254) : Math.round(mrSignal(seq, hu[p], cls[lb[p]] || 'none') * 255);
      else { let hv = hu[p] + 1024; hv = hv < 0 ? 0 : hv > 4095 ? 4095 : hv; g = lut[hv]; }
      let r = g, gg = g, b = g; const l = lb[p];
      if (l === LESION_ID) {        // simulated lesion: the grey level is the teaching content; outline only on request
        if (S.hiLesion && vis[l] && ((u > 0 && lb[p - 1] !== l) || (u < w - 1 && lb[p + 1] !== l) || (v > 0 && lb[p - w] !== l) || (v < h - 1 && lb[p + w] !== l))) { r = 255; gg = 79; b = 216; }
      } else if (l && vis[l]) {
        const edge = (u > 0 && lb[p - 1] !== l) || (u < w - 1 && lb[p + 1] !== l) || (v > 0 && lb[p - w] !== l) || (v < h - 1 && lb[p + w] !== l);
        let a = 0;
        if (mode === 'fill') { a = sel ? (l === sel ? Math.min(0.85, a0 + 0.25) : a0 * 0.3) : a0; if (edge && (l === sel || l === hov)) a = 0.95; }
        else if (mode === 'outline') { a = edge ? (sel && l !== sel ? 0.45 : 1) : (l === sel || l === hov ? 0.25 : 0); }
        else if ((l === hov || l === sel) && edge) a = 1;
        if (a) { r = g + (R[l] - g) * a; gg = g + (G[l] - g) * a; b = g + (B[l] - g) * a; }
        if (l === hov && edge && mode !== 'none') { r = 255; gg = 255; b = 255; }
      }
      const q = p * 4; d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);
  }
  visible() {
    if (this.slot === 'B') return S.layout === 'compare';
    return S.layout === 'triple' || this.plane === S.active;
  }
  draw() {
    if (this.slot === 'B' && this.plane !== S.active) { this.plane = S.active; this.key = ''; }
    if (!this.visible()) return;
    const dpr = window.devicePixelRatio || 1, [cw, ch] = this.size();
    if (this.cv.width !== Math.round(cw * dpr) || this.cv.height !== Math.round(ch * dpr)) { this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(ch * dpr); }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.modality === 'rx' && this.plane === 'axial') {      // a plain film is a projection: no axial image
      c.fillStyle = '#000'; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(230,237,245,.7)'; c.font = '13px system-ui'; c.textAlign = 'center';
      c.fillText(T().mod.rxAxial, cw / 2, ch / 2); this.el.querySelector('.tag i').textContent = ''; if (this.plane === 'axial') drawScout(); return;
    }
    if (this.pendingFocus && this.slot !== 'B' && cw > 0) {      // pan so a point (e.g. the lesion) sits in the centre
      this.px = 0; this.py = 0; const g0 = this.geom(), q = pixelOf(this.plane, this.pendingFocus), [sx, sy] = this.toScreen(q.u, q.v, g0);
      this.px = cw / 2 - sx; this.py = ch / 2 - sy; this.pendingFocus = null;
    }
    this.extract(); this.compose();
    const air = S.modality === 'ct' ? S.lut[24] : 0; c.fillStyle = `rgb(${air},${air},${air})`; c.fillRect(0, 0, cw, ch);   // air colour: crop edge invisible in any window
    const g = this.geom();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.off, g.ox, g.oy, g.iw * g.s, g.ih * g.s);
    this.drawCross(c, g); this.drawOrient(c, g); this.drawScale(c, g); this.drawMeasure(c, g);
    if (S.modality !== 'rx') this.drawLabels(c, g);
    this.drawMarks(c, g); this.drawBadge(c, g);
    this.el.querySelector('.tag i').textContent = (sliceOf(this.plane, S.cur) + 1) + ' / ' + g.n;
    if (this.plane === 'axial') drawScout();
  }
  /** Teaching marks of the current lesion (arrows with a short text), hidden during an exam. */
  drawMarks(c, g) {
    const P = S.patch[this.slot]; if (!P || !P.marks || !P.marks.length || !S.showMarks || (S.mod && S.mod.exam)) return;
    const tol = 8, sl = sliceOf(this.plane, S.cur), axis = { axial: 0, coronal: 1, sagittal: 2 }[this.plane];
    c.save(); c.font = '600 11.5px system-ui,-apple-system,Segoe UI,sans-serif'; c.textBaseline = 'middle';
    for (const m of P.marks) {
      if (S.modality !== 'rx' && Math.abs(m.at[axis] - sl) > tol) continue;
      if (m.planes && !m.planes.includes(this.plane)) continue;
      const q = pixelOf(this.plane, { z: m.at[0], y: m.at[1], x: m.at[2] }), [x, y] = this.toScreen(q.u, q.v, g);
      const t = S.lang === 'es' ? m.text.es : m.text.en, dx = m.dx !== undefined ? m.dx : 46, dy = m.dy !== undefined ? m.dy : -34, tx = x + dx, ty = y + dy;
      c.strokeStyle = '#ff4fd8'; c.fillStyle = '#ff4fd8'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(x, y); c.stroke();
      const ang = Math.atan2(y - ty, x - tx); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8 * Math.cos(ang - 0.4), y - 8 * Math.sin(ang - 0.4)); c.lineTo(x - 8 * Math.cos(ang + 0.4), y - 8 * Math.sin(ang + 0.4)); c.fill();
      const tw = c.measureText(t).width, bx = dx >= 0 ? tx : tx - tw - 8;
      c.fillStyle = 'rgba(10,14,19,.85)'; c.fillRect(bx, ty - 10, tw + 8, 20); c.fillStyle = '#ffd6f4'; c.textAlign = 'left'; c.fillText(t, bx + 4, ty);
    }
    c.restore();
  }
  /** Corner badge: which modality/phase this view simulates, and the compared entity's name. */
  drawBadge(c, g) {
    const t = T().mod, parts = [];
    if (S.modality !== 'ct') parts.push(t.modName[S.modality] + ' · ' + t.simulated);
    else if (S.phase !== 'portal') parts.push((S.phaseLabel || t.phaseName[S.phase]) + ' · ' + t.simulated);
    if (S.layout === 'compare' && S.lesionName[this.slot]) parts.unshift((this.slot === 'A' ? 'A · ' : 'B · ') + S.lesionName[this.slot]);
    if (!parts.length) return;
    c.save(); c.font = '600 11px ui-monospace,Menlo,monospace'; c.textBaseline = 'middle'; c.textAlign = 'right';
    let y = 46; for (const p of parts) { const w = c.measureText(p).width; c.fillStyle = 'rgba(10,14,19,.8)'; c.fillRect(g.cw - w - 18, y - 10, w + 12, 20); c.fillStyle = '#f6c453'; c.fillText(p, g.cw - 12, y); y += 24; }
    c.restore();
  }
  drawCross(c, g) {
    if (S.layout !== 'triple') return;
    const p = pixelOf(this.plane, S.cur), cs = getComputedStyle(document.documentElement);
    const colU = { axial: '--sa', coronal: '--sa', sagittal: '--co' }[this.plane], colV = { axial: '--co', coronal: '--ax', sagittal: '--ax' }[this.plane];
    const [sx, sy] = this.toScreen(p.u, p.v, g);
    c.save(); c.globalAlpha = 0.75; c.lineWidth = 1; c.setLineDash([5, 4]);
    c.strokeStyle = cs.getPropertyValue(colU).trim(); c.beginPath(); c.moveTo(sx, g.oy); c.lineTo(sx, g.oy + g.ih * g.s); c.stroke();
    c.strokeStyle = cs.getPropertyValue(colV).trim(); c.beginPath(); c.moveTo(g.ox, sy); c.lineTo(g.ox + g.iw * g.s, sy); c.stroke();
    c.restore();
  }
  drawOrient(c, g) {
    const [l, r, t, b] = T().orient[this.plane];
    c.save(); c.fillStyle = 'rgba(230,237,245,.55)'; c.font = '600 11px ui-monospace,Menlo,monospace'; c.textBaseline = 'middle';
    c.textAlign = 'left'; c.fillText(l, 8, g.ch / 2); c.textAlign = 'right'; c.fillText(r, g.cw - 8, g.ch / 2);
    c.textAlign = 'center'; c.fillText(t, g.cw / 2, 30); c.fillText(b, g.cw / 2, g.ch - 12);
    c.restore();
  }
  drawScale(c, g) {
    const mm = [10, 20, 50, 100].find(m => m * g.s > 60) || 100, px = mm * g.s, x0 = g.cw - 14 - px, y0 = g.ch - 30;
    c.save(); c.strokeStyle = c.fillStyle = 'rgba(230,237,245,.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + px, y0); c.moveTo(x0, y0 - 4); c.lineTo(x0, y0 + 4); c.moveTo(x0 + px, y0 - 4); c.lineTo(x0 + px, y0 + 4); c.stroke();
    c.font = '10px ui-monospace,Menlo,monospace'; c.textAlign = 'center'; c.fillText(mm / 10 + ' cm', x0 + px / 2, y0 - 8); c.restore();
  }
  drawMeasure(c, g) {
    const m = S.measure; if (!m || m.plane !== this.plane || m.slice !== sliceOf(this.plane, S.cur)) return;
    const x1 = g.ox + m.u1 * g.s * g.pw, y1 = g.oy + m.v1 * g.s * g.ph, x2 = g.ox + m.u2 * g.s * g.pw, y2 = g.oy + m.v2 * g.s * g.ph;
    const dmm = Math.hypot((m.u2 - m.u1) * g.pw, (m.v2 - m.v1) * g.ph);
    c.save(); c.strokeStyle = c.fillStyle = '#f6c453'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    for (const [x, y] of [[x1, y1], [x2, y2]]) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    const fmt = new Intl.NumberFormat(S.lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    const t = dmm >= 10 ? fmt.format(dmm / 10) + ' cm' : fmt.format(dmm) + ' mm';
    c.font = '600 12px system-ui'; const tw = c.measureText(t).width, mx = (x1 + x2) / 2 + 8, my = (y1 + y2) / 2 - 8;
    c.fillStyle = 'rgba(10,14,19,.85)'; c.fillRect(mx - 4, my - 10, tw + 8, 18); c.fillStyle = '#f6c453'; c.textBaseline = 'middle'; c.fillText(t, mx, my);
    c.restore();
  }
  drawLabels(c, g) {
    if (!this.cands) this.cands = sliceLabels(this.lb, this.off.width, this.off.height);
    let cands = this.cands.filter(k => S.vis[k.l] && S.byId[k.l]);
    if (S.labels !== 'all') cands = cands.filter(k => k.l === S.hover || k.l === S.sel);
    if (S.iso) cands = cands.filter(k => k.l === S.sel);
    cands = cands.filter(k => {     // ribs only on demand; vertebrae auto-labelled in the sagittal plane, where they line up
      if (k.l === S.sel || k.l === S.hover) return true;
      const key = S.byId[k.l].key;
      if (key.startsWith('rib_') || key === 'costal_cartilages') return false;
      if (key.startsWith('vertebrae_')) return this.plane === 'sagittal';
      return true;
    });
    if (!cands.length) return;
    const small = g.cw < 520, fs = small ? 10 : 11.5, lh = fs + 5;
    for (const k of cands) k.pri = k.n * (WEIGHT[S.byId[k.l].system] || 1) + (k.l === S.sel || k.l === S.hover ? 1e9 : 0);
    cands.sort((a, b) => b.pri - a.pri);
    const perSide = Math.max(3, Math.min(small ? 9 : 16, Math.floor((g.ch - 70) / (lh * 1.3))));
    const left = [], right = [];
    for (const k of cands) {
      const [ax, ay] = this.toScreen(k.au, k.av, g);
      if (ax < 0 || ax > g.cw || ay < 0 || ay > g.ch) continue;
      const side = k.au < g.w / 2 ? left : right;
      if (side.length < perSide) side.push({ k, ax, ay });
    }
    c.save(); c.font = `500 ${fs}px system-ui,-apple-system,Segoe UI,sans-serif`; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.miterLimit = 2;
    const imgL = g.ox, imgR = g.ox + g.iw * g.s;
    // keep the right column clear of the scout thumbnail (single axial view) and the bottom scale bar
    const scoutOn = this.plane === 'axial' && S.layout === 'single' && scoutImg;
    const scoutBottom = scoutOn ? 8 + $('.scout').offsetHeight + 12 : 34;
    const place = (arr, isLeft) => {
      if (!arr.length) return;
      for (const o of arr) { o.text = o.k.l === LESION_ID ? (S.lesionName[this.slot] || shortName(S.byId[o.k.l])) : shortName(S.byId[o.k.l]); o.tw = c.measureText(o.text).width; }
      layoutColumn(arr, isLeft ? 34 : scoutBottom, g.ch - 56, lh);
      const maxw = Math.max(...arr.map(o => o.tw));
      let tx;
      if (isLeft) { tx = imgL - 12; if (tx - maxw < 6) tx = Math.min(6 + maxw, g.cw * 0.42); }
      else { tx = imgR + 12; if (tx + maxw > g.cw - 6) tx = Math.max(g.cw - 6 - maxw, g.cw * 0.58); }
      for (const o of arr) {
        const s = S.byId[o.k.l], hi = o.k.l === S.sel || o.k.l === S.hover, ex = isLeft ? tx + 4 : tx - 4;
        c.strokeStyle = hi ? s.color : 'rgba(230,237,245,.45)'; c.lineWidth = hi ? 1.5 : 1;
        c.beginPath(); c.moveTo(o.ax, o.ay); c.lineTo(ex, o.y); c.stroke();
        c.fillStyle = s.color; c.beginPath(); c.arc(o.ax, o.ay, hi ? 3.5 : 2.5, 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 0.8; c.stroke();
        c.textAlign = isLeft ? 'right' : 'left';
        c.lineWidth = 2.6; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(o.text, tx, o.y);
        c.fillStyle = hi ? '#fff' : s.color; c.fillText(o.text, tx, o.y);
      }
    };
    place(left, true); place(right, false);
    c.restore();
  }
}
const views = {};

/* ---------------- scout: coronal thick slab ---------------- */
let scoutImg = null;
function buildScout() {
  const cv = $('.scout'), [Z, Y, X] = S.dims, slab = document.createElement('canvas');
  slab.width = X; slab.height = Z;
  const sc = slab.getContext('2d'), im = sc.createImageData(X, Z), y0 = Math.floor(Y * 0.3), y1 = Math.floor(Y * 0.7), YX = Y * X;
  for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    let s = 0; for (let y = y0; y < y1; y += 2) s += S.vol[z * YX + y * X + x];
    let g = (s / ((y1 - y0) / 2) + 250) / 700 * 255; g = g < 0 ? 0 : g > 255 ? 255 : g;
    const q = (z * X + x) * 4; im.data[q] = im.data[q + 1] = im.data[q + 2] = g; im.data[q + 3] = 255;
  }
  sc.putImageData(im, 0, 0); scoutImg = slab;
  const h = 150, w = Math.round(h * X * S.sp[2] / (Z * S.sp[0]));
  cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); const r = cv.getBoundingClientRect(); setSlice('axial', Math.round((e.clientY - r.top) / r.height * (Z - 1))); });
}
function drawScout() {
  const cv = $('.scout'); if (!scoutImg) return;
  cv.style.display = S.layout === 'single' && S.active === 'axial' ? 'block' : 'none';
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.drawImage(scoutImg, 0, 0, cv.width, cv.height);
  const y = (S.cur.z + 0.5) / S.dims[0] * cv.height;
  c.strokeStyle = '#f6c453'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke();
}

/* ---------------- simulated plain film (DRR) ---------------- */
// Base projections are computed once per plane; each slot adds its patch's change on top.
function drrImage(slot, plane) {
  if (plane === 'axial') return null;
  if (!S.drrBase[plane]) { const p = projectVolume(S.vol, S.dims, S.sp, plane); S.drrBase[plane] = { p, stats: filmStats(p) }; }
  const c = S.drr[slot], b = S.drrBase[plane], P = planeInfo(plane, S.dims, S.sp);
  if (!c[plane] || c[plane].v !== S.pv[slot]) c[plane] = { v: S.pv[slot], img: filmImage(projectPatch(b.p, S.vol, S.dims, S.sp, plane, S.patch[slot]), P.w, P.h, b.stats) };
  return c[plane].img;
}

/* ---------------- render loop ---------------- */
let raf = 0;
function render() { if (raf || !S.vol) return; raf = requestAnimationFrame(() => { raf = 0; for (const v of Object.values(views)) v.draw(); updateBottom(); }); }
function invalidate() { for (const v of Object.values(views)) v.key = ''; render(); }
function relabel() { for (const v of Object.values(views)) v.cands = null; render(); }

/* ---------------- sidebar ---------------- */
function naturalOrder(s) {
  const m = s.key.match(/^vertebrae_([CTLS])(\d+)/); if (m) return { C: 0, T: 10, L: 30, S: 40 }[m[1]] + (+m[2]);
  const r = s.key.match(/^rib_(left|right)_(\d+)/); if (r) return 100 + (+r[2]) * 2 + (r[1] === 'left' ? 1 : 0);
  return 0;
}
const EYE_ON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/></svg>';
function buildSidebar() {
  const a = S.atlas, sysEl = $('#systems'), listEl = $('#list');
  const closed = new Set($$('.grp.closed').map(g => g.dataset.sys));
  const first = !listEl.children.length;
  sysEl.innerHTML = ''; listEl.innerHTML = '';
  for (const y of a.systems) {
    const items = a.structures.filter(s => s.system === y.id).sort((p, q) => naturalOrder(p) - naturalOrder(q) || nm(p).localeCompare(nm(q), S.lang));
    const b = document.createElement('button'); b.className = 'sys'; b.dataset.sys = y.id;
    b.innerHTML = `<span class="sw" style="background:${y.color}"></span><span>${esc(sysName(y.id))}</span><span class="n">${items.length}</span>`;
    b.onclick = () => toggleSystem(y.id); sysEl.appendChild(b);
    const g = document.createElement('div');
    g.className = 'grp' + ((first ? items.length > 12 : closed.has(y.id)) ? ' closed' : ''); g.dataset.sys = y.id;
    g.innerHTML = `<div class="gh" role="button" tabindex="0"><svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg><span style="width:8px;height:8px;border-radius:2px;background:${y.color}"></span>${esc(sysName(y.id))}</div><div class="items"></div>`;
    const gh = g.querySelector('.gh'); gh.onclick = () => g.classList.toggle('closed'); gh.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.classList.toggle('closed'); } };
    const box = g.querySelector('.items');
    for (const s of items) {
      const it = document.createElement('div'); it.className = 'it'; it.dataset.id = s.id; it.title = alt(s); it.tabIndex = 0;
      it.innerHTML = `<span class="dot" style="background:${s.color}"></span><span class="nm">${esc(nm(s))}</span><button class="eye" title="${esc(T().showHide)}" aria-label="${esc(T().showHide)}">${EYE_ON}</button>`;
      it.onclick = e => { if (e.target.closest('.eye')) { e.stopPropagation(); toggleStructure(s.id); } else { select(s.id, true); closeDrawer(); } };
      it.onkeydown = e => { if (e.key === 'Enter') { select(s.id, true); closeDrawer(); } };
      box.appendChild(it);
    }
    listEl.appendChild(g);
  }
  search($('#q').value); syncSidebar();
}
function syncSidebar() {
  for (const b of $$('.sys')) b.classList.toggle('off', !S.sysOn[b.dataset.sys]);
  for (const it of $$('.it')) { const id = +it.dataset.id; it.classList.toggle('hidden', !S.vis[id]); it.classList.toggle('sel', id === S.sel); it.querySelector('.eye').innerHTML = S.vis[id] ? EYE_ON : EYE_OFF; }
}
function toggleSystem(id) {
  if (S.iso) unIso();
  S.sysOn[id] = !S.sysOn[id];
  for (const s of S.atlas.structures) if (s.system === id) S.vis[s.id] = S.sysOn[id] ? 1 : 0;
  syncSidebar(); relabel();
}
function toggleStructure(id) {
  S.vis[id] = S.vis[id] ? 0 : 1;
  const y = S.byId[id].system; S.sysOn[y] = S.atlas.structures.some(s => s.system === y && S.vis[s.id]);
  syncSidebar(); relabel();
}
function setAll(on) { if (S.iso) unIso(); for (const s of S.atlas.structures) S.vis[s.id] = on ? 1 : 0; for (const k in S.sysOn) S.sysOn[k] = on; syncSidebar(); relabel(); }
function search(q) {
  const hits = new Set(searchStructures(S.atlas.structures, q).map(s => s.id)), any = q.trim() !== '';
  for (const g of $$('.grp')) {
    let n = 0;
    for (const it of g.querySelectorAll('.it')) { const h = hits.has(+it.dataset.id); it.style.display = h ? '' : 'none'; n += h; }
    g.style.display = n ? '' : 'none'; if (any && n) g.classList.remove('closed');
  }
}

/* ---------------- selection ---------------- */
function select(id, go) {
  if (S.iso && id !== S.sel) unIso();
  S.sel = id || 0;
  renderCard();
  if (S.sel) {
    const s = S.byId[S.sel];
    if (!S.vis[S.sel]) { S.vis[S.sel] = 1; S.sysOn[s.system] = true; }
    const it = $(`.it[data-id="${S.sel}"]`); if (it) { it.closest('.grp').classList.remove('closed'); it.scrollIntoView({ block: 'nearest' }); }
    if (go) goTo(s);
  }
  syncSidebar(); relabel();
}
function renderCard() {
  const card = $('#card');
  if (!S.sel) { card.classList.remove('on'); return; }
  const s = S.byId[S.sel], y = S.atlas.systems.find(x => x.id === s.system);
  const vol = s.volume_ml >= 1 ? new Intl.NumberFormat(S.lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1 }).format(s.volume_ml) + ' ml' : '<1 ml';
  const lv = levelRange(S.atlas.levels, s.bbox).replace(/Cráneo|Sacro/g, m => lvlName(m));
  $('#cDot').style.background = s.color; $('#cName').textContent = nm(s); $('#cEn').textContent = alt(s);
  $('#cMeta').innerHTML = `<span class="chip" style="color:${y.color}">${esc(sysName(s.system))}</span><span class="chip">${vol}</span>${lv ? `<span class="chip">${esc(lv)}</span>` : ''}`;
  card.classList.add('on');
}
/** Move the crosshair to a voxel and centre every view on it at a given zoom (used by the pathology modules). */
function focusOn(pt, zoom) {
  S.cur = { z: pt.z, y: pt.y, x: pt.x }; S.lastLevel = null;
  for (const v of Object.values(views)) if (v.slot !== 'B') { v.zoom = zoom || 1; v.pendingFocus = { ...S.cur }; }
  invalidate();
}
function goTo(s) {
  S.cur = nearestVoxel(S.lab, S.dims, s); S.lastLevel = null;
  for (const v of Object.values(views)) { v.px = 0; v.py = 0; }
  invalidate();
}
function toggleIso() {
  if (!S.sel) return;
  if (S.iso) unIso(); else { S.savedVis = S.vis.slice(); S.vis.fill(0); S.vis[S.sel] = 1; S.iso = true; $('#cIso').classList.add('on'); }
  syncSidebar(); relabel();
}
function unIso() { if (S.savedVis) S.vis.set(S.savedVis); S.savedVis = null; S.iso = false; $('#cIso').classList.remove('on'); }

/* ---------------- bottom bar ---------------- */
function buildKeys() {
  const box = $('#keys'); box.querySelectorAll('.kl').forEach(b => b.remove());
  for (const k of S.atlas.keylevels) {
    const b = document.createElement('button'); b.className = 'kl'; b.dataset.z = k.z; b.dataset.id = k.id;
    b.innerHTML = `${esc(klName(k))}<small>${esc(lvlName((k.level || '').split('–')[0]))}</small>`;
    b.title = (S.lang === 'es' ? k.note : k.note_en) || klName(k);
    b.onclick = () => goLevel(k.id);
    box.appendChild(b);
  }
}
function goLevel(id) {
  const k = S.atlas.keylevels.find(k => k.id === id); if (!k) return;
  S.cur.z = k.z; const s = S.byKey[k.focus];
  if (s) { S.cur.x = Math.round((s.bbox[4] + s.bbox[5]) / 2); S.cur.y = Math.round((s.bbox[2] + s.bbox[3]) / 2); }
  if (S.layout === 'single' && S.active !== 'axial') setPlane('axial');
  invalidate(); S.lastLevel = id;
}
function updateBottom() {
  const P = planeInfo(S.active, S.dims, S.sp), sl = $('#slider'), v = sliceOf(S.active, S.cur);
  sl.max = P.n - 1; if (+sl.value !== v) sl.value = v;
  $('#sliceTxt').textContent = `${T()[S.active]} ${v + 1} / ${P.n}`;
  $('#lvl').textContent = lvlName(S.atlas.levels[S.cur.z]) || '—';
  for (const b of $$('.kl')) b.classList.toggle('on', Math.abs(+b.dataset.z - S.cur.z) <= 1);
}
function setSlice(plane, v) {
  const next = withSlice(plane, S.cur, v, S.dims);
  if (sliceOf(plane, next) === sliceOf(plane, S.cur)) return;
  S.cur = next; S.lastLevel = null; invalidate();
}
function setPlane(p) {
  for (const b of $$('#planeSeg button')) b.classList.toggle('on', b.dataset.p === p);
  if (p === 'triple') { S.layout = 'triple'; $('#views').className = 'views triple'; }
  else { S.layout = S.compareOn ? 'compare' : 'single'; S.active = p; $('#views').className = 'views ' + S.layout; }
  for (const el of $$('.view')) el.classList.toggle('active', !el.dataset.slot && el.dataset.plane === S.active);
  invalidate();
}
/** Side-by-side compare (two simulated lesions in the same plane); only outside the triple view. */
function setCompare(on) {
  S.compareOn = !!on;
  setPlane(S.layout === 'triple' ? 'triple' : S.active);
}

/* ---------------- tooltip ---------------- */
function showTip(view, sx, sy, cx, cy) {
  const { u, v, g } = view.toSlice(sx, sy), tip = $('#tip');
  if (u < 0 || v < 0 || u >= g.w || v >= g.h) { hideTip(); return; }
  const p = voxelAt(view.plane, u, v, S.cur), i = index3(S.dims, p.z, p.y, p.x), hu = S.vol[i];
  const l = view.lb && S.modality !== 'rx' ? view.lb[v * g.w + u] : S.lab[i];     // patched label (simulated lesion) when present
  const exam = S.mod && S.mod.exam;
  const h = l && S.vis[l] && !(exam && l === LESION_ID) ? l : 0;
  if (h !== S.hover) { S.hover = h; render(); }
  let html = '';
  const vhu = view.hu ? view.hu[v * g.w + u] : hu;      // what is on screen (phase / simulated lesion included)
  if (h === LESION_ID) { html += `<div><span class="sw" style="background:${S.byId[h].color}"></span><b>${esc(S.lesionName[view.slot] || nm(S.byId[h]))}</b></div><div class="en">${esc(T().mod.simLesion)}</div>`; }
  else if (h) { const s = S.byId[l]; html += `<div><span class="sw" style="background:${s.color}"></span><b>${esc(nm(s))}</b></div><div class="en">${esc(alt(s))} · ${esc(sysName(s.system))}</div>`; }
  const lv = exam ? '' : lvlName(S.atlas.levels[p.z]);
  html += `<div class="row">${S.modality === 'ct' ? `<span>${vhu} ${T().hu}</span>` : ''}${lv ? `<span>${esc(lv)}</span>` : ''}</div>`;
  tip.innerHTML = html; tip.style.display = 'block';
  const r = $('#stage').getBoundingClientRect(); let x = cx - r.left + 14, y = cy - r.top + 14;
  if (x + tip.offsetWidth > r.width - 6) x = cx - r.left - tip.offsetWidth - 14;
  if (y + tip.offsetHeight > r.height - 6) y = cy - r.top - tip.offsetHeight - 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { $('#tip').style.display = 'none'; if (S.hover) { S.hover = 0; render(); } }

/* ---------------- interaction ---------------- */
function zoomAt(view, [x, y], f) {
  const nz = Math.max(0.5, Math.min(12, view.zoom * f)), k = nz / view.zoom, [cw, ch] = view.size();
  view.px = (x - cw / 2) - ((x - cw / 2) - view.px) * k; view.py = (y - ch / 2) - ((y - ch / 2) - view.py) * k; view.zoom = nz; render();
}
function bindView(view) {
  const el = view.el, ptrs = new Map(); let drag = null, pinch = null;
  const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const frac = (x, y) => { const g = view.geom(); return [(x - g.ox) / (g.s * g.pw), (y - g.oy) / (g.s * g.ph)]; };
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomAt(view, local(e), Math.exp(-e.deltaY * 0.0025)); return; }
    if (S.layout === 'triple') S.active = view.plane;
    const step = Math.abs(e.deltaY) > 40 ? Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 60)) : Math.sign(e.deltaY);
    setSlice(view.plane, sliceOf(view.plane, S.cur) + step);
  }, { passive: false });
  el.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('scout')) return;
    el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e));
    if (S.layout === 'triple') { S.active = view.plane; updateBottom(); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], zoom: view.zoom, px: view.px, py: view.py }; drag = null; return; }
    const [x, y] = local(e);
    let mode = S.tool;
    if (e.pointerType === 'mouse') { if (e.button === 2) mode = 'ventana'; else if (e.button === 1) mode = 'mover'; }
    else if (mode === 'mover') mode = 'scroll';      // touch: one finger scrolls slices, two fingers pan/zoom
    drag = { x0: x, y0: y, mode, moved: false, px: view.px, py: view.py, wc: S.wc, ww: S.ww, slice: sliceOf(view.plane, S.cur), type: e.pointerType };
    if (mode === 'medir') [drag.mu, drag.mv] = frac(x, y);
  });
  el.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [x, y]);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const nz = Math.max(0.5, Math.min(12, pinch.zoom * d / pinch.d)), k = nz / pinch.zoom, [cw, ch] = view.size();
      view.px = (pinch.m[0] - cw / 2) - ((pinch.m[0] - cw / 2) - pinch.px) * k + (m[0] - pinch.m[0]);
      view.py = (pinch.m[1] - ch / 2) - ((pinch.m[1] - ch / 2) - pinch.py) * k + (m[1] - pinch.m[1]);
      view.zoom = nz; render(); return;
    }
    if (!drag) { if (e.pointerType === 'mouse') showTip(view, x, y, e.clientX, e.clientY); return; }
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    hideTip();
    if (drag.mode === 'mover') { view.px = drag.px + dx; view.py = drag.py + dy; render(); }
    else if (drag.mode === 'ventana') { setWindow('custom', drag.wc + dy * 2, Math.max(1, drag.ww + dx * 4)); render(); }
    else if (drag.mode === 'scroll') setSlice(view.plane, drag.slice + Math.round(-dy / 6));
    else if (drag.mode === 'medir') { const [u2, v2] = frac(x, y); S.measure = { plane: view.plane, slice: sliceOf(view.plane, S.cur), u1: drag.mu, v1: drag.mv, u2, v2 }; render(); }
  });
  const end = e => {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    if (drag && !drag.moved) {
      const { u, v, g } = view.toSlice(drag.x0, drag.y0);
      if (u >= 0 && v >= 0 && u < g.w && v < g.h) {
        const p = voxelAt(view.plane, u, v, S.cur), l = S.lab[index3(S.dims, p.z, p.y, p.x)];
        if (S.onClick && S.onClick(p, view)) { drag = null; return; }      // e.g. exam "find the lesion"
        if (S.layout === 'triple') { S.cur = p; S.lastLevel = null; invalidate(); }
        select(l && S.vis[l] ? l : 0, false);
        if (drag.type !== 'mouse') showTip(view, drag.x0, drag.y0, e.clientX, e.clientY);
      } else select(0);
    }
    drag = null;
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) hideTip(); });
}
const activeViews = () => (S.layout === 'triple' ? Object.values(views) : [views[S.active]]);
function openDrawer() { $('#side').classList.add('open'); $('#scrim').classList.add('on'); }
function closeDrawer() { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); }

/* ---------------- language ---------------- */
function applyLang(lang) {
  S.lang = lang; const t = T();
  try { localStorage.setItem('ctatlas.lang', lang); } catch (e) { /* storage blocked */ }
  document.documentElement.lang = lang; document.title = t.title;
  for (const el of $$('[data-i]')) el.textContent = t[el.dataset.i];
  for (const el of $$('[data-it]')) { el.title = t[el.dataset.it]; el.setAttribute('aria-label', t[el.dataset.it]); }
  for (const el of $$('[data-ip]')) el.placeholder = t[el.dataset.ip];
  for (const b of $$('#langSw button')) b.classList.toggle('on', b.dataset.lang === lang);
  $('#winSel').innerHTML = [...Object.keys(WINDOWS), 'custom'].map(k => `<option value="${k}"${k === 'custom' ? ' disabled hidden' : ''}>${esc(t.win[k])}</option>`).join('');
  $('#winSel').value = S.winKey;
  $('#footTxt').innerHTML = t.footer;
  $('#helpTable').innerHTML = t.helpRows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('#helpNote').textContent = t.helpNote;
  $('#lvl').title = t.vertLevel;
  if (S.atlas) {
    $('#seriesTxt').textContent = lang === 'es' ? S.atlas.series : S.atlas.series_en;
    S.byId[LESION_ID] && Object.assign(S.byId[LESION_ID], { es: STRINGS.es.mod.simLesion, en: STRINGS.en.mod.simLesion });
    buildSidebar(); buildKeys(); renderCard(); relabel();
  }
  if (MOD) MOD.relang();
}

/* ---------------- deep links ---------------- */
function currentLink() {
  const st = { view: S.layout === 'triple' ? 'triple' : S.active, window: S.winKey === 'custom' ? null : S.winKey,
    labels: S.labels, iso: S.iso, lang: S.lang, structure: S.sel ? S.byId[S.sel].key : null };
  if (S.lastLevel) st.level = S.lastLevel; else if (!S.sel) st.z = S.cur.z;
  let q = buildParams(st);
  const m = MOD ? MOD.linkParams() : '';
  if (m) q = (q ? q + '&' : '?') + m;
  return location.origin + location.pathname + q;
}
function toast(msg, ms = 1800) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = 'none'), ms); }
async function copyLink() {
  const url = currentLink();
  try { await navigator.clipboard.writeText(url); toast(T().copied); }
  catch (e) { toast(url, 6000); }
}
function applyParams(p) {
  if (p.window) setWindow(p.window);
  if (p.labels) { S.labels = p.labels; for (const x of $$('#lblSeg button')) x.classList.toggle('on', x.dataset.l === p.labels); }
  if (p.view) setPlane(p.view);
  if (p.level) goLevel(p.level);
  if (p.z !== undefined) S.cur.z = p.z;
  if (p.structure) { select(S.byKey[p.structure].id, !p.level && p.z === undefined); if (p.iso) toggleIso(); }
}

/* ---------------- wire ---------------- */
function wire() {
  for (const el of $$('.view')) { const v = new View(el); views[v.slot === 'B' ? 'B' : v.plane] = v; bindView(v); }
  const seg = (sel, fn) => { $(sel).onclick = e => { const b = e.target.closest('button'); if (!b) return; for (const x of $(sel).querySelectorAll('button')) x.classList.toggle('on', x === b); fn(b); }; };
  $('#planeSeg').onclick = e => { const b = e.target.closest('button'); if (b) setPlane(b.dataset.p); };
  seg('#toolSeg', b => { S.tool = b.dataset.t; if (S.tool !== 'medir') { S.measure = null; render(); } });
  seg('#ovSeg', b => { S.overlay = b.dataset.o; render(); });
  seg('#lblSeg', b => { S.labels = b.dataset.l; render(); });
  $('#langSw').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.lang !== S.lang) applyLang(b.dataset.lang); };
  $('#winSel').onchange = e => { setWindow(e.target.value); render(); };
  $('#opac').oninput = e => { S.opacity = +e.target.value; render(); };
  $('#slider').oninput = e => setSlice(S.active, +e.target.value);
  $('#zIn').onclick = () => { for (const v of activeViews()) { const [cw, ch] = v.size(); zoomAt(v, [cw / 2, ch / 2], 1.25); } };
  $('#zOut').onclick = () => { for (const v of activeViews()) { const [cw, ch] = v.size(); zoomAt(v, [cw / 2, ch / 2], 0.8); } };
  $('#zFit').onclick = () => { for (const v of Object.values(views)) { v.zoom = 1; v.px = 0; v.py = 0; } render(); };
  $('#linkBtn').onclick = copyLink;
  $('#allOn').onclick = () => setAll(true); $('#allOff').onclick = () => setAll(false);
  $('#cClose').onclick = () => select(0); $('#cGo').onclick = () => S.sel && goTo(S.byId[S.sel]); $('#cIso').onclick = toggleIso;
  $('#q').oninput = e => search(e.target.value);
  $('#q').onkeydown = e => { if (e.key === 'Enter') { const it = $$('.it').find(x => x.style.display !== 'none' && x.closest('.grp').style.display !== 'none'); if (it) { select(+it.dataset.id, true); closeDrawer(); } } };
  $('#menuBtn').onclick = openDrawer; $('#scrim').onclick = closeDrawer;
  const help = $('#help');
  $('#helpBtn').onclick = () => help.classList.add('on');
  $('#helpLink').onclick = e => { e.preventDefault(); help.classList.add('on'); };
  $('#helpClose').onclick = () => help.classList.remove('on');
  help.onclick = e => { if (e.target === help) help.classList.remove('on'); };
  window.addEventListener('keydown', e => {
    if ((e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'SELECT') return;
    const P = S.active, cur = sliceOf(P, S.cur);
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); setSlice(P, cur - (e.key === 'PageUp' ? 10 : 1)); }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); setSlice(P, cur + (e.key === 'PageDown' ? 10 : 1)); }
    else if ('1234'.includes(e.key) && e.key.length === 1) setPlane([...PLANES, 'triple'][+e.key - 1]);
    else if (e.key === 'e' || e.key === 'E') { const o = ['all', 'hover', 'none']; $(`#lblSeg [data-l="${o[(o.indexOf(S.labels) + 1) % 3]}"]`).click(); }
    else if (e.key === 'c' || e.key === 'C') { const o = ['fill', 'outline', 'none']; $(`#ovSeg [data-o="${o[(o.indexOf(S.overlay) + 1) % 3]}"]`).click(); }
    else if (e.key === 'Escape') { help.classList.remove('on'); select(0); }
  });
  new ResizeObserver(() => render()).observe($('#stage'));
}

/* ---------------- boot ---------------- */
let MOD = null;     // pathology-module controller (src/modui.js)
(async function boot() {
  const pre = new URLSearchParams(location.search).get('lang');
  wire(); applyLang(pickLang(pre));
  try {
    await load();
    setupData(); applyLang(S.lang); buildScout();
    applyParams(parseParams(location.search, S.atlas));
    MOD = initModules({ S, T, views, render, invalidate, relabel, setPlane, setCompare, setWindow, select, toast, esc, $, $$, focusOn,
      setOverlay: o => { S.overlay = o; for (const x of $$('#ovSeg button')) x.classList.toggle('on', x.dataset.o === o); render(); },
      setLabels: l => { S.labels = l; for (const x of $$('#lblSeg button')) x.classList.toggle('on', x.dataset.l === l); render(); },
      copyLink, closeDrawer });
    await MOD.boot(location.search);
    $('#loading').style.display = 'none';
    invalidate();
  } catch (err) {
    console.error(err);
    $('#progtxt').textContent = T().loadError + err.message;
  }
})();

// Hook for automated checks (tests/e2e and manual debugging).
window.__atlas = { S, views, setPlane, setSlice, select, goLevel, applyLang, currentLink, setWindow, setCompare, mod: () => MOD };
