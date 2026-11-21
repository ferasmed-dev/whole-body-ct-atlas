// Pathology modules: sidebar panel, entity picker, sliders and toggles, técnica correcta vs equivocada,
// side-by-side compare, exam mode and deep links. Content lives in modules/<slug>/module.js; the viewer
// (src/ui.js) only knows about patches (src/pathology.js), so later modules reuse all of this unchanged.
import { REGISTRY, TAGS, defaults, coerce, parseModuleParams, buildModuleParams, paramString, validateModule, makeQuestion, rng, levelOptions } from './modules.js';
import { Anatomy, buildPatch, phaseShift, labelMeans, lesionCentre, patchVoxels, LESION_ID } from './pathology.js';
import { nearestVoxel, index3 } from './core.js';

export function initModules(api) {
  const { S, T, $, $$, esc } = api;
  const M = { def: null, slug: null, ent: null, params: null, tech: null, compare: null, treated: false, exam: null, anat: null, prev: null, loaded: {} };
  S.mod = M;
  const L = o => (o ? (S.lang === 'es' ? o.es : o.en) : '');
  const t = () => T().mod;
  const pane = $('#panePath');

  /* ---------- tabs ---------- */
  function showTab(tab) {
    for (const b of $$('#sideTabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    $('#paneAtlas').classList.toggle('on', tab === 'atlas'); $('#paneAtlas').hidden = tab !== 'atlas';
    pane.classList.toggle('on', tab === 'path'); pane.hidden = tab !== 'path';
    if (tab === 'path' && !M.def) renderHome();
  }
  $('#sideTabs').onclick = e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); };

  /* ---------- loading ---------- */
  async function load(slug) {
    if (M.loaded[slug]) return M.loaded[slug];
    const r = REGISTRY.find(x => x.slug === slug); if (!r) throw new Error('module ' + slug);
    const def = (await import(new URL(r.path, import.meta.url).href)).default;
    const errs = validateModule(def, S.atlas);
    if (errs.length) console.warn('module ' + slug + ':', errs);
    M.loaded[slug] = def; return def;
  }
  async function open(slug, opts = {}) {
    pane.innerHTML = `<div class="mhint">${esc(t().loading)}</div>`;
    try { M.def = await load(slug); } catch (e) { console.error(e); pane.innerHTML = `<div class="mhint">${esc(t().loadError)}</div>`; return; }
    M.slug = slug;
    if (!M.anat) M.anat = new Anatomy(S.atlas, S.lab, S.dims, S.sp);
    if (!M.prev) M.prev = { overlay: S.overlay, labels: S.labels };
    api.setOverlay('none'); api.setLabels('hover');      // the lesion is the subject: anatomy labels on demand
    showTab('path');
    const first = opts.entity || M.def.entities[0].id;
    selectEntity(first, opts);
    if (opts.exam) startExam();
  }
  function close() {
    stopExam(true);
    M.def = M.ent = M.slug = null; M.compare = null;
    S.patch.A = S.patch.B = null; S.pv.A++; S.pv.B++; S.lesionName.A = S.lesionName.B = null;
    setPhase('portal'); S.modality = 'ct'; api.setCompare(false);
    if (M.prev) { api.setOverlay(M.prev.overlay); api.setLabels(M.prev.labels); M.prev = null; }
    renderHome(); api.invalidate();
  }

  /* ---------- state changes ---------- */
  function setPhase(ph) {
    S.phase = ph;
    if (ph !== 'portal' && !S.means) S.means = labelMeans(S.vol, S.lab);
    phaseShift(S.atlas.structures, S.means || new Float64Array(256), ph, S.shift);
  }
  function entity(id) { return M.def.entities.find(e => e.id === id); }
  function env(ent) { return { phase: S.phase, treated: !!(M.treated && ent.treatment), technique: M.tech, lang: S.lang, modality: S.modality }; }

  function selectEntity(id, opts = {}) {
    const ent = entity(id) || M.def.entities[0];
    const prevLevel = M.params && M.params.level;
    M.ent = ent;
    M.params = opts.params ? { ...defaults(ent), ...opts.params } : defaults(ent);
    if (!opts.params && prevLevel !== undefined && (ent.params || []).some(q => q.id === 'level' && q.options.some(o => o.v === prevLevel))) M.params.level = prevLevel;
    M.treated = !!opts.treated && !!ent.treatment;
    M.compare = opts.compare && (ent.compare || []).includes(opts.compare) ? opts.compare : null;
    const techs = ent.techniques || [];
    M.tech = (opts.technique && techs.find(x => x.id === opts.technique)) || techs.find(x => x.default) || techs.find(x => x.mod === 'ct') || techs[0] || null;
    setPhase(opts.phase || (M.tech && M.tech.phase) || (ent.contrast === false ? 'sin' : ent.defaultPhase || 'portal'));
    S.modality = M.tech ? M.tech.mod : 'ct';
    const v = ent.view || {};
    if (v.window) api.setWindow((M.tech && M.tech.window) || v.window);
    rebuild(true);
    const plane = (M.tech && M.tech.plane) || v.plane;
    if (plane && S.layout !== 'triple') api.setPlane(plane);
    api.setCompare(!!M.compare);
    renderPanel();
  }

  let pending = 0;
  function rebuildSoon() { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; rebuild(false); renderReadouts(); }); }
  /** Rebuild the patch(es) for the current entity; recentre the crosshair on the lesion when asked. */
  function rebuild(recentre) {
    const ent = M.ent, A = M.anat;
    const mk = (e, p) => {
      if (typeof e.build !== 'function') return null;
      const prims = e.build(p, A, env(e));
      return buildPatch(prims, A, { vol: S.vol, lab: S.lab }, { phase: S.phase, shift: S.phase !== 'portal' ? S.shift : null, seed: 11 });
    };
    S.patch.A = mk(ent, M.params); S.pv.A++; S.lesionName.A = L(ent.short || ent.name);
    S.phaseLabel = ent.phaseLabels && ent.phaseLabels[S.phase] ? L(ent.phaseLabels[S.phase]) : null;
    if (M.compare) {
      const b = entity(M.compare), pb = defaults(b);
      for (const q of b.params || []) if (M.params[q.id] !== undefined) pb[q.id] = coerce(q, M.params[q.id]);
      S.patch.B = mk(b, pb); S.lesionName.B = L(b.short || b.name);
    } else { S.patch.B = null; S.lesionName.B = null; }
    S.pv.B++;
    if (recentre) centre();
    api.invalidate();
  }
  function centre() {
    const ent = M.ent, A = M.anat, v = ent.view || {};
    let c = v.at ? v.at(M.params, A) : null;
    if (!c && S.patch.A) c = lesionCentre(S.patch.A);
    if (!c && v.focus) { const p = nearestVoxel(S.lab, S.dims, A.s(v.focus)); c = [p.z, p.y, p.x]; }
    if (c) api.focusOn({ z: c[0], y: c[1], x: c[2] }, v.zoom || 1.6);
  }
  function setTechnique(id) {
    const tech = (M.ent.techniques || []).find(x => x.id === id); if (!tech) return;
    M.tech = tech; S.modality = tech.mod;
    if (tech.phase) setPhase(tech.phase);
    if (tech.window) api.setWindow(tech.window);
    if (tech.plane && S.layout !== 'triple') api.setPlane(tech.plane);
    rebuild(false); renderPanel();
  }

  /* ---------- panel ---------- */
  function renderHome() {
    pane.innerHTML = `<div class="mhead"><div><div class="kick">${esc(t().modules)}</div><h2>${esc(t().pick)}</h2></div></div>
      <div class="mods">${REGISTRY.map(r => `<button class="modcard" data-open="${r.slug}"><b>${esc(L(r))}</b><span>${esc(t().open)} →</span></button>`).join('')}</div>
      <p class="mhint">${esc(t().homeNote)}</p>`;
    pane.onclick = e => { const b = e.target.closest('[data-open]'); if (b) open(b.dataset.open); };
  }
  const tagChip = tg => `<span class="tag t-${tg}" title="${esc(L(TAGS[tg].hint))}">${esc(L(TAGS[tg]))}</span>`;
  function renderPanel() {
    if (!M.def) return renderHome();
    if (M.exam) return renderExam();
    const d = M.def, ent = M.ent;
    const groups = `<div class="epick2"><button class="btn" data-act="prevEnt" title="${esc(t().prev)}">‹</button><select data-act="ent" aria-label="${esc(t().entity)}">${d.groups.map(g =>
      `<optgroup label="${esc(L(g))}">${d.entities.filter(e => e.group === g.id).map(e => `<option value="${e.id}"${e.id === ent.id ? ' selected' : ''}>${esc(L(e.name))}</option>`).join('')}</optgroup>`).join('')}</select><button class="btn" data-act="nextEnt" title="${esc(t().nextEnt)}">›</button></div>
      <div class="ecount">${esc(t().entity)} ${d.entities.indexOf(ent) + 1} / ${d.entities.length}</div>`;
    pane.innerHTML = `
      <div class="mhead"><div><div class="kick">${esc(t().modules)}</div><h2>${esc(L(d.title))}</h2></div>
        <div class="mbtns"><button class="btn" data-act="exam">${esc(t().exam)}</button><button class="btn" data-act="close" title="${esc(t().exit)}">✕</button></div></div>
      ${d.intro ? `<details class="intro"><summary>${esc(t().backbone)}</summary><div>${L(d.intro.text)}</div>${d.intro.table ? table(d.intro.table) : ''}</details>` : ''}
      <div class="epick">${groups}</div>
      <div class="ent" id="entCard">${entityCard(ent)}</div>`;
    pane.onclick = onPanelClick; pane.oninput = onPanelInput; pane.onchange = onPanelInput;
  }
  function table(tb) {
    const rows = S.lang === 'es' ? tb.es : tb.en;
    return `<table class="mtab"><thead><tr>${rows[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function seg(name, items, on) {
    return `<div class="seg mseg" data-seg="${name}">${items.map(([v, label, cls]) => `<button data-v="${esc(v)}" class="${v === on ? 'on' : ''} ${cls || ''}">${esc(label)}</button>`).join('')}</div>`;
  }
  function paramCtl(q) {
    const v = M.params[q.id], lab = esc(L(q.label));
    if (q.type === 'range') return `<label class="prm"><span>${lab}<b data-out="${q.id}">${fmt(v)}${q.unit ? ' ' + esc(q.unit) : ''}</b></span><input type="range" data-p="${q.id}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}"></label>`;
    if (q.type === 'toggle') return `<label class="prm chk"><input type="checkbox" data-p="${q.id}"${v ? ' checked' : ''}><span>${lab}</span></label>`;
    if (q.options.length <= 4 && !q.dropdown) return `<div class="prm"><span>${lab}</span>${seg('p:' + q.id, q.options.map(o => [String(o.v), L(o)]), String(v))}</div>`;
    return `<label class="prm"><span>${lab}</span><select data-p="${q.id}">${q.options.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(L(o))}</option>`).join('')}</select></label>`;
  }
  const fmt = v => (typeof v === 'number' ? new Intl.NumberFormat(S.lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1 }).format(v) : v);
  function entityCard(ent) {
    const tt = t(), techs = ent.techniques || [], info = ent.info || {};
    let h = `<div class="eh"><h3>${esc(L(ent.name))}</h3><div class="en">${esc(S.lang === 'es' ? ent.name.en : ent.name.es)}</div><div class="chips">${tagChip(ent.tag)}${(ent.extraTags || []).map(tagChip).join('')}</div></div>`;
    if (ent.tag === 'kit' && ent.kitNote) h += `<div class="note kit">${esc(L(ent.kitNote))}</div>`;
    if (techs.length) {
      h += `<div class="sect"><div class="sh">${esc(tt.technique)}</div>${seg('tech', techs.map(x => [x.id, L(x.label), 'v-' + x.verdict]), M.tech && M.tech.id)}`;
      if (M.tech) h += `<div class="verdict v-${M.tech.verdict}"><b>${esc(tt.verdict[M.tech.verdict])}</b> · ${esc(L(M.tech.note))}</div>`;
      h += `</div>`;
    }
    const tog = [];
    if (ent.contrast && S.modality === 'ct') tog.push(`<div class="prm"><span>${esc(tt.contrast)}</span>${seg('phase', [['sin', tt.phaseName.sin], ['portal', tt.with]], S.phase === 'sin' ? 'sin' : 'portal')}</div>`);
    if (ent.phases && S.modality === 'ct') tog.push(`<div class="prm"><span>${esc(tt.phase)}</span>${seg('phase', ent.phases.map(p => [p, ent.phaseLabels && ent.phaseLabels[p] ? L(ent.phaseLabels[p]) : tt.phaseName[p]]), S.phase)}</div>`);
    if (ent.treatment) tog.push(`<div class="prm"><span>${esc(tt.treatment)}</span>${seg('tx', [['0', tt.untreated], ['1', L(ent.treatment.label)]], M.treated ? '1' : '0')}</div>`);
    if ((ent.params || []).length || tog.length) h += `<div class="sect"><div class="sh">${esc(tt.params)}</div>${tog.join('')}${(ent.params || []).map(paramCtl).join('')}</div>`;
    if (M.treated && ent.treatment) h += `<div class="note">${esc(L(ent.treatment.note))}</div>`;
    h += `<div class="sect ro" id="readouts">${readoutsHTML()}</div>`;
    if ((ent.compare || []).length) h += `<div class="sect"><label class="prm"><span>${esc(tt.compare)}</span><select data-act="compare"><option value="">${esc(tt.noCompare)}</option>${ent.compare.map(c => `<option value="${c}"${c === M.compare ? ' selected' : ''}>${esc(L(entity(c).name))}</option>`).join('')}</select></label></div>`;
    h += `<div class="sect row2"><label class="prm chk"><input type="checkbox" data-act="marks"${S.showMarks ? ' checked' : ''}><span>${esc(tt.marks)}</span></label><label class="prm chk"><input type="checkbox" data-act="hi"${S.hiLesion ? ' checked' : ''}><span>${esc(tt.highlight)}</span></label></div>`;
    for (const k of ['where', 'see', 'technique', 'differential', 'tip']) if (info[k]) h += `<div class="info"><div class="sh">${esc(tt.info[k])}</div><p>${L(info[k])}</p></div>`;
    if (ent.diagram) h += `<div class="diagram">${typeof ent.diagram === 'function' ? ent.diagram(S.lang) : L(ent.diagram)}</div>`;
    for (const f of ent.flags || []) h += `<div class="flag f-${f.kind}"><b>${esc(tt.flags[f.kind])}</b> ${esc(L(f))}</div>`;
    h += `<div class="sect"><button class="btn" data-act="link">${esc(tt.link)}</button></div>`;
    return h;
  }
  function readoutsHTML() {
    const ent = M.ent; if (!ent || typeof ent.readouts !== 'function') return '';
    let rows = [];
    try { rows = ent.readouts(M.params, M.anat, env(ent), S.patch.A) || []; } catch (e) { console.warn(e); }
    if (!rows.length) return '';
    return `<div class="sh">${esc(t().readouts)}</div>` + rows.map(r => `<div class="rr"><span>${esc(L(r.label))}</span><b>${esc(typeof r.value === 'object' ? L(r.value) : r.value)}</b></div>`).join('');
  }
  function renderReadouts() { const el = $('#readouts'); if (el) el.innerHTML = readoutsHTML(); }

  function onPanelClick(e) {
    const ei = e.target.closest('[data-ent]'); if (ei) { selectEntity(ei.dataset.ent); return; }
    const b = e.target.closest('button'); if (!b) return;
    const sg = b.closest('[data-seg]');
    if (sg && b.dataset.v !== undefined) {
      const name = sg.dataset.seg, v = b.dataset.v;
      if (name === 'tech') setTechnique(v);
      else if (name === 'phase') { setPhase(v); rebuild(false); renderPanel(); }
      else if (name === 'tx') { M.treated = v === '1'; rebuild(false); renderPanel(); }
      else if (name.startsWith('p:')) { const id = name.slice(2), q = M.ent.params.find(x => x.id === id); M.params[id] = coerce(q, v); rebuild(!!q.recentre); renderPanel(); }
      else if (name.startsWith('ex:')) answer(+v);
      return;
    }
    const act = b.dataset.act;
    if (act === 'prevEnt' || act === 'nextEnt') { const es = M.def.entities, i = es.indexOf(M.ent), j = (i + (act === 'nextEnt' ? 1 : -1) + es.length) % es.length; selectEntity(es[j].id); return; }
    if (act === 'close') close();
    else if (act === 'exam') startExam();
    else if (act === 'link') api.copyLink();
    else if (act === 'next') nextQuestion();
    else if (act === 'stopExam') stopExam();
    else if (act === 'again') startExam();
    else if (act === 'reveal') reveal();
  }
  function onPanelInput(e) {
    const el = e.target;
    if (el.dataset.p) {
      const q = M.ent.params.find(x => x.id === el.dataset.p);
      M.params[q.id] = coerce(q, el.type === 'checkbox' ? el.checked : el.value);
      const out = pane.querySelector(`[data-out="${q.id}"]`); if (out) out.textContent = fmt(M.params[q.id]) + (q.unit ? ' ' + q.unit : '');
      if (q.recentre && e.type === 'change') { rebuild(true); renderPanel(); } else rebuildSoon();
      return;
    }
    const act = el.dataset.act;
    if (act === 'ent' && e.type === 'change') { selectEntity(el.value); return; }
    if (act === 'compare' && e.type === 'change') { M.compare = el.value || null; api.setCompare(!!M.compare); rebuild(false); }
    else if (act === 'marks') { S.showMarks = el.checked; api.render(); }
    else if (act === 'hi') { S.hiLesion = el.checked; api.invalidate(); }
  }

  /* ---------- exam ---------- */
  function startExam() {
    if (!M.def) return;
    M.exam = { n: 0, total: M.def.examLength || 8, score: 0, r: rng((Date.now() ^ 0x5f3759df) >>> 0), q: null, done: false, answered: false };
    M.examPrev = { labels: S.labels, overlay: S.overlay, compare: M.compare, hi: S.hiLesion };
    api.setLabels('none'); api.setOverlay('none'); M.compare = null; api.setCompare(false); S.hiLesion = false;
    S.vis[LESION_ID] = 0; document.body.classList.add('exam');      // hides the vertebral-level badge and key levels (they give answers away)
    nextQuestion();
  }
  function stopExam(silent) {
    if (!M.exam) return;
    M.exam = null; S.onClick = null; S.vis[LESION_ID] = 1; document.body.classList.remove('exam');
    if (M.examPrev) { api.setLabels(M.examPrev.labels); api.setOverlay(M.examPrev.overlay); S.hiLesion = M.examPrev.hi; M.examPrev = null; }
    if (!silent && M.ent) selectEntity(M.ent.id);
  }
  function nextQuestion() {
    const X = M.exam; if (!X) return;
    if (X.n >= X.total) { X.done = true; S.onClick = null; renderExam(); return; }
    X.n++; X.answered = false; X.picked = null; X.revealed = false;
    let q = makeQuestion(M.def, X.r);
    if (q.entity) {
      const ent = entity(q.entity);
      M.ent = ent; M.params = q.params || defaults(ent); M.treated = false;
      M.tech = (ent.techniques || []).find(x => x.mod === 'ct') || null;
      S.modality = 'ct'; setPhase(ent.defaultPhase || 'portal');
      if (ent.view && ent.view.window) api.setWindow(ent.view.window);
      rebuild(true);
      api.setPlane((ent.view && ent.view.examPlane) || (ent.view && ent.view.plane) || 'axial');
      if (q.kind === 'level') {
        const lv = ent.examLevel(M.params), all = M.anat.vertebraKeys().map(k => k.replace('vertebrae_', ''));
        const lo = levelOptions(lv, all); q.options = lo.options.map(x => ({ es: x, en: x })); q.answer = lo.answer;
      }
    } else { S.patch.A = null; S.pv.A++; api.invalidate(); }
    X.q = q;
    S.onClick = q.kind === 'find' ? onExamClick : null;
    renderExam();
  }
  function answer(i) {
    const X = M.exam; if (!X || X.answered) return;
    X.answered = true; X.picked = i; X.ok = i === X.q.answer; if (X.ok) X.score++;
    reveal(); renderExam();
  }
  function onExamClick(p) {
    const X = M.exam; if (!X || X.answered || X.q.kind !== 'find') return false;
    const vox = patchVoxels(S.patch.A); let best = Infinity;
    for (const v of vox) { const d = (v[0] - p.z) ** 2 + (v[1] - p.y) ** 2 + (v[2] - p.x) ** 2; if (d < best) best = d; }
    X.answered = true; X.ok = Math.sqrt(best) <= 4; X.click = p; if (X.ok) X.score++;
    reveal(); renderExam(); return true;
  }
  function reveal() { S.vis[LESION_ID] = 1; S.hiLesion = true; if (M.exam) M.exam.revealed = true; api.invalidate(); }
  function renderExam() {
    const X = M.exam, tt = t();
    if (X.done) {
      pane.innerHTML = `<div class="mhead"><div><div class="kick">${esc(tt.exam)} · ${esc(L(M.def.title))}</div><h2>${esc(tt.examDone.replace('{s}', X.score).replace('{t}', X.total))}</h2></div></div>
        <div class="sect"><button class="btn" data-act="again">${esc(tt.again)}</button> <button class="btn" data-act="stopExam">${esc(tt.finish)}</button></div>`;
      pane.onclick = onPanelClick; return;
    }
    const q = X.q;
    let h = `<div class="mhead"><div><div class="kick">${esc(tt.exam)} · ${esc(L(M.def.title))}</div><h2>${esc(tt.examOf.replace('{n}', X.n).replace('{t}', X.total))}</h2></div>
      <div class="mbtns"><span class="score">${esc(tt.score)} ${X.score}</span><button class="btn" data-act="stopExam" title="${esc(tt.finish)}">✕</button></div></div>
      <div class="q"><p class="qp">${esc(L(q.prompt))}</p>`;
    if (q.kind === 'find' && !X.answered) h += `<p class="mhint">${esc(tt.clickHint)}</p>`;
    if (q.options) h += `<div class="qopts">${q.options.map((o, i) => {
      const cls = X.answered ? (i === q.answer ? 'ok' : i === X.picked ? 'bad' : '') : '';
      return `<button class="qo ${cls}" data-v="${i}"${X.answered ? ' disabled' : ''}>${esc(L(o))}</button>`;
    }).join('')}</div>`;
    if (X.answered) {
      h += `<div class="fb ${X.ok ? 'ok' : 'bad'}">${esc(X.ok ? tt.correct : tt.wrong)}</div>`;
      if (q.explain) h += `<p class="ex">${esc(L(q.explain))}</p>`;
      if (q.entity && q.kind !== 'identify') h += `<p class="ex">${esc(L(entity(q.entity).name))}</p>`;
      if (q.kind === 'identify' && !X.ok) h += `<p class="ex">${esc(tt.answerWas)}${esc(L(q.options[q.answer]))}</p>`;
      h += `<div class="sect"><button class="btn on" data-act="next">${esc(X.n >= X.total ? tt.finish : tt.next)}</button></div>`;
    } else if (q.kind === 'find') h += `<div class="sect"><button class="btn" data-act="reveal">${esc(tt.giveUp)}</button></div>`;
    h += `</div>`;
    pane.innerHTML = h;
    pane.onclick = e => {
      const o = e.target.closest('.qo'); if (o && !o.disabled) { answer(+o.dataset.v); return; }
      const b = e.target.closest('[data-act="reveal"]'); if (b && M.exam && !M.exam.answered) { M.exam.answered = true; M.exam.ok = false; reveal(); renderExam(); return; }
      onPanelClick(e);
    };
  }

  /* ---------- deep links + language ---------- */
  function linkParams() {
    if (!M.def || !M.ent) return '';
    return buildModuleParams({ module: M.slug, entity: M.ent.id, params: paramString(M.params, M.ent), technique: M.tech && !M.tech.default && M.tech !== (M.ent.techniques || [])[0] ? M.tech.id : null,
      compare: M.compare, treated: M.treated, phase: S.phase !== ((M.tech && M.tech.phase) || M.ent.defaultPhase || 'portal') ? S.phase : null, exam: !!M.exam });
  }
  async function boot(search) {
    const raw = parseModuleParams(search);
    if (!raw.module || !REGISTRY.some(r => r.slug === raw.module)) return;
    try {
      const def = await load(raw.module), p = parseModuleParams(search, def);
      await open(raw.module, { entity: p.entity, params: p.params, technique: p.technique, compare: p.compare, treated: p.treated, phase: p.phase, exam: p.exam });
    } catch (e) { console.error(e); }
  }
  function relang() { if (!pane.hidden) renderPanel(); if (M.ent) { S.lesionName.A = L(M.ent.short || M.ent.name); if (M.compare) S.lesionName.B = L(entity(M.compare).short || entity(M.compare).name); } }

  return { boot, open, close, selectEntity, setTechnique, startExam, stopExam, answer, relang, linkParams, state: M, showTab };
}
