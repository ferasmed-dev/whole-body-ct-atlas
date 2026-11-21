// Módulo «Hígado, vía biliar y páncreas»: técnicas y fases del estudio dinámico, patología difusa y focal hepática,
// vesícula y vía biliar, pancreatitis y tumores pancreáticos, dibujados sobre el TC real (caso s0591, fase portal).
// Every value comes from the course topic; anything beyond it is flagged 'ampliacion'.
// Files: geo.js (geometry on the masks), lesions.js (liver lesion builders), common.js (text helpers, phase HU),
// diagrams.js (esquemas), ents-hig.js (liver), ents-bil.js (gallbladder and ducts), ents-panc.js (pancreas).
import { TEC, DIF, BEN, INT, MAL } from './ents-hig.js';
import { BIL } from './ents-bil.js';
import { PANC } from './ents-panc.js';
import { bi } from './common.js';

const mcq = (prompt, options, explain, show) => ({ type: 'mcq', prompt, options, answer: 0, explain, ...(show ? { show } : {}) });

export default {
  slug: 'higado',
  title: bi('Hígado, vía biliar y páncreas', 'Liver, biliary tree and pancreas'),
  examLength: 10,
  intro: {
    text: bi(
      'Tres órganos, una técnica de entrada distinta para cada uno. <b>Hígado</b>: la eco es la técnica inicial; para caracterizar una lesión focal hace falta un <b>estudio dinámico</b> (TC o RM: basal, arterial ~10 s, portal ~60 s, tardía ~90 s) — usa el control de fase. La RM es la mejor para la patología difusa (grasa, hierro). <b>Vía biliar</b>: la eco es de elección y la clínica orienta: <b>dolor</b> = colelitiasis / colecistitis · <b>dolor + ictericia</b> = coledocolitiasis · <b>ictericia indolora</b> = neoplasia. <b>Páncreas</b>: el TC es la técnica más usada; en la pancreatitis aguda no es rutinario y se hace a partir de las 48–72 h (necrosis = no capta); el adenocarcinoma es hipodenso, hipocaptante y dilata el conducto pancreático. La vía biliar no está segmentada en este estudio (conductos estimados) y las fases distintas de la portal se simulan.',
      'Three organs, a different entry test for each. <b>Liver</b>: ultrasound comes first; characterising a focal lesion needs a <b>dynamic study</b> (CT or MR: unenhanced, arterial ~10 s, portal ~60 s, delayed ~90 s) — use the phase control. MR is best for diffuse disease (fat, iron). <b>Biliary tree</b>: ultrasound is the test of choice and the presentation points the way: <b>pain</b> = gallstones / cholecystitis · <b>pain + jaundice</b> = choledocholithiasis · <b>painless jaundice</b> = tumour. <b>Pancreas</b>: CT is the most used test; in acute pancreatitis it is not routine and is done after 48–72 h (necrosis = no enhancement); adenocarcinoma is hypodense, hypoenhancing and dilates the pancreatic duct. The bile ducts are not segmented on this study (estimated ducts) and phases other than portal are simulated.'),
    table: {
      es: [['Patrón de captación', 'Lesión'], ['Arterial + lavado portal («llega y se va»)', 'Hepatocarcinoma, adenoma'], ['Arterial y luego isodensa («se queda como hígado»), estrella', 'HNF'], ['Nodular, centrípeta, tardía', 'Hemangioma'], ['Anillo (fase portal)', 'Metástasis, absceso'], ['Retardada persistente + retracción capsular', 'Colangiocarcinoma'], ['No capta', 'Quiste'], ['Páncreas: no capta / hipocapta / hipervascular', 'Necrosis / adenocarcinoma / neuroendocrino']],
      en: [['Enhancement pattern', 'Lesion'], ['Arterial + portal washout ("in and out")', 'HCC, adenoma'], ['Arterial then isodense ("stays like liver"), star', 'FNH'], ['Nodular, centripetal, delayed', 'Haemangioma'], ['Ring (portal phase)', 'Metastasis, abscess'], ['Delayed persistent + capsular retraction', 'Cholangiocarcinoma'], ['No enhancement', 'Cyst'], ['Pancreas: none / hypo / hypervascular', 'Necrosis / adenocarcinoma / neuroendocrine']],
    },
  },
  groups: [
    { id: 'tec', es: 'Hígado: técnicas, fases y segmentos', en: 'Liver: techniques, phases and segments' },
    { id: 'difusa', es: 'Hígado: patología difusa', en: 'Liver: diffuse disease' },
    { id: 'benigna', es: 'Hígado: lesiones benignas', en: 'Liver: benign lesions' },
    { id: 'inter', es: 'Hígado: intermedias y cirrótico', en: 'Liver: intermediate and cirrhotic' },
    { id: 'maligna', es: 'Hígado: lesiones malignas', en: 'Liver: malignant lesions' },
    { id: 'bil-tec', es: 'Vía biliar: anatomía, técnicas y clínica', en: 'Biliary tree: anatomy, techniques and presentation' },
    { id: 'vesicula', es: 'Vesícula biliar', en: 'Gallbladder' },
    { id: 'conductos', es: 'Vía biliar: coledocolitiasis y colangiocarcinoma', en: 'Bile ducts: stones and cholangiocarcinoma' },
    { id: 'panc-inf', es: 'Páncreas: técnicas y pancreatitis', en: 'Pancreas: techniques and pancreatitis' },
    { id: 'panc-tum', es: 'Páncreas: tumores', en: 'Pancreas: tumours' },
  ],
  entities: [...TEC, ...DIF, ...BEN, ...INT, ...MAL, ...BIL, ...PANC],
  questions: [
    mcq(bi('¿Qué técnica es la más específica para detectar hemocromatosis y por qué eco y TC no sirven?', 'Which test is the most specific for haemochromatosis, and why are US and CT no use?'),
      [bi('RM con eco de gradiente, que además cuantifica el hierro; eco y TC no muestran alteraciones hasta la fase de cirrosis', 'Gradient-echo MR, which also quantifies iron; US and CT show nothing until the cirrhosis stage'), bi('TC sin contraste: el hígado se ve hiperdenso desde el principio', 'Unenhanced CT: the liver is hyperdense from the start'), bi('Eco con contraste: el hierro capta microburbujas', 'Contrast US: iron takes up microbubbles'), bi('RM T2 con gadolinio, porque el gadolinio se ve blanco en T2', 'T2 MR with gadolinium, because gadolinium is bright on T2')],
      bi('RM (eco de gradiente): la más específica y cuantifica el hierro.', 'MR (gradient echo): the most specific, and quantifies iron.'), 'hemocromatosis'),
    mcq(bi('En el TC multifásico, ¿en qué fase se valoran mejor las metástasis y cómo captan?', 'On multiphase CT, in which phase are metastases best seen, and how do they enhance?'),
      [bi('En la fase portal (~60 s), que realza el parénquima y destaca las hipovasculares; captan en anillo', 'Portal phase (~60 s), which enhances the parenchyma and shows hypovascular lesions; ring enhancement'), bi('En la fase arterial: captan intensamente y lavan', 'Arterial phase: they enhance strongly and wash out'), bi('En la tardía: relleno nodular centrípeto', 'Delayed phase: nodular centripetal fill-in'), bi('Sin contraste: son hiperdensas', 'Unenhanced: they are hyperdense')],
      bi('Portal (~60 s), captación en anillo.', 'Portal (~60 s), ring enhancement.'), 'metastasis'),
    mcq(bi('Cirrótico con un nódulo nuevo que realza en fase arterial y lava en portal, con AFP elevada. ¿Diagnóstico y hace falta biopsia?', 'Cirrhotic patient with a new nodule enhancing in arterial and washing out in portal, with raised AFP. Diagnosis, and is a biopsy needed?'),
      [bi('Hepatocarcinoma; con el estudio dinámico típico y la AFP elevada se diagnostica sin histología', 'HCC; with the typical dynamic study and raised AFP it is diagnosed without histology'), bi('Hiperplasia nodular focal; biopsia obligatoria', 'FNH; biopsy mandatory'), bi('Hemangioma; control con eco cada 6 meses', 'Haemangioma; US every 6 months'), bi('Metástasis; buscar el primario', 'Metastasis; look for the primary')],
      bi('Hepatocarcinoma sin biopsia (hoy con LI-RADS la AFP no es necesaria).', 'HCC without biopsy (with LI-RADS today AFP is not required).'), 'hcc'),
    mcq(bi('Mujer joven con lesión que en eco no se ve, capta en fase arterial con patrón estrellado y luego es isodensa al hígado. ¿Qué es?', 'Young woman with a lesion invisible on US, enhancing in the arterial phase with a stellate pattern and then isodense to liver. What is it?'),
      [bi('Hiperplasia nodular focal', 'Focal nodular hyperplasia'), bi('Adenoma hepático', 'Hepatic adenoma'), bi('Hepatocarcinoma', 'Hepatocellular carcinoma'), bi('Hemangioma', 'Haemangioma')],
      bi('HNF: hepatocitos desordenados, isoecoica, captación arterial en estrella que luego queda como el hígado.', 'FNH: disordered hepatocytes, isoechoic, stellate arterial enhancement that then matches the liver.'), 'hnf'),
    mcq(bi('Hallazgo casual en eco de una lesión nodular hiperecogénica en un paciente sano sin antecedentes oncológicos. ¿Qué haces?', 'Incidental echogenic nodular lesion on US in a healthy patient with no cancer history. What do you do?'),
      [bi('Es típica de hemangioma: no hacen falta más pruebas, control ecográfico cada 6 meses', 'Typical of haemangioma: no further tests, US follow-up every 6 months'), bi('TC multifásico urgente', 'Urgent multiphase CT'), bi('Biopsia percutánea', 'Percutaneous biopsy'), bi('Resección quirúrgica', 'Surgical resection')],
      bi('Hemangioma típico en sano: control eco cada 6 meses; TC/RM solo si hay antecedente de neoplasia.', 'Typical haemangioma in a healthy patient: US every 6 months; CT/MR only with a cancer history.'), 'hemangioma'),
    mcq(bi('¿Cuáles son signos de hipertensión portal en imagen?', 'Which are imaging signs of portal hypertension?'),
      [bi('Esplenomegalia, porta > 13 mm y colaterales', 'Splenomegaly, portal vein > 13 mm and collaterals'), bi('Atrofia del lóbulo izquierdo y porta de 8 mm', 'Left lobe atrophy and an 8 mm portal vein'), bi('Retracción capsular y realce retardado', 'Capsular retraction and delayed enhancement'), bi('Hígado hiperdenso y bazo pequeño', 'Hyperdense liver and a small spleen')],
      bi('Esplenomegalia, porta > 13 mm, colaterales (además: pérdida de onda trifásica en Doppler, cabeza de medusa).', 'Splenomegaly, portal vein > 13 mm, collaterals (also: loss of triphasic Doppler waveform, caput medusae).'), 'htp'),
    mcq(bi('¿Cuáles son los criterios ecográficos de colecistitis?', 'What are the ultrasound criteria for cholecystitis?'),
      [bi('Colelitiasis, Murphy ecográfico, engrosamiento de la pared y líquido perivesicular', 'Gallstones, sonographic Murphy, wall thickening and pericholecystic fluid'), bi('Gas en la pared y en la luz', 'Gas in the wall and lumen'), bi('Doble luz y pata de cangrejo', 'Double lumen and crab claw'), bi('Masa que sustituye a la vesícula', 'Mass replacing the gallbladder')],
      bi('Colelitiasis, Murphy ecográfico, pared engrosada, líquido perivesicular.', 'Gallstones, sonographic Murphy, thick wall, pericholecystic fluid.'), 'colecistitis'),
    mcq(bi('Anciano diabético con cuadro séptico sin dolor abdominal; la eco de la vesícula no es valorable. ¿Qué sospechas y qué prueba pides?', 'Elderly diabetic, septic, without abdominal pain; gallbladder US is not assessable. What do you suspect and which test do you order?'),
      [bi('Colecistitis enfisematosa gangrenosa: TC, que muestra gas en la vesícula', 'Emphysematous gangrenous cholecystitis: CT, which shows gas in the gallbladder'), bi('Coledocolitiasis: colangio-RM', 'Choledocholithiasis: MRCP'), bi('Colelitiasis simple: repetir la eco', 'Simple gallstones: repeat the US'), bi('Carcinoma de vesícula: CPRE', 'Gallbladder carcinoma: ERCP')],
      bi('Anaerobios productores de gas; la eco no la ve por el gas → TC.', 'Gas-forming anaerobes; US cannot see it because of the gas → CT.'), 'enfisematosa'),
    mcq(bi('Ictericia indolora; en la eco, la vía intrahepática está dilatada pero el colédoco no. ¿Qué localización tumoral sugiere?', 'Painless jaundice; on US the intrahepatic ducts are dilated but the common duct is not. Which tumour site does it suggest?'),
      [bi('Tumor de Klatskin (colangiocarcinoma hiliar, en la confluencia de los hepáticos)', 'Klatskin tumour (hilar cholangiocarcinoma, at the hepatic duct confluence)'), bi('Adenocarcinoma de cabeza de páncreas', 'Pancreatic head adenocarcinoma'), bi('Colangiocarcinoma extrahepático distal', 'Distal extrahepatic cholangiocarcinoma'), bi('Coledocolitiasis distal', 'Distal choledocholithiasis')],
      bi('La obstrucción está por encima del colédoco: hilio → Klatskin.', 'The block is above the common duct: hilum → Klatskin.'), 'klatskin'),
    mcq(bi('Pancreatitis aguda leve que ingresa hace 24 h y va bien. ¿Pides TC?', 'Mild acute pancreatitis admitted 24 h ago and doing well. Do you order a CT?'),
      [bi('No: no está indicado de rutina y nunca antes de 48–72 h; solo si dudas diagnósticas, clínica grave, Ranson > 3 o empeoramiento', 'No: it is not routine and never before 48–72 h; only for diagnostic doubt, severe illness, Ranson > 3 or worsening'), bi('Sí, urgente, para confirmar el diagnóstico', 'Yes, urgently, to confirm the diagnosis'), bi('Sí, sin contraste, para ver la necrosis', 'Yes, unenhanced, to see necrosis'), bi('Sí: toda pancreatitis necesita TC a las 24 h', 'Yes: every pancreatitis needs CT at 24 h')],
      bi('El TC no diagnostica la pancreatitis: la estadifica, y solo cuando hace falta.', 'CT does not diagnose pancreatitis: it stages it, and only when needed.'), 'pa-edematosa'),
    mcq(bi('En el TC con contraste de una pancreatitis, ¿qué indica una zona del páncreas que no capta?', 'On contrast CT in pancreatitis, what does a non-enhancing area of the pancreas mean?'),
      [bi('Necrosis → pancreatitis necrotizante (grave), que puede dejar colecciones encapsuladas', 'Necrosis → necrotising (severe) pancreatitis, which can leave walled-off collections'), bi('Edema → pancreatitis leve', 'Oedema → mild pancreatitis'), bi('Calcificación → pancreatitis crónica', 'Calcification → chronic pancreatitis'), bi('Tumor neuroendocrino', 'Neuroendocrine tumour')],
      bi('No capta = necrosis → PA necrotizante (grave).', 'No enhancement = necrosis → necrotising (severe) AP.'), 'pa-necrotizante'),
    mcq(bi('Adenocarcinoma frente a tumor neuroendocrino de páncreas en el TC con contraste: ¿cómo se comportan?', 'Adenocarcinoma versus neuroendocrine tumour of the pancreas on contrast CT: how do they behave?'),
      [bi('Adenocarcinoma hipodenso, hipovascular e hipocaptante (dilata el conducto); neuroendocrino hipervascular, sí capta', 'Adenocarcinoma hypodense, hypovascular, hypoenhancing (dilates the duct); neuroendocrine hypervascular, does enhance'), bi('Los dos son hipervasculares', 'Both are hypervascular'), bi('Adenocarcinoma hipervascular; neuroendocrino quístico', 'Adenocarcinoma hypervascular; neuroendocrine cystic'), bi('Ninguno capta contraste', 'Neither enhances')],
      bi('Adeno: hipocaptante; neuroendocrino: hipervascular.', 'Adeno: hypoenhancing; neuroendocrine: hypervascular.'), 'adenoca-pancreas'),
    mcq(bi('Dolor en hipocondrio derecho e ictericia. En la eco el colédoco y la vía intrahepática están dilatados. ¿Qué sospechas y cuál es la secuencia de pruebas?', 'Right upper quadrant pain and jaundice. US shows a dilated common duct and intrahepatic ducts. What do you suspect and what is the sequence of tests?'),
      [bi('Coledocolitiasis: ingreso → colangio-RM (cuántas piedras y dónde) → CPRE para extraerlas', 'Choledocholithiasis: admission → MRCP (how many stones and where) → ERCP to remove them'), bi('Klatskin: TC y stent percutáneo', 'Klatskin: CT and percutaneous stent'), bi('Colecistitis: nada más', 'Cholecystitis: nothing more'), bi('Pancreatitis crónica: Rx simple', 'Chronic pancreatitis: plain film')],
      bi('Dolor + ictericia = coledocolitiasis (causa más frecuente de ictericia dolorosa).', 'Pain + jaundice = choledocholithiasis (commonest cause of painful jaundice).'), 'coledocolitiasis'),
  ],
};
