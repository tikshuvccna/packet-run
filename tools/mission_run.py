"""Mission flow test through the real page: start a new game, read the opening talk, then teleport next to each mission
ring and roll in, checking the HUD box, the reward and the next mission. Screenshots along the way.
usage: python -I tools/mission_run.py <out_prefix> [WxH] [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
w, h = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "1280x720").split("x")]
base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5211/"

STATE = "() => { const s = window.__pr.ctx.save.data; const b = document.querySelector('.missionbox'); return { m: s.mission, coins: s.coins, box: b && !b.classList.contains('hidden') ? b.innerText.replace(/\\n/g, ' | ') : null }; }"
TARGET = "() => window.__pr.flow.objective()"

def talk(pg):
    for i in range(40):
        if not pg.locator(".dlg").count(): return
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)

def roll_to(pg):
    """Teleport 20 m before the objective on the same road line and drive in."""
    t = pg.evaluate(TARGET)
    pg.evaluate("""(t) => { const pr = window.__pr; const c = pr.drive.city; const r = c.nearestRoad(t.x, t.z);
      const hx = Math.sin(r.heading), hz = -Math.cos(r.heading);
      pr.bus.emit('drive:teleport', { x: r.x - hx * 24, z: r.z - hz * 24, heading: r.heading }); }""", t)
    pg.wait_for_timeout(400)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(2600); pg.keyboard.up("ArrowUp")
    pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(500); pg.keyboard.up("ArrowDown")
    pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
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
    pg.screenshot(path=f"{prefix}_1talk.png")
    talk(pg)
    pg.wait_for_timeout(800)
    print("after talk", pg.evaluate(STATE))
    pg.screenshot(path=f"{prefix}_2mission.png")
    roll_to(pg)
    print("after pick-up", pg.evaluate(STATE))
    pg.screenshot(path=f"{prefix}_3timed.png")
    roll_to(pg)
    pg.wait_for_timeout(600)
    pg.screenshot(path=f"{prefix}_4done.png")
    talk(pg)
    pg.wait_for_timeout(600)
    print("after delivery", pg.evaluate(STATE))
    # timer failure: jump to mission 3's timed run and let the clock run out quickly
    pg.evaluate("() => { const pr = window.__pr; pr.ctx.save.data.mission = { idx: 2, step: 4 }; pr.flow.deadline = 3; pr.flow.showMission(); }")
    pg.wait_for_timeout(4500)
    print("after timeout", pg.evaluate(STATE))
    # a place far away: look at a landmark and the traffic
    for name in ("place_cityhall", "place_stadium", "place_police", "place_taxi"):
        pg.evaluate("""(id) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === id); const r = pr.drive.city.nearestRoad(p.x, p.z);
          const hx = Math.sin(r.heading), hz = -Math.cos(r.heading); pr.bus.emit('drive:teleport', { x: r.x - hx * 45, z: r.z - hz * 45, heading: r.heading }); }""", name)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{prefix}_{name}.png")
    print("fps", round(pg.evaluate("() => window.__pr.drive.fps()")))
    print("traffic", pg.evaluate("() => { const o = {}; for (const d of window.__pr.drive.sim.drivers) { const k = d.look.extra || d.kind; o[k] = (o[k] || 0) + 1; } return o; }"))
    for e in errs[:10]: print("ERR", e)
    b.close()
