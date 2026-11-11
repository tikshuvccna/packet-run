"""Print every POI of the city (id, kind, district, position) from the dev server. usage: python -I tools/pois.py [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5211/"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new"])
    pg = b.new_page()
    pg.goto(base + "?dev=none", wait_until="networkidle")
    rows = pg.evaluate("""async () => { const m = await import('/src/world3d/city.ts'); const c = m.buildCity(11);
      return c.pois.map(p => [p.id, p.kind, p.district, Math.round(p.x), Math.round(p.z), p.label].join('  ')); }""")
    for r in rows: print(r)
    b.close()
