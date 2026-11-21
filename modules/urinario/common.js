// Shared text and technique helpers for the urinario module (no DOM).
export const bi = (es, en) => ({ es, en });
export const mark = (at, es, en, extra = {}) => ({ t: 'mark', at: at.map(Math.round), text: { es, en }, ...extra });
export const mcq = (prompt, options, explain, show) => ({ type: 'mcq', prompt, options, answer: 0, explain, ...(show ? { show } : {}) });
const tq = (id, mod, verdict, label, note, x = {}) => ({ id, mod, verdict, label, note, ...x });

/** Technique entries used across the module. note = what this technique shows or misses for that entity. */
export const T = {
  ctCon: (verdict, es, en, x = {}) => tq('tc-con', 'ct', verdict, bi('TC con contraste', 'Contrast CT'), bi(es, en), { window: 'soft', phase: 'portal', ...x }),
  ctSin: (verdict, es, en, x = {}) => tq('tc-sin', 'ct', verdict, bi('TC sin contraste', 'Unenhanced CT'), bi(es, en), { window: 'soft', phase: 'sin', ...x }),
  ctExc: (verdict, es, en, x = {}) => tq('uro-tc', 'ct', verdict, bi('Uro-TC (fase excretora)', 'CT urography (excretory phase)'), bi(es, en), { window: 'soft', phase: 'tardia', ...x }),
  kub: (verdict, es, en, x = {}) => tq('rx', 'rx', verdict, bi('Rx simple de abdomen', 'Plain abdominal film'), bi(es, en), { plane: 'coronal', ...x }),
  t1: (verdict, es, en, x = {}) => tq('t1', 't1', verdict, bi('RM T1', 'T1 MR'), bi(es, en), x),
  t2: (verdict, es, en, x = {}) => tq('t2', 't2', verdict, bi('RM T2', 'T2 MR'), bi(es, en), x),
  fatsat: (verdict, es, en, x = {}) => tq('stir', 'stir', verdict, bi('RM con supresión grasa (STIR)', 'Fat-suppressed MR (STIR)'), bi(es, en), x),
  inPhase: (verdict, es, en, x = {}) => tq('en-fase', 't1', verdict, bi('RM T1 en fase', 'In-phase T1 MR'), bi(es, en), x),
  oop: (verdict, es, en, x = {}) => tq('fuera-fase', 't1', verdict, bi('RM T1 fuera de fase (aprox.)', 'Opposed-phase T1 MR (approx.)'), bi(es, en), x),
};
/** True when the current technique is the opposed-phase (chemical-shift) sequence. */
export const isOOP = env => !!(env && env.technique && env.technique.id === 'fuera-fase');
export const techId = env => (env && env.technique ? env.technique.id : null);

/** Phase labels of the renal study (corticomedullary / nephrographic / excretory). */
export const RENAL_PHASES = {
  sin: bi('Sin contraste', 'Unenhanced'),
  arterial: bi('Corticomedular', 'Corticomedullary'),
  portal: bi('Nefrográfica', 'Nephrographic'),
  tardia: bi('Excretora', 'Excretory'),
};
export const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
export const fmtEs = s => String(s).replace('.', ',');
