"""Wikipedia lead sections in batches of 20 (action API: prop=extracts|pageprops|info), cached per title.
Far fewer requests than one REST call per article, which Wikipedia rate-limits."""
import json, os, re, time, urllib.request, urllib.parse
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}
CACHE = 'wikicache/'
os.makedirs(CACHE, exist_ok=True)
key = lambda t: CACHE + re.sub(r'[^\w]+', '_', t)[:120] + '.json'

def fetch_many(titles):
    """returns {asked title: {title, extract, url, disambiguation} or None}"""
    out, todo = {}, []
    for t in titles:
        if os.path.exists(key(t)): out[t] = json.load(open(key(t))) or None
        else: todo.append(t)
    for i in range(0, len(todo), 20):
        chunk = todo[i:i + 20]
        q = dict(action='query', format='json', prop='extracts|pageprops|info', exintro=1, explaintext=1, exlimit=20, inprop='url', redirects=1, titles='|'.join(chunk))
        for k in range(6):
            try:
                j = json.load(urllib.request.urlopen(urllib.request.Request('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode(q), headers=UA), timeout=60)); break
            except Exception as e:
                print('  wiki retry', e, flush=True); time.sleep(5 * (k + 1))
        else:
            continue
        # follow normalisation and redirects back to the asked titles
        back = {t: t for t in chunk}
        for n in j['query'].get('normalized', []): back[n['to']] = back.pop(n['from'], n['from'])
        for r in j['query'].get('redirects', []):
            if r['from'] in back: back[r['to']] = back.pop(r['from'])
        got = {}
        for p in j['query'].get('pages', {}).values():
            asked = back.get(p.get('title'))
            if asked is None or 'missing' in p: continue
            got[asked] = dict(title=p['title'], extract=(p.get('extract') or '').strip(), url=p.get('fullurl'), disambiguation='disambiguation' in p.get('pageprops', {}))
        for t in chunk:
            out[t] = got.get(t)
            json.dump(got.get(t) or {}, open(key(t), 'w'))
        time.sleep(1.0)
    return out
