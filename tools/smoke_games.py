"""Opens every game level and the quizzes in the real UI, clicks around for a few seconds, reports runtime errors."""
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5211"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

CLICK_AROUND = r"""
async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let clicks = 0;
  for (let i = 0; i < 40; i++) {
    const cands = [...document.querySelectorAll('.option:not(:disabled), .pool .item:not(:disabled), .floor, .tool, .container, .lfoot .btn:not(:disabled)')];
    if (!cands.length) { await wait(200); continue; }
    const c = cands[Math.floor(Math.random() * cands.length)];
    c.click(); clicks++;
    await wait(250);
  }
  return clicks + ' clicks; screen: ' + (document.querySelector('.screen')?.className ?? 'none');
}
"""

def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--headless=new"])
        targets = [f"game{n}:{lv}" for n in ("06", "07", "08") for lv in ("easy", "medium", "hard")] + [f"quiz{n}" for n in ("06", "07", "08")]
        for t in targets:
            pg = b.new_page(viewport={"width": 1000, "height": 700})
            pg.on("pageerror", lambda e: errors.append(f"{t} PAGEERROR " + str(e)))
            pg.on("console", lambda m: errors.append(f"{t} console " + m.text) if m.type == "error" and "404" not in m.text else None)
            pg.goto(f"{BASE}/dev-ui.html?fresh&dev={t}", wait_until="networkidle")
            pg.wait_for_timeout(800)
            print(t, pg.evaluate(CLICK_AROUND))
            pg.close()
        b.close()
    print("ERRORS:", errors if errors else "none")

main()
