# Whole-body CT atlas · Atlas TC de cuerpo entero

**Live demo:** https://ferasmed-dev.github.io/whole-body-ct-atlas/ · English: https://ferasmed-dev.github.io/whole-body-ct-atlas/?lang=en

An interactive, browser-only atlas of a real contrast-enhanced CT from the skull vertex to the femoral heads, with **pathology modules** that draw each topic's lesions on the same real anatomy. Scroll through axial, coronal and sagittal slices, or all three linked; switch 115 segmented structures on and off by system; hover any pixel for its name, system, vertebral level and Hounsfield value; and jump straight to the classic landmark levels (carina, aortic arch, gastro-oesophageal junction, renal hila, aortic bifurcation…). Spanish by default, with an English switch.

![Axial slice at L1 with labelled organs, vessels and muscles](docs/screenshot.png)

## What it shows

- **Real anatomy, not drawings.** One portal-venous-phase CT (1.5 mm isotropic voxels, 531 × 224 × 275) with expert-reviewed segmentations of 115 structures in 12 systems: nervous (2), respiratory (6 — the five lobes + trachea), heart (2), arteries (8), veins (8), digestive (8), spleen (1), urinary (4), endocrine (3), muscles (10), axial skeleton (53 — every vertebra C1–S1, all 24 ribs, sternum, sacrum, skull, costal cartilages) and appendicular skeleton (10).
- **Three planes, or all three linked.** In the triple view a click in any plane moves the crosshair and the other two follow. A coronal scout shows where the axial slice sits.
- **Labels with leader lines**, placed in two columns that never overlap. Organs and vessels get priority over bones; vertebrae are labelled automatically in the sagittal plane, where they line up; ribs are labelled on hover or selection.
- **Hover to identify** (name in both languages, system, vertebral level, HU). Click to select. **Isolate** shows one structure alone.
- **Windowing** with the standard presets (soft tissue 40/400, mediastinum 50/350, lung −600/1500, bone 400/1800, brain 40/80, liver 70/170, vascular 150/600) and free window/level by dragging.
- **Vertebral level of every axial slice**, computed from the vertebra masks (disc spaces show as "T12–L1").
- **Key levels**: 17 one-click landmarks, each with its vertebral level in this patient.
- **Measure** distances in mm. **Fill / outline / no-colour** overlays with adjustable opacity.
- **Phone-friendly**: swipe to scroll slices, pinch to zoom, two fingers to pan; the structure list becomes a drawer.

## Pathology modules

The **Patología / Pathology** tab turns the atlas into a pathology simulator. A module takes one topic (for example *Columna y médula*) and draws every entity of it **on this patient's real CT, at its real anatomical site**, found from the masks: a wedge fracture collapses the chosen vertebral body, a disc herniation comes out of the disc space between two real vertebrae, an abscess sits inside the real psoas.

For each entity you get:

- **Sliders and toggles** for what changes the image: size, grade, level, time course (e.g. spondylodiscitis at onset / 2 weeks / 8–12 weeks), acute vs chronic, **con / sin contraste**, and **sin / con tratamiento** (cement, injection, response to antibiotics).
- **Técnica correcta vs equivocada.** Each entity lists the techniques the topic mentions, marked *técnica de elección* (★), *útil* or *no es la adecuada*, with one line on what each one shows or misses. Switching technique switches the image:
  - **CT**: the real study, with the lesion drawn in Hounsfield units (hover reads the simulated HU);
  - **Simulated plain film (Rx)**: a digitally reconstructed radiograph (DRR) computed from the CT, AP (coronal) or lateral (sagittal), with the lesion included;
  - **Simulated MR (T1, T2, STIR)**: a pseudo-MR made from tissue density and anatomy (fat, fluid, marrow, oedema, flow void), so the contrasts the topic teaches — acute fracture bright on STIR, infected disc low T1 / high T2 — can be seen. Always badged *simulación*.
  - **Contrast phases** (unenhanced, arterial, portal, delayed) are simulated from the acquired portal phase with per-organ HU targets.
