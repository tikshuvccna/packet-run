"""Side missions, car damage and pedestrians through the real page. Screenshots along the way.
usage: python -I tools/side_run.py <out_prefix> [WxH] [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
w, h = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "1280x720").split("x")]
base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5211/"

STATE = """() => { const pr = window.__pr, s = pr.ctx.save.data, b = document.querySelector('.missionbox');
  return { m: s.mission, side: s.side, coins: s.coins, health: Math.round(pr.drive.sim.health * 100) / 100, zones: pr.drive.sim.zones.map(z => Math.round(z * 100) / 100),
    box: b && !b.classList.contains('hidden') ? (b.classList.contains('side') ? '[SIDE] ' : '') + b.innerText.replace(/\\n/g, ' | ') : null,
    prompt: (() => { const p = document.querySelector('.prompt'); return p && !p.classList.contains('hidden') ? (p.classList.contains('side') ? '[SIDE] ' : '') + p.innerText : null; })() }; }"""
NEAR = """(a) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === a[0]); const r = pr.drive.city.nearestRoad(p.x, p.z);
  const hx = Math.sin(r.heading), hz = -Math.cos(r.heading); pr.bus.emit('drive:teleport', { x: r.x - hx * a[1], z: r.z - hz * a[1], heading: r.heading }); }"""
INTO = """(id) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === id); const r = pr.drive.city.nearestRoad(p.x, p.z);
  const h = Math.atan2(p.x - r.x, -(p.z - r.z)); pr.bus.emit('drive:teleport', { x: p.x - Math.sin(h) * 5, z: p.z + Math.cos(h) * 5, heading: h }); }"""

def talk(pg):
    pg.wait_for_timeout(500)
    for i in range(40):
        if not pg.locator(".dlg").count(): return
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)

def roll_in(pg, poi, dist=24, sec=2600):
    pg.evaluate(NEAR, [poi, dist]); pg.wait_for_timeout(400)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(sec); pg.keyboard.up("ArrowUp")
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
    talk(pg)
    print("start", pg.evaluate(STATE))
    print("side spots before unlock:", len(pg.evaluate("() => window.__pr.flow.sideSpots()")))

    # ---- mission 1 (bakery -> parts shop), then the garage mission
    roll_in(pg, "place_bakery"); roll_in(pg, "shop_main"); talk(pg)
    print("after m1", pg.evaluate(STATE))
    pg.evaluate(INTO, "garage_main"); pg.wait_for_timeout(700)
    print("in garage ring", pg.evaluate(STATE))
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{prefix}_1garage.png")
    pg.get_by_role("button", name="יציאה").first.click()
    talk(pg)
    print("after garage", pg.evaluate(STATE))
    print("side spots after unlock:", len(pg.evaluate("() => window.__pr.flow.sideSpots()")))

    # ---- a side-mission giver from the road, then the offer
    pg.evaluate(NEAR, ["place_taxi", 55]); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{prefix}_2giver.png")
    pg.evaluate(INTO, "place_taxi"); pg.wait_for_timeout(800)
    print("at giver", pg.evaluate(STATE))
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{prefix}_3offer.png")
    pg.get_by_role("button", name="יוצאים לדרך").first.click(); pg.wait_for_timeout(700)
    print("accepted", pg.evaluate(STATE))
    pg.evaluate(NEAR, ["place_cityhall", 110]); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{prefix}_4sidebeam.png")
    roll_in(pg, "place_cityhall")
    print("picked up", pg.evaluate(STATE))
    roll_in(pg, "place_police"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{prefix}_5sidedone.png")
    print("side done", pg.evaluate(STATE))

    # ---- the mission list in the pause menu
    pg.get_by_role("button", name="הפסקה").first.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="משימות").first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{prefix}_6list.png")
    pg.get_by_role("button", name="סגירה").first.click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="המשך").first.click(); pg.wait_for_timeout(400)

    # ---- fragile side mission: take it, crash, it is cancelled
    pg.evaluate(INTO, "place_bookshop"); pg.wait_for_timeout(800)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="יוצאים לדרך").first.click(); pg.wait_for_timeout(700)
    print("fragile accepted", pg.evaluate(STATE))

    # ---- damage: drive hard into a wall, twice
    CRASH = """() => { const pr = window.__pr, c = pr.drive.city, p = pr.drive.sim.player;
      const b = c.buildings.filter(q => Math.abs(q.rot) < 0.01 && q.w > 14 && !c.statics.blocked(q.x, q.z + q.d / 2 + 30, 3) && !c.statics.blocked(q.x, q.z + q.d / 2 + 15, 3))
        .sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0];
      pr.bus.emit('drive:teleport', { x: b.x, z: b.z + b.d / 2 + 30, heading: 0 }); pr.drive.sim.player.ghostT = 0; }"""
    for k in range(3):
        pg.evaluate(CRASH); pg.wait_for_timeout(300)
        pg.keyboard.down("ArrowUp"); pg.keyboard.down("Space"); pg.wait_for_timeout(3200); pg.keyboard.up("ArrowUp"); pg.keyboard.up("Space")
        pg.wait_for_timeout(300)
        print("crash", k + 1, pg.evaluate(STATE))
        if k == 0: pg.screenshot(path=f"{prefix}_7crash1.png")
    pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(1500); pg.keyboard.up("ArrowDown")
    pg.keyboard.down("KeyC"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{prefix}_8damaged_front.png")
    pg.keyboard.up("KeyC"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{prefix}_8damaged_back.png")
    # wreck it
    pg.evaluate("() => { const s = window.__pr.drive.sim; s.health = 0.03; s.player.dmg = 0.97; }")
    pg.evaluate(CRASH); pg.wait_for_timeout(300)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(3400); pg.keyboard.up("ArrowUp")
    pg.screenshot(path=f"{prefix}_9wreck.png")
    print("wrecked", pg.evaluate(STATE))
    pg.wait_for_timeout(3000)
    print("after emergency fix", pg.evaluate(STATE))
    # repair at the fuel station
    roll_in(pg, "fuel1")
    print("after fuel station", pg.evaluate(STATE))

    # ---- people
    pg.evaluate(NEAR, ["garage_lesson07", 60]); pg.wait_for_timeout(3000)
    print("people", pg.evaluate("() => window.__pr.drive.scene.people.count"), "fps", round(pg.evaluate("() => window.__pr.drive.fps()")))
    # stand next to the nearest walker and look
    LOOKPED = """() => { const pr = window.__pr, sc = pr.drive.scene, ps = sc.people.list(), p = pr.drive.sim.player;
      const q = ps.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0]; if (!q) return null;
      const r = pr.drive.city.nearestRoad(q.x, q.z); const hx = Math.sin(r.heading), hz = -Math.cos(r.heading);
      pr.bus.emit('drive:teleport', { x: r.x - hx * 11, z: r.z - hz * 11, heading: r.heading }); return [q.x, q.z]; }"""
    print("nearest ped", pg.evaluate(LOOKPED)); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{prefix}_10people.png")
    # drive straight at a pedestrian on the sidewalk: they must jump aside
    AIM = """() => { const pr = window.__pr, sc = pr.drive.scene, ps = sc.people.list(), p = pr.drive.sim.player;
      const q = ps.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0]; if (!q) return null;
      const r = pr.drive.city.nearestRoad(q.x, q.z); const hx = Math.sin(r.heading), hz = -Math.cos(r.heading);
      const h = r.heading; pr.bus.emit('drive:teleport', { x: q.x - hx * 16, z: q.z - hz * 16, heading: h }); pr.drive.sim.player.ghostT = 0; return [q.x, q.z]; }"""
    tgt = pg.evaluate(AIM); pg.wait_for_timeout(200)
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{prefix}_11dodge.png")
    pg.wait_for_timeout(600); pg.keyboard.up("ArrowUp")
    moved = pg.evaluate("() => window.__pr.drive.scene.people.list().filter(q => Math.hypot(q.ox, q.oz) > 0.5).length")
    mind = pg.evaluate("() => { const p = window.__pr.drive.sim.player; return Math.min(...window.__pr.drive.scene.people.list().map(q => Math.hypot(q.x - p.x, q.z - p.z))); }")
    print("aimed at", tgt, "people that jumped aside:", moved, "closest person to the car now (m):", round(mind, 2))
    for e in errs[:10]: print("ERR", e)
    b.close()
