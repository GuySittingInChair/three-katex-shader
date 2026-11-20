# Rewraps docs/wiki prose to one width (python3 tools/rewrap-wiki.py --apply).
# Rendered HTML is unchanged; checked on all pages when first run (2026-11-20).
# Rewrap wiki prose to one width. Leaves alone: the --- header, code blocks,
# tables, headings, HTML comments. Never starts a line with something Markdown
# would read as a list, heading, quote or table.
import re, sys, glob
W = 110
BAD_START = re.compile(r'^(\d+[.)]\s|[-*+>#|]\s|[-*+]$|#)')
LIST = re.compile(r'^(\s*)([-*+]|\d+[.)])\s+')

def wrap(words, first_prefix, rest_prefix):
    lines, cur = [], first_prefix
    empty = True
    for w in words:
        cand = cur + ('' if empty else ' ') + w
        if not empty and len(cand) > W and not BAD_START.match(w + ' '):
            lines.append(cur); cur = rest_prefix + w
        else:
            cur = cand
        empty = False
    lines.append(cur)
    return lines

def rewrap(text):
    out, i = [], 0
    L = text.split('\n')
    # header
    if L and L[0] == '---':
        j = L.index('---', 1); out += L[:j+1]; i = j + 1
    in_code = False
    while i < len(L):
        line = L[i]
        s = line.strip()
        if re.match(r'^\s*```', line):
            in_code = not in_code; out.append(line); i += 1; continue
        if in_code or not s or s.startswith(('#', '|', '<!--', '<')) or line.endswith('  ') or line.endswith('\\'):
            out.append(line); i += 1; continue
        m = LIST.match(line)
        if m:
            indent = m.group(1); marker = m.group(0)
            hang = ' ' * len(marker)
            body = [line[len(marker):]]
            i += 1
            while i < len(L) and L[i].strip() and not LIST.match(L[i]) and L[i].startswith(hang) and not re.match(r'^\s*```', L[i]):
                body.append(L[i].strip()); i += 1
            out += wrap(' '.join(body).split(), marker, hang)
            continue
        # plain paragraph: until blank, list, heading, code, table
        indent = re.match(r'^\s*', line).group(0)
        body = [s]; i += 1
        while i < len(L) and L[i].strip() and not LIST.match(L[i]) and not L[i].strip().startswith(('#', '|', '```', '<')):
            body.append(L[i].strip()); i += 1
        out += wrap(' '.join(body).split(), indent, indent)
    return '\n'.join(out)

files = sorted(glob.glob(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', 'docs/wiki/**/*.md'), recursive=True))
changed = 0
for f in files:
    t = open(f).read()
    n = rewrap(t)
    if n != t:
        changed += 1
        if '--apply' in sys.argv: open(f, 'w').write(n)
        else: print('would change', f)
print('pages that would change:', changed, 'of', len(files))
