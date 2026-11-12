"""Wikipedia lead summaries (REST /page/summary) for each Messier object's article. Text is CC BY-SA 4.0."""
import json, time, urllib.request, urllib.parse
d = json.load(open('messier_raw.json'))
out = {}
for x in d:
    url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(x['title'].replace(' ', '_'))
    req = urllib.request.Request(url, headers={'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'})
    for attempt in range(3):
        try:
            j = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception as e:
            print('retry', x['m'], e); time.sleep(3)
    out[x['m']] = dict(extract=j.get('extract', ''), page=j.get('content_urls', {}).get('desktop', {}).get('page', ''), title=j.get('title'), revision=j.get('revision'))
    time.sleep(0.4)
json.dump(out, open('summaries.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), sum(1 for v in out.values() if v['extract']))
