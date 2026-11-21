// SVG diagrams (esquemas) for the urinario module. Classes come from src/styles.css (.dsvg …); colours that
// must read in both themes use the CSS variables.
const tx = (x, y, s, cls = 'dt') => `<text x="${x}" y="${y}" class="${cls}">${s}</text>`;
const LINE = 'fill:none;stroke:var(--dim);stroke-width:1.2';
const FLUID = 'fill:#24384a;stroke:#6d8fa8;stroke-width:1';
const PAR = 'fill:#cdbf9b;stroke:#7d7257;stroke-width:1';
const ENH = '#ff4fd8', CALC = '#ffffff';
const svg = (w, h, label, body) => `<svg viewBox="0 0 ${w} ${h}" class="dsvg" role="img" aria-label="${label}">${body}</svg>`;

/** Bosniak I → IV: wall, septa, calcium and enhancing tissue. */
export function bosniakDiagram(lang) {
  const en = lang === 'en';
  const act = en ? ['nothing more', 'nothing more', 'follow-up CT', 'surgery*', 'surgery'] : ['nada más', 'nada más', 'seguimiento TC', 'cirugía*', 'cirugía'];
  const mal = en ? ['benign', 'benign', 'probably benign', '50 % malignant', '100 % malignant'] : ['benigno', 'benigno', 'prob. benigno', '50 % malignos', '100 % malignos'];
  const cats = ['I', 'II', 'IIF', 'III', 'IV'];
  const panel = (i) => {
    const cx = 34 + i * 64, cy = 44;
    let g = `<circle cx="${cx}" cy="${cy}" r="24" style="${FLUID};stroke-width:${[1, 1, 1.5, 4, 4][i]}"/>`;
    if (i === 1) g += `<line x1="${cx - 20}" y1="${cy - 6}" x2="${cx + 21}" y2="${cy + 4}" style="stroke:#cfd8e0;stroke-width:.8"/><circle cx="${cx + 16}" cy="${cy - 17}" r="1.6" fill="${CALC}"/>`;
    if (i === 2) g += `<line x1="${cx - 21}" y1="${cy - 8}" x2="${cx + 22}" y2="${cy + 2}" style="stroke:#cfd8e0;stroke-width:1.6"/><line x1="${cx - 6}" y1="${cy - 23}" x2="${cx + 2}" y2="${cy + 23}" style="stroke:#cfd8e0;stroke-width:1.6"/><path d="M${cx + 10} ${cy - 21} q6 3 9 8" style="stroke:${CALC};stroke-width:2.4;fill:none"/>`;
    if (i === 3) g += `<path d="M${cx - 22} ${cy - 6} q12 -6 20 2 t22 0" style="stroke:#cfd8e0;stroke-width:3.4;fill:none"/><path d="M${cx - 4} ${cy - 23} q-6 14 4 24 t-2 22" style="stroke:#cfd8e0;stroke-width:3.4;fill:none"/><path d="M${cx - 18} ${cy + 14} q6 8 14 8" style="stroke:${CALC};stroke-width:3;fill:none"/>`;
    if (i === 4) g += `<path d="M${cx - 22} ${cy - 4} q14 -4 22 4 t20 -2" style="stroke:${ENH};stroke-width:3.4;fill:none"/><circle cx="${cx + 12}" cy="${cy + 9}" r="8" fill="${ENH}"/>`;
    return g + tx(cx, 84, 'Bosniak ' + cats[i]) + tx(cx, 96, mal[i], 'dt2') + tx(cx, 107, act[i], 'dt2');
  };
  const foot = en ? '* the syllabus table files III under "no enhancement / if in doubt: imaging"; the text says surgery · magenta = enhances'
    : '* la tabla del temario pone III en «no capta / si dudas: imagen»; el texto dice cirugía · magenta = capta';
  return svg(324, 122, 'Bosniak I–IV', [0, 1, 2, 3, 4].map(panel).join('') + `<text x="162" y="119" class="dt2" style="font-size:7.5px">${foot}</text>`);
}

