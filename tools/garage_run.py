"""Real UI paths: buy and select every car with the garage buttons, drive, start a race, leave to the menu and continue,
open a lesson garage. Prints every error. usage: python -I tools/garage_run.py <out_prefix> [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
prefix = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5211/"
w, h = 1280, 720
ST = "() => { const pr = window.__pr, s = pr.drive.sim; return s ? { car: s.player.carId, top: Math.round(s.player.stats.topSpeed * 3.6), kmh: Math.round(s.player.speed * 3.6), ready: pr.drive.scene.cars.get(s.player.id)?.isReady, race: s.race ? s.race.state : null, screens: [...document.querySelectorAll('.screen')].map(e => e.className) } : { sim: null, screens: [...document.querySelectorAll('.screen')].map(e => e.className) }; }"
INTO = """(id) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === id); const r = pr.drive.city.nearestRoad(p.x, p.z);
  const h = Math.atan2(p.x - r.x, -(p.z - r.z)); pr.bus.emit('drive:teleport', { x: p.x - Math.sin(h) * 5, z: p.z + Math.cos(h) * 5, heading: h }); }"""
ROAD = """(id) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === id); const r = pr.drive.city.nearestRoad(p.x, p.z); pr.bus.emit('drive:teleport', { x: r.x, z: r.z, heading: r.heading }); pr.drive.sim.player.ghostT = 0; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:400]))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text[:300]) if m.type == "error" and "404" not in m.text else None)
    def flush(tag):
        for e in errs: print("   ERR after", tag, ":", e)
        errs.clear()
    def talk():
        for i in range(40):
            if not pg.locator(".dlg").count(): return
            pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)
    pg.goto(base + "?fresh", wait_until="networkidle"); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="התחלה").first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="יאללה").first.click()
    for i in range(30):
        if pg.locator(".help-screen").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="הבנתי").first.click(); pg.wait_for_timeout(3000)
    talk(); flush("start")
    pg.evaluate("() => { window.__pr.ctx.save.data.coins = 20000; }")
    # ---- the garage: buy every car by its button, then leave and drive
    pg.evaluate(INTO, "garage_main"); pg.wait_for_timeout(700)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(700)
    n = pg.locator(".garage-screen .grow").count()
    print("cars in the list:", n)
    for k in range(n):
        row = pg.locator(".garage-screen .grow").nth(k)
        name = row.locator("b").inner_text()
        btn = row.locator("button")
        if btn.is_enabled(): btn.click()
        pg.wait_for_timeout(900)
        st = pg.evaluate(ST)
        print("  ", name, "->", st["car"], "model ready:", st["ready"])
        flush("buy " + name)
    pg.screenshot(path=prefix + "_garage.png")
    for tab in ("צבע", "מדבקות", "גלגלים", "שדרוגים"):
        pg.locator(".garage-screen .gtabs button", has_text=tab).first.click(); pg.wait_for_timeout(250)
        bs = pg.locator(".garage-screen .gbody button:enabled")
        if bs.count(): bs.first.click(); pg.wait_for_timeout(300)
        flush("tab " + tab)
    pg.get_by_role("button", name="יציאה").first.click(); pg.wait_for_timeout(600)
    talk()
    pg.evaluate(ROAD, "garage_main"); pg.wait_for_timeout(300)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(5000); pg.keyboard.up("ArrowUp")
    print("after the garage, driving:", pg.evaluate(ST)); flush("drive after garage")
    pg.screenshot(path=prefix + "_drive.png")
    # ---- a race from its ring
    pg.evaluate(INTO, "race_r_docks"); pg.wait_for_timeout(700)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(5500)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(5000); pg.keyboard.up("ArrowUp")
    print("in the race:", pg.evaluate(ST)); flush("race")
    pg.screenshot(path=prefix + "_race.png")
    # ---- leave to the menu and continue
    pg.get_by_role("button", name="הפסקה").first.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="לתפריט הראשי").first.click(); pg.wait_for_timeout(1000)
    print("at the title:", pg.evaluate(ST)); flush("to title")
    pg.get_by_role("button", name="המשך נסיעה").first.click(); pg.wait_for_timeout(3500)
    talk()
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(3000); pg.keyboard.up("ArrowUp")
    print("after continue:", pg.evaluate(ST)); flush("continue")
    pg.screenshot(path=prefix + "_continue.png")
    # ---- reload the page and continue (what a returning player does)
    pg.goto(base, wait_until="networkidle"); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name="המשך נסיעה").first.click(); pg.wait_for_timeout(3500)
    talk()
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(3000); pg.keyboard.up("ArrowUp")
    print("after reload + continue:", pg.evaluate(ST)); flush("reload")
    pg.screenshot(path=prefix + "_reload.png")
    # ---- the lesson garage opens
    pg.evaluate(INTO, "garage_lesson06"); pg.wait_for_timeout(700)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(1200)
    print("lesson garage:", pg.evaluate(ST)["screens"]); flush("lesson")
    pg.screenshot(path=prefix + "_lesson.png")
    b.close()
