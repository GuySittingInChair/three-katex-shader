"""Re-fetch summaries whose returned title doesn't match the article asked for (rate-limited requests reused the last one)."""
import json, time, urllib.request, urllib.parse
d = json.load(open('messier_raw.json')); s = json.load(open('summaries.json'))
norm = lambda t: (t or '').replace('_', ' ').strip().lower()
for x in d:
    k = str(x['m'])
    if norm(s[k]['title']) == norm(x['title']): continue
    url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(x['title'].replace(' ', '_'))
    req = urllib.request.Request(url, headers={'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'})
    j = None
    for attempt in range(6):
        try: j = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception as e: print('retry', k, e, flush=True); time.sleep(5 * (attempt + 1))
    if j: s[k] = dict(extract=j.get('extract', ''), page=j.get('content_urls', {}).get('desktop', {}).get('page', ''), title=j.get('title'), revision=j.get('revision'))
    print(k, x['title'], '->', s[k]['title'], flush=True)
    time.sleep(1.5)
json.dump(s, open('summaries.json', 'w'), indent=1, ensure_ascii=False)
bad = [x['m'] for x in d if norm(s[str(x['m'])]['title']) != norm(x['title'])]
print('still mismatched:', bad)