- **Side-by-side compare** of look-alikes (wedge vs burst, Jefferson vs hangman's, adult spondylodiscitis vs childhood discitis…), synchronised slice and zoom.
- **Measurements** (heights, canal occupancy, disc height…), **teaching marks** that point at the sign, and the entity's *where / what you see / technique / differential / tip*.
- **Coverage tag** on every entity, so it is always clear how real the picture is: *TC real* (drawn on existing masks), *TC aprox.* (site estimated: no mask for that structure), *Necesita data kit* (needs a mask or case that does not exist yet), *Simulación* (film, MR or phase simulated from CT), *Esquema* (an adult CT cannot show it; explained with a diagram).
- **Flags** where the course material is outdated or inconsistent, or where the module adds something beyond it (*Ampliación*), so nothing beyond the syllabus is presented as course content.
- **Exam mode**: identify the lesion, click on it, name its vertebral level, or answer written questions based on the topic's self-test; labels, level badge and lesion names are hidden while you answer.

### Modules

| Module | Entities | Coverage on s0591 (primary tag) |
|---|---|---|
| `columna` — Columna y médula | 12: compression (wedge) fracture, vertebroplasty, Jefferson, hangman's, burst, pyogenic spondylodiscitis, paravertebral / epidural abscess, childhood discitis, facet osteoarthritis, synovial cyst, uncovertebral osteoarthritis, disc herniation | 5 real CT · 6 approx. · 1 diagram |
| `pulmon` — Parénquima pulmonar | 41: alveolar pattern and the five consolidation patterns, nine atelectasis types (incl. Golden's S and round atelectasis), angiogram sign and fluid bronchogram, secondary lobule, HRCT patterns (nodules, honeycombing, peribronchovascular, septal, ground glass, crazy paving), bronchiectasis, chronic bronchitis, emphysema (film signs, centrilobular, panlobular, paraseptal, bullous), solitary nodule benign vs malignant, pseudonodules, multiple nodules, central and peripheral carcinoma, Pancoast, ARDS/COVID-19 | 28 real · 7 approx. · 3 data kit · 2 sim · 1 diagram |
| `mediastino` — Mediastino y pleura | 46: techniques and compartments; anterior, middle and posterior masses; aortic aneurysm, intramural haematoma, penetrating ulcer, dissection (Stanford); pulmonary hypertension, PE, pneumomediastinum; fissures, effusions (free, subpulmonary, loculated, phantom tumour), empyema, haemothorax, malignant effusion, pleural thickening, asbestos plaques, mesothelioma, pneumothorax and tension pneumothorax; chest-wall and diaphragm lesions | 28 real · 13 approx. · 3 data kit · 2 sim |
| `higado` — Hígado, vía biliar y páncreas | 37: multiphase technique, MR sequences, hepatocyte-specific agents, contrast US, Couinaud; steatosis, haemochromatosis, cirrhosis, portal hypertension; cyst, hydatid, abscess, haemangioma, FNH, adenoma, cirrhotic nodules, HCC, intrahepatic cholangiocarcinoma, metastases; biliary anatomy and clinical triad, gallstones, cholecystitis (incl. emphysematous), gallbladder carcinoma, choledocholithiasis, Klatskin, extrahepatic cholangiocarcinoma; pancreatic techniques, oedematous and necrotising pancreatitis, chronic pancreatitis, adenocarcinoma, NET, serous / mucinous / IPMN | 23 real · 6 approx. · 5 sim · 2 data kit · 1 diagram |
| `urinario` — Urinario, suprarrenales y próstata | 19: Bosniak on the patient's real right renal cyst, complicated cyst, angiomyolipoma, renal cell carcinoma (corticomedullary / nephrographic / excretory, IVC thrombus), bladder tumour, pyelonephritis, hydronephrosis, stones (film vs CT), dual-energy CT, ureteric jet, functional tests, adrenal incidentaloma algorithm with washout, adenoma, myelolipoma, metastasis, adrenal carcinoma, prostate zones, BPH, prostate cancer | 11 real · 3 approx. · 3 sim · 2 data kit |

**What the data kit would add** (one-time TotalSegmentator run, see the coverage tags): `lung_vessels` (open licence) for bronchiectasis, fluid bronchogram and segmental PE; `liver_segments` + `liver_vessels` (open) for Couinaud; an arterial-phase angio-CT case for real arterial phases; a male case with a prostate mask + an MRI case for the prostate entities; a female case + `breasts` (open) for the breast prosthesis. `heartchambers_highres` (pulmonary trunk, chambers) is free only for non-commercial use.

### Module links

Add these to any atlas link (the usual `view`, `w`, `lang`… still work):

| Parameter | Values | Example |
|---|---|---|
| `module` | module slug | `?module=columna` |
| `e` | entity id | `?module=columna&e=estallido` |
| `p` | parameters that differ from the defaults, `id:value` separated by commas | `?module=columna&e=compresion&p=level:T12,loss:40` |
| `t` | technique id | `?module=columna&e=compresion&t=stir` |
| `cmp` | entity to compare side by side | `?module=columna&e=jefferson&cmp=ahorcado` |
| `tx` | `1` — show the treated state | `?module=columna&e=compresion&tx=1` |
| `ph` | `sin`, `arterial`, `portal`, `tardia` | `?module=columna&e=absceso&ph=sin` |
| `exam` | `1` — open straight into the exam | `?module=columna&exam=1` |

Ready-made: [acute wedge fracture on STIR](https://ferasmed-dev.github.io/whole-body-ct-atlas/?module=columna&e=compresion&t=stir) · [wedge vs burst](https://ferasmed-dev.github.io/whole-body-ct-atlas/?module=columna&e=compresion&cmp=estallido) · [discitis: normal film at onset](https://ferasmed-dev.github.io/whole-body-ct-atlas/?module=columna&e=espondilodiscitis&t=rx&p=stage:inicio) · [spine exam](https://ferasmed-dev.github.io/whole-body-ct-atlas/?module=columna&exam=1).

### How a module is built

A module is one file, `modules/<slug>/module.js`, holding data and small build functions; the engine does the rest. Each entity declares its parameters, techniques, treatment, look-alikes and texts (Spanish and English), and a `build(params, anatomy, env)` that returns **lesion primitives** placed with the anatomy helpers:

- primitives (`src/pathology.js`): `blob` (ellipsoid with soft or spiculated margin, rim, necrotic core, calcification pattern), `fill` (change a whole structure or part of it), `shell` (band outside a structure: wall thickening, effusion), `layer` (dependent layer inside a structure), `warp` (geometric deformation: collapse, slip, displacement), `plane` (fracture line), `tube` (duct, vessel, needle or trocar track), `cols` (per-voxel function) and `mark` (teaching arrow). Any of them can carry phase-dependent HU and pseudo-MR signal;
- anatomy helpers: structure boxes and centres, vertebral body / canal / pedicles of any vertebra, the intervertebral disc between two vertebrae (found column by column, so the lordotic tilt does not matter), cord position per slice, vertebral level per slice.

The engine turns the primitives into a **patch** (a small box of HU, labels and MR signal) that the viewer lays over the real volume, so lesions cost milliseconds and the 16 MB study is never copied. `src/modules.js` validates every module against `data/atlas.json` (bilingual texts, structures that exist, valid parameters and techniques) and generates exam questions; `tests/modules.test.js` builds every entity with default and random parameters and checks that the lesion lands where the view looks.

To add a module: write `modules/<slug>/module.js` and add one line to `REGISTRY` in `src/modules.js`. Interface strings live in `src/i18n.js` (`mod.*`); module content strings live in the module file.

### Limits of the simulation

- The lesions are **teaching simulations** drawn on one adult man's portal-venous CT. They show where things are and what changes; they are not real pathology images.
- **Simulated MR and plain film** are derived from CT density and anatomy. They reproduce the contrasts the topics teach, not MR physics or radiographic technique.
- **Approximate sites**: structures the dataset does not segment (facet joints, discs, nodes, pleura, biliary tree…) are placed from neighbouring masks and tagged *TC aprox.*
- The thorax of this patient may show trauma findings; check the chosen level before reading a simulated fracture. The left lower lobe already has real posterior consolidation / atelectasis, so the lung module avoids it as a target.
- Simulated tissue gets CT-like grain (~12 HU) so it blends with the real image noise; ultrasound, Doppler, diffusion MR and nuclear medicine are not simulated (they appear as notes or diagrams).

## Curriculum fit

For students and teachers at any Spanish medical faculty. Cross-sectional anatomy belongs to **Module I** (*Morfología, estructura y función del cuerpo humano*) and imaging to **Module IV** (*Procedimientos diagnósticos y terapéuticos*) of Orden ECI/332/2008. It supports *Anatomía Humana* (all faculties), and *Radiología General* / *Radiología y Medicina Física* / *Diagnóstico por la Imagen*, whatever each faculty calls them. Recognising structures and vertebral levels on CT is routinely examined in the MIR image questions.

## For teachers

Every view can be shared as a link, so you can project or send an exact slice. The **link** button in the toolbar copies the current state. You can also write the parameters by hand:

| Parameter | Values | Example |
|---|---|---|
| `view` | `axial` (default), `coronal`, `sagittal`, `triple` | `?view=triple` |
| `level` | key-level id (table below) | `?level=carina` |
| `s` | structure key (TotalSegmentator name) — selects and centres it | `?s=pancreas` |
| `iso` | `1` — show only the selected structure | `?s=aorta&iso=1` |
| `w` | `soft`, `mediastinum`, `lung`, `bone`, `brain`, `liver`, `vascular` | `?w=lung` |
| `z` | axial slice number (1–531, head → feet) | `?z=246` |
| `labels` | `all` (default), `hover`, `none` — `hover`/`none` turn it into a self-test | `?labels=none` |
| `lang` | `es` (default), `en` | `?lang=en` |

Ready-made links:

- Carina in the lung window: [`?level=carina&w=lung`](https://ferasmed-dev.github.io/whole-body-ct-atlas/?level=carina&w=lung)
- Pancreas, coronal, alone: [`?view=coronal&s=pancreas&iso=1`](https://ferasmed-dev.github.io/whole-body-ct-atlas/?view=coronal&s=pancreas&iso=1)
- Aorta in the triple view: [`?view=triple&s=aorta`](https://ferasmed-dev.github.io/whole-body-ct-atlas/?view=triple&s=aorta)
- Renal hila without labels (quiz): [`?level=renal-hila&labels=hover`](https://ferasmed-dev.github.io/whole-body-ct-atlas/?level=renal-hila&labels=hover)
- Spine in the bone window: [`?view=sagittal&w=bone`](https://ferasmed-dev.github.io/whole-body-ct-atlas/?view=sagittal&w=bone)

## Key levels

Computed from the masks by `tools/build.py`. The vertebral level is where it falls in this patient; textbook levels are the usual reference values (individual variation of one level is normal).

| id | Landmark | How it is found | This patient | Textbook |
|---|---|---|---|---|
| `brain` | Brain | median slice of the brain mask | — | — |
| `atlas` | Atlas (C1) | middle of C1 | C1 | C1 |
| `thyroid` | Thyroid | median slice of the thyroid | T1 | C5–T1 |
| `brachiocephalic-trunk` | Brachiocephalic trunk | lowest slice of the trunk (origin) | T4 | T3–T4 |
| `aortic-arch` | Aortic arch | top of the aorta + 6 mm | T4 | T4 |
| `carina` | Carina | first slice where the trachea splits in two | T5 | T4–T5 |
| `heart` | Heart | median slice of the heart (≈ four-chamber) | T9 | T8–T9 |
| `liver-dome` | Liver dome | top of the liver + 4.5 mm | T10 | T8–T9 |
| `gej` | Gastro-oesophageal junction | lowest slice of the oesophagus | T11 | T11 (hiatus T10) |
| `portal-vein` | Portal vein | median slice of the portal/splenic vein | T12 | L1–L2 |
| `pancreas` | Pancreas | median slice of the pancreas | T12 | L1–L2 |
| `renal-hila` | Renal hila | mean of the two kidney median slices | L1 | L1–L2 |
| `aortic-bifurcation` | Aortic bifurcation | lowest slice of the aorta | L4 | L4 |
| `ivc-confluence` | Iliac confluence (IVC) | lowest slice of the IVC | L4 | L5 |
| `sacral-promontory` | Sacral promontory | top of the sacrum + 3 mm | L5 (lower end) | S1 |
| `bladder` | Bladder | median slice of the bladder | sacrum | — |
| `femoral-heads` | Femoral heads | top of the femurs + 9 mm | sacrum | — |

Mean attenuation in this study (portal venous phase), useful for teaching HU: lung (right upper lobe) −686 HU, liver 101, spleen 129, kidney 164, aorta 235, portal/splenic vein 159, urine 15, gallbladder 8, femur 353.

## Data and processing

- **Source:** case **s0591** of the [TotalSegmentator dataset v2.0.1](https://zenodo.org/records/10047263) (University Hospital Basel, CC BY 4.0). It was chosen from the 102-case subset as the scan with contrast, low noise, complete brain and arms down that also covers the femoral heads.
- **`tools/build.py`** (Python 3, numpy, scipy; no other dependencies — `tools/nii.py` reads NIfTI directly):
  1. reorients to the display convention (radiological: patient right on the screen's left; anterior up; head first);
  2. crops to the body and sets everything outside it (table, clothing) to air (−1000 HU);
  3. cleans each mask (solid organs and bones keep their largest connected piece; others drop pieces < 5 % of the largest) — this removed, for example, a stray "L4" fragment inside the skull;
  4. merges the masks into one label map (smaller structures painted last so they stay visible on overlaps);
  5. computes the per-slice vertebral level and the key levels;
  6. writes `data/ct.bin` (int16 HU, byte-shuffled, gzip — 16 MB), `data/labels.bin` (uint8, gzip — 0.6 MB) and `data/atlas.json` (names ES/EN, systems, colours, bounding boxes, levels).
- **`tools/catalog.py`** holds the Spanish (Terminologia Anatomica as used in Spanish faculties) and English names, the systems and the colours.
- **`tools/b64split.py`** writes base64 text copies of the binaries, for hosts that refuse `.bin` files; the viewer falls back to them automatically.

To rebuild from the dataset:

```bash
python3 tools/build.py /path/to/Totalsegmentator_dataset_small_v201/s0591 data
```

## Known limitations

- **Coverage** ends at the femoral heads (skull to hips). Lower limbs are not included.
- **One patient.** Normal variation (one vertebral level either way) is expected. The scan comes from a trauma CT (dataset metadata: trauma, thorax), so the thorax may show non-anatomical findings.
- **Automatic segmentation.** The dataset's masks were reviewed by experts but edges can be off by a voxel or two, especially small vessels and bowel. The prostate mask is empty in this case and is not listed.
- **What is not segmented** by the source dataset: coeliac trunk, superior mesenteric artery and vein, renal vessels, lymph nodes, abdominal-wall muscles, intracranial anatomy beyond "brain". Key levels such as the coeliac trunk therefore cannot be computed.
- Key levels are computed rules (see the table), not hand-picked slices.

## Layout

```
index.html            page shell (Spanish by default)
src/core.js           pure functions: decoding, windowing LUT, plane geometry, slice extraction, label layout, search, deep links
src/pathology.js      pure pathology engine: lesion primitives → patches, anatomy helpers, contrast phases, pseudo-MR, simulated film
src/modules.js        module registry, validation, parameters, module deep links, exam questions (pure)
src/modui.js          pathology tab: entity picker, sliders, techniques, compare, exam
src/i18n.js           all interface strings, ES + EN
src/ui.js             loading, canvas rendering, interaction, sidebar, language switch; exposes window.__atlas for checks
src/styles.css        dark workstation look; panels follow the OS light/dark setting
modules/<slug>/       one pathology module per topic (content + build functions)
data/                 ct.bin, labels.bin, atlas.json (generated)
tools/                Python data pipeline
tests/                node:test — core, data integrity, pathology engine, modules
docs/screenshot.png
```

## Run locally

ES modules and `fetch` need a web server (opening the file directly will not work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

```bash
npm test     # node --test, Node 20+
```

43 tests (about two minutes: the module tests build every entity):

- **Core (12):** byte decoding, windowing, plane geometry round-trips, slice extraction in every plane, label anchoring and layout, search, deep-link validation.
- **Data (7):** sizes and voxel counts, bilingual names, physiological HU (lung < −600, enhanced aorta > 120, liver 60–160, urine −10 to 40, bone > 250), radiological orientation (liver left of spleen on screen, sternum anterior to the cord, head before pelvis), vertebrae in order C1 → S1, key levels within one level of the textbook value.
- **Pathology engine (13):** every primitive (size, label, within/outside, rim/core, outer and inner bands, dependent and non-dependent layers, radial dilation, fracture plane, tube, warp), patches applied identically in all three planes, simulated film equal to the projection of the patched volume, phase shifts, pseudo-MR contrasts without jumps, and the anatomy helpers on the real masks (vertebral bodies in front of the canal, discs between adjacent bodies).
- **Modules (11):** each module validates against the atlas; every entity builds a lesion near where its view looks, with default and random parameters; key numbers of the topic are shown (fracture deficits 0 / 0 / 25 / 50 %, ≈ 3 mm wedge); deep links round-trip; exam questions are well formed and reproducible; Spanish and English strings match; no course-material references in module text.

They run on every push (`.github/workflows/test.yml`).

## Deploy

GitHub → Settings → Pages → Deploy from a branch → `main` / `(root)`. The site appears at `https://ferasmed-dev.github.io/whole-body-ct-atlas/` after a minute or two.

## References

- Wasserthal J, Breit HC, Meyer MT, et al. TotalSegmentator: robust segmentation of 104 anatomic structures in CT images. *Radiol Artif Intell.* 2023;5(5):e230024. Dataset v2.0.1: https://zenodo.org/records/10047263 (CC BY 4.0).
- Federative International Programme for Anatomical Terminology. *Terminologia Anatomica*, 2nd ed. 2019.
- Standard window settings and vertebral landmark levels as in Moore KL, Dalley AF, Agur AMR. *Clinically Oriented Anatomy* and Weir J, Abrahams PH. *Imaging Atlas of Human Anatomy*.

## Licence

Code: MIT © 2026 Feras Elhissi. Data in `data/`: derived from TotalSegmentator, CC BY 4.0 — see [LICENSE](LICENSE).

*Teaching tool · not for clinical use.*
