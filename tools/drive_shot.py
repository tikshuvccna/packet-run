"""Drive engine visual check in the real Chrome (GPU, headless=new).
usage: python -I tools/drive_shot.py "<query>" <out_prefix> [shots] [script]
  query  : dev3d.html query, e.g. "seed=1&quality=medium&race=circuit"
  shots  : comma list of seconds after start for screenshots (default "3,8")
  script : optional JS run once after the engine is ready (window.__dev available). Use keys like
           __dev.key('ArrowUp', true) to hold a key (see the helper injected below).
env: DS_URL (default http://localhost:5182/dev3d.html), DS_W/DS_H (1280x720), DS_CPU (CPU throttle rate), DS_UNCAP=1
Prints fps (average over the run), console errors.
"""
import sys, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = os.environ.get("DS_URL", "http://localhost:5182/dev3d.html")
HELPER = """() => { window.__dev.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); }"""

def main():
    query, prefix = sys.argv[1], sys.argv[2]
    shots = [float(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "3,8").split(",")]
    script = sys.argv[4] if len(sys.argv) > 4 else ""
    W, H = int(os.environ.get("DS_W", 1280)), int(os.environ.get("DS_H", 720))
    with sync_playwright() as p:
        args = ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist",
                "--disable-background-timer-throttling", "--disable-renderer-backgrounding"]
        if os.environ.get("DS_UNCAP"):
            args += ["--disable-gpu-vsync", "--disable-frame-rate-limit"]
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=args)
        ctx = b.new_context(viewport={"width": W, "height": H}, has_touch=W < 800, is_mobile=W < 800)
        pg = ctx.new_page()
        logs = []
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning", "log") else None)
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))
        if os.environ.get("DS_CPU"):
            ctx.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": float(os.environ["DS_CPU"])})
        pg.goto(BASE + "?" + query, wait_until="domcontentloaded")
        try:
            pg.wait_for_function("() => window.__dev && window.__dev.ready()", timeout=30000)
        except Exception as e:
            pg.screenshot(path=prefix + "_fail.png")
            print("NOT STARTED", e)
            for l in logs[:25]:
                print("  ", l)
            b.close()
            return
        pg.evaluate(HELPER)
        if script:
            try:
                r = pg.evaluate(script)
                if r is not None:
                    print("script:", r)
            except Exception as e:
                print("script error", e)
        pg.evaluate("() => window.__dev.resetFps()")
        t = 0.0
        for s in shots:
            pg.wait_for_timeout(int((s - t) * 1000))
            t = s
            out = f"{prefix}_{s:g}s.png"
            pg.screenshot(path=out)
            print("shot", out, pg.evaluate("() => document.getElementById('dbg').textContent"))
        print("fps", round(pg.evaluate("() => window.__dev.fps()"), 1))
        print("gpu", pg.evaluate("() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }"))
        for l in logs[:20]:
            print("  ", l[:300])
        b.close()

main()
