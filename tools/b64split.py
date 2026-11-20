"""Write base64 text copies of the binary data files, split into <=12 MB parts.
Some hosts (e.g. the claude.ai artifact preview) refuse .bin files; the viewer falls back to these."""
import base64, json, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else 'site/data'
atlas = json.load(open(os.path.join(d, 'atlas.json'), encoding='utf-8'))
atlas['b64'] = {}
for name in ('ct', 'labels'):
    raw = open(os.path.join(d, name + '.bin'), 'rb').read()
    txt = base64.b64encode(raw)
    n = 12_000_000
    parts = [txt[i:i + n] for i in range(0, len(txt), n)]
    files = []
    for i, p in enumerate(parts):
        fn = f'{name}.b64.{i}.txt'
        open(os.path.join(d, fn), 'wb').write(p)
        files.append(fn)
    atlas['b64'][name] = files
    print(name, [round(len(p) / 1e6, 1) for p in parts])
json.dump(atlas, open(os.path.join(d, 'atlas.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
