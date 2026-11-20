"""Structure catalog: TotalSegmentator v2 class -> Spanish/English names, system, color.

Spanish names follow Terminologia Anatomica as used in Spanish medical faculties.
'short' is the compact on-image label; 'es' is the full name shown in panels/tooltips.
"""

SYSTEMS = [
    # id, Spanish name, English name, swatch color
    ("nervioso",      "Sistema nervioso",      "Nervous system",        "#f2a0c0"),
    ("respiratorio",  "Respiratorio",          "Respiratory",           "#8fd3ff"),
    ("corazon",       "Corazón",               "Heart",                 "#ff6b6b"),
    ("arterias",      "Arterias",              "Arteries",              "#ff3b3b"),
    ("venas",         "Venas",                 "Veins",                 "#4d7cff"),
    ("digestivo",     "Digestivo",             "Digestive",             "#ffb347"),
    ("linfatico",     "Bazo",                  "Spleen",                "#b57edc"),
    ("urinario",      "Urinario",              "Urinary",               "#ffe066"),
    ("reproductor",   "Reproductor",           "Reproductive",          "#ff9ecf"),
    ("endocrino",     "Endocrino",             "Endocrine",             "#7ee0b5"),
    ("musculos",      "Músculos",              "Muscles",               "#d9785b"),
    ("esq_axial",     "Esqueleto axial",       "Axial skeleton",        "#f3e6c4"),
    ("esq_apend",     "Esqueleto apendicular", "Appendicular skeleton", "#e8d3a0"),
]

L = {"left": ("izquierdo", "izquierda", "izq.", "left"), "right": ("derecho", "derecha", "der.", "right")}


def side(key):
    if key.endswith("_left"):
        return "left"
    if key.endswith("_right"):
        return "right"
    return None


