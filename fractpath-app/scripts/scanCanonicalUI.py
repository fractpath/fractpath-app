import os
import re

roots = ['src']
patterns = [
    r'Not computed',
    r'not computed',
    r'computed',
    r'isComputed',
    r'extractSnapshot',
    r'snapshot_json',
    r'outputs',
    r'outputs\.results',
    r'chart_series',
    r'outputs\.summary'
]

regexes = [re.compile(p, re.IGNORECASE) for p in patterns]
exts = {'.ts', '.tsx', '.js', '.jsx'}
hits = []

for root in roots:
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if os.path.splitext(fn)[1] not in exts:
                continue
            path = os.path.join(dp, fn)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
            except Exception:
                continue
            for i, line in enumerate(lines, 1):
                if any(r.search(line) for r in regexes):
                    hits.append((path, i, line.strip()))

for path, i, line in hits[:200]:
    print(f"{path}:{i}: {line}")

print('---')
print('hits =', len(hits))
