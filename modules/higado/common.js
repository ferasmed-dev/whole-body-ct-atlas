// Shared helpers of the «Hígado, vía biliar y páncreas» module: bilingual text shortcuts, techniques, marks,
// the simulated enhancement of the background organs per phase, and contrast read-outs.
export const bi = (es, en) => ({ es, en });
export const opt = (v, es, en) => ({ v, es, en: en || es });
/** Technique: id, modality, verdict ('best' | 'ok' | 'bad'), label {es,en}, note {es,en}, extra (plane, window, phase, default). */
export const tq = (id, mod, verdict, label, note, extra = {}) => ({ id, mod, verdict, label, note, ...extra });
export const mark = (at, es, en, extra = {}) => ({ t: 'mark', at: at.map(Math.round), text: { es, en }, ...extra });
export const flag = (kind, es, en) => ({ kind, es, en });
export const pv = (v, phase) => (typeof v === 'number' ? v : v[phase] !== undefined ? v[phase] : v.portal);

/** Phase slider of every dynamic entity, with the times of the syllabus. */
export const PH4 = ['sin', 'arterial', 'portal', 'tardia'];
export const PHL = {
  sin: bi('Basal', 'Unenhanced'),
  arterial: bi('Arterial ~10 s', 'Arterial ~10 s'),
  portal: bi('Portal ~60 s', 'Portal ~60 s'),
  tardia: bi('Tardía ~90 s', 'Delayed ~90 s'),
};
export const PHL_PAN = { sin: bi('Basal (vacío)', 'Unenhanced'), arterial: bi('Pancreática (arterial)', 'Pancreatic (arterial)'), portal: bi('Venosa portal', 'Portal venous') };
/** Approximate HU of the background organs in each simulated phase (engine targets; portal = this study as acquired). */
export const BG = {
  liver: { sin: 55, arterial: 70, portal: 101, tardia: 85 },
  spleen: { sin: 45, arterial: 120, portal: 129, tardia: 100 },
  pancreas: { sin: 40, arterial: 120, portal: 63, tardia: 70 },
  portal: { sin: 40, arterial: 130, portal: 159, tardia: 120 },
  aorta: { sin: 40, arterial: 320, portal: 235, tardia: 130 },
};
/** Blood-pool HU in each phase (hemangioma nodules follow it). */
export const POOL = { sin: 40, arterial: 230, portal: 160, tardia: 125 };
const PHN = { sin: bi('basal', 'unenhanced'), arterial: bi('arterial', 'arterial'), portal: bi('portal', 'portal'), tardia: bi('tardía', 'delayed') };
/** "hiper / iso / hipo" wording of a lesion HU against the organ HU. */
export function rel(les, org) {
  const d = les - org;
  return d > 15 ? bi('hiperdensa', 'hyperdense') : d < -15 ? bi('hipodensa', 'hypodense') : bi('isodensa', 'isodense');
}
/** Read-out row: lesion vs organ in the current phase. */
export function contrastRO(lesHU, phase, organ = 'liver') {
  const org = BG[organ][phase], r = rel(lesHU, org), on = organ === 'liver' ? bi('hígado', 'liver') : organ === 'pancreas' ? bi('páncreas', 'pancreas') : bi(organ, organ);
  return { label: bi('En fase ' + PHN[phase].es, 'In the ' + PHN[phase].en + ' phase'), value: bi(`${Math.round(lesHU)} HU frente a ${on.es} ≈ ${org} HU → ${r.es}`, `${Math.round(lesHU)} HU vs ${on.en} ≈ ${org} HU → ${r.en}`) };
}
export const ecoRO = (es, en) => ({ label: bi('Ecografía (no simulada)', 'Ultrasound (not simulated)'), value: bi(es, en) });

/* MR signals of lesions (pseudo-MR, 0..1) */
export const MR = {
  fluid: { t1: 0.1, t2: 0.97, stir: 0.95 },
  pus: { t1: 0.2, t2: 0.85, stir: 0.85 },
  solidHypoT1: { t1: 0.3, t2: 0.62, stir: 0.6 },
  hemangioma: { t1: 0.2, t2: 0.9, stir: 0.85 },
  iso: { t1: 0.47, t2: 0.42, stir: 0.36 },
  calc: { t1: 0.04, t2: 0.04, stir: 0.04 },
  gas: { t1: 0.02, t2: 0.02, stir: 0.02 },
  blood: { t1: 0.8, t2: 0.5, stir: 0.4 },
  wall: { t1: 0.4, t2: 0.5, stir: 0.45 },
  soft: { t1: 0.38, t2: 0.55, stir: 0.5 },
};
/** Structures a peripancreatic / perihepatic collection must not overwrite. */
export const ORGANS = ['liver', 'spleen', 'stomach', 'duodenum', 'small_bowel', 'colon', 'kidney_left', 'kidney_right', 'aorta', 'inferior_vena_cava', 'portal_vein_and_splenic_vein', 'adrenal_gland_left', 'adrenal_gland_right', 'gallbladder', 'pancreas'];
export const techT = id => (id && id.id) || id || null;