# key: (es_masc_or_fem_base, gender 'm'/'f', short, en, system, color)
BASE = {
    "brain":                 ("Encéfalo", "m", "Encéfalo", "Brain", "nervioso", "#f2a0c0"),
    "spinal_cord":           ("Médula espinal", "f", "Médula espinal", "Spinal cord", "nervioso", "#ffd1e3"),

    "trachea":               ("Tráquea", "f", "Tráquea", "Trachea", "respiratorio", "#5fd0ff"),
    "lung_upper_lobe_left":  ("Lóbulo superior del pulmón izquierdo", "m", "LSI", "Left upper lobe", "respiratorio", "#9ad7ff"),
    "lung_lower_lobe_left":  ("Lóbulo inferior del pulmón izquierdo", "m", "LII", "Left lower lobe", "respiratorio", "#6fb6f0"),
    "lung_upper_lobe_right": ("Lóbulo superior del pulmón derecho", "m", "LSD", "Right upper lobe", "respiratorio", "#a9c8ff"),
    "lung_middle_lobe_right":("Lóbulo medio del pulmón derecho", "m", "LMD", "Right middle lobe", "respiratorio", "#c6b4ff"),
    "lung_lower_lobe_right": ("Lóbulo inferior del pulmón derecho", "m", "LID", "Right lower lobe", "respiratorio", "#7d9cf0"),

    "heart":                 ("Corazón", "m", "Corazón", "Heart", "corazon", "#ff7a7a"),
    "atrial_appendage_left": ("Orejuela auricular izquierda", "f", "Orejuela izq.", "Left atrial appendage", "corazon", "#ffa07a"),

    "aorta":                 ("Aorta", "f", "Aorta", "Aorta", "arterias", "#ff2d2d"),
    "brachiocephalic_trunk": ("Tronco braquiocefálico", "m", "Tronco braquiocefálico", "Brachiocephalic trunk", "arterias", "#ff5252"),
    "subclavian_artery":     ("Arteria subclavia", "f", "A. subclavia", "Subclavian artery", "arterias", "#ff6e6e"),
    "common_carotid_artery": ("Arteria carótida común", "f", "A. carótida común", "Common carotid artery", "arterias", "#ff4040"),
    "iliac_artery":          ("Arteria ilíaca", "f", "A. ilíaca", "Iliac artery", "arterias", "#ff5c5c"),

    "superior_vena_cava":    ("Vena cava superior", "f", "VCS", "Superior vena cava", "venas", "#3d6bff"),
    "inferior_vena_cava":    ("Vena cava inferior", "f", "VCI", "Inferior vena cava", "venas", "#3d6bff"),
    "brachiocephalic_vein":  ("Vena braquiocefálica", "f", "V. braquiocefálica", "Brachiocephalic vein", "venas", "#5a82ff"),
    "portal_vein_and_splenic_vein": ("Vena porta y vena esplénica", "f", "V. porta / esplénica", "Portal and splenic vein", "venas", "#7b5cff"),
    "pulmonary_vein":        ("Venas pulmonares", "f", "Vv. pulmonares", "Pulmonary veins", "venas", "#8a6bff"),
    "iliac_vena":            ("Vena ilíaca", "f", "V. ilíaca", "Iliac vein", "venas", "#5577ff"),

    "esophagus":             ("Esófago", "m", "Esófago", "Oesophagus", "digestivo", "#ffa94d"),
    "stomach":               ("Estómago", "m", "Estómago", "Stomach", "digestivo", "#ffc078"),
    "duodenum":              ("Duodeno", "m", "Duodeno", "Duodenum", "digestivo", "#ffd43b"),
    "small_bowel":           ("Intestino delgado", "m", "Intestino delgado", "Small bowel", "digestivo", "#ffe8a3"),
    "colon":                 ("Colon", "m", "Colon", "Colon", "digestivo", "#e8a87c"),
    "liver":                 ("Hígado", "m", "Hígado", "Liver", "digestivo", "#c8553d"),
    "gallbladder":           ("Vesícula biliar", "f", "Vesícula biliar", "Gallbladder", "digestivo", "#6fd36f"),
    "pancreas":              ("Páncreas", "m", "Páncreas", "Pancreas", "digestivo", "#ffd8a8"),

    "spleen":                ("Bazo", "m", "Bazo", "Spleen", "linfatico", "#b57edc"),

    "kidney":                ("Riñón", "m", "Riñón", "Kidney", "urinario", "#ffd43b"),
    "kidney_cyst":           ("Quiste renal", "m", "Quiste renal", "Kidney cyst", "urinario", "#fff3bf"),
    "urinary_bladder":       ("Vejiga urinaria", "f", "Vejiga", "Urinary bladder", "urinario", "#ffec99"),

    "prostate":              ("Próstata", "f", "Próstata", "Prostate", "reproductor", "#ff9ecf"),

    "thyroid_gland":         ("Glándula tiroides", "f", "Tiroides", "Thyroid gland", "endocrino", "#63e6be"),
    "adrenal_gland":         ("Glándula suprarrenal", "f", "Suprarrenal", "Adrenal gland", "endocrino", "#96f2d7"),

    "autochthon":            ("Musculatura paravertebral profunda", "f", "M. paravertebral", "Deep back muscles (erector spinae)", "musculos", "#c9644a"),
    "iliopsoas":             ("Músculo iliopsoas", "m", "M. iliopsoas", "Iliopsoas", "musculos", "#e07a5f"),
    "gluteus_maximus":       ("Músculo glúteo mayor", "m", "Glúteo mayor", "Gluteus maximus", "musculos", "#d4694f"),
    "gluteus_medius":        ("Músculo glúteo medio", "m", "Glúteo medio", "Gluteus medius", "musculos", "#e8907a"),
    "gluteus_minimus":       ("Músculo glúteo menor", "m", "Glúteo menor", "Gluteus minimus", "musculos", "#f0a896"),

    "skull":                 ("Cráneo", "m", "Cráneo", "Skull", "esq_axial", "#f3e6c4"),
    "sternum":               ("Esternón", "m", "Esternón", "Sternum", "esq_axial", "#efe0b8"),
    "costal_cartilages":     ("Cartílagos costales", "m", "Cartílagos costales", "Costal cartilages", "esq_axial", "#cfe3d4"),
    "sacrum":                ("Sacro", "m", "Sacro", "Sacrum", "esq_axial", "#ead9ae"),

    "clavicula":             ("Clavícula", "f", "Clavícula", "Clavicle", "esq_apend", "#e8d3a0"),
    "scapula":               ("Escápula", "f", "Escápula", "Scapula", "esq_apend", "#e0c890"),
    "humerus":               ("Húmero", "m", "Húmero", "Humerus", "esq_apend", "#ecd9a8"),
    "hip":                   ("Hueso coxal", "m", "Coxal", "Hip bone", "esq_apend", "#e4cf98"),
    "femur":                 ("Fémur", "m", "Fémur", "Femur", "esq_apend", "#f0dfb0"),
}

