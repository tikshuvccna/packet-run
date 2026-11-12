"""Touch controls test: title -> open world, push the power lever, turn the wheel, brake, reverse. Screenshots + overlap check.
usage: python -I tools/touch_run.py <out_prefix> [WxH] [base_url]"""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

prefix = sys.argv[1]
w, h = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "740x360").split("x")]
base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5211/"

OVERLAP = """() => {
  const sel = ['.wheel', '.gearbox', '.abtn.brake', '.abtn.nitro', '.abtn.throwit', '.abtn.drift', '.abtn.resetbtn', '.abtn.lookbtn', '.dash', '.minimap', '.fuelgauge', '.cargauge', '.missionbox', '.abtn.act'];
  const rs = sel.map(s => { const e = document.querySelector(s); if (!e) return null; const st = getComputedStyle(e); if (st.display === 'none' || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { s, r } : null; }).filter(Boolean);
  const bad = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i].r, b = rs[j].r;
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(rs[i].s + ' x ' + rs[j].s);
  }
  for (const q of rs) if (q.r.left < -1 || q.r.top < -1 || q.r.right > innerWidth + 1 || q.r.bottom > innerHeight + 1) bad.push('offscreen ' + q.s);
  return bad.length ? bad.join('; ') : 'no overlap (' + rs.length + ' items)';
}"""
SPEED = "() => { const s = window.__pr.drive.sim; return s ? [Math.round(s.player.vf * 10) / 10, Math.round(s.player.h * 100) / 100] : null; }"

def center(pg, sel):
    r = pg.locator(sel).bounding_box()
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2, r

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True, args=["--headless=new", "--use-angle=d3d11"])
    pg = b.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True).new_page()
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
    pg.wait_for_timeout(3500)
    for i in range(30):   # opening mission talk, if any
        if not pg.locator(".dialogue, .dlg").count(): break
        pg.mouse.click(w // 2, h // 2); pg.wait_for_timeout(200)
    pg.wait_for_timeout(600)
    print("overlap:", pg.evaluate(OVERLAP))
    print("start", pg.evaluate(SPEED))
    pg.screenshot(path=f"{prefix}_1idle.png")
    # push the lever to full power
    gx, gy, gr = center(pg, ".gear-track")
    pg.mouse.move(gx, gy); pg.mouse.down(); pg.mouse.move(gx, gr["y"] + 2, steps=5); pg.mouse.up()
    pg.wait_for_timeout(2500)
    print("lever full", pg.evaluate(SPEED))
    # turn the wheel right: drag from the top around to the right
    wx, wy, wr = center(pg, ".wheel")
    R = wr["width"] * 0.42
    pg.mouse.move(wx, wy - R); pg.mouse.down(); pg.mouse.move(wx + R * 0.7, wy - R * 0.7, steps=4); pg.mouse.move(wx + R, wy, steps=4)
    pg.wait_for_timeout(700)
    pg.screenshot(path=f"{prefix}_2turn.png")
    print("turning", pg.evaluate(SPEED), pg.evaluate("() => document.querySelector('.wheel').style.transform"))
    pg.mouse.up()
    pg.wait_for_timeout(400)
    print("wheel back", pg.evaluate("() => document.querySelector('.wheel').style.transform"))
    # half power
    pg.mouse.move(gx, gr["y"] + 2); pg.mouse.down(); pg.mouse.move(gx, gr["y"] + gr["height"] * 0.2, steps=4); pg.mouse.up()
    pg.wait_for_timeout(3000)
    print("lever 50%", pg.evaluate(SPEED), pg.evaluate("() => document.querySelector('.gear-knob').textContent"))
    # reverse
    pg.mouse.move(gx, gy); pg.mouse.down(); pg.mouse.move(gx, gr["y"] + gr["height"] - 2, steps=5); pg.mouse.up()
    pg.wait_for_timeout(3500)
    print("reverse", pg.evaluate(SPEED), pg.evaluate("() => document.querySelector('.gear-knob').textContent"))
    pg.screenshot(path=f"{prefix}_3reverse.png")
    # brake while reversing
    bx, by, _ = center(pg, ".abtn.brake")
    pg.mouse.move(bx, by); pg.mouse.down(); pg.wait_for_timeout(1200)
    print("brake held", pg.evaluate(SPEED))
    pg.mouse.up()
    for e in errs[:10]: print("ERR", e)
    b.close()
