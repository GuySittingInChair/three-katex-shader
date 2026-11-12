"""Arp's Atlas of Peculiar Galaxies, from Wikipedia's 'Atlas of Peculiar Galaxies' (Catalog list section):
each object's number, name, notes, and Arp's class (section and sub-section) with Wikipedia's description of it."""
import json, re
t = json.load(open('atlas.json'))['parse']['wikitext']['*']
t = t[t.find('==Catalog list=='):]
# strip citations (often several lines long) and picture captions (which contain nested links) before splitting rows
t = re.sub(r'<ref[^>/]*/>', '', t)
t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
def drop_files(s):
    out, i = [], 0
    while True:
        j = min([k for k in (s.find('[[File:', i), s.find('[[Image:', i)) if k >= 0], default=-1)
        if j < 0: out.append(s[i:]); return ''.join(out)
        out.append(s[i:j]); depth, k = 0, j
        while k < len(s):
            if s.startswith('[[', k): depth += 1; k += 2
            elif s.startswith(']]', k):
                depth -= 1; k += 2
                if depth == 0: break
            else: k += 1
        i = k
t = drop_files(t)
def clean(s):
    s = re.sub(r'<ref[^>]*/>', '', s); s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\[\[(?:File|Image):[^\]]*\]\]', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s); s = re.sub(r'\{\{[^}]*\}\}', '', s)
    return re.sub(r'\s+', ' ', s).strip()
out, major, minor, desc = [], None, None, ''
for block in re.split(r'\n(?=={2,4}[^=])', t):
    m = re.match(r'(={2,4})\s*([^=]+?)\s*\1', block)
    if not m: continue
    level, title = len(m.group(1)), m.group(2).strip()
    body = block[m.end():]
    if level == 3: major, minor = title, None
    elif level == 4: minor = title
    if level == 2 and title != 'Catalog list': break
    pre = body.split('{|')[0]
    d = clean(pre)
    if d: desc = d
    elif level == 3: desc = ''
    for tab in re.findall(r'\{\|.*?\n\|\}', body, flags=re.S):
        for row in tab.split('\n|-')[1:]:
            cells = [c.strip() for c in re.split(r'\n\|', '\n' + row.strip()) if c.strip()]
            if not cells: continue
            first = clean(cells[0].lstrip('|'))
            if not re.match(r'^\d+$', first): continue
            num = int(first)
            own = re.search(r'\[\[([^|\]]+)\|', cells[0])          # [[Arp 72|72]]: the object has its own article
            name_raw = cells[1] if len(cells) > 1 else ''
            link = re.search(r'\[\[([^|\]]+)(?:\|[^\]]*)?\]\]', name_raw)
            if own: link = own
            out.append(dict(arp=num, name=clean(name_raw), wiki=link.group(1) if link else None,
                            notes=clean(cells[2]) if len(cells) > 2 else '', cls=major, sub=minor, clsText=desc))
for x in out:
    # Arp's last section has no sub-classes and Wikipedia gives it no description
    if not x['sub']: x['sub'] = x['cls']
    x['clsText'] = re.sub(r'^(As (noted|mentioned) (above|earlier|previously),?\s*)', '', x['clsText'])   # it's quoted out of the page
    if x['clsText']: x['clsText'] = x['clsText'][0].upper() + x['clsText'][1:]
    if not x['clsText']: x['clsText'] = f"Arp's final section, '{x['cls']}': objects that fit none of his other classes."
out.sort(key=lambda x: x['arp'])
nums = [x['arp'] for x in out]
print(len(out), 'missing', sorted(set(range(1, 339)) - set(nums)), 'dupes', len(nums) - len(set(nums)))
from collections import Counter
for (a, b), n in Counter((x['cls'], x['sub']) for x in out).items(): print(f'  {n:3d}  {a} / {b}')
print(out[0], out[150], sep='\n')
json.dump(out, open('arp_list.json', 'w'), indent=1, ensure_ascii=False)
