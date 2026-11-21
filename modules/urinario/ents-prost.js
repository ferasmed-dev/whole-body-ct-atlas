// Prostate: zonal anatomy, HBP (volume 0.5 × D1 × D2 × D3) and cancer (peripheral zone, T2-hypo). The prostate mask is
// empty and the study ends at mid-bladder, so the gland is a stand-in ellipsoid at the bottom of the study.
import { bi, mark, T } from './common.js';
import { prostate, prostateGeom, prostateVolume } from './anat.js';
import { prostateDiagram } from './diagrams.js';

const NORMAL = [30, 40, 30];      // D1 craniocaudal, D2 transverse, D3 AP (mm): ≈ 18 cc
const KIT = bi('No hay máscara de próstata y este TC termina a mitad de la vejiga, por encima de la glándula: se dibuja una próstata elipsoidal con sus zonas al final del estudio, contra la base vesical. Haría falta un caso masculino con máscara «prostate» y un estudio de RM.', 'There is no prostate mask and this CT ends at mid-bladder, above the gland: an ellipsoid prostate with its zones is drawn at the bottom of the study, against the bladder base. It needs a male case with a "prostate" mask and an MR study.');
const zoneMarks = (A, d) => {
  const g = prostateGeom(A, d), [zc, yc, xc] = g.c, [rz, rx, ry] = g.r;
  return [
    mark([zc, yc - ry * 0.8, xc], 'Estroma fibromuscular anterior', 'Anterior fibromuscular stroma', { dx: -190, dy: -40, planes: ['axial', 'sagittal'] }),
    mark([zc, yc - ry * 0.15, xc - rx * 0.3], 'Zona transicional', 'Transition zone', { dx: -170, dy: 30, planes: ['axial'] }),
    mark([zc, yc + ry * 0.75, xc + rx * 0.45], 'Zona periférica', 'Peripheral zone', { dx: 60, dy: 40, planes: ['axial'] }),
    mark([zc - rz * 0.6, yc + ry * 0.2, xc], 'Zona central (base)', 'Central zone (base)', { dx: 60, dy: -50, planes: ['sagittal'] }),
  ];
};
const prostView = (d, zoom = 3.2) => ({ plane: 'axial', window: 'soft', zoom, at: (p, A) => prostateGeom(A, d(p)).c, examPlane: 'axial' });
const dims = p => [p.d1 * 10, p.d2 * 10, p.d3 * 10];

