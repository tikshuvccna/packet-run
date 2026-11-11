"""Visual check: the mission beam from a distance, and a close look at a taxi, a patrol car and a motorcycle in traffic.
usage: python -I tools/look_run.py <out_prefix> [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5211/"
w, h = 1280, 720
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(base + "?fresh", wait_until="networkidle")
    pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="התחלה").first.click()
    pg.wait_for_timeout(500)
    pg.get_by_role("button", name="יאללה").first.click()
    for i in range(30):
        if pg.locator(".help-screen").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="הבנתי").first.click()
    pg.wait_for_timeout(3000)
    for i in range(40):
        if not pg.locator(".dlg").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const pr = window.__pr; const t = pr.flow.objective(); const r = pr.drive.city.nearestRoad(t.x, t.z);
      const hx = Math.sin(r.heading), hz = -Math.cos(r.heading); pr.bus.emit('drive:teleport', { x: r.x - hx * 90, z: r.z - hz * 90, heading: r.heading }); }""")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{prefix}_beam.png")
    for kind in ("moto", "taxi", "police"):
        ok = pg.evaluate("""(kind) => { const pr = window.__pr; const s = pr.drive.sim; const d = s.drivers.find(q => q.look.extra === kind); if (!d) return false;
          const c = d.car; const hx = Math.sin(c.h), hz = -Math.cos(c.h); const p = s.player;
          p.x = c.x - hx * 9 - hz * 3.2; p.z = c.z - hz * 9 + hx * 3.2; p.h = c.h; p.vx = c.vx; p.vz = c.vz; p.y = c.y; pr.drive.scene.chase.snap(p); return true; }""", kind)
        pg.wait_for_timeout(350)
        pg.screenshot(path=f"{prefix}_{kind}.png")
        print(kind, ok)
    for e in errs[:10]: print("ERR", e)
    b.close()
