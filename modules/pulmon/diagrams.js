// SVG diagrams (esquemas) for the lung-parenchyma module. Classes come from src/styles.css (.dsvg …).
const tx = (x, y, s, cls = 'dt') => `<text x="${x}" y="${y}" class="${cls}">${s}</text>`;
const LINE = 'fill:none;stroke:var(--dim);stroke-width:1.2';

/** Secondary pulmonary lobule: septa (veins, lymphatics) around, bronchiole + arteriole in the centre, acini. */
export function lobuleDiagram(lang) {
  const T = lang === 'en'
    ? ['Secondary pulmonary lobule', 'Interlobular septum', '(veins and lymphatics)', 'Centrilobular bronchiole', '+ arteriole', 'Acini', 'Pleura']
    : ['Lobulillo pulmonar secundario', 'Septo interlobulillar', '(venas y linfáticos)', 'Bronquiolo centrolobulillar', '+ arteriola', 'Ácinos', 'Pleura'];
  const hex = 'M110 22 L170 40 L182 98 L140 140 L80 136 L46 92 L60 40 Z';
  const ac = [[92, 70], [128, 66], [150, 98], [118, 112], [84, 104]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" class="ds" style="stroke:var(--dim);stroke-width:.5"/>`).join('');
  return `<svg viewBox="0 0 320 170" class="dsvg" role="img" aria-label="${T[0]}">
    <path d="M30 14 Q110 4 196 22" style="${LINE};stroke-dasharray:4 3"/>${tx(206, 22, T[6], 'dt2')}
    <path d="${hex}" style="fill:none;stroke:#6d8fa8;stroke-width:4"/>${ac}
    <path d="M110 160 L114 92" style="fill:none;stroke:#cdbf9b;stroke-width:5"/><path d="M120 160 L122 92" style="fill:none;stroke:#ff8fb0;stroke-width:3"/>
    <circle cx="117" cy="90" r="5" class="dh"/>
    <line x1="182" y1="70" x2="214" y2="58" style="${LINE}"/>${tx(262, 54, T[1])}${tx(262, 66, T[2], 'dt2')}
    <line x1="123" y1="90" x2="214" y2="104" style="${LINE}"/>${tx(262, 104, T[3])}${tx(262, 116, T[4], 'dt2')}
    <line x1="150" y1="98" x2="214" y2="138" style="${LINE}"/>${tx(262, 142, T[5])}
    ${tx(110, 168, T[0], 'dt2')}</svg>`;
}

/** Where each type of emphysema destroys the lobule. */
export function emphysemaDiagram(lang) {
  const T = lang === 'en'
    ? ['Centrilobular', 'centre · upper zones', 'Panlobular', 'whole lobule · lower lobes', 'Paraseptal', 'subpleural · thin wall', 'Bullous', 'bullae > 1/3 of lung']
    : ['Centrolobulillar', 'centro · zonas superiores', 'Panlobulillar', 'todo el lobulillo · inferiores', 'Paraseptal', 'subpleural · pared fina', 'Bulloso', 'bullas > 1/3 del pulmón'];
  const lob = (x, inner) => `<g transform="translate(${x},0)"><rect x="8" y="10" width="60" height="60" rx="6" style="fill:#dbe7f3;fill-opacity:.35;stroke:#6d8fa8;stroke-width:3"/>${inner}</g>`;
  const p1 = lob(0, '<circle cx="38" cy="40" r="11" style="fill:#151b22;stroke:none"/><circle cx="38" cy="40" r="2.5" class="dh"/>');
  const p2 = lob(80, '<rect x="11" y="13" width="54" height="54" rx="4" style="fill:#151b22"/><circle cx="38" cy="40" r="2" class="dh"/>');
  const p3 = lob(160, '<line x1="4" y1="6" x2="72" y2="6" style="stroke:var(--dim);stroke-width:2"/>' + [16, 30, 44, 58].map(x => `<circle cx="${x}" cy="17" r="6" style="fill:#151b22;stroke:#6d8fa8;stroke-width:.8"/>`).join('') + '<circle cx="38" cy="40" r="2.5" class="dh"/>');
  const p4 = lob(240, '<circle cx="38" cy="38" r="27" style="fill:#151b22;stroke:#6d8fa8;stroke-width:1"/>');
  const lab = (x, a, b) => tx(x + 38, 88, a) + tx(x + 38, 100, b, 'dt2');
  return `<svg viewBox="0 0 320 106" class="dsvg" role="img" aria-label="${T[0]}, ${T[2]}, ${T[4]}, ${T[6]}">${p1}${p2}${p3}${p4}${lab(0, T[0], T[1])}${lab(80, T[2], T[3])}${lab(160, T[4], T[5])}${lab(240, T[6], T[7])}</svg>`;
}

/** Golden's S sign on a PA film of the right hemithorax: concave fissure laterally + convex hilar mass medially. */
export function goldenDiagram(lang) {
  const T = lang === 'en' ? ['Collapsed RUL', 'Fissure (concave)', 'Hilar mass (convex)', 'reverse S'] : ['LSD colapsado', 'Cisura (cóncava)', 'Masa hiliar (convexa)', 'S invertida'];
  return `<svg viewBox="0 0 320 160" class="dsvg" role="img" aria-label="${T[3]}">
    <path d="M150 12 C100 12 52 40 40 110 L46 150 L190 150 L196 20 Z" style="fill:#dbe7f3;fill-opacity:.25;stroke:var(--dim)"/>
    <path d="M150 14 C110 16 70 30 56 58 C90 50 120 62 140 76 C162 92 190 86 192 62 L194 22 Z" style="fill:#cdbf9b;fill-opacity:.85"/>
    <circle cx="170" cy="80" r="20" class="dh" style="fill-opacity:.85"/>
    <path d="M56 58 C90 50 120 62 140 76 C150 84 160 100 175 100 C190 100 194 88 192 70" style="fill:none;stroke:#ff4fd8;stroke-width:2.5;stroke-dasharray:5 3"/>
    ${tx(110, 34, T[0], 'dt2')}<line x1="88" y1="56" x2="70" y2="108" style="${LINE}"/>${tx(72, 120, T[1])}
    <line x1="182" y1="94" x2="232" y2="120" style="${LINE}"/>${tx(262, 126, T[2])}${tx(262, 60, T[3])}
    <path d="M232 40 q20 -12 26 4 q4 14 -16 18 q-20 4 -14 18 q6 14 26 4" style="fill:none;stroke:#ff4fd8;stroke-width:2"/></svg>`;
}

/** "Alveolar fills, atelectasis shrinks": same lobe, same density, opposite volume. */
export function fillShrinkDiagram(lang) {
  const T = lang === 'en' ? ['Alveolar pattern', 'fills: no volume loss', 'Atelectasis', 'shrinks: fissure pulled in'] : ['Patrón alveolar', 'llena: sin pérdida de volumen', 'Atelectasia', 'encoge: la cisura se retrae'];
  const lung = x => `<path d="M${x + 20} 10 C${x + 80} 6 ${x + 120} 40 ${x + 124} 110 L${x + 14} 110 C${x + 4} 60 ${x + 6} 20 ${x + 20} 10 Z" style="fill:#dbe7f3;fill-opacity:.25;stroke:var(--dim)"/>`;
  return `<svg viewBox="0 0 320 140" class="dsvg" role="img" aria-label="${T[0]} / ${T[2]}">
    ${lung(10)}<path d="M30 12 C80 8 116 36 122 66 L18 66 C14 40 16 22 30 12 Z" style="fill:#ff8fb0;fill-opacity:.8"/>
    <path d="M40 40 l18 6 m-4 -2 l10 -8 M60 30 l16 10" style="fill:none;stroke:#151b22;stroke-width:2"/>
    <line x1="16" y1="66" x2="124" y2="66" style="stroke:var(--dim);stroke-dasharray:4 3"/>
    ${lung(170)}<path d="M190 12 C230 10 252 22 262 38 C240 40 214 50 190 58 C180 40 180 22 190 12 Z" style="fill:#ff8fb0;fill-opacity:.8"/>
    <line x1="176" y1="66" x2="284" y2="66" style="stroke:var(--dim);stroke-dasharray:4 3;opacity:.5"/>
    <path d="M190 58 C214 50 240 40 262 38" style="fill:none;stroke:#ff4fd8;stroke-width:2"/>
    ${tx(74, 126, T[0])}${tx(74, 137, T[1], 'dt2')}${tx(234, 126, T[2])}${tx(234, 137, T[3], 'dt2')}</svg>`;
}
