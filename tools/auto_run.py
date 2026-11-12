"""Balance check with the bot driver: free roam and one race; prints health, crashes, speed and fps.
usage: python -I tools/auto_run.py [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5211/"
w, h = 1280, 720
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
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
    pg.evaluate("() => { window.__hits = []; window.__pr.bus.on('drive:damage', d => window.__hits.push(Math.round(d.amount * 100))); window.__pr.drive.setAuto(true); }")
    ST = "() => { const s = window.__pr.drive.sim; return { health: Math.round(s.health * 100), hits: window.__hits.join(','), kmh: Math.round(s.player.speed * 3.6), fps: Math.round(window.__pr.drive.fps()), people: window.__pr.drive.scene.people.count, race: s.race ? s.race.state + ' place ' + s.race.cars[0].place : null }; }"
    for k in range(3):
        pg.wait_for_timeout(15000); print("free roam", (k + 1) * 15, "s", pg.evaluate(ST))
    pg.screenshot(path=sys.argv[2] + "_roam.png") if len(sys.argv) > 2 else None
    pg.evaluate("() => { window.__hits.length = 0; const pr = window.__pr; const r = pr.drive.city.pois.find(q => q.id === 'race_r_docks'); pr.flow.onPoi({ id: r.id, kind: 'race', race: r.race }); }")
    for k in range(5):
        pg.wait_for_timeout(15000); print("race", (k + 1) * 15, "s", pg.evaluate(ST))
    pg.screenshot(path=sys.argv[2] + "_race.png") if len(sys.argv) > 2 else None
    for e in errs[:10]: print("ERR", e)
    b.close()