# compact English on-image labels (default: the full English name)
SHORT_EN = {
    "lung_upper_lobe_left": "LUL", "lung_lower_lobe_left": "LLL", "lung_upper_lobe_right": "RUL",
    "lung_middle_lobe_right": "RML", "lung_lower_lobe_right": "RLL", "atrial_appendage_left": "L atrial appendage",
    "superior_vena_cava": "SVC", "inferior_vena_cava": "IVC", "portal_vein_and_splenic_vein": "Portal / splenic v.",
    "pulmonary_vein": "Pulmonary vv.", "subclavian_artery": "Subclavian a.", "common_carotid_artery": "Common carotid a.",
    "iliac_artery": "Iliac a.", "iliac_vena": "Iliac v.", "brachiocephalic_vein": "Brachiocephalic v.",
    "urinary_bladder": "Bladder", "thyroid_gland": "Thyroid", "adrenal_gland": "Adrenal",
    "autochthon": "Paraspinal m.", "costal_cartilages": "Costal cartilages",
}

VERT_COLORS = {"C": "#ffe3a3", "T": "#f7d794", "L": "#f3c77a", "S": "#ead9ae"}
VERT_SPECIAL = {"C1": "Atlas (C1)", "C2": "Axis (C2)"}
ORD = {1: "1.ª", 2: "2.ª", 3: "3.ª", 4: "4.ª", 5: "5.ª", 6: "6.ª", 7: "7.ª", 8: "8.ª", 9: "9.ª", 10: "10.ª", 11: "11.ª", 12: "12.ª"}


def describe(key):
    """Return dict(es, short, en, system, color) for a TotalSegmentator key."""
    if key.startswith("vertebrae_"):
        v = key.split("_")[1]
        es = VERT_SPECIAL.get(v, f"Vértebra {v}")
        en = {"C1": "Atlas (C1)", "C2": "Axis (C2)"}.get(v, f"Vertebra {v}")
        return dict(es=es, short=v, en=en, short_en=v, system="esq_axial", color=VERT_COLORS[v[0]])
    if key.startswith("rib_"):
        _, s, n = key.split("_")
        n = int(n)
        sp = L[s]
        tint = ["#ffe0b2", "#ffd59e", "#ffcc80", "#f5c06a"][n % 4]
        return dict(es=f"{ORD[n]} costilla {sp[1]}", short=f"{n}.ª cost. {sp[2]}", en=f"{s.capitalize()} rib {n}",
                    short_en=f"{s[0].upper()} rib {n}", system="esq_axial", color=tint)
    if key in BASE:
        es, g, short, en, sysid, col = BASE[key]
        return dict(es=es, short=short, en=en, short_en=SHORT_EN.get(key, en), system=sysid, color=col)
    s = side(key)
    base = key.rsplit("_", 1)[0]
    es, g, short, en, sysid, col = BASE[base]
    sp = L[s]
    adj = sp[0] if g == "m" else sp[1]
    # lighten/darken paired structures slightly so left/right are distinguishable
    col = shade(col, 1.12 if s == "left" else 0.88)
    se = SHORT_EN.get(base, en)
    return dict(es=f"{es} {adj}", short=f"{short} {sp[2]}", en=f"{sp[3].capitalize()} {en[0].lower() + en[1:]}",
                short_en=f"{sp[3][0].upper()} {se[0].lower() + se[1:] if se[1:2].islower() else se}", system=sysid, color=col)


def shade(hexcol, f):
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (max(0, min(255, int(round(c * f)))) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"
