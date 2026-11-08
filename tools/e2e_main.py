"""End-to-end check of the MAIN page (index.html) with the drive engine, in the real Chrome (GPU).
usage: python -I tools/e2e_main.py <out_prefix> [WxH] [base_url] [steps]
steps (comma list, default all): lesson, race, delivery, drift, tow
Records bus events (drive:poi, drive:race-end, drive:toast) and screenshots each stage.
"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
w, h = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "1280x720").split("x")]
base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5182/"
steps = (sys.argv[4] if len(sys.argv) > 4 else "lesson,race,delivery,drift,tow").split(",")
touch = w < 800

HOOK = """() => {
  const pr = window.__pr; window.__ev = [];
  for (const k of ['drive:poi', 'drive:race-end', 'drive:toast', 'drive:gate', 'drive:ready'])
    pr.bus.on(k, (p) => window.__ev.push([k, JSON.stringify(p ?? null).slice(0, 160)]));
  return 'hooked';
}"""

def ev(pg, clear=True):
    r = pg.evaluate("() => { const e = window.__ev.slice(); return e; }")
    if clear:
        pg.evaluate("() => { window.__ev.length = 0; }")
    return r

def teleport_to(pg, poi_id):
    return pg.evaluate("""(id) => { const d = window.__pr.drive; const p = d.city.pois.find((q) => q.id === id);
      if (!p) return 'no poi ' + id; const r = d.city.nearestRoad(p.x, p.z);
      window.__pr.bus.emit('drive:teleport', { x: p.x, z: p.z, heading: r.heading }); return [p.x.toFixed(0), p.z.toFixed(0)]; }""", poi_id)

def click_text(pg, text, timeout=4000):
    pg.get_by_role("button", name=text).first.click(timeout=timeout)

def race_with_bot(pg, race_id, max_s, tag):
    pg.evaluate("""(id) => { const d = window.__pr.drive; const r = d.city.races.find((q) => q.id === id || q.kind === id);
       window.__pr.bus.emit('drive:start-race', r); d.setAuto(true); return r && r.id; }""", race_id)
    pg.wait_for_timeout(5000)
    pg.screenshot(path=f"{prefix}_{tag}_a.png")
    end = None
    for i in range(int(max_s / 2)):
        pg.wait_for_timeout(2000)
        es = ev(pg)
        for k, p in es:
            if k == 'drive:race-end':
                end = p
        if end:
            break
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{prefix}_{tag}_end.png")
    pg.evaluate("() => window.__pr.drive.setAuto(false)")
    print(tag, "race-end:", end)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True,
                          args=["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"])
    pg = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
    pg.goto(base + "?fresh", wait_until="networkidle")
    pg.wait_for_timeout(1200)
    click_text(pg, "התחלה")
    pg.wait_for_timeout(500)
    try:
        click_text(pg, "יאללה")
    except Exception as e:
        print("no יאללה", e)
    for i in range(14):
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(150)
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(250)
        if pg.locator(".help-screen").count():
            break
    try:
        click_text(pg, "הבנתי")
    except Exception as e:
        print("no הבנתי", e)
    pg.wait_for_function("() => window.__pr && window.__pr.drive && window.__pr.drive.sim", timeout=20000)
    print(pg.evaluate(HOOK))
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{prefix}_0world.png")

    if "lesson" in steps:
        print("teleport", teleport_to(pg, "garage_lesson06"))
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{prefix}_1poi.png")
        if touch:
            print("prompt", pg.evaluate("() => document.body.innerText.includes('מוסך') "))
        pg.keyboard.press("KeyE")
        pg.wait_for_timeout(1500)
        print("lesson events", ev(pg))
        pg.screenshot(path=f"{prefix}_2lesson.png")
        pg.goto(base + "?fresh", wait_until="networkidle")   # restart clean for the races
        pg.wait_for_timeout(1000)
        click_text(pg, "התחלה"); pg.wait_for_timeout(400)
        try: click_text(pg, "יאללה")
        except Exception: pass
        for i in range(14):
            pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(150)
            pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(250)
            if pg.locator(".help-screen").count(): break
        try: click_text(pg, "הבנתי")
        except Exception: pass
        pg.wait_for_function("() => window.__pr && window.__pr.drive && window.__pr.drive.sim", timeout=20000)
        pg.evaluate(HOOK)
        pg.wait_for_timeout(1500)

    if "race" in steps:
        print("teleport", teleport_to(pg, "race_r_docks"))
        pg.wait_for_timeout(1200)
        pg.keyboard.press("KeyE")
        pg.wait_for_timeout(1500)
        print("race poi events", ev(pg, clear=False))
        pg.screenshot(path=f"{prefix}_3racepoi.png")
        race_with_bot(pg, "r_docks", 260, "4circuit")
    if "delivery" in steps:
        race_with_bot(pg, "delivery", 160, "5delivery")
    if "drift" in steps:
        race_with_bot(pg, "drift", 120, "6drift")
    if "tow" in steps:
        pg.evaluate("""() => { const d = window.__pr.drive; const r = d.city.races.find((q) => q.kind === 'circuit'); window.__pr.bus.emit('drive:start-race', r); }""")
        pg.wait_for_timeout(5000)
        print("tow mid-race", teleport_to(pg, "garage_main"))
        pg.wait_for_timeout(1500)
        print("race after tow:", pg.evaluate("() => !!window.__pr.drive.sim.race"))
        pg.screenshot(path=f"{prefix}_7tow.png")
    print("fps", round(pg.evaluate("() => window.__pr.drive.fps()"), 1))
    for e in errs[:12]:
        print("ERR", e[:300])
    b.close()
