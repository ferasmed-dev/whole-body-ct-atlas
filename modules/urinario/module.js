// Módulo «Urinario, suprarrenales y próstata»: masas renales (Bosniak sobre el quiste real, AML, CCR por fases), tumor
// vesical, pielonefritis, uropatía obstructiva y litiasis, pruebas funcionales, suprarrenales (algoritmo del incidentaloma)
// y próstata, dibujados sobre el TC real (caso s0591). Values from the course topic; anything beyond it is 'ampliacion'.
// Files: anat.js (geometry on the masks), common.js (text and technique helpers), diagrams.js, ents-*.js (entities).
import { RENAL } from './ents-renal.js';
import { OBST } from './ents-obst.js';
import { SUPRA } from './ents-supra.js';
import { PROST } from './ents-prost.js';
import { bi, mcq } from './common.js';

export default {
  slug: 'urinario',
  title: bi('Urinario, suprarrenales y próstata', 'Urinary tract, adrenals and prostate'),
  examLength: 10,
  intro: {
    text: bi(
      'Cinco bloques y, en todos, <b>eco primero</b> y TC o RM para caracterizar: <b>masas renales</b> (quiste → Bosniak; angiomiolipoma → grasa; carcinoma → capta menos que el riñón en fase <b>nefrográfica</b>) y <b>tumor vesical</b> · <b>pielonefritis</b> (cuñas hipocaptantes) · <b>uropatía obstructiva</b> (grados I–IV, litiasis: eco → TC sin contraste; jet ureteral) · <b>suprarrenales</b> (≤ 10 UH o lavado &gt; 50 % = adenoma; PET &gt; hígado = maligno) · <b>próstata</b> (RM de elección; HBP en la zona transicional, cáncer en la periférica).',
      'Five blocks and, in all of them, <b>ultrasound first</b> and CT or MR to characterise: <b>renal masses</b> (cyst → Bosniak; angiomyolipoma → fat; carcinoma → enhances less than the kidney in the <b>nephrographic</b> phase) and <b>bladder tumour</b> · <b>pyelonephritis</b> (hypoenhancing wedges) · <b>obstructive uropathy</b> (grades I–IV, stones: ultrasound → unenhanced CT; ureteral jet) · <b>adrenals</b> (≤ 10 HU or washout &gt; 50 % = adenoma; PET &gt; liver = malignant) · <b>prostate</b> (MR is the choice; BPH in the transition zone, cancer in the peripheral zone).'),
    table: {
      es: [['Bloque', 'Prueba clave', 'Cifra clave'],
        ['Quiste renal', 'TC sin y con contraste', 'Bosniak I–II nada · IIF seguimiento · III 50 % · IV 100 % malignos'],
        ['Carcinoma renal', 'TC, fase nefrográfica', 'Trombo en vena renal o cava: 30 %'],
        ['Litiasis', 'Eco 1.ª · TC sin contraste 2.ª', 'Rx 45 % · eco 96 % (renal) · TC 94–100 %'],
        ['Suprarrenal', 'TC sin contraste → lavado', '≤ 10 UH · lavado > 50 % · mielolipoma < −20 UH'],
        ['Próstata', 'Eco → RM de elección', 'Volumen 0,5 × D1 × D2 × D3 · > 20 cc patológico']],
      en: [['Block', 'Key test', 'Key figure'],
        ['Renal cyst', 'Unenhanced and contrast CT', 'Bosniak I–II nothing · IIF follow-up · III 50 % · IV 100 % malignant'],
        ['Renal carcinoma', 'CT, nephrographic phase', 'Renal vein or IVC thrombus: 30 %'],
        ['Stones', 'Ultrasound 1st · unenhanced CT 2nd', 'Film 45 % · ultrasound 96 % (renal) · CT 94–100 %'],
        ['Adrenal', 'Unenhanced CT → washout', '≤ 10 HU · washout > 50 % · myelolipoma < −20 HU'],
        ['Prostate', 'Ultrasound → MR is the choice', 'Volume 0.5 × D1 × D2 × D3 · > 20 cc abnormal']],
    },
  },
  groups: [
    { id: 'quiste', es: 'Quistes renales (Bosniak)', en: 'Renal cysts (Bosniak)' },
    { id: 'solido', es: 'Tumores renales y vesicales', en: 'Renal and bladder tumours' },
    { id: 'inf', es: 'Pielonefritis', en: 'Pyelonephritis' },
    { id: 'obst', es: 'Uropatía obstructiva, litiasis y pruebas funcionales', en: 'Obstructive uropathy, stones and functional tests' },
    { id: 'supra', es: 'Suprarrenales', en: 'Adrenals' },
    { id: 'prost', es: 'Próstata', en: 'Prostate' },
  ],
  entities: [...RENAL, ...OBST, ...SUPRA, ...PROST],
  questions: [
    mcq(bi('¿Por qué se usa la clasificación de Bosniak en los quistes renales?', 'Why is the Bosniak classification used for renal cysts?'),
      [bi('Porque hasta un 10 % de los carcinomas renales se presentan como masas quísticas: decide entre no hacer nada, seguir u operar', 'Because up to 10 % of renal carcinomas present as cystic masses: it decides between doing nothing, follow-up or surgery'), bi('Porque todos los quistes renales acaban malignizando', 'Because every renal cyst eventually becomes malignant'), bi('Para decidir si hace falta biopsia percutánea en todos', 'To decide whether all of them need percutaneous biopsy'), bi('Para calcular la función renal residual', 'To estimate residual renal function')],
      bi('Hasta un 10 % de los CCR son quísticos.', 'Up to 10 % of RCCs are cystic.'), 'bosniak'),
    mcq(bi('Quiste renal con tejido nodular que capta contraste. ¿Bosniak y actitud?', 'Renal cyst with enhancing nodular tissue. Bosniak category and management?'),
      [bi('Bosniak IV (100 % malignos): cirugía', 'Bosniak IV (100 % malignant): surgery'), bi('Bosniak IIF: seguimiento con TC', 'Bosniak IIF: CT follow-up'), bi('Bosniak II: sin seguimiento', 'Bosniak II: no follow-up'), bi('Bosniak I: nada más', 'Bosniak I: nothing further')],
      bi('Tejido nodular que capta = IV.', 'Enhancing nodular tissue = IV.'), 'bosniak'),
    mcq(bi('Lesión renal hiperecogénica en eco. ¿Qué es lo más probable y cómo lo confirmas?', 'Hyperechoic renal lesion on ultrasound. What is most likely and how do you confirm it?'),
      [bi('Angiomiolipoma; confirmar la grasa con TC sin contraste (UH negativas), porque el carcinoma también puede ser hiperecogénico', 'Angiomyolipoma; confirm the fat with unenhanced CT (negative HU), because carcinoma can also be hyperechoic'), bi('Quiste simple; no hace falta nada más', 'Simple cyst; nothing else needed'), bi('Carcinoma renal; nefrectomía directa', 'Renal carcinoma; straight to nephrectomy'), bi('Angiomiolipoma; confirmarlo con Rx simple', 'Angiomyolipoma; confirm with a plain film')],
      bi('Hiperecogénico → buscar grasa en la TC sin contraste.', 'Hyperechoic → look for fat on unenhanced CT.'), 'aml'),
    mcq(bi('¿En qué fase de la TC se detecta mejor el carcinoma de células renales y cómo se ve?', 'In which CT phase is renal cell carcinoma best detected and how does it look?'),
      [bi('Nefrográfica: capta contraste, pero menos que el parénquima adyacente', 'Nephrographic: it enhances, but less than the adjacent parenchyma'), bi('Sin contraste: claramente hiperdenso', 'Unenhanced: clearly hyperdense'), bi('Excretora: capta más que el riñón', 'Excretory: enhances more than the kidney'), bi('Corticomedular: no capta', 'Corticomedullary: no enhancement')],
      bi('Sin contraste es isodenso; la nefrográfica es la más eficaz.', 'Unenhanced it is isodense; the nephrographic phase is the best.'), 'ccr'),
    mcq(bi('¿Qué técnica distingue las capas de la pared vesical para estadificar un tumor?', 'Which technique separates the bladder wall layers to stage a tumour?'),
      [bi('La RM', 'MR'), bi('La eco transabdominal', 'Transabdominal ultrasound'), bi('La urografía IV', 'IV urography'), bi('La Rx simple', 'Plain film')],
      bi('RM: mayor resolución, distingue las capas y da el estadio.', 'MR: higher resolution, separates the layers and gives the stage.'), 'vesical'),
    mcq(bi('Embarazada con sospecha de pielonefritis complicada. ¿Qué técnica y qué esperas ver?', 'Pregnant woman with suspected complicated pyelonephritis. Which technique and what do you expect?'),
      [bi('RM: riñón agrandado por edema y restricción en difusión en las zonas infectadas', 'MR: kidney enlarged by oedema and restricted diffusion in the infected areas'), bi('TC con contraste: cuñas hipocaptantes', 'Contrast CT: hypoenhancing wedges'), bi('Urografía IV: defecto de repleción', 'IV urography: filling defect'), bi('Rx simple: litiasis', 'Plain film: stone')],
      bi('RM en embarazadas, alérgicos y niños.', 'MR in pregnancy, allergy and children.'), 'pielonefritis'),
    mcq(bi('Paciente con cólico nefrítico: ¿cuál es la 1.ª técnica y cuál la 2.ª?', 'Patient with renal colic: which is the 1st test and which the 2nd?'),
      [bi('Eco primero; TC sin contraste después (S 94–100 %, también ve causas extraurinarias)', 'Ultrasound first; unenhanced CT next (Se 94–100 %, also shows extra-urinary causes)'), bi('Rx simple primero (S 45 %); urografía después', 'Plain film first (Se 45 %); urography next'), bi('TC con contraste primero; RM después', 'Contrast CT first; MR next'), bi('Urografía primero; eco después', 'Urography first; ultrasound next')],
      bi('Eco 1.ª (96 % renal) → TC sin contraste 2.ª.', 'Ultrasound 1st (96 % renal) → unenhanced CT 2nd.'), 'litiasis'),
    mcq(bi('Hidronefrosis en eco, pero el Doppler muestra jet ureteral en la vejiga. ¿Interpretación?', 'Hydronephrosis on ultrasound, but Doppler shows a ureteral jet in the bladder. Interpretation?'),
      [bi('Dilatación sin obstrucción (p. ej., reflujo vesicoureteral)', 'Dilatation without obstruction (e.g. vesicoureteric reflux)'), bi('Obstrucción completa: derivación urgente', 'Complete obstruction: urgent drainage'), bi('Obstrucción sin dilatación', 'Obstruction without dilatation'), bi('Litiasis en la unión ureterovesical', 'Stone at the vesicoureteric junction')],
      bi('Si se ve el jet, no hay obstrucción.', 'If the jet is seen, there is no obstruction.'), 'jet'),
    mcq(bi('Incidentaloma suprarrenal de 2 cm con 6 UH en TC sin contraste. ¿Qué haces?', 'Adrenal incidentaloma, 2 cm, 6 HU on unenhanced CT. What do you do?'),
      [bi('Nada más: es un adenoma rico en lípidos (≤ 10 UH)', 'Nothing further: it is a lipid-rich adenoma (≤ 10 HU)'), bi('TC con contraste y fase tardía para el lavado', 'Contrast CT with a delayed phase for washout'), bi('PET-FDG', 'FDG-PET'), bi('Biopsia percutánea', 'Percutaneous biopsy')],
      bi('≤ 10 UH, redonda y lisa: no precisa más estudios.', '≤ 10 HU, round and smooth: no further tests.'), 'incidentaloma'),
    mcq(bi('Lesión suprarrenal de 25 UH que, tras contraste, pierde el 60 % de la atenuación en fase tardía. ¿Diagnóstico?', 'Adrenal lesion of 25 HU that loses 60 % of its attenuation on the delayed phase after contrast. Diagnosis?'),
      [bi('Adenoma (lavado > 50 %)', 'Adenoma (washout > 50 %)'), bi('Metástasis', 'Metastasis'), bi('Mielolipoma', 'Myelolipoma'), bi('Carcinoma suprarrenal', 'Adrenocortical carcinoma')],
      bi('> 10 UH obliga al contraste; el lavado > 50 % es de adenoma.', '> 10 HU calls for contrast; washout > 50 % means adenoma.'), 'incidentaloma'),
    mcq(bi('Paciente con cáncer de pulmón y masa suprarrenal bilateral que no lava y capta más que el hígado en PET. ¿Qué es?', 'Lung cancer patient with bilateral adrenal masses that do not wash out and take up more than the liver on PET. What is it?'),
      [bi('Metástasis suprarrenales', 'Adrenal metastases'), bi('Adenomas bilaterales', 'Bilateral adenomas'), bi('Mielolipomas', 'Myelolipomas'), bi('Hiperplasia suprarrenal', 'Adrenal hyperplasia')],
      bi('Sin lavado (> 30 UH), PET > hígado, 50 % bilaterales.', 'No washout (> 30 HU), PET > liver, 50 % bilateral.'), 'metastasis-supra'),
    mcq(bi('Masa suprarrenal con densidad de −85 UH en la TC sin contraste. ¿Qué es?', 'Adrenal mass measuring −85 HU on unenhanced CT. What is it?'),
      [bi('Mielolipoma (< −20 UH: grasa madura)', 'Myelolipoma (< −20 HU: mature fat)'), bi('Adenoma pobre en lípidos', 'Lipid-poor adenoma'), bi('Metástasis', 'Metastasis'), bi('Carcinoma suprarrenal', 'Adrenocortical carcinoma')],
      bi('UH negativas por debajo de −20 = grasa macroscópica.', 'Negative HU below −20 = macroscopic fat.'), 'mielolipoma'),
    mcq(bi('¿Dónde asienta el cáncer de próstata y cómo se ve en RM T2?', 'Where does prostate cancer arise and how does it look on T2 MR?'),
      [bi('En la zona periférica, como lesión hipointensa (la periférica normal es hiperintensa)', 'In the peripheral zone, as a hypointense lesion (the normal peripheral zone is hyperintense)'), bi('En la zona transicional, hiperintensa', 'In the transition zone, hyperintense'), bi('En la zona central, isointensa', 'In the central zone, isointense'), bi('En el estroma fibromuscular anterior, hiperintensa', 'In the anterior fibromuscular stroma, hyperintense')],
      bi('«Periferia = Peligro».', '"Periphery = Peril".'), 'ca-prostata'),
    mcq(bi('¿Qué valor de volumen prostático es patológico en la eco transabdominal y cómo se calcula?', 'Which prostate volume is abnormal on transabdominal ultrasound and how is it calculated?'),
      [bi('> 20 cm³; volumen = 0,5 × D1 × D2 × D3', '> 20 cm³; volume = 0.5 × D1 × D2 × D3'), bi('> 50 cm³; volumen = D1 × D2 × D3', '> 50 cm³; volume = D1 × D2 × D3'), bi('> 10 cm³; volumen = 0,5 × D1 × D2', '> 10 cm³; volume = 0.5 × D1 × D2'), bi('> 20 cm³; volumen = π × D1 × D2 × D3', '> 20 cm³; volume = π × D1 × D2 × D3')],
      bi('> 20 cm³ (normal 20–25 g o 20 cc).', '> 20 cm³ (normal 20–25 g or 20 cc).'), 'hbp'),
  ],
};
