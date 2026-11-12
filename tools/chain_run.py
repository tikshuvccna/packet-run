"""The whole main story through the real page, step by step: talks are read, rings are driven into (after a teleport
next to them), garages are entered, lessons are marked as learned and races are reported as finished in first place.
Proves that every mission can start, advance, pay and hand over to the next one. usage: python -I tools/chain_run.py [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5211/"
w, h = 1280, 720

CUR = """() => { const pr = window.__pr, f = pr.flow, c = f.cur(); if (!c) return null; const st = c.steps[c.step];
  return { idx: pr.ctx.save.data.mission.idx, step: c.step, title: c.title, t: st.t, poi: st.poi || null, lesson: st.lesson || null, race: st.race || null, coins: pr.ctx.save.data.coins, dlg: !!document.querySelector('.dlg'), deadline: f.deadline }; }"""
NEAR = """(a) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === a[0]); const r = pr.drive.city.nearestRoad(p.x, p.z);
  const hx = Math.sin(r.heading), hz = -Math.cos(r.heading); pr.bus.emit('drive:teleport', { x: r.x - hx * a[1], z: r.z - hz * a[1], heading: r.heading }); }"""
INTO = """(id) => { const pr = window.__pr; const p = pr.drive.city.pois.find(q => q.id === id); const r = pr.drive.city.nearestRoad(p.x, p.z);
  const h = Math.atan2(p.x - r.x, -(p.z - r.z)); pr.bus.emit('drive:teleport', { x: p.x - Math.sin(h) * 5, z: p.z + Math.cos(h) * 5, heading: h }); }"""

def talk(pg):
    for i in range(60):
        if not pg.locator(".dlg").count(): return
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(170)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
    pg.goto(base + "?fresh", wait_until="networkidle"); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="התחלה").first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="יאללה").first.click()
    for i in range(30):
        if pg.locator(".help-screen").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="הבנתי").first.click(); pg.wait_for_timeout(3000)
    last, same, done = None, 0, []
    for guard in range(140):
        pg.wait_for_timeout(350)
        if pg.locator(".credits-screen, .screen.credits").count() or pg.get_by_role("button", name="סגירה").count():
            try: pg.get_by_role("button", name="סגירה").first.click(timeout=800)
            except Exception: pass
        talk(pg)
        c = pg.evaluate(CUR)
        if c is None: print("STORY COMPLETE, coins", pg.evaluate("() => window.__pr.ctx.save.data.coins")); break
        key = (c["idx"], c["step"])
        same = same + 1 if key == last else 0
        if key != last:
            if last and last[0] != c["idx"]: done.append(last[0])
            print(f"mission {c['idx'] + 1} step {c['step']} [{c['title']}] {c['t']} {c['poi'] or c['lesson'] or c['race'] or ''} coins {c['coins']} clock {c['deadline']}")
        last = key
        if same > 6: print("STUCK at", c); break
        if c["dlg"] or c["t"] == "say": continue
        if c["t"] == "goto":
            pg.evaluate(NEAR, [c["poi"], 24]); pg.wait_for_timeout(350)
            pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(2600); pg.keyboard.up("ArrowUp")
            pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(450); pg.keyboard.up("ArrowDown")
        elif c["t"] == "visit":
            pg.evaluate(INTO, c["poi"]); pg.wait_for_timeout(700)
            pg.keyboard.press("KeyE"); pg.wait_for_timeout(600)
            pg.get_by_role("button", name="יציאה").first.click()
        elif c["t"] == "lesson":
            pg.evaluate("(id) => { const pr = window.__pr; pr.ctx.save.lesson(id).done = true; pr.flow.enterStep(); }", c["lesson"])
        elif c["t"] == "race":
            pg.evaluate("(id) => { const pr = window.__pr; pr.flow.onRaceEnd({ raceId: id, place: 1, total: 6, time: 90 + Math.random(), coins: 50, medal: 'gold', gatesRight: 0, gatesWrong: 0, bestLap: 40 }); }", c["race"])
            pg.wait_for_timeout(800)
    print("missions passed:", len(set(done)) + (1 if c is None else 0))
    for e in errs[:10]: print("ERR", e)
    b.close()