/** Hydronephrosis grades I–IV (dilated pelvis → calyceal ectasia → rounded calyces → cortical atrophy). */
export function hydroDiagram(lang) {
  const en = lang === 'en';
  const sub = en ? ['dilated pelvis', '+ calyceal ectasia', '+ rounded calyces', '+ cortical atrophy'] : ['pelvis dilatada', '+ ectasia calicial', '+ cálices redondeados', '+ atrofia cortical'];
  const kid = (i) => {
    const x = 8 + i * 80, bean = `M${x + 40} ${8} C${x + 72} 8 ${x + 74} 78 ${x + 40} 80 C${x + 12} 80 ${x + 6} 60 ${x + 22} 48 C${x + 28} 44 ${x + 28} 40 ${x + 22} 36 C${x + 6} 26 ${x + 12} 8 ${x + 40} 8 Z`;
    const pel = [[7, 5], [9, 6], [11, 8], [13, 10]][i];
    let g = `<path d="${bean}" style="${PAR}"/>`;
    if (i === 3) g = `<path d="${bean}" style="${FLUID};stroke:#cdbf9b;stroke-width:3.2"/>`;
    g += `<ellipse cx="${x + 26}" cy="44" rx="${pel[0]}" ry="${pel[1] + 4}" style="${FLUID}"/>`;
    const cal = i === 0 ? [] : [[46, 22], [52, 44], [46, 66]];
    for (const [cx, cy] of cal) {
      if (i === 1) g += `<path d="M${x + 30} 44 L${x + cx} ${cy}" style="stroke:#6d8fa8;stroke-width:4"/>`;
      else g += `<path d="M${x + 30} 44 L${x + cx} ${cy}" style="stroke:#24384a;stroke-width:5"/><circle cx="${x + cx}" cy="${cy}" r="${i === 2 ? 7 : 9}" style="${FLUID}"/>`;
    }
    return g + tx(x + 40, 96, (en ? 'Grade ' : 'Grado ') + ['I', 'II', 'III', 'IV'][i]) + tx(x + 40, 108, sub[i], 'dt2');
  };
  return svg(328, 112, en ? 'Hydronephrosis grades' : 'Grados de hidronefrosis', [0, 1, 2, 3].map(kid).join(''));
}

/** Prostate zonal anatomy (axial, mid-gland) and how each zone looks on T2. */
export function prostateDiagram(lang) {
  const en = lang === 'en';
  const T = en ? ['Anterior fibromuscular stroma', 'Transition zone (HBP)', 'T2: heterogeneous, low', 'Peripheral zone (cancer)', 'T2: homogeneous, high', 'Central zone (base)', 'Urethra', 'Rectum', 'anterior', 'posterior']
    : ['Estroma fibromuscular anterior', 'Zona transicional (HBP)', 'T2: heterogénea, hipo', 'Zona periférica (cáncer)', 'T2: homogénea, hiper', 'Zona central (base)', 'Uretra', 'Recto', 'anterior', 'posterior'];
  return svg(330, 150, T[3], `
    <ellipse cx="90" cy="72" rx="66" ry="50" style="fill:#e9eef3;stroke:#7d7257;stroke-width:1.5"/>
    <path d="M40 46 Q90 10 140 46 L132 52 Q90 26 48 52 Z" style="fill:#5a6470"/>
    <ellipse cx="72" cy="64" rx="20" ry="16" style="fill:#7b8794"/><ellipse cx="108" cy="64" rx="20" ry="16" style="fill:#7b8794"/>
    <ellipse cx="90" cy="88" rx="16" ry="9" style="fill:#aeb8c2;stroke:var(--dim);stroke-dasharray:2 2"/>
    <circle cx="90" cy="60" r="4" style="fill:#2b3138"/>
    <ellipse cx="90" cy="138" rx="40" ry="10" style="fill:#8a6d5a;opacity:.6"/>
    <circle cx="124" cy="98" r="7" style="fill:${ENH}"/>
    ${tx(90, 6, T[8], 'dt2')}${tx(90, 148, T[7], 'dt2')}
    <line x1="132" y1="40" x2="176" y2="20" style="${LINE}"/>${tx(252, 18, T[0])}
    <line x1="120" y1="62" x2="176" y2="48" style="${LINE}"/>${tx(252, 46, T[1])}${tx(252, 58, T[2], 'dt2')}
    <line x1="150" y1="86" x2="176" y2="84" style="${LINE}"/>${tx(252, 82, T[3])}${tx(252, 94, T[4], 'dt2')}
    <line x1="104" y1="90" x2="176" y2="114" style="${LINE}"/>${tx(252, 116, T[5])}
    <line x1="94" y1="58" x2="176" y2="134" style="${LINE}"/>${tx(252, 136, T[6], 'dt2')}
    <text x="124" y="122" class="dt2" style="fill:${ENH}">${en ? 'T2-hypo focus' : 'foco hipo T2'}</text>`);
}

/** Ureteral jet on colour Doppler: the two traps of ultrasound. */
export function jetDiagram(lang) {
  const en = lang === 'en';
  const T = en ? ['Dilated collecting system', 'obstruction?', 'No dilatation, but', 'obstructive symptoms', 'Doppler of the bladder', 'Jet?', 'YES: dilatation WITHOUT', 'obstruction (e.g. reflux)', 'NO: obstruction WITHOUT', 'dilatation (onset, dehydrated)']
    : ['Vía excretora dilatada', '¿obstrucción?', 'Sin dilatación, pero', 'clínica obstructiva', 'Doppler en vejiga', '¿Jet?', 'SÍ: dilatación SIN', 'obstrucción (p. ej., reflujo)', 'NO: obstrucción SIN', 'dilatación (inicio, deshidratado)'];
  const box = (x, y, w, a, b, st = 'fill:var(--panel);stroke:var(--dim)') => `<rect x="${x}" y="${y}" width="${w}" height="30" rx="6" style="${st}"/>${tx(x + w / 2, y + 13, a)}${b ? tx(x + w / 2, y + 25, b, 'dt2') : ''}`;
  const row = (y, a, b, c, d, ok) => box(4, y, 104, a, b) + `<path d="M108 ${y + 15} H124" style="${LINE}"/>` + box(124, y, 64, T[4].split(' ')[0], T[5]) +
    `<path d="M188 ${y + 15} H202" style="${LINE}"/>` + box(202, y, 124, c, d, ok ? 'fill:rgba(77,200,140,.18);stroke:#4dc88c' : 'fill:rgba(255,120,120,.16);stroke:#ff7878');
  return svg(330, 76, 'Jet', row(4, T[0], T[1], T[6], T[7], true) + row(42, T[2], T[3], T[8], T[9], false));
}

