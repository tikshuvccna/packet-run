"""Does the game start? Fresh start and "continue" with saves from older versions, on desktop and on a phone-size touch screen.
Prints every page error, console error and failed request. usage: python -I tools/resume_run.py <out_prefix> [base_url]"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
prefix = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5211/"

OLD = {"v": 1, "started": True, "hero": "girl", "name": "דנה", "twoPlayers": False, "coins": 230,
       "upgrades": {"engine": 1, "nitro": 0, "tires": 0, "brakes": 0, "armor": 0, "slots": 0}, "cars": ["van", "hatch"], "wheels": ["std"], "vinyls": [],
       "look": {"car": "hatch", "paint": "#e55a4e", "vinyl": None, "vinylColor": "#ffffff", "wheels": "std", "rim": "#d8dde3", "spoiler": False},
       "lessons": {}, "flags": {}, "parcels": {}, "races": {}, "pos": {"x": 100, "z": 700, "heading": 0}, "bossWon": False,
       "playSeconds": 0, "settings": {"quality": "auto", "showFps": False, "musicOn": True, "sfxOn": True, "musicVol": 0.5, "sfxVol": 0.8}}
CASES = [
    ("fresh", None, (1280, 720), False),
    ("old_v1109_no_mission", OLD, (1280, 720), False),
    ("old_v1111_mission3", {**OLD, "mission": {"idx": 3, "step": 1}}, (1280, 720), False),
    ("v1112_side_active", {**OLD, "mission": {"idx": 4, "step": 1}, "mv": 2, "side": {"active": {"id": "s_pizza", "step": 0}, "done": {}}, "health": 0.4}, (1280, 720), False),
    ("phone_fresh", None, (740, 360), True),
    ("phone_old", {**OLD, "mission": {"idx": 1, "step": 0}}, (360, 640), True),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    for name, save, (w, h), touch in CASES:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:300]))
        pg.on("console", lambda m: errs.append("CONSOLE " + m.text[:300]) if m.type == "error" else None)
        pg.on("requestfailed", lambda r: errs.append("REQFAILED " + r.url[-80:]))
        pg.on("response", lambda r: errs.append(f"HTTP {r.status} " + r.url[-80:]) if r.status >= 400 else None)
        if save is not None:
            pg.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('packet-run.save.v1', %s); }" % json.dumps(json.dumps(save, ensure_ascii=False)))
        pg.goto(base, wait_until="networkidle"); pg.wait_for_timeout(1200)
        try:
            if save is None:
                pg.get_by_role("button", name="התחלה").first.click(timeout=4000); pg.wait_for_timeout(500)
                pg.get_by_role("button", name="יאללה").first.click(timeout=4000)
                for i in range(30):
                    if pg.locator(".help-screen").count(): break
                    pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
                pg.get_by_role("button", name="הבנתי").first.click(timeout=4000)
            else:
                pg.get_by_role("button", name="המשך נסיעה").first.click(timeout=4000)
            pg.wait_for_timeout(3500)
            for i in range(40):
                if not pg.locator(".dlg").count(): break
                pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(180)
            pg.wait_for_timeout(600)
            pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(2500); pg.keyboard.up("ArrowUp")
            st = pg.evaluate("() => { const pr = window.__pr, s = pr.drive.sim; return { build: pr.build, kmh: s ? Math.round(s.player.speed * 3.6) : null, car: s ? s.player.carId : null, mission: pr.ctx.save.data.mission, side: pr.ctx.save.data.side.active, fps: Math.round(pr.drive.fps()), canvas: !!document.querySelector('#game canvas'), errbar: getComputedStyle(document.getElementById('errbar')).display !== 'none' ? document.getElementById('errtext').innerText : null, boot: !!document.getElementById('bootmsg'), box: (document.querySelector('.missionbox') || {}).innerText }; }")
            print(name, "OK", st)
        except Exception as e:
            print(name, "FAILED", str(e)[:300])
        pg.screenshot(path=f"{prefix}_{name}.png")
        for e in errs[:12]: print("   ", e)
        ctx.close()
    b.close()
