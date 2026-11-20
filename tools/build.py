"""Build web-ready data for the CT atlas from one TotalSegmentator case.

Usage:  python3 build.py <case_dir> <out_dir>

Outputs (out_dir):
  ct.bin         int16 HU, byte-shuffled (all low bytes, then all high bytes), gzip
  labels.bin     uint8 label map, gzip
  atlas.json     dims, spacing, structures, systems, vertebral level per slice, key levels

Array order is [z][y][x] (C order) in DISPLAY orientation:
  z = 0 most superior (head)  -> caudal
  y = 0 most anterior         -> posterior
  x = 0 patient RIGHT         -> patient left   (radiological convention)
"""
import sys, os, json, gzip, glob, time
import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(__file__))
import nii
from catalog import SYSTEMS, describe


def to_display(arr, aff):
    A = aff[:3, :3]
    assert np.allclose(A - np.diag(np.diag(A)), 0, atol=1e-3), "oblique affine not supported"
    # RAS+ world. display wants x: R->L (decreasing world x), y: A->P (decreasing world y), z: S->I (decreasing world z)
    sl = tuple(slice(None, None, -1) if A[i, i] > 0 else slice(None) for i in range(3))
    return np.ascontiguousarray(arr[sl].transpose(2, 1, 0))


def body_mask(ct):
    m = ct > -500
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 0.02 * sizes.max()]
    m = np.isin(lab, keep)
    for z in range(m.shape[0]):           # fill lungs / airways per axial slice
        m[z] = ndi.binary_fill_holes(m[z])
    return ndi.binary_dilation(m, iterations=3)


SINGLE = ("vertebrae_", "rib_", "femur", "humerus", "hip_", "scapula", "clavicula", "sternum", "sacrum",
          "skull", "brain", "heart", "liver", "spleen", "kidney_left", "kidney_right", "aorta", "trachea",
          "stomach", "pancreas", "gallbladder", "urinary_bladder", "spinal_cord", "esophagus")


def clean(m, key):
    """Remove stray segmentation fragments. Solid single organs/bones keep only their largest piece;
    everything else drops pieces smaller than 5% of the largest one."""
    lab, n = ndi.label(m)
    if n <= 1:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    if key.startswith(SINGLE):
        keep = [int(np.argmax(sizes)) + 1]
    else:
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(30, 0.05 * sizes.max())]
    return np.isin(lab, keep)


