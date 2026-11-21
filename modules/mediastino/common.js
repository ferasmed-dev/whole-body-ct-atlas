// Shared helpers of the «Mediastino y pleura» module: bilingual text shortcuts, techniques, marks and the
// compartment read-out (compartment of a mass + its differential, as in the syllabus).
import { compartmentAt, HU, MR } from './geo.js';

export const bi = (es, en) => ({ es, en });
export const opt = (v, es, en) => ({ v, es, en: en || es });
/** Technique: id, modality, verdict ('best' | 'ok' | 'bad'), label {es,en}, note {es,en}, extra (plane, window, phase, default). */
export const tq = (id, mod, verdict, label, note, extra = {}) => ({ id, mod, verdict, label, note, ...extra });
export const mark = (at, es, en, extra = {}) => ({ t: 'mark', at: at.map(Math.round), text: { es, en }, ...extra });
export const flag = (kind, es, en) => ({ kind, es, en });
export const pv = (v, phase) => (typeof v === 'number' ? v : v[phase] !== undefined ? v[phase] : v.portal);
export const SIDES = [opt('R', 'Derecho', 'Right'), opt('L', 'Izquierdo', 'Left')];
export const SIDES3 = [...SIDES, opt('both', 'Bilateral', 'Bilateral')];
export const sidesOf = s => (s === 'both' ? ['R', 'L'] : [s]);
export { HU, MR };

/* frequently used techniques */
export const T = {
  ctMed: (verdict, es, en, x = {}) => tq('ct', 'ct', verdict, bi('TC con contraste', 'Contrast CT'), bi(es, en), { window: 'mediastinum', ...x }),
  ctLung: (verdict, es, en, x = {}) => tq('ct-pulmon', 'ct', verdict, bi('TC (ventana de pulmón)', 'CT (lung window)'), bi(es, en), { window: 'lung', ...x }),
  rxPA: (verdict, es, en, x = {}) => tq('rx', 'rx', verdict, bi('Rx PA', 'PA film'), bi(es, en), { plane: 'coronal', ...x }),
  rxLat: (verdict, es, en, x = {}) => tq('rx-lat', 'rx', verdict, bi('Rx lateral', 'Lateral film'), bi(es, en), { plane: 'sagittal', ...x }),
  t2: (verdict, es, en, x = {}) => tq('t2', 't2', verdict, bi('RM T2', 'T2 MR'), bi(es, en), x),
  t1: (verdict, es, en, x = {}) => tq('t1', 't1', verdict, bi('RM T1', 'T1 MR'), bi(es, en), x),
  angio: (verdict, es, en, x = {}) => tq('angio', 'ct', verdict, bi('Angio-TC (fase arterial)', 'CT angiography (arterial phase)'), bi(es, en), { window: 'vascular', phase: 'arterial', ...x }),
};

/* compartments: names, differential (syllabus lists) */
export const COMP = { anterior: bi('Mediastino anterior', 'Anterior mediastinum'), medio: bi('Mediastino medio', 'Middle mediastinum'), posterior: bi('Mediastino posterior', 'Posterior mediastinum') };
export const DD = {
  anterior: bi('4T: timoma (la más frecuente), teratoma, «terrible» linfoma de Hodgkin, tiroides · quistes pleuropericárdicos, hiperplasia y quistes tímicos',
    '4T: thymoma (commonest), teratoma, "terrible" Hodgkin lymphoma, thyroid · pleuropericardial cysts, thymic hyperplasia and cysts'),
  medio: bi('Adenopatías (las más frecuentes), crecimiento tiroideo, quiste broncogénico, quiste de duplicación esofágico, hernia de hiato, lesión aórtica',
    'Lymph nodes (commonest), thyroid enlargement, bronchogenic cyst, oesophageal duplication cyst, hiatus hernia, aortic lesion'),
  posterior: bi('Tumores neurogénicos (los más frecuentes), hematopoyesis extramedular, patología vertebral', 'Neurogenic tumours (commonest), extramedullary haematopoiesis, vertebral disease'),
};
/** Read-out rows: compartment of point c (classic limits of the syllabus) and its differential. */
export function compRO(A, c) {
  const k = compartmentAt(A, Math.round(c[0]), Math.round(c[1]), Math.round(c[2]));
  return [
    { label: bi('Compartimento (límites clásicos)', 'Compartment (classic limits)'), value: k ? COMP[k] : bi('Fuera de los límites', 'Outside the limits') },
    { label: bi('Diagnóstico diferencial del compartimento', 'Differential of the compartment'), value: k ? DD[k] : bi('—', '—') },
  ];
}
export const NOT_BONE = ['sternum', 'costal_cartilages', 'clavicula_left', 'clavicula_right', 'spinal_cord'];
export const VESSELS = ['aorta', 'superior_vena_cava', 'brachiocephalic_vein_left', 'brachiocephalic_vein_right', 'brachiocephalic_trunk', 'common_carotid_artery_left', 'common_carotid_artery_right', 'subclavian_artery_left', 'subclavian_artery_right', 'pulmonary_vein', 'inferior_vena_cava'];
export const vertebraeKeys = A => A.vertebraKeys();
export const LUNGS = ['lung_upper_lobe_right', 'lung_middle_lobe_right', 'lung_lower_lobe_right', 'lung_upper_lobe_left', 'lung_lower_lobe_left'];
/** Integer box for the cols primitive (the engine loops over the box as given). */
export const rbox = b => b.map(Math.round);
