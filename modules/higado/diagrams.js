// SVG diagrams (esquemas) of the «Hígado, vía biliar y páncreas» module. Classes come from src/styles.css (.dsvg …).
// Curves use the same teaching HU as the simulation (lesions.js / common.js), so diagram and image agree.
import { HUT, HEMA_FILL } from './lesions.js';
import { BG } from './common.js';

const tx = (x, y, s, cls = 'dt', extra = '') => `<text x="${x}" y="${y}" class="${cls}"${extra}>${s}</text>`;
const LINE = 'fill:none;stroke:var(--dim);stroke-width:1.2';
const box = (x, y, w, h, fill = '#dbe7f3', op = 0.3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" style="fill:${fill};fill-opacity:${op};stroke:var(--dim);stroke-width:.8"/>`;
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="${LINE}" marker-end="url(#ah)"/>`;
const DEFS = '<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" style="fill:var(--dim)"/></marker></defs>';
const en = lang => lang === 'en';

/** Time–density curves of the typical liver lesions over the four phases (the backbone of the module). */
export function enhancementDiagram(lang) {
  const E = en(lang), ph = ['sin', 'arterial', 'portal', 'tardia'];
  const PL = E ? ['Unenh.', 'Arterial ~10 s', 'Portal ~60 s', 'Delayed ~90 s'] : ['Basal', 'Arterial ~10 s', 'Portal ~60 s', 'Tardía ~90 s'];
  const hema = ph.map(p => HUT.hemangioma.base[p] + HEMA_FILL[p] * (HUT.hemangioma.pool[p] - HUT.hemangioma.base[p]));
  const series = [
    [E ? 'Liver' : 'Hígado', ph.map(p => BG.liver[p]), 'var(--dim)', '5 3'],
    [E ? 'HCC / adenoma: in and out' : 'HCC / adenoma: llega y se va', ph.map(p => HUT.hcc.body[p]), '#ff4f6d'],
    [E ? 'FNH: in, then like liver' : 'HNF: llega y queda como hígado', ph.map(p => HUT.hnf.body[p]), '#f0a020'],
    [E ? 'Haemangioma: slow, centripetal' : 'Hemangioma: lenta, centrípeta', hema, '#4fb0ff'],
    [E ? 'Metastasis: ring (rim)' : 'Metástasis: anillo (borde)', ph.map(p => HUT.meta.rim[p]), '#b070ff'],
    [E ? 'Cyst: no enhancement' : 'Quiste: no capta', ph.map(p => HUT.quiste.body[p]), '#40c090'],
  ];
  const X = i => 46 + i * 62, Y = hu => 128 - hu * 0.55;
  const grid = ph.map((p, i) => `<line x1="${X(i)}" y1="10" x2="${X(i)}" y2="130" style="stroke:var(--dim);stroke-width:.4;opacity:.5"/>${tx(X(i), 142, PL[i], 'dt2')}`).join('')
    + [0, 100, 200].map(h => `<line x1="40" y1="${Y(h)}" x2="236" y2="${Y(h)}" style="stroke:var(--dim);stroke-width:.3;opacity:.4"/>${tx(28, Y(h) + 3, h + ' HU', 'dt2')}`).join('');
  const lines = series.map(([, v, c, dash]) => `<polyline points="${v.map((h, i) => X(i) + ',' + Y(h).toFixed(1)).join(' ')}" style="fill:none;stroke:${c};stroke-width:2.2${dash ? ';stroke-dasharray:' + dash : ''}"/>`).join('');
  const leg = series.map(([n, , c], i) => `<rect x="246" y="${14 + i * 20}" width="10" height="4" style="fill:${c}"/><text x="260" y="${19 + i * 20}" class="dt2" style="text-anchor:start">${n}</text>`).join('');
  return `<svg viewBox="0 0 420 150" class="dsvg" role="img" aria-label="${E ? 'Enhancement curves' : 'Curvas de captación'}">${grid}${lines}${leg}</svg>`;
}

/** Couinaud: three hepatic veins (vertical planes) + portal vein (transverse plane) → 8 segments; caudate (1) drains to the IVC. */
export function couinaudDiagram(lang) {
  const E = en(lang);
  const T = E ? ['Right HV', 'Middle HV', 'Left HV', 'Portal plane', 'IVC', 'Caudate (1) → IVC', 'Falciform / umbilical fissure']
    : ['Suprahep. dcha.', 'Suprahep. media', 'Suprahep. izq.', 'Plano portal', 'Cava', 'Caudado (1) → cava', 'Fisura umbilical'];
  const liver = 'M20 70 C20 30 70 14 150 16 C230 18 300 30 310 52 C300 70 250 84 210 100 C170 116 120 130 70 128 C36 126 20 104 20 70 Z';
  const n = (x, y, s) => `<circle cx="${x}" cy="${y}" r="9" style="fill:#151b22;fill-opacity:.7;stroke:#6d8fa8"/>${tx(x, y + 3.5, s)}`;
  return `<svg viewBox="0 0 330 160" class="dsvg" role="img" aria-label="Couinaud">
    <path d="${liver}" style="fill:#cdbf9b;fill-opacity:.35;stroke:#7d7257;stroke-width:1.5"/>
    <rect x="150" y="4" width="18" height="40" rx="6" style="fill:#6d8fa8;fill-opacity:.8"/>${tx(159, 54, T[4], 'dt2')}
    <path d="M152 24 L50 120" style="fill:none;stroke:#4fb0ff;stroke-width:2.5"/><path d="M158 26 L140 126" style="fill:none;stroke:#4fb0ff;stroke-width:2.5"/><path d="M166 24 L236 92" style="fill:none;stroke:#4fb0ff;stroke-width:2.5"/>
    <line x1="22" y1="78" x2="300" y2="62" style="stroke:#ff4fd8;stroke-width:2;stroke-dasharray:6 3"/>
    ${n(62, 50, '7')}${n(70, 104, '6')}${n(118, 44, '8')}${n(116, 104, '5')}${n(184, 50, '4')}${n(176, 100, '4')}${n(240, 40, '2')}${n(250, 80, '3')}${n(159, 70, '1')}
    ${tx(40, 148, T[0], 'dt2')}${tx(140, 148, T[1], 'dt2')}${tx(250, 110, T[2], 'dt2')}${tx(286, 50, T[3], 'dt2')}${tx(250, 148, T[5], 'dt2')}</svg>`;
}

/** Liver-specific and iron (Fe) agents: uptake by lesion (table of the syllabus). */
export function ironDiagram(lang) {
  const E = en(lang), Y = E ? 'Yes' : 'Sí';
  const rows = [
    [E ? 'Haemangioma' : 'Hemangioma', 'No', Y + ' ⚠', E ? 'no hepatocytes' : 'sin hepatocitos'],
    [E ? 'FNH' : 'HNF', Y, Y, E ? 'hepatocytes' : 'hepatocitos'],
    ['Adenoma', 'No', 'No', '—'],
    [E ? 'HCC' : 'Hepatocarcinoma', 'No', 'No', E ? 'undifferentiated' : 'indiferenciadas'],
    [E ? 'Metastasis / cholangioca.' : 'Metástasis / colangioca.', 'No', 'No', E ? 'other cell line' : 'otra estirpe'],
  ];
  const head = E ? ['Lesion', 'Liver-specific', 'Fe', 'Why'] : ['Lesión', 'Hepatoespecífico', 'Fe', 'Por qué'];
  const xs = [70, 170, 228, 290], cell = (v, x, y) => tx(x, y, v, v === 'No' ? 'dt2' : 'dt');
  return `<svg viewBox="0 0 340 ${30 + rows.length * 20}" class="dsvg" role="img" aria-label="${head[1]} / Fe">
    ${head.map((h, i) => tx(xs[i], 14, h)).join('')}<line x1="6" y1="20" x2="334" y2="20" style="${LINE}"/>
    ${rows.map((r, j) => (r[1] !== 'No' && r[2] !== 'No' ? `<rect x="6" y="${24 + j * 20}" width="328" height="18" rx="3" style="fill:#40c090;fill-opacity:.18"/>` : '') + r.map((v, i) => cell(v, xs[i], 37 + j * 20)).join('')).join('')}</svg>`;
}

/** MR sequences: signal of the liver (normal / fat / iron) and of water, as grey squares. */
export function mriTable(lang) {
  const E = en(lang), g = v => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };
  const cols = E ? ['Water', 'Normal', 'Fat', 'Iron'] : ['Agua', 'Normal', 'Grasa', 'Hierro'];
  const rows = [
    ['T1', [0.1, 0.5, 0.6, 0.3]], ['T2', [0.97, 0.4, 0.5, 0.1]],
    [E ? 'T1 in phase' : 'T1 en fase', [0.1, 0.5, 0.6, 0.12]], [E ? 'T1 out of phase' : 'T1 fuera de fase', [0.1, 0.5, 0.18, 0.42]],
  ];
  const sq = (x, y, v) => `<rect x="${x}" y="${y}" width="40" height="18" rx="3" style="fill:${g(v)};stroke:var(--dim);stroke-width:.5"/>`;
  return `<svg viewBox="0 0 320 ${34 + rows.length * 24}" class="dsvg" role="img" aria-label="MR">
    ${cols.map((c, i) => tx(130 + i * 50, 14, c)).join('')}
    ${rows.map(([n, v], j) => tx(50, 34 + j * 24, n) + v.map((s, i) => sq(110 + i * 50, 21 + j * 24, s)).join('')).join('')}
    ${tx(160, 30 + rows.length * 24, E ? 'Out of phase fat drops (steatosis); iron does the opposite' : 'Fuera de fase cae la grasa (esteatosis); el hierro hace lo contrario', 'dt2')}</svg>`;
}

/** Focal liver lesion: ultrasound first, then the dynamic study decides. */
export function livAlgorithm(lang) {
  const E = en(lang);
  const T = E ? ['Focal liver lesion', 'Ultrasound', 'Simple cyst → nothing more', 'Typical haemangioma (healthy) → US every 6 months', 'Other → dynamic CT / MR', 'Arterial + washout → HCC / adenoma', 'Arterial → isodense → FNH', 'Ring → metastasis / abscess', 'Centripetal → haemangioma']
    : ['Lesión hepática focal', 'Ecografía', 'Quiste simple → nada más', 'Hemangioma típico (sano) → eco cada 6 meses', 'Otra → TC / RM dinámico', 'Arterial + lavado → HCC / adenoma', 'Arterial → isodensa → HNF', 'Anillo → metástasis / absceso', 'Centrípeta → hemangioma'];
  return `<svg viewBox="0 0 340 170" class="dsvg" role="img" aria-label="${T[0]}">${DEFS}
    ${box(110, 4, 120, 18)}${tx(170, 17, T[0])}${arrow(170, 22, 170, 32)}${box(130, 32, 80, 18, '#4fb0ff')}${tx(170, 45, T[1])}
    ${arrow(150, 50, 70, 66)}${arrow(170, 50, 170, 66)}${arrow(190, 50, 280, 66)}
    ${tx(70, 76, T[2], 'dt2')}${tx(170, 90, T[3], 'dt2')}${box(222, 66, 116, 18, '#ff4fd8', 0.18)}${tx(280, 79, T[4])}
    ${arrow(280, 84, 280, 96)}${[5, 6, 7, 8].map((k, i) => tx(250, 108 + i * 16, T[k], 'dt2')).join('')}</svg>`;
}

/** Biliary anatomy: right + left hepatic → common hepatic; + cystic → common bile duct; + pancreatic duct → ampulla of Vater. */
export function biliaryDiagram(lang) {
  const E = en(lang);
  const T = E ? ['Right hepatic', 'Left hepatic', 'Common hepatic duct', 'Cystic duct', 'Gallbladder', 'Common bile duct', 'Pancreatic duct', 'Ampulla of Vater → D2', 'Klatskin (hilum)']
    : ['Hepático dcho.', 'Hepático izq.', 'Hepático común', 'Cístico', 'Vesícula', 'Colédoco', 'Conducto pancreático', 'Ampolla de Vater → D2', 'Klatskin (hilio)'];
  const D = 'fill:none;stroke:#3fb27f;stroke-width:5;stroke-linecap:round';
  return `<svg viewBox="0 0 340 190" class="dsvg" role="img" aria-label="${T[2]}">
    <path d="M70 20 L140 60 M230 18 L160 60 M140 60 L150 64 L160 60" style="${D}"/><path d="M150 64 L150 104 L156 150" style="${D}"/>
    <path d="M150 104 C126 104 104 108 92 118" style="${D};stroke-width:3.5"/>
    <path d="M60 116 C60 96 96 100 98 120 C100 150 70 164 58 150 Z" style="fill:#3fb27f;fill-opacity:.45;stroke:#3fb27f"/>
    <path d="M300 128 C260 140 200 146 160 152" style="fill:none;stroke:#f0a020;stroke-width:4;stroke-linecap:round"/>
    <path d="M148 140 C138 160 150 182 176 182 L176 186 C140 188 128 160 140 136 Z" style="fill:#cdbf9b;fill-opacity:.6"/>
    <circle cx="157" cy="153" r="4" class="dh"/><circle cx="150" cy="62" r="9" style="fill:none;stroke:#ff4fd8;stroke-dasharray:3 2"/>
    ${tx(56, 14, T[0], 'dt2')}${tx(246, 12, T[1], 'dt2')}${tx(210, 86, T[2])}${tx(110, 96, T[3], 'dt2')}${tx(50, 176, T[4], 'dt2')}${tx(200, 116, T[5])}${tx(286, 118, T[6], 'dt2')}${tx(236, 176, T[7], 'dt2')}${tx(196, 56, T[8], 'dt2')}</svg>`;
}

/** Biliary clinical triad: the symptom points to the entity; ultrasound always first. */
export function triadDiagram(lang) {
  const E = en(lang);
  const C = E ? [['Abdominal pain', 'Gallstones · cholecystitis', '(+ fever, chills, leucocytosis)', 'US of choice', 'Emphysematous: CT'], ['Pain + jaundice', 'Choledocholithiasis', 'retrograde duct dilatation', 'US + admission', '→ MRCP → ERCP'], ['PAINLESS jaundice', 'Gallbladder carcinoma', 'cholangiocarcinoma · pancreatic head', 'US + admission', '→ CT (staging) + MRCP']]
    : [['Dolor abdominal', 'Colelitiasis · colecistitis', '(+ fiebre, escalofríos, leucocitosis)', 'Eco de elección', 'Enfisematosa: TC'], ['Dolor + ictericia', 'Coledocolitiasis', 'dilatación retrógrada de la vía', 'Eco + ingreso', '→ colangio-RM → CPRE'], ['Ictericia INDOLORA', 'Carcinoma de vesícula', 'colangiocarcinoma · cabeza de páncreas', 'Eco + ingreso', '→ TC (estadiaje) + colangio-RM']];
  const col = (c, i) => { const x = 6 + i * 112, fill = ['#4fb0ff', '#f0a020', '#ff4f6d'][i];
    return `${box(x, 4, 104, 20, fill, 0.35)}${tx(x + 52, 18, c[0])}${tx(x + 52, 44, c[1])}${tx(x + 52, 57, c[2], 'dt2')}${box(x, 70, 104, 36, fill, 0.12)}${tx(x + 52, 85, c[3])}${tx(x + 52, 99, c[4], 'dt2')}`; };
  return `<svg viewBox="0 0 342 112" class="dsvg" role="img" aria-label="${C[0][0]} / ${C[1][0]} / ${C[2][0]}">${C.map(col).join('')}</svg>`;
}

/** Balthazar grades and CT severity index (necrosis points added beyond the syllabus). */
export function balthazarDiagram(lang) {
  const E = en(lang);
  const R = E ? [['A', 'Normal pancreas', '0'], ['B', 'Enlarged (focal or diffuse)', '1'], ['C', 'B + peripancreatic inflammation', '2'], ['D', 'One fluid collection', '3'], ['E', '≥ 2 collections or gas', '4']]
    : [['A', 'Páncreas normal', '0'], ['B', 'Aumento (focal o difuso)', '1'], ['C', 'B + inflamación peripancreática', '2'], ['D', 'Una colección líquida', '3'], ['E', '≥ 2 colecciones o gas', '4']];
  const N = E ? ['Necrosis: none 0 · < 30 % 2 · 30–50 % 4 · > 50 % 6', 'CTSI = grade + necrosis: 0–3 mild · 4–6 moderate · 7–10 severe'] : ['Necrosis: no 0 · < 30 % 2 · 30–50 % 4 · > 50 % 6', 'CTSI = grado + necrosis: 0–3 leve · 4–6 moderada · 7–10 grave'];
  return `<svg viewBox="0 0 320 ${44 + R.length * 18}" class="dsvg" role="img" aria-label="Balthazar">
    ${R.map((r, j) => `<rect x="6" y="${4 + j * 18}" width="308" height="16" rx="3" style="fill:#ff4f6d;fill-opacity:${(0.06 + j * 0.07).toFixed(2)}"/>${tx(20, 16 + j * 18, r[0])}<text x="40" y="${16 + j * 18}" class="dt2" style="text-anchor:start">${r[1]}</text>${tx(296, 16 + j * 18, r[2])}`).join('')}
    ${tx(160, 18 + R.length * 18, N[0], 'dt2')}${tx(160, 32 + R.length * 18, N[1], 'dt2')}</svg>`;
}

/** Cystic pancreatic tumours: serous (many small cysts), mucinous (large cysts), IPMN (duct). */
export function cysticDiagram(lang) {
  const E = en(lang);
  const T = E ? [['Serous', 'many small cysts', 'benign'], ['Mucinous', 'large cysts · women', 'malignant potential'], ['IPMN', 'intraductal, mucin', 'malignant potential']]
    : [['Seroso', 'múltiples quistes pequeños', 'benigno'], ['Mucinoso', 'quistes grandes · mujer', 'potencial maligno'], ['TPMI', 'intraductal, mucina', 'potencial maligno']];
  const small = [[30, 40], [42, 34], [52, 44], [38, 52], [50, 56], [62, 50], [28, 60], [60, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" style="fill:#4fb0ff;fill-opacity:.5;stroke:var(--dim);stroke-width:.6"/>`).join('');
  const big = '<circle cx="146" cy="46" r="22" style="fill:#4fb0ff;fill-opacity:.5;stroke:var(--text);stroke-width:2"/><circle cx="172" cy="56" r="12" style="fill:#4fb0ff;fill-opacity:.5;stroke:var(--text);stroke-width:2"/>';
  const ipmn = '<path d="M226 50 L318 50" style="stroke:#4fb0ff;stroke-width:9;stroke-linecap:round;opacity:.7"/><circle cx="250" cy="34" r="8" style="fill:#4fb0ff;fill-opacity:.5;stroke:var(--dim)"/><circle cx="290" cy="66" r="9" style="fill:#4fb0ff;fill-opacity:.5;stroke:var(--dim)"/><path d="M250 42 L250 50 M290 50 L290 57" style="stroke:#4fb0ff;stroke-width:3"/>';
  const lab = (x, t) => tx(x, 92, t[0]) + tx(x, 104, t[1], 'dt2') + tx(x, 116, t[2], 'dt2');
  return `<svg viewBox="0 0 330 122" class="dsvg" role="img" aria-label="${T[0][0]} / ${T[1][0]} / ${T[2][0]}">${small}${big}${ipmn}${lab(46, T[0])}${lab(156, T[1])}${lab(272, T[2])}</svg>`;
}