def main(case, out):
    t0 = time.time()
    os.makedirs(out, exist_ok=True)
    ct, aff, h = nii.load(os.path.join(case, "ct.nii.gz"))
    spacing = [float(abs(aff[2, 2])), float(abs(aff[1, 1])), float(abs(aff[0, 0]))]  # z,y,x
    ct = to_display(np.asarray(ct, np.int16), aff)
    print("ct", ct.shape, spacing, ct.min(), ct.max())

    body = body_mask(ct)
    zz, yy, xx = np.where(body)
    pad = 4
    z0, z1 = max(zz.min() - pad, 0), min(zz.max() + pad + 1, ct.shape[0])
    y0, y1 = max(yy.min() - pad, 0), min(yy.max() + pad + 1, ct.shape[1])
    x0, x1 = max(xx.min() - pad, 0), min(xx.max() + pad + 1, ct.shape[2])
    crop = (slice(z0, z1), slice(y0, y1), slice(x0, x1))
    ct = ct[crop].copy()
    body = body[crop]
    ct[~body] = -1000                       # remove table / clothing, keep pure air outside
    ct = np.clip(ct, -1024, 3071).astype(np.int16)
    print("cropped", ct.shape)

    # ---- labels -------------------------------------------------------------
    files = sorted(glob.glob(os.path.join(case, "segmentations", "*.nii.gz")))
    masks = {}
    for f in files:
        key = os.path.basename(f)[:-7]
        m, a2, _ = nii.load(f)
        m = to_display(np.asarray(m) > 0, a2)[crop]
        if m.any():
            masks[key] = clean(m, key)
    print(len(files), "mask files,", len(masks), "non-empty")
    # paint big structures first so small ones (cysts, appendage, vessels) stay visible on overlap
    order = sorted(masks, key=lambda k: -int(masks[k].sum()))
    keys = sorted(masks)                    # stable ids, alphabetical
    kid = {k: i + 1 for i, k in enumerate(keys)}
    labels = np.zeros(ct.shape, np.uint8)
    for k in order:
        labels[masks[k]] = kid[k]

    # ---- structures ---------------------------------------------------------
    structures = []
    for k in keys:
        m = labels == kid[k]
        n = int(m.sum())
        if n == 0:
            continue
        z, y, x = np.where(m)
        d = describe(k)
        structures.append(dict(
            id=kid[k], key=k, es=d["es"], short=d["short"], en=d["en"], short_en=d["short_en"], system=d["system"], color=d["color"],
            voxels=n, volume_ml=round(n * np.prod(spacing) / 1000, 1),
            bbox=[int(z.min()), int(z.max()), int(y.min()), int(y.max()), int(x.min()), int(x.max())],
            center=[int(np.median(z)), int(np.median(y)), int(np.median(x))],
        ))

    # ---- vertebral level for every axial slice ------------------------------
    vorder = [f"C{i}" for i in range(1, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)] + ["S1"]
    vids = [(v, kid.get("vertebrae_" + v)) for v in vorder if "vertebrae_" + v in kid]
    per = np.zeros((ct.shape[0], len(vids)), np.int32)
    for j, (v, i) in enumerate(vids):
        per[:, j] = (labels == i).sum(axis=(1, 2))
    level = []
    for z in range(ct.shape[0]):
        row = per[z]
        if row.max() > 0:
            level.append(vids[int(row.argmax())][0])
        else:
            level.append(None)
    # fill gaps between two vertebrae as disc spaces
    for z in range(len(level)):
        if level[z] is None:
            up = next((level[u] for u in range(z - 1, -1, -1) if level[u] and "–" not in level[u]), None)
            dn = next((level[u] for u in range(z + 1, len(level)) if level[u] and "–" not in level[u]), None)
            if up and dn and up != dn and abs(vorder.index(up) - vorder.index(dn)) == 1:
                level[z] = f"{up}–{dn}"
    sac = kid.get("sacrum")
    if sac:
        sz = (labels == sac).any(axis=(1, 2))
        for z in range(len(level)):
            if level[z] is None and sz[z]:
                level[z] = "Sacro"
    sk = kid.get("skull")
    if sk:
        skz = (labels == sk).any(axis=(1, 2))
        for z in range(len(level)):
            if level[z] is None and skz[z]:
                level[z] = "Cráneo"

    # ---- key levels (axial slice indices) -----------------------------------
    def zr(key):
        i = kid.get(key)
        if not i:
            return None
        z = np.where((labels == i).any(axis=(1, 2)))[0]
        return (int(z.min()), int(z.max())) if len(z) else None

    def zc(key):
        s = next((s for s in structures if s["key"] == key), None)
        return s["center"][0] if s else None

    keylevels = []

    def add(kid_, es, en, z, note_es, note_en, struct=None):
        if z is not None:
            keylevels.append(dict(id=kid_, name=es, name_en=en, z=int(z), level=level[int(z)],
                                  note=note_es, note_en=note_en, focus=struct))

    # carina: first slice (going caudal) where the trachea splits into two airway components
    tr = kid.get("trachea")
    if tr:
        zs = np.where((labels == tr).any(axis=(1, 2)))[0]
        car = None
        for z in zs:
            lab, n = ndi.label(labels[z] == tr)
            if n >= 2:
                sizes = sorted(ndi.sum(np.ones_like(lab), lab, range(1, n + 1)), reverse=True)
                if sizes[1] > 8:
                    car = z
                    break
        add("carina", "Carina", "Carina", car if car is not None else zs.max(), "Bifurcación traqueal", "Tracheal bifurcation", "trachea")
    add("brain", "Encéfalo", "Brain", zc("brain"), "", "", "brain")
    r = zr("vertebrae_C1");          r and add("atlas", "Atlas (C1)", "Atlas (C1)", (r[0] + r[1]) // 2, "Unión craneocervical", "Craniocervical junction", "vertebrae_C1")
    add("thyroid", "Tiroides", "Thyroid", zc("thyroid_gland"), "Glándula tiroides", "Thyroid gland", "thyroid_gland")
    r = zr("aorta");                 r and add("aortic-arch", "Cayado aórtico", "Aortic arch", r[0] + 4, "Parte más alta del arco aórtico", "Top of the aortic arch", "aorta")
    r = zr("brachiocephalic_trunk"); r and add("brachiocephalic-trunk", "Tronco braquiocefálico", "Brachiocephalic trunk", r[1], "Origen en el cayado", "Origin from the arch", "brachiocephalic_trunk")
    add("heart", "Corazón", "Heart", zc("heart"), "Corte de cuatro cámaras aprox.", "Approx. four-chamber level", "heart")
    r = zr("liver");                 r and add("liver-dome", "Cúpula hepática", "Liver dome", r[0] + 3, "Parte más alta del hígado", "Top of the liver", "liver")
    r = zr("esophagus");             r and add("gej", "Unión esofagogástrica", "Gastro-oesophageal junction", r[1], "Paso del esófago por el hiato", "Oesophagus through the hiatus", "esophagus")
    add("portal-vein", "Vena porta", "Portal vein", zc("portal_vein_and_splenic_vein"), "Confluente esplenoportal aprox.", "Approx. splenoportal confluence", "portal_vein_and_splenic_vein")
    add("pancreas", "Páncreas", "Pancreas", zc("pancreas"), "", "", "pancreas")
    kz = [z for z in (zc("kidney_left"), zc("kidney_right")) if z is not None]
    kz and add("renal-hila", "Hilios renales", "Renal hila", int(np.mean(kz)), "Nivel aproximado de los hilios", "Approx. level of the hila", "kidney_left")
    r = zr("aorta");                 r and add("aortic-bifurcation", "Bifurcación aórtica", "Aortic bifurcation", r[1], "Origen de las ilíacas comunes", "Origin of the common iliacs", "aorta")
    r = zr("inferior_vena_cava");    r and add("ivc-confluence", "Confluencia ilíaca (VCI)", "Iliac confluence (IVC)", r[1], "Formación de la vena cava inferior", "Formation of the IVC", "inferior_vena_cava")
    r = zr("sacrum");                r and add("sacral-promontory", "Promontorio sacro", "Sacral promontory", r[0] + 2, "", "", "sacrum")
    add("bladder", "Vejiga", "Bladder", zc("urinary_bladder"), "", "", "urinary_bladder")
    r = zr("femur_left") or zr("femur_right")
    r and add("femoral-heads", "Cabezas femorales", "Femoral heads", min(r[0] + 6, ct.shape[0] - 1), "", "", "femur_left")
    keylevels.sort(key=lambda k: k["z"])

    # ---- write --------------------------------------------------------------
    raw = ct.astype("<i2").tobytes()
    a = np.frombuffer(raw, np.uint8).reshape(-1, 2)
    shuffled = np.concatenate([a[:, 0], a[:, 1]]).tobytes()
    with gzip.open(os.path.join(out, "ct.bin"), "wb", compresslevel=9) as f:
        f.write(shuffled)
    with gzip.open(os.path.join(out, "labels.bin"), "wb", compresslevel=9) as f:
        f.write(labels.tobytes())

    used_systems = {s["system"] for s in structures}
    atlas = dict(
        title="Atlas TC de cuerpo entero", title_en="Whole-body CT atlas",
        series="TC con contraste · fase venosa portal",
        source=dict(name="TotalSegmentator dataset v2.0.1 (caso s0591)", license="CC BY 4.0",
                    url="https://zenodo.org/records/10047263",
                    citation="Wasserthal J. et al. TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. Radiology: AI 2023."),
        dims=[int(s) for s in ct.shape], spacing=spacing,
        encoding=dict(ct="int16-le-byteshuffle-gzip", labels="uint8-gzip"),
        systems=[dict(id=i, es=es, en=en, color=c) for i, es, en, c in SYSTEMS if i in used_systems],
        series_en="Contrast-enhanced CT · portal venous phase",
        structures=structures, levels=level, keylevels=keylevels,
    )
    with open(os.path.join(out, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump(atlas, f, ensure_ascii=False, separators=(",", ":"))
    for fn in ("ct.bin", "labels.bin", "atlas.json"):
        print(fn, round(os.path.getsize(os.path.join(out, fn)) / 1e6, 2), "MB")
    print("done in", round(time.time() - t0, 1), "s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
