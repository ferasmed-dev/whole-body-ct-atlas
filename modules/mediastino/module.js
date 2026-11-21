// Módulo «Mediastino y pleura»: técnicas, compartimentos y masas mediastínicas, aorta torácica, arterias pulmonares,
// neumomediastino, pleura, pared torácica y diafragma, dibujados sobre el TC real (caso s0591).
// Every value comes from the course topic; anything beyond it is flagged 'ampliacion'.
// Files: geo.js (geometry on the masks), common.js (text helpers), ents-*.js (entities by region).
import { MED } from './ents-med.js';
import { VASC } from './ents-vasc.js';
import { PLEURA } from './ents-pleura.js';
import { PARED } from './ents-pared.js';
import { bi } from './common.js';

const mcq = (prompt, options, explain, show) => ({ type: 'mcq', prompt, options, answer: 0, explain, ...(show ? { show } : {}) });

export default {
  slug: 'mediastino',
  title: bi('Mediastino y pleura', 'Mediastinum and pleura'),
  examLength: 10,
  intro: {
    text: bi(
      'El tórax de dentro afuera: <b>mediastino</b> (tres compartimentos, cada uno con su masa más frecuente: <b>T-A-N</b>, timoma · adenopatías · neurogénicos), <b>aorta torácica</b> (umbrales del aneurisma «5-4 / 6-7» y Stanford: A → cirugía urgente), <b>arterias pulmonares</b> (HTP, TEP: prueba de elección TC), <b>neumomediastino</b>, <b>pleura</b> (derrames, engrosamiento, asbesto, neumotórax a tensión), <b>pared</b> y <b>diafragma</b>. Técnicas: Rx → TC; RM para mediastino y aorta; ecografía para el derrame.',
      'The chest from inside out: <b>mediastinum</b> (three compartments, each with its commonest mass: <b>T-A-N</b>, thymoma · lymph nodes · neurogenic), <b>thoracic aorta</b> (aneurysm thresholds "5-4 / 6-7" and Stanford: A → urgent surgery), <b>pulmonary arteries</b> (PH, PE: CT is the test of choice), <b>pneumomediastinum</b>, <b>pleura</b> (effusions, thickening, asbestos, tension pneumothorax), <b>chest wall</b> and <b>diaphragm</b>. Techniques: film → CT; MR for mediastinum and aorta; ultrasound for effusion.'),
    table: {
      es: [['Compartimento', 'Límite posterior', 'Contenido', 'Masa más frecuente'], ['Anterior', 'Pared anterior traqueal, pared posterior del corazón y VCI', 'Timo, grasa, ganglios, corazón, aorta ascendente, tronco pulmonar', 'Timoma (4T)'], ['Medio', '1 cm por detrás del borde anterior vertebral', 'Ganglios, tráquea y bronquios, esófago, arco aórtico, aa. pulmonares', 'Adenopatías'], ['Posterior', '—', 'Espacio paravertebral, vértebras, estructuras neurales, aorta descendente', 'Tumores neurogénicos']],
      en: [['Compartment', 'Posterior limit', 'Contents', 'Commonest mass'], ['Anterior', 'Anterior tracheal wall, posterior heart wall and IVC', 'Thymus, fat, nodes, heart, ascending aorta, pulmonary trunk', 'Thymoma (4T)'], ['Middle', '1 cm behind the anterior vertebral border', 'Nodes, trachea and bronchi, oesophagus, aortic arch, pulmonary arteries', 'Lymph nodes'], ['Posterior', '—', 'Paravertebral space, vertebrae, neural structures, descending aorta', 'Neurogenic tumours']],
    },
  },
  groups: [
    { id: 'tec', es: 'Técnicas y compartimentos', en: 'Techniques and compartments' },
    { id: 'ant', es: 'Mediastino anterior', en: 'Anterior mediastinum' },
    { id: 'med', es: 'Mediastino medio', en: 'Middle mediastinum' },
    { id: 'post', es: 'Mediastino posterior', en: 'Posterior mediastinum' },
    { id: 'aorta', es: 'Aorta torácica', en: 'Thoracic aorta' },
    { id: 'pulm', es: 'Arterias pulmonares y neumomediastino', en: 'Pulmonary arteries and pneumomediastinum' },
    { id: 'pleura', es: 'Pleura: cisuras y derrame', en: 'Pleura: fissures and effusion' },
    { id: 'pleura2', es: 'Pleura: engrosamiento, asbesto y neumotórax', en: 'Pleura: thickening, asbestos and pneumothorax' },
    { id: 'pared', es: 'Pared torácica', en: 'Chest wall' },
    { id: 'dia', es: 'Diafragma', en: 'Diaphragm' },
  ],
  entities: [...MED, ...VASC, ...PLEURA, ...PARED],
  questions: [
    mcq(bi('¿Cuál es la masa más frecuente de cada compartimento mediastínico?', 'What is the commonest mass of each mediastinal compartment?'),
      [bi('Anterior: timoma · medio: adenopatías · posterior: tumores neurogénicos', 'Anterior: thymoma · middle: lymph nodes · posterior: neurogenic tumours'), bi('Anterior: linfoma · medio: bocio · posterior: hernia de hiato', 'Anterior: lymphoma · middle: goitre · posterior: hiatus hernia'), bi('Anterior: teratoma · medio: quiste broncogénico · posterior: adenopatías', 'Anterior: teratoma · middle: bronchogenic cyst · posterior: lymph nodes'), bi('Anterior: adenopatías · medio: timoma · posterior: neurogénicos', 'Anterior: lymph nodes · middle: thymoma · posterior: neurogenic')],
      bi('«T-A-N»: timoma, adenopatías, neurogénicos.', '"T-A-N": thymoma, lymph nodes (adenopatías), neurogenic.'), 'compartimentos'),
    mcq(bi('¿Qué diferencia el comportamiento del linfoma de Hodgkin del de un timoma invasivo?', 'What distinguishes the behaviour of Hodgkin lymphoma from an invasive thymoma?'),
      [bi('El linfoma invade y comprime (VCS, corazón) pero no infiltra; el timoma invasivo sí infiltra', 'Lymphoma invades and compresses (SVC, heart) but does not infiltrate; invasive thymoma does infiltrate'), bi('El linfoma infiltra y el timoma solo comprime', 'Lymphoma infiltrates and thymoma only compresses'), bi('Los dos infiltran por igual', 'Both infiltrate alike'), bi('Ninguno comprime estructuras vecinas', 'Neither compresses neighbouring structures')],
      bi('«Invade y comprime, pero no infiltra» es el linfoma.', '"Invades and compresses, but does not infiltrate" is lymphoma.'), 'linfoma'),
    mcq(bi('En una Rx ves una masa mediastínica media retrocardíaca con aire en su interior. ¿Qué sospechas y cuál es su mecanismo más habitual?', 'A film shows a retrocardiac middle mediastinal mass with air inside. What do you suspect and what is its usual mechanism?'),
      [bi('Hernia de hiato por deslizamiento: la UEG y parte del estómago suben por el hiato', 'Sliding hiatus hernia: the GOJ and part of the stomach rise through the hiatus'), bi('Neumomediastino por rotura esofágica', 'Pneumomediastinum from oesophageal rupture'), bi('Quiste broncogénico infectado', 'Infected bronchogenic cyst'), bi('Hernia de Bochdalek', 'Bochdalek hernia')],
      bi('Masa retrocardíaca con aire = hernia de hiato; la mayoría por deslizamiento.', 'Retrocardiac mass with air = hiatus hernia; most are sliding.'), 'hernia-hiato'),
    mcq(bi('¿Qué dos signos de imagen indican que una masa mediastínica es un bocio?', 'Which two imaging signs show a mediastinal mass is a goitre?'),
      [bi('Continuidad con el tiroides del cuello y densidad similar a la suya', 'Continuity with the thyroid in the neck and density similar to it'), bi('Calcificación periférica y necrosis central', 'Peripheral calcification and central necrosis'), bi('Aire en su interior y nivel hidroaéreo', 'Air inside and an air-fluid level'), bi('Densidad grasa y cápsula', 'Fat density and a capsule')],
      bi('Continuidad con el tiroides y densidad similar.', 'Continuity with the thyroid and similar density.'), 'bocio'),
    mcq(bi('En una TC hecha por otro motivo aparece una aorta ascendente de 5,3 cm. ¿Es un aneurisma? ¿Qué haces?', 'A CT done for another reason shows a 5.3 cm ascending aorta. Is it an aneurysm? What do you do?'),
      [bi('Sí (≥ 5 cm): seguimiento clínico y radiológico anual; tratar cuando el riesgo de rotura sea elevado (≥ 6 cm)', 'Yes (≥ 5 cm): clinical and yearly imaging follow-up; treat when rupture risk is high (≥ 6 cm)'), bi('No: el umbral de la ascendente es 7 cm', 'No: the ascending threshold is 7 cm'), bi('Sí: cirugía urgente', 'Yes: urgent surgery'), bi('No: es normal hasta 6 cm', 'No: normal up to 6 cm')],
      bi('Ascendente ≥ 5 cm = aneurisma; riesgo de rotura ≥ 6 cm. Descendente: ≥ 4 / ≥ 7 cm.', 'Ascending ≥ 5 cm = aneurysm; rupture risk ≥ 6 cm. Descending: ≥ 4 / ≥ 7 cm.'), 'aneurisma'),
    mcq(bi('Hipertenso con dolor torácico: flap intimomedial que empieza en la aorta descendente, sin isquemia y con el dolor controlado. ¿Stanford y tratamiento?', 'Hypertensive patient with chest pain: intimomedial flap starting in the descending aorta, no ischaemia, pain controlled. Stanford type and treatment?'),
      [bi('Tipo B: tratamiento médico inicial (no hay complicaciones)', 'Type B: initial medical treatment (no complications)'), bi('Tipo A: cirugía urgente', 'Type A: urgent surgery'), bi('Tipo B: endovascular inmediato', 'Type B: immediate endovascular repair'), bi('Tipo A: tratamiento médico', 'Type A: medical treatment')],
      bi('No afecta a la ascendente → B → médico; endovascular solo si isquemia, dolor pese a analgesia o HTA no controlada.', 'Ascending spared → B → medical; endovascular only if ischaemia, pain despite analgesia or uncontrolled BP.'), 'diseccion'),
    mcq(bi('¿Cómo se ve un hematoma intramural en la TC sin y con contraste?', 'How does an intramural haematoma look on unenhanced and contrast CT?'),
      [bi('Semiluna en la pared: hiperdensa sin contraste, hipodensa con contraste; sin desgarro de la íntima', 'Crescent in the wall: hyperdense unenhanced, hypodense with contrast; no intimal tear'), bi('Flap y dos luces', 'Flap and two lumens'), bi('Hipodensa sin contraste e hiperdensa con contraste', 'Hypodense unenhanced and hyperdense with contrast'), bi('Cráter de contraste fuera de la luz', 'Contrast crater outside the lumen')],
      bi('Semiluna hiperdensa sin contraste e hipodensa con contraste.', 'Crescent hyperdense unenhanced, hypodense with contrast.'), 'hematoma-intramural'),
    mcq(bi('¿Cuál es la prueba de elección en el TEP agudo y cuál es su signo directo?', 'What is the test of choice in acute PE and its direct sign?'),
      [bi('TC: defecto de repleción (trombo hipodenso en un vaso hiperdenso)', 'CT: filling defect (hypodense thrombus in a hyperdense vessel)'), bi('Rx de tórax: joroba de Hampton', 'Chest film: Hampton hump'), bi('Ecografía: vaso no compresible', 'Ultrasound: non-compressible vessel'), bi('RM: vacío de señal', 'MR: flow void')],
      bi('TC por su alta sensibilidad y especificidad; defecto de repleción.', 'CT for its high sensitivity and specificity; filling defect.'), 'tep'),
    mcq(bi('Cita criterios de imagen de HTP en la TC:', 'Imaging criteria of PH on CT:'),
      [bi('Tronco pulmonar > 29–31,5 mm (o mayor que la aorta en < 50 años) · VD/VI > 1 · pared libre del VD > 4 mm', 'Pulmonary trunk > 29–31.5 mm (or larger than the aorta under 50) · RV/LV > 1 · RV free wall > 4 mm'), bi('Tronco pulmonar > 20 mm · VI > VD', 'Pulmonary trunk > 20 mm · LV > RV'), bi('Aorta > tronco pulmonar en > 50 años', 'Aorta > pulmonary trunk over 50'), bi('Tabique desviado a la derecha · AD pequeña', 'Septum bowed to the right · small RA')],
      bi('También vale el tabique aplanado o desviado a la izquierda, o la AD dilatada.', 'A flattened or left-bowed septum, or a dilated RA, also count.'), 'htp'),
    mcq(bi('Una opacidad lenticular en la cisura menor desaparece tras dar diuréticos. ¿Qué era?', 'A lenticular opacity in the minor fissure disappears after diuretics. What was it?'),
      [bi('Un derrame encapsulado cisural: el «tumor fantasma» o «evanescente»', 'A fissural loculated effusion: the "phantom" or "vanishing" tumour'), bi('Un carcinoma broncogénico', 'A bronchogenic carcinoma'), bi('Una atelectasia del lóbulo medio', 'Middle lobe atelectasis'), bi('Un empiema', 'An empyema')],
      bi('Derrame cisural que desaparece con diuréticos.', 'Fissural effusion that vanishes with diuretics.'), 'tumor-fantasma'),
    mcq(bi('¿Qué técnica es más sensible para un derrame pequeño y loculado, y por qué guía la punción?', 'Which technique is most sensitive for a small loculated effusion, and why does it guide the tap?'),
      [bi('La ecografía: es la que mejor ve los tabiques y dirige la punción a la cavidad mayor', 'Ultrasound: it best shows the septa and directs the tap into the largest cavity'), bi('La Rx PA', 'The PA film'), bi('La RM', 'MR'), bi('La Rx lateral, porque ve el seno posterior', 'The lateral film, as it shows the posterior recess')],
      bi('Ecografía (la Rx lateral es más sensible que la PA, pero menos que la eco).', 'Ultrasound (the lateral film beats the PA, but not ultrasound).'), 'eco-derrame'),
    mcq(bi('Diferencia la latencia y la imagen de las placas por asbesto y del mesotelioma:', 'Compare latency and imaging of asbestos plaques and mesothelioma:'),
      [bi('Placas: hasta 20 años, múltiples, bilaterales, posterolaterales y diafragmáticas · mesotelioma: 30–40 años, nodular y circunferencial con derrame, placas calcificadas en el 50 %', 'Plaques: up to 20 years, multiple, bilateral, posterolateral and diaphragmatic · mesothelioma: 30–40 years, nodular circumferential with effusion, calcified plaques in 50 %'), bi('Placas: 30–40 años · mesotelioma: hasta 20 años', 'Plaques: 30–40 years · mesothelioma: up to 20 years'), bi('Ambos: 5 años, unilaterales', 'Both: 5 years, unilateral'), bi('Placas: unilaterales y apicales · mesotelioma: sin derrame', 'Plaques: unilateral and apical · mesothelioma: no effusion')],
      bi('Asbesto «20 / 30-40».', 'Asbestos "20 / 30-40".'), 'mesotelioma'),
    mcq(bi('¿Qué hallazgos definen el neumotórax a tensión y qué implica?', 'Which findings define tension pneumothorax and what does it imply?'),
      [bi('Atrapamiento aéreo valvular con desplazamiento mediastínico contralateral y aplanamiento diafragmático que persisten en inspiración → drenaje urgente', 'Valve-like air trapping with contralateral mediastinal shift and diaphragmatic flattening persisting on inspiration → urgent drainage'), bi('Desplazamiento mediastínico hacia el lado del neumotórax → observación', 'Mediastinal shift towards the pneumothorax → observation'), bi('Línea pleural fina sin desplazamiento → control en 24 h', 'Thin pleural line without shift → check in 24 h'), bi('Aire alrededor de la tráquea → cirugía', 'Air around the trachea → surgery')],
      bi('Mecanismo valvular, desplazamiento contralateral, diafragma aplanado: drenar ya.', 'Valve mechanism, contralateral shift, flat diaphragm: drain now.'), 'neumotorax-tension'),
  ],
};
