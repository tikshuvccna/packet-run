"""Zip dist/ with start.bat and README.txt into packet-run-offline.zip (run `npm run build` first)."""
import os, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist = os.path.join(ROOT, 'dist')
out = os.path.join(ROOT, 'packet-run-offline.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in ('start.bat', 'README.txt'):
        z.write(os.path.join(ROOT, 'offline', name), name)
    for base, _, files in os.walk(dist):
        for f in files:
            p = os.path.join(base, f)
            z.write(p, os.path.join('game', os.path.relpath(p, dist)))
print(round(os.path.getsize(out) / 1e6, 1), 'MB')