/** Adrenal incidentaloma: the syllabus sequence (unenhanced CT → washout → MR → PET). */
export function adrenalDiagram(lang) {
  const en = lang === 'en';
  const T = en ? ['Adrenal lesion → unenhanced CT', '≤ 10 HU, round, smooth?', 'yes → lipid-rich adenoma: stop', 'no (> 10 HU) → contrast', 'washout > 50 %?', 'yes → adenoma', 'no → indeterminate:', 'MR: opposed-phase drop → adenoma', 'PET: uptake > liver → malignant', 'no uptake (cancer patient) → not a metastasis']
    : ['Lesión suprarrenal → TC sin contraste', '¿≤ 10 UH, redonda, lisa?', 'sí → adenoma rico en lípidos: fin', 'no (> 10 UH) → contraste', '¿lavado > 50 %?', 'sí → adenoma', 'no → indeterminada:', 'RM: cae fuera de fase → adenoma', 'PET: captación > hígado → maligno', 'sin captación (oncológico) → no es metástasis'];
  const b = (x, y, w, s, st) => `<rect x="${x}" y="${y}" width="${w}" height="18" rx="5" style="${st || 'fill:var(--panel);stroke:var(--dim)'}"/>${tx(x + w / 2, y + 12, s, 'dt2')}`;
  const ok = 'fill:rgba(77,200,140,.18);stroke:#4dc88c', bad = 'fill:rgba(255,180,90,.16);stroke:#e0a050';
  return svg(330, 132, en ? 'Adrenal algorithm' : 'Algoritmo suprarrenal',
    b(60, 2, 210, T[0]) + `<path d="M165 20 V28" style="${LINE}"/>` + b(80, 28, 170, T[1]) +
    `<path d="M250 37 H262" style="${LINE}"/>` + b(186, 50, 142, T[2], ok) + `<path d="M120 46 V56" style="${LINE}"/>` + b(4, 56, 170, T[3]) +
    `<path d="M90 74 V80" style="${LINE}"/>` + b(30, 80, 120, T[4]) + `<path d="M150 89 H186" style="${LINE}"/>` + b(186, 80, 142, T[5], ok) +
    `<path d="M90 98 V104" style="${LINE}"/>` + b(4, 104, 100, T[6], bad) + tx(218, 112, T[7], 'dt2') + tx(218, 122, T[8], 'dt2') + tx(218, 131, T[9], 'dt2'));
}

/** Isotope renogram (DTPA / MAG3) curves and the DMSA cortical scan. */
export function renogramDiagram(lang) {
  const en = lang === 'en';
  const T = en ? ['Renogram (DTPA: filtration · MAG3: tubular secretion)', 'normal: peak and drainage', 'obstruction: curve keeps rising', 'time', 'DMSA (cortex)', 'cold areas: pyelonephritis']
    : ['Renograma (DTPA: filtrado · MAG3: secreción tubular)', 'normal: pico y vaciado', 'obstrucción: la curva sigue subiendo', 'tiempo', 'DMSA (corteza)', 'zonas hipoactivas: pielonefritis'];
  return svg(330, 118, T[0], `${tx(110, 10, T[0], 'dt2')}
    <path d="M14 98 H206 M14 98 V18" style="${LINE}"/>${tx(196, 110, T[3], 'dt2')}
    <path d="M14 98 C30 30 46 26 60 34 S120 82 204 88" style="fill:none;stroke:#4dc88c;stroke-width:2"/>
    <path d="M14 98 C40 60 80 40 120 32 S180 22 204 20" style="fill:none;stroke:#ff7878;stroke-width:2"/>
    ${tx(132, 78, T[1], 'dt2')}${tx(112, 46, T[2], 'dt2')}
    <ellipse cx="248" cy="58" rx="16" ry="28" style="fill:#5a6470"/><ellipse cx="292" cy="58" rx="16" ry="28" style="fill:#5a6470"/>
    <path d="M300 38 L284 52 L306 56 Z" style="fill:var(--panel2)"/><path d="M296 74 L284 64 L300 82 Z" style="fill:var(--panel2)"/>
    ${tx(270, 100, T[4])}${tx(270, 112, T[5], 'dt2')}`);
}
