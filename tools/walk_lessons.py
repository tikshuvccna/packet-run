"""Plays every lesson step, quiz and game level through the real UI (dev-ui.html) to catch runtime errors.
usage: python -I tools/walk_lessons.py [base_url]
"""
import sys, os, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5201"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

SOLVE_WIDGET = r"""
async (step) => {
  const w = step.widget;
  const q = (s) => [...document.querySelectorAll(s)];
  const byText = (s, t) => q(s).find((e) => e.textContent.trim() === t);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (w.type === 'explore') for (const c of w.cards) byText('.card-btn', c.label).click();
  else if (w.type === 'match') for (const p of w.pairs) { byText('.match .col:first-child .item', p.a).click(); byText('.match .col:last-child .item', p.b).click(); }
  else if (w.type === 'toggle') q('.sw').forEach((b) => b.click());
  else if (w.type === 'order') for (const it of w.items) byText('.pool .item', it).click();
  else if (w.type === 'split') { q('.sw').slice(0, 2).forEach((b) => b.click()); }
  else if (w.type === 'beam') q('.sw').forEach((b) => b.click());
  else if (w.type === 'sort') {
    for (let i = 0; i < w.items.length; i++) {
      const label = document.querySelector('.sortcard').textContent.trim();
      const it = w.items.find((x) => x.label === label);
      const bucket = w.buckets.find((b) => b.id === it.bucket);
      q('.bucket').find((b) => b.textContent.trim() === bucket.label).click();
    }
  } else if (w.type === 'msglab') {
    const sendIt = async () => { byText('.btn', 'שלחו').click(); await wait(2100); };
    await sendIt();
    const rb = q('.rulebtn');
    for (let i = 0; i < 3; i++) { rb[i].click(); await sendIt(); rb[i].click(); }
  } else if (w.type === 'encode') {
    q('.switches .sw').forEach((b) => b.click());
  } else if (w.type === 'cast') {
    const modes = q('.switches .sw');
    for (const [mi, picks] of [[0, [1]], [1, [2, 3]], [2, []]]) {
      modes[mi].click();
      for (const p of picks) q('.host')[p].click();
      byText('.btn', 'שלחו').click();
      await wait(80);
    }
  } else if (w.type === 'flowsim') {
    const sl = q('input[type=range]')[0];
    for (const v of ['12', '2']) { sl.value = v; sl.dispatchEvent(new Event('input')); byText('.btn', 'שלחו 8 שניות').click(); await wait(80); }
  } else if (w.type === 'journey') {
    for (let i = 0; i < 40; i++) { const nb = q('.widget .btn.primary')[0]; if (!nb) break; nb.click(); await wait(10); }
  } else if (w.type === 'tcpudp') {
    const sl = q('input[type=range]')[0]; sl.value = '40'; sl.dispatchEvent(new Event('input'));
    q('.switches .sw').forEach((b) => b.click());
  } else if (w.type === 'wrap') {
    for (let i = 0; i < w.layers.length; i++) byText('.sw', 'עטפו').click();
    for (let i = 0; i < w.layers.length; i++) byText('.sw', 'קלפו').click();
  }
  await wait(60);
  const next = byText('.lfoot .btn', 'לשאלה');
  if (!next || next.disabled) return 'widget not completed: ' + w.type;
  next.click();
  await wait(60);
  const opt = q('.option')[step.check.correct];
  opt.click();
  await wait(60);
  const go = q('.lfoot .btn').find((b) => b.textContent.trim() === 'הבא' || b.textContent.trim() === 'סיום');
  if (!go || go.disabled) return 'check not passed';
  go.click();
  await wait(60);
  return 'ok';
}
"""

def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--headless=new"])
        for n in ("06", "07", "08"):
            pg = b.new_page(viewport={"width": 1000, "height": 700})
            pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
            pg.on("console", lambda m: errors.append("console " + m.text) if m.type == "error" and "404" not in m.text else None)
            pg.goto(f"{BASE}/dev-ui.html?fresh&dev=lesson{n}", wait_until="networkidle")
            pg.wait_for_timeout(1500)
            lesson = pg.evaluate(f"import('/src/content/index.ts').then(m => m.LESSONS['lesson{n}'])")
            for st in lesson["steps"]:
                res = pg.evaluate(f"({SOLVE_WIDGET})", st)
                print(n, st["id"], st["widget"]["type"], res)
                if res != "ok":
                    errors.append(f"lesson{n} {st['id']} {res}")
                    pg.screenshot(path=os.path.join(os.environ.get("TEMP", "."), f"walk_fail_{n}_{st['id']}.png"))
                    break
            pg.wait_for_timeout(200)
            print(n, "lesson overlay closed:", pg.evaluate("!document.querySelector('.lesson-screen')"))
            pg.close()
        b.close()
    print("ERRORS:", errors if errors else "none")

main()
