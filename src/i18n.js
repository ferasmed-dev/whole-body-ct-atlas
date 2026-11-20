// All interface strings, Spanish (default) and English.
// Structure, system and key-level names live in data/atlas.json (es/en fields).

export const STRINGS = {
  es: {
    title: 'Atlas TC de cuerpo entero',
    kicker: 'Radiología · TC',
    loading: 'Cargando el estudio (≈17 MB). La primera vez puede tardar unos segundos.',
    decompressing: 'Descomprimiendo…',
    loadError: 'Error al cargar: ',
    search: 'Buscar estructura… (p. ej. páncreas)',
    systems: 'Sistemas', all: 'Todos', none: 'Ninguno', opacity: 'Opacidad del color',
    axial: 'Axial', coronal: 'Coronal', sagittal: 'Sagital', triple: 'Triple',
    win: { soft: 'Partes blandas', mediastinum: 'Mediastino', lung: 'Pulmón', bone: 'Hueso', brain: 'Cerebro', liver: 'Hígado', vascular: 'Vascular', custom: 'Personalizada' },
    winTitle: 'Ventana', toolTitle: 'Herramienta al arrastrar', ovTitle: 'Color de las estructuras', lblTitle: 'Etiquetas',
    pan: 'Mover', window: 'Ventana', measure: 'Medir',
    fill: 'Relleno', outline: 'Contorno', nocolor: 'Sin color',
    labels: 'Etiquetas', onhover: 'Al pasar', hidden: 'Ocultas',
    zoomIn: 'Acercar', zoomOut: 'Alejar', fit: 'Ajustar', help: 'Controles', copyLink: 'Copiar enlace', copied: 'Enlace copiado', menu: 'Estructuras',
    keyLevels: 'Niveles clave', vertLevel: 'Nivel vertebral del corte axial actual',
    centre: 'Centrar', isolate: 'Aislar', close: 'Cerrar', showHide: 'Mostrar/ocultar', scoutTitle: 'Pulsa para saltar a ese nivel',
    hu: 'UH', ml: 'ml',
    orient: { axial: ['D', 'I', 'A', 'P'], coronal: ['D', 'I', 'Sup', 'Inf'], sagittal: ['A', 'P', 'Sup', 'Inf'] },
    level: { 'Cráneo': 'Cráneo', 'Sacro': 'Sacro' },
    footer: 'Datos: <a href="https://zenodo.org/records/10047263" target="_blank" rel="noopener">TotalSegmentator</a> (Wasserthal et&nbsp;al., CC&nbsp;BY&nbsp;4.0), caso s0591. Segmentación automática revisada por expertos; puede contener pequeños errores.',
    disclaimer: 'Herramienta docente · no apta para uso clínico',
    helpRows: [
      ['Recorrer cortes', 'Rueda del ratón · <kbd>↑</kbd> <kbd>↓</kbd> · barra inferior · en móvil, desliza con un dedo'],
      ['Zoom', '<kbd>Ctrl</kbd> + rueda · pellizcar con dos dedos · botones + / −'],
      ['Mover la imagen', 'Herramienta <b>Mover</b> y arrastrar · botón central · dos dedos en móvil'],
      ['Ventana (brillo/contraste)', 'Herramienta <b>Ventana</b> y arrastrar · botón derecho · presets'],
      ['Medir distancias', 'Herramienta <b>Medir</b> y arrastrar (mm)'],
      ['Identificar', 'Pasa el cursor: nombre, sistema, nivel vertebral y unidades Hounsfield (UH)'],
      ['Seleccionar', 'Clic sobre una estructura o en la lista · <b>Aislar</b> para verla sola'],
      ['Vista triple', 'Clic en cualquier plano para mover la cruz y sincronizar los otros dos'],
      ['Compartir', '<b>Copiar enlace</b> guarda el plano, el nivel, la estructura y la ventana actuales'],
      ['Atajos', '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> planos · <kbd>E</kbd> etiquetas · <kbd>C</kbd> color · <kbd>Esc</kbd> deseleccionar'],
    ],
    helpNote: 'Orientación radiológica: el lado derecho del paciente (D) aparece a la izquierda de la pantalla. A = anterior, P = posterior, Sup/Inf = superior/inferior.',
  },
  en: {
    title: 'Whole-body CT atlas',
    kicker: 'Radiology · CT',
    loading: 'Loading the study (≈17 MB). The first time can take a few seconds.',
    decompressing: 'Decompressing…',
    loadError: 'Loading error: ',
    search: 'Search structure… (e.g. pancreas)',
    systems: 'Systems', all: 'All', none: 'None', opacity: 'Colour opacity',
    axial: 'Axial', coronal: 'Coronal', sagittal: 'Sagittal', triple: 'Triple',
    win: { soft: 'Soft tissue', mediastinum: 'Mediastinum', lung: 'Lung', bone: 'Bone', brain: 'Brain', liver: 'Liver', vascular: 'Vascular', custom: 'Custom' },
    winTitle: 'Window', toolTitle: 'Drag tool', ovTitle: 'Structure colour', lblTitle: 'Labels',
    pan: 'Pan', window: 'Window', measure: 'Measure',
    fill: 'Fill', outline: 'Outline', nocolor: 'No colour',
    labels: 'Labels', onhover: 'On hover', hidden: 'Hidden',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', help: 'Controls', copyLink: 'Copy link', copied: 'Link copied', menu: 'Structures',
    keyLevels: 'Key levels', vertLevel: 'Vertebral level of the current axial slice',
    centre: 'Centre', isolate: 'Isolate', close: 'Close', showHide: 'Show/hide', scoutTitle: 'Click to jump to that level',
    hu: 'HU', ml: 'ml',
    orient: { axial: ['R', 'L', 'A', 'P'], coronal: ['R', 'L', 'Sup', 'Inf'], sagittal: ['A', 'P', 'Sup', 'Inf'] },
    level: { 'Cráneo': 'Skull', 'Sacro': 'Sacrum' },
    footer: 'Data: <a href="https://zenodo.org/records/10047263" target="_blank" rel="noopener">TotalSegmentator</a> (Wasserthal et&nbsp;al., CC&nbsp;BY&nbsp;4.0), case s0591. Automatic segmentation reviewed by experts; may contain small errors.',
    disclaimer: 'Teaching tool · not for clinical use',
    helpRows: [
      ['Scroll slices', 'Mouse wheel · <kbd>↑</kbd> <kbd>↓</kbd> · bottom slider · on a phone, swipe with one finger'],
      ['Zoom', '<kbd>Ctrl</kbd> + wheel · pinch with two fingers · + / − buttons'],
      ['Pan', '<b>Pan</b> tool and drag · middle button · two fingers on a phone'],
      ['Window (brightness/contrast)', '<b>Window</b> tool and drag · right button · presets'],
      ['Measure distances', '<b>Measure</b> tool and drag (mm)'],
      ['Identify', 'Hover: name, system, vertebral level and Hounsfield units (HU)'],
      ['Select', 'Click a structure or pick it in the list · <b>Isolate</b> to see it alone'],
      ['Triple view', 'Click in any plane to move the crosshair and sync the other two'],
      ['Share', '<b>Copy link</b> keeps the current plane, level, structure and window'],
      ['Shortcuts', '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> planes · <kbd>E</kbd> labels · <kbd>C</kbd> colour · <kbd>Esc</kbd> deselect'],
    ],
    helpNote: 'Radiological orientation: the patient\'s right (R) is shown on the left of the screen. A = anterior, P = posterior, Sup/Inf = superior/inferior.',
  },
};

export function pickLang(param) {
  if (param === 'es' || param === 'en') return param;
  try { const s = localStorage.getItem('ctatlas.lang'); if (s === 'es' || s === 'en') return s; } catch (e) { /* storage blocked */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  return nav.some(l => /^es\b/i.test(l || '')) || !nav.some(l => /^en\b/i.test(l || '')) ? 'es' : 'en';
}
