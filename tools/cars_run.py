"""Every car in the real game: switch to it, look at it from behind and from the front, drive it flat out for a few
seconds. Makes one contact sheet. Also a screenshot of the garage car list.
usage: python -I tools/cars_run.py <out_prefix> [base_url] [car ...]"""
import sys, io
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
from PIL import Image

prefix = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5211/"
cars = sys.argv[3:] or ['mini', 'pickup', 'muscle', 'rally', 'suv', 'roadster', 'gt', 'electric', 'concept', 'hyper']
w, h = 960, 540
PAINT = {'mini': '#e55a4e', 'pickup': '#4a90e2', 'muscle': '#ff9a3c', 'rally': '#4a90e2', 'suv': '#ffffff', 'roadster': '#7fd957', 'gt': '#c0c8d0',
         'electric': '#2dc4e8', 'concept': '#ffffff', 'hyper': '#ff7fb0'}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") and "404" not in m.text and "glb failed" in m.text or m.type == "error" and "404" not in m.text else None)
    pg.goto(base + "?fresh", wait_until="networkidle"); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="התחלה").first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="יאללה").first.click()
    for i in range(30):
        if pg.locator(".help-screen").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="הבנתי").first.click(); pg.wait_for_timeout(3000)
    for i in range(40):
        if not pg.locator(".dlg").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)
    # a long straight avenue to drive on
    pg.evaluate("""() => { const pr = window.__pr, c = pr.drive.city; const e = c.edges.filter(q => q.avenue && !q.bridge && !q.tunnel && !q.ramp).sort((u, v) => v.len - u.len)[0];
      const a = c.nodes[e.a], bb = c.nodes[e.b]; window.__st = { x: a.x + (bb.x - a.x) * 0.1, z: a.z + (bb.z - a.z) * 0.1, heading: Math.atan2(bb.x - a.x, -(bb.z - a.z)) };
      document.querySelector('.hud').style.visibility = 'hidden'; }""")
    shots = []
    for car in cars:
        pg.evaluate("""(a) => { const pr = window.__pr, s = pr.ctx.save.data; s.cars.push(a[0]); s.look.car = a[0]; s.look.paint = a[1]; s.look.spoiler = false; s.look.wheels = 'std';
          pr.flow.syncCar(); pr.bus.emit('drive:teleport', window.__st); pr.drive.sim.player.ghostT = 0; }""", [car, PAINT.get(car, '#f2b134')])
        pg.wait_for_timeout(1800)
        a = pg.screenshot()
        pg.keyboard.down("KeyC"); pg.wait_for_timeout(500); bshot = pg.screenshot(); pg.keyboard.up("KeyC")
        pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(5000)
        st = pg.evaluate("() => { const p = window.__pr.drive.sim.player; return { car: p.carId, kmh: Math.round(p.speed * 3.6), top: Math.round(p.stats.topSpeed * 3.6), ready: window.__pr.drive.scene.cars.get(p.id).isReady, glb: window.__pr.drive.scene.cars.get(p.id).tpl.fromGlb }; }")
        pg.keyboard.up("ArrowUp")
        print(car, st)
        shots.append((car, a, bshot))
    sheet = Image.new('RGB', (480 * 2, 270 * len(shots)), 'white')
    for r, (car, a, bshot) in enumerate(shots):
        for c, raw in enumerate((a, bshot)):
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            cw, ch = 640, 360
            im = im.crop(((w - cw) // 2, h - ch - 10, (w + cw) // 2, h - 10)).resize((480, 270))
            sheet.paste(im, (c * 480, r * 270))
    sheet.save(prefix + "_cars.png")
    # the garage list
    pg.evaluate("() => { document.querySelector('.hud').style.visibility = ''; const pr = window.__pr; pr.ctx.save.data.coins = 700; pr.flow.onPoi({ id: 'garage_main', kind: 'garage' }); }")
    pg.wait_for_timeout(900)
    pg.screenshot(path=prefix + "_garage.png")
    for e in errs[:10]: print("ERR", e)
    b.close()