export const PROST = [
  {
    id: 'prostata-zonal', group: 'prost', tag: 'kit', exam: false, kitNote: KIT,
    name: bi('Próstata: técnicas y anatomía zonal', 'Prostate: techniques and zonal anatomy'),
    short: bi('Próstata (zonas)', 'Prostate (zones)'),
    view: prostView(() => NORMAL),
    techniques: [
      T.t2('best', 'RM de elección. T2: zona periférica homogénea e hiperintensa; transicional heterogénea e hipointensa.', 'MR is the choice. T2: peripheral zone homogeneous and hyperintense; transition zone heterogeneous and hypointense.', { default: true }),
      T.t1('ok', 'T1: adenopatías, lesiones óseas, hemorragia posbiopsia (las zonas no se separan).', 'T1: nodes, bone lesions, post-biopsy haemorrhage (the zones are not separated).'),
      { id: 'tc', mod: 'ct', window: 'soft', verdict: 'bad', label: bi('TC', 'CT'), note: bi('Poca utilidad diagnóstica: no separa bien próstata y vesículas seminales ni las zonas; solo extensión a distancia.', 'Little diagnostic value: does not separate prostate, seminal vesicles or zones well; distant spread only.') },
    ],
    build: (p, A) => [prostate(A, { d: NORMAL }), ...zoneMarks(A, NORMAL)],
    readouts: () => [
      { label: bi('Volumen (0,5 × D1 × D2 × D3)', 'Volume (0.5 × D1 × D2 × D3)'), value: bi(`0,5 × 3 × 4 × 3 = ${String(prostateVolume(NORMAL)).replace('.', ',')} cc`, `0.5 × 3 × 4 × 3 = ${prostateVolume(NORMAL)} cc`) },
      { label: bi('Eco transabdominal', 'Transabdominal ultrasound'), value: bi('Tamaño y residuo; no ve el cáncer', 'Size and residual volume; does not show cancer') },
      { label: bi('Eco endorrectal', 'Endorectal ultrasound'), value: bi('Mejor anatomía; guía la biopsia', 'Better anatomy; guides biopsy') },
    ],
    info: {
      where: bi('Glándula aproximada al final del estudio, contra la base de la vejiga.', 'Gland approximated at the bottom of the study, against the bladder base.'),
      see: bi('Zona <b>periférica</b> (posterolateral): homogénea e <b>hiperintensa en T2</b> · zona <b>transicional</b> (anterocentral): heterogénea e <b>hipointensa</b> · zona central (base) · estroma fibromuscular anterior.', '<b>Peripheral</b> zone (posterolateral): homogeneous and <b>T2-hyperintense</b> · <b>transition</b> zone (anterocentral): heterogeneous and <b>hypointense</b> · central zone (base) · anterior fibromuscular stroma.'),
      technique: bi('Eco primero: suprapúbica (sonda de baja frecuencia, vejiga llena: tamaño y residuo posmiccional; no separa periférica y transicional) y endorrectal (alta frecuencia: anatomía, biopsia, tratamientos mínimamente invasivos). RM de elección (endorrectal: mejor señal, espectroscopia, estadificación). TC solo para la extensión.', 'Ultrasound first: suprapubic (low-frequency probe, full bladder: size and post-void residue; does not separate peripheral and transition zones) and endorectal (high frequency: anatomy, biopsy, minimally invasive treatment). MR is the choice (endorectal: better signal, spectroscopy, staging). CT for spread only.'),
      tip: bi('«Periferia = Peligro, Transición = Tamaño»: el cáncer asienta en la periférica, la HBP en la transicional. Cambia de RM T2 a TC: en TC las zonas desaparecen.', '"Periphery = Peril, Transition = Tissue growth": cancer arises in the peripheral zone, HBP in the transition zone. Switch from T2 MR to CT: on CT the zones vanish.'),
    },
    diagram: lang => prostateDiagram(lang),
    flags: [{ kind: 'ampliacion', es: 'Posición y tamaño de la próstata estimados (fuera del campo de este TC); la señal de cada zona es una pseudo-RM.', en: 'Prostate position and size estimated (outside this CT\'s field of view); the signal of each zone is a pseudo-MR.' }],
  },
  {
    id: 'hbp', group: 'prost', tag: 'ct-aprox', extraTags: ['sim'],
    name: bi('Hipertrofia benigna de próstata (HBP)', 'Benign prostatic hyperplasia (BPH)'),
    short: bi('HBP', 'BPH'),
    view: prostView(dims, 2.4),
    params: [
      { id: 'd1', type: 'range', label: bi('D1 craneocaudal', 'D1 craniocaudal'), min: 2.5, max: 6, step: 0.5, value: 4.5, unit: 'cm' },
      { id: 'd2', type: 'range', label: bi('D2 transversal', 'D2 transverse'), min: 3, max: 7, step: 0.5, value: 5.5, unit: 'cm' },
      { id: 'd3', type: 'range', label: bi('D3 anteroposterior', 'D3 anteroposterior'), min: 2.5, max: 6, step: 0.5, value: 4.5, unit: 'cm' },
      { id: 'calc', type: 'toggle', label: bi('Calcificaciones en la cápsula quirúrgica', 'Calcifications in the surgical capsule'), value: true },
    ],
    techniques: [
      { id: 'tc', mod: 'ct', window: 'soft', verdict: 'ok', default: true, label: bi('TC', 'CT'), note: bi('Se ve el tamaño y la impronta en la vejiga, no las zonas. El volumen se mide con la eco transabdominal.', 'Shows the size and the bladder impression, not the zones. Volume is measured with transabdominal ultrasound.') },
      T.t2('ok', 'Zona transicional agrandada, heterogénea y nodular; la periférica queda comprimida.', 'Enlarged, heterogeneous, nodular transition zone; the peripheral zone is compressed.'),
    ],
    build: (p, A) => {
      const d = dims(p), g = prostateGeom(A, d);
      return [prostate(A, { d, calc: p.calc }), mark(g.c, 'Zona transicional agrandada', 'Enlarged transition zone', { dx: 60, dy: -50 })];
    },
    readouts: (p) => {
      const v = prostateVolume(dims(p)), f = x => String(x).replace('.', ',');
      return [
        { label: bi('Volumen = 0,5 × D1 × D2 × D3', 'Volume = 0.5 × D1 × D2 × D3'), value: bi(`0,5 × ${f(p.d1)} × ${f(p.d2)} × ${f(p.d3)} = ${f(v.toFixed(1))} cc`, `0.5 × ${p.d1} × ${p.d2} × ${p.d3} = ${v.toFixed(1)} cc`) },
        { label: bi('Lectura', 'Reading'), value: v > 20 ? bi('> 20 cc: patológico (HBP)', '> 20 cc: abnormal (BPH)') : bi('≤ 20 cc: normal', '≤ 20 cc: normal') },
      ];
    },
    info: {
      where: bi('Glándula aproximada al final del estudio, contra la base de la vejiga (este TC termina por encima de la próstata).', 'Gland approximated at the bottom of the study, against the bladder base (this CT ends above the prostate).'),
      see: bi('Hipertrofia de la <b>zona transicional</b> del adulto (adenoma prostático). Aspecto variable: homogéneo, heterogéneo, calcificaciones en la cápsula quirúrgica.', 'Hyperplasia of the adult <b>transition zone</b> (prostatic adenoma). Variable look: homogeneous, heterogeneous, calcifications in the surgical capsule.'),
      technique: bi('Eco transabdominal: volumen prostático = <b>0,5 × D1 × D2 × D3</b> (craneocaudal, transversal y anteroposterior); <b>&gt; 20 cm³</b> es patológico. No sirve para detectar el cáncer.', 'Transabdominal ultrasound: prostate volume = <b>0.5 × D1 × D2 × D3</b> (craniocaudal, transverse and anteroposterior); <b>&gt; 20 cm³</b> is abnormal. Not useful to detect cancer.'),
      tip: bi('Mueve D1–D3 y mira cómo la glándula empuja la base de la vejiga.', 'Move D1–D3 and watch the gland push into the bladder base.'),
    },
    flags: [
      { kind: 'revisar', es: 'El temario da «> 20 cm³ es patológico» y a la vez «normal 20–25 g o 20 cc»: los dos rangos se solapan. El simulador usa > 20 cc.', en: 'The syllabus says "> 20 cm³ is abnormal" and also "normal 20–25 g or 20 cc": the two ranges overlap. The simulator uses > 20 cc.' },
      { kind: 'ampliacion', es: 'Posición estimada: la próstata está fuera del campo de este TC; se dibuja en la base vesical para poder medirla.', en: 'Estimated position: the prostate is outside this CT\'s field of view; it is drawn at the bladder base so it can be measured.' },
    ],
  },
  {
    id: 'ca-prostata', group: 'prost', tag: 'kit', extraTags: ['sim'], exam: false, kitNote: KIT,
    name: bi('Cáncer de próstata', 'Prostate cancer'),
    short: bi('Cáncer de próstata', 'Prostate cancer'),
    view: prostView(() => NORMAL),
    params: [
      { id: 'side', type: 'select', label: bi('Lado', 'Side'), options: [{ v: 'R', es: 'Derecho', en: 'Right' }, { v: 'L', es: 'Izquierdo', en: 'Left' }], value: 'R' },
      { id: 'mm', type: 'range', label: bi('Tamaño', 'Size'), min: 6, max: 18, step: 1, value: 12, unit: 'mm' },
      { id: 'ratio', type: 'range', label: bi('Espectroscopia: (colina + creatina) / citrato', 'Spectroscopy: (choline + creatine) / citrate'), min: 0.3, max: 1.6, step: 0.1, value: 1.1 },
    ],
    techniques: [
      T.t2('best', 'Lesión hipointensa en T2 en la zona periférica (normalmente hiperintensa). Alto valor predictivo negativo.', 'T2-hypointense lesion in the peripheral zone (normally hyperintense). High negative predictive value.', { default: true }),
      { id: 'tc', mod: 'ct', window: 'soft', verdict: 'bad', label: bi('TC', 'CT'), note: bi('No se ve: el TC solo sirve para la extensión a distancia (adenopatías, metástasis óseas).', 'Not visible: CT is only for distant spread (nodes, bone metastases).') },
    ],
    build: (p, A) => {
      const g = prostateGeom(A, NORMAL), [zc, yc, xc] = g.c, [, rx, ry] = g.r;
      return [prostate(A, { d: NORMAL, label: 'keep', lesion: { side: p.side, mm: p.mm } }), mark([zc, yc + ry * 0.66, xc + (p.side === 'R' ? -1 : 1) * rx * 0.42], 'Foco hipointenso en T2 (zona periférica)', 'T2-hypointense focus (peripheral zone)', { dx: 60, dy: 40 })];
    },
    readouts: (p) => [
      { label: bi('(colina + creatina) / citrato', '(choline + creatine) / citrate'), value: bi(p.ratio.toFixed(1).replace('.', ','), p.ratio.toFixed(1)) },
      { label: bi('Espectroscopia', 'Spectroscopy'), value: p.ratio > 0.8 ? bi('> 0,7–0,8: sugiere cáncer (colina ↑, citrato ↓)', '> 0.7–0.8: suggests cancer (choline ↑, citrate ↓)') : p.ratio >= 0.7 ? bi('En el límite (0,7–0,8)', 'Borderline (0.7–0.8)') : bi('< 0,7: no sugiere cáncer', '< 0.7: does not suggest cancer') },
      { label: bi('Eco endorrectal', 'Endorectal ultrasound'), value: bi('Zona hipoecoica periférica, ↑ Doppler; baja eficacia', 'Hypoechoic peripheral area, ↑ Doppler; low yield') },
    ],
    info: {
      where: bi('Zona periférica (posterolateral) de la glándula aproximada.', 'Peripheral (posterolateral) zone of the approximated gland.'),
      see: bi('RM: lesión <b>hipointensa en T2 en la zona periférica</b> (normalmente hiperintensa). Mejora con espectroscopia y difusión: <b>colina alta y citrato bajo</b>; (colina + creatina) / citrato <b>&gt; 0,7–0,8</b> sugiere cáncer.', 'MR: <b>T2-hypointense lesion in the peripheral zone</b> (normally hyperintense). Improved by spectroscopy and diffusion: <b>high choline, low citrate</b>; (choline + creatine) / citrate <b>&gt; 0.7–0.8</b> suggests cancer.'),
      technique: bi('Diagnóstico: tacto rectal, PSA y biopsia. Imagen si: PSA elevado con biopsias negativas · PSA elevado y riesgo clínico antes de la biopsia · monitorización terapéutica. Eco endorrectal: baja eficacia; RM: alto valor predictivo negativo.', 'Diagnosis: digital rectal exam, PSA and biopsy. Imaging if: raised PSA with negative biopsies · raised PSA and clinical risk before biopsy · treatment monitoring. Endorectal ultrasound: low yield; MR: high negative predictive value.'),
      differential: bi('HBP: zona transicional, no periférica.', 'BPH: transition zone, not peripheral.'),
      tip: bi('3.ª causa de muerte por cáncer en varones; células tumorales en > 70 % de las autopsias de varones de 70–79 años. Cambia a TC: el foco desaparece.', '3rd cause of cancer death in men; tumour cells in > 70 % of autopsies of men aged 70–79. Switch to CT: the focus disappears.'),
    },
    diagram: lang => prostateDiagram(lang),
    flags: [
      { kind: 'ampliacion', es: 'En el cociente de espectroscopia el metabolito es la creatina, no la «creatinina».', en: 'The spectroscopy ratio uses creatine, not "creatinine".' },
      { kind: 'ampliacion', es: 'El temario no menciona PI-RADS. Hoy la RM multiparamétrica se informa con PI-RADS v2.1 (T2, difusión y contraste dinámico) y la espectroscopia ha quedado en desuso.', en: 'The syllabus does not mention PI-RADS. Multiparametric MR is now reported with PI-RADS v2.1 (T2, diffusion and dynamic contrast) and spectroscopy has fallen out of use.' },
    ],
  },
];
