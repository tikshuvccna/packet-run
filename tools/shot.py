"""Screenshot helper using the real Chrome (GPU) in headless mode.
usage: python -I tools/shot.py <url> <out_prefix> [WxH,WxH...] [js-to-run-before-shot] [wait_ms]
Writes <out_prefix>_<W>x<H>.png. The js runs in the page (e.g. clicks) before each shot.
"""
import sys, os, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME):
    CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

def main():
    url, prefix = sys.argv[1], sys.argv[2]
    sizes = (sys.argv[3] if len(sys.argv) > 3 else "1200x760").split(",")
    js = sys.argv[4] if len(sys.argv) > 4 else ""
    wait = int(sys.argv[5]) if len(sys.argv) > 5 else 1500
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True,
                              args=["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"])
        for sz in sizes:
            w, h = [int(x) for x in sz.split("x")]
            ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=(w < 800), is_mobile=(w < 800))
            pg = ctx.new_page()
            logs = []
            pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))
            pg.goto(url, wait_until="domcontentloaded")
            pg.wait_for_timeout(wait)
            if js:
                try:
                    r = pg.evaluate(js)
                    if r is not None:
                        print("js:", r)
                except Exception as e:
                    print("js error", e)
                pg.wait_for_timeout(700)
            out = f"{prefix}_{w}x{h}.png"
            pg.screenshot(path=out)
            print("shot", out)
            for l in logs[:12]:
                print("  ", l)
            ctx.close()
        b.close()

main()
