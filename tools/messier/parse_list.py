"""Parse Wikipedia's Messier table (wikitext of 'Messier object') into messier.json."""
import json, re
t = json.load(open('list.json'))['parse']['wikitext']['*']
t = t[t.find('{|'):]
t = t[:t.find('\n|}')]
rows = t.split('\n|-')[1:]

def clean(s):
    s = re.sub(r'<ref[^>]*/>', '', s)
    s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{shy\|([^}]*)\}\}', lambda m: m.group(1).replace('|', ''), s)
    s = re.sub(r'\{\{(?:wbr|sdash[^}]*)\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = s.replace("''", '').strip()
    return s

out = []
for r in rows:
    cells = [c for c in re.split(r'\n[|!]\s*', '\n' + r.split('\n', 1)[1]) if c.strip()]
    if len(cells) < 11: continue
    head = cells[0]
    m = re.search(r'\[\[([^|\]]+)\|M(\d+)\]\]', head)
    if not m: continue
    title, num = m.group(1), int(m.group(2))
    # cell values: strip 'scope=..|' prefixes and {{dsv|x}} sort keys
    def val(c):
        c = re.sub(r'^scope="row"\s*\|\s*', '', c)
        c = re.sub(r'\{\{dsv\|[^}]*\}\}\s*\|', '', c)
        return c.strip()
    ngc, common, _img, typ, dist, const, mag, dims, ra, dec = [val(c) for c in cells[1:11]]
    # distance (kly): the sort key {{dsv|x}} is the central value when a range is given; else the number, or a range's middle
    raw = cells[5]
    sk = re.search(r'\{\{dsv\|([\d.,]+)\}\}', raw)
    nums = [float(x.replace(',', '')) for x in re.findall(r'[\d][\d,]*\.?\d*', re.sub(r'\{\{dsv\|[^}]*\}\}', '', raw))]
    kly = float(sk.group(1).replace(',', '')) if sk else (sum(nums[:2]) / len(nums[:2]) if nums else None)
    ra_m = re.search(r'\{\{RA\|(\d+)\|([\d.]+)\|?([\d.]*)\}\}', ra)
    dec_m = re.search(r'\{\{DEC\|([+\-−–]?\d+)\|([\d.]+)\|?([\d.]*)\}\}', dec)
    rah = int(ra_m.group(1)) + float(ra_m.group(2)) / 60 + (float(ra_m.group(3)) if ra_m.group(3) else 0) / 3600
    dd = dec_m.group(1).replace('−', '-').replace('–', '-')
    sgn = -1 if dd.startswith('-') else 1
    decd = sgn * (abs(int(dd)) + float(dec_m.group(2)) / 60 + (float(dec_m.group(3)) if dec_m.group(3) else 0) / 3600)
    out.append(dict(m=num, title=title, ngc=clean(ngc), common=clean(common), type=clean(typ), dist=clean(re.sub(r'\{\{nts\|([^}]*)\}\}', r'\1', dist)), kly=kly, const=clean(const),
                    mag=clean(mag), dims=clean(dims), ra=rah * 15, dec=decd))
out.sort(key=lambda x: x['m'])
print(len(out))
for x in out[:3] + out[29:33] + out[-3:]: print(x)
json.dump(out, open('messier_raw.json', 'w'), indent=1, ensure_ascii=False)
