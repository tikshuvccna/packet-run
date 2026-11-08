"""Plays the real main page from the title into the open world and screenshots stages.
usage: python -I tools/flow_run.py <out_prefix> [WxH] [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
w, h = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "1280x720").split("x")]
base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5211/"
touch = w < 800

def click_text(pg, text, timeout=4000):
    pg.get_by_role("button", name=text).first.click(timeout=timeout)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
    pg.goto(base + "?fresh", wait_until="networkidle")
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{prefix}_1title.png")
    click_text(pg, "התחלה")
    pg.wait_for_timeout(500)
    click_text(pg, "יאללה")
    for i in range(14):
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(150)
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(250)
        if pg.locator(".help-screen").count(): break
    click_text(pg, "הבנתי")
    pg.wait_for_timeout(3500)
    pg.screenshot(path=f"{prefix}_2start.png")
    if not touch:
        pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(2500)
        pg.keyboard.down("ArrowLeft"); pg.wait_for_timeout(700); pg.keyboard.up("ArrowLeft")
        pg.keyboard.down("Space"); pg.wait_for_timeout(900)
        pg.screenshot(path=f"{prefix}_3driving.png")
        pg.keyboard.up("Space"); pg.keyboard.up("ArrowUp")
    else:
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{prefix}_3driving.png")
    print("fps", pg.evaluate("() => window.__pr && window.__pr.ctx ? 'ok' : 'no hook'"))
    for e in errs[:10]: print("ERR", e)
    b.close()
