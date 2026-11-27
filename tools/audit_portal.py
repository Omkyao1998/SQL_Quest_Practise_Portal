"""Page-by-page audit: visits every route in local mode and backend mode (mock), on desktop and phone widths.
Flags page errors, console errors, failed requests, 'undefined'/'NaN'/'[object' text, sideways scrolling on phones,
empty pages, and links that leave the site. Usage: python3 tools/audit_portal.py   (SHOTS=dir for screenshots)
"""
import asyncio, functools, http.server, json, os, shutil, subprocess, sys, threading, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.environ.get("SHOTS", "")
PORT_API = 8798
AUDIT = {"pw": "ChangeMe@123"}
STUDENT = ["#/home", "#/list", "#/list?world=w5", "#/q/1", "#/q/60", "#/q/100", "#/mcq", "#/mcq?bank=bigdata", "#/mcq?bank=de&i=29", "#/scenario", "#/scenario/s1",
           "#/scenario/b3", "#/learn", "#/learn?tab=interview", "#/learn/bd1", "#/learn/de8", "#/oa", "#/exp", "#/exp?id=1", "#/sandbox", "#/badges", "#/board", "#/guide", "#/welcome",
           "#/q/999", "#/scenario/zzz", "#/learn/zzz", "#/nonsense"]
FACULTY = ["#/f/overview", "#/f/student/NST001", "#/f/student/NOPE", "#/f/questions", "#/f/review", "#/f/review?status=reviewed", "#/f/roster", "#/f/mcq", "#/f/team", "#/board",
           "#/list", "#/learn", "#/admin", "#/admin/students", "#/admin/faculty", "#/admin/log"]

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT); h.log_message = lambda *a, **k: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]

CHECK_JS = """() => {
  const m = document.querySelector('main'); const t = (m ? m.innerText : '') || '';
  const bad = [];
  for (const w of ['undefined', 'NaN', '[object', 'null/']) if (t.includes(w)) bad.push('text contains ' + w + ': …' + t.slice(Math.max(0, t.indexOf(w) - 50), t.indexOf(w) + 30).replace(/\\n/g, ' ') + '…');
  if (t.trim().length < 40) bad.push('page almost empty: ' + JSON.stringify(t.trim().slice(0, 80)));
  const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
  if (sw > cw + 4) { const wide = [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > cw + 4 && !e.closest('.tablewrap,pre,.editor,.cm,textarea')).slice(0, 3).map(e => e.tagName + '.' + e.className); if (wide.length) bad.push('sideways scroll ' + sw + '>' + cw + ' ' + wide.join(', ')); }
  const ext = [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).filter(h => /^https?:/.test(h) && !h.includes('127.0.0.1'));
  const imgs = [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);
  if (imgs.length) bad.push('broken images ' + imgs.join(' '));
  return { bad, ext, h1: (document.querySelector('main h1') || {}).innerText || '' };
}"""

async def audit(b, url, routes, label, width, login=None):
    ctx = await b.new_context(viewport={"width": width, "height": 900}); pg = await ctx.new_page()
    errs, cons, fails = [], [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: fails.append(r.url[:80] + " " + str(r.failure)))
    await pg.goto(url + "#/welcome"); await pg.wait_for_timeout(800)
    if login: await login(pg)
    out, exts = [], set()
    for r in routes:
        e0, c0 = len(errs), len(cons)
        await pg.goto(url + r); await pg.wait_for_timeout(900 if "/f/" in r or "admin" in r or r in ("#/board", "#/home") else 450)
        res = await pg.evaluate(CHECK_JS)
        exts.update(res["ext"])
        new = errs[e0:] + cons[c0:]
        issues = res["bad"] + [f"JS error: {e}" for e in new]
        if issues: out.append((r, pg.url.split("#")[-1], issues))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, f"{label}_{width}_{r.replace('#/', '').replace('/', '_').replace('?', '_') or 'root'}.png"), full_page=False)
    await ctx.close()
    return out, sorted(exts), fails

async def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py"), os.path.join(ROOT, "_audit.html")], check=True, stdout=subprocess.DEVNULL)
    p = os.path.join(ROOT, "_audit.html"); src = open(p, encoding="utf-8").read()
    open(os.path.join(ROOT, "_audit_api.html"), "w", encoding="utf-8").write(src.replace('BACKEND_URL: ""', f'BACKEND_URL: "http://127.0.0.1:{PORT_API}/exec"'))
    api = subprocess.Popen(["node", os.path.join(ROOT, "tools", "mock_backend.js"), str(PORT_API)], stdout=subprocess.DEVNULL); time.sleep(1.2)
    port = serve(); local, online = f"http://127.0.0.1:{port}/_audit.html", f"http://127.0.0.1:{port}/_audit_api.html"
    report = {}
    async def prof(pg):
        await pg.click("#wl-student"); await pg.wait_for_selector("#pf-name"); await pg.fill("#pf-name", "Audit Student"); await pg.fill("#pf-roll", "A1"); await pg.click("#pf-save")
    async def stu(pg):
        await pg.click("#wl-student"); await pg.wait_for_selector("#lg-roll"); await pg.fill("#lg-roll", "NST001"); await pg.fill("#lg-pin", "2468"); await pg.click("#lg-sgo"); await pg.wait_for_timeout(1500)
    async def adm(pg):
        await pg.click("#wl-faculty"); await pg.wait_for_selector("#lg-user"); await pg.fill("#lg-user", "omkar"); pw_now = AUDIT["pw"]; await pg.fill("#lg-pass", pw_now); await pg.click("#lg-fgo"); await pg.wait_for_timeout(1500)
        if await pg.locator("#mp-new").count(): await pg.fill("#mp-new", "Audit@12345"); await pg.fill("#mp-new2", "Audit@12345"); await pg.click("#mp-go"); await pg.wait_for_timeout(800); AUDIT["pw"] = "Audit@12345"
    try:
        async with async_playwright() as pw:
            chrome = shutil.which("google-chrome")
            b = await pw.chromium.launch(**({"executable_path": chrome} if chrome else {}), args=["--no-sandbox"])
            for w in (1320, 390):
                report[f"local-student-{w}"] = await audit(b, local, STUDENT + ["#/login/faculty"], "local", w, prof)
                report[f"online-student-{w}"] = await audit(b, online, STUDENT, "stu", w, stu)
            report["online-admin-1320"] = await audit(b, online, FACULTY, "adm", 1320, adm)
            report["online-admin-390"] = await audit(b, online, FACULTY, "adm", 390, adm)
            await b.close()
    finally:
        api.terminate(); os.remove(p); os.remove(os.path.join(ROOT, "_audit_api.html"))
    total = 0
    for k, (issues, exts, fails) in report.items():
        print(f"\n=== {k}: {len(issues)} pages with issues")
        for r, landed, iss in issues:
            total += 1; print(f"  {r} (landed {landed})"); [print("     - " + i[:300]) for i in iss]
        if fails: print("  failed requests:", fails[:5])
        if exts: print("  external links:", ", ".join(exts)[:600])
    print("\nTOTAL pages with issues:", total)

asyncio.run(main())
