"""Browser smoke test for index.html. Needs: pip install playwright && playwright install chromium

Run from the repo root after building:  python3 tools/test_portal.py
Exits non-zero if anything fails, so it is safe to use before every push.
"""
import asyncio, functools, http.server, os, shutil, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]

async def main():
    port = serve(); url = f"http://127.0.0.1:{port}/index.html"
    fails = []
    def check(cond, msg):
        print(("PASS " if cond else "FAIL ") + msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        chrome = shutil.which("google-chrome")
        b = await p.chromium.launch(**({"executable_path": chrome} if chrome else {}), args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1300, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_selector("#wl-student")
        check("Faculty / Admin" in await pg.inner_text("main"), "welcome page shows student and faculty/admin buttons")
        await pg.click("#wl-faculty"); await pg.wait_for_selector(".loginbox h2")
        check("isn't switched on" in await pg.inner_text("main"), "faculty button explains setup when no backend")
        await pg.goto(url + "#/welcome"); await pg.click("#wl-student")
        await pg.fill("#pf-name", "Test Bot"); await pg.click("#pf-save"); await pg.wait_for_selector(".hero")
        await pg.wait_for_function("document.querySelector('#engine').className==='ok'", timeout=40000)
        res = await pg.evaluate("""async () => { const X = window.__SQLQ; const bad = [];
          for (const q of X.QS) { const e = await X.expected(q); if (!e.ok || !e.rows.length || !X.compare(q, e, e).pass) bad.push(q.id); } return [X.QS.length, bad]; }""")
        check(not res[1], f"all {res[0]} reference solutions run and self-grade (bad: {res[1]})")
        await pg.goto(url + "#/q/1"); await pg.wait_for_selector("#sql")
        await pg.fill("#sql", "SELECT name FROM employees"); await pg.click("#submit"); await pg.wait_for_selector(".fb.bad")
        check("column" in (await pg.inner_text("#feedback")), "wrong answer gets column feedback")
        await pg.fill("#sql", "SELECT name, city FROM employees WHERE city = 'Pune'"); await pg.click("#submit"); await pg.wait_for_selector(".fb.good")
        check("XP" in await pg.inner_text("#hdr-stats"), "correct answer awards XP")
        await pg.goto(url + "#/exp"); await pg.wait_for_selector(".exp")
        n = await pg.locator(".exp").count(); total = await pg.evaluate("window.SQLQ_DATA.experiences.length")
        check(n == total and n > 0, f"experiences page shows all {total} cards")
        await pg.goto(url + "#/exp?topic=guesstimate"); await pg.wait_for_timeout(300)
        m = await pg.locator(".exp").count(); check(0 < m < total, f"topic filter works ({m} guesstimate cards)")
        await pg.locator(".exp summary").first.click(); await pg.locator("[data-read]").first.click(); await pg.wait_for_timeout(200)
        check(await pg.evaluate("Object.keys(window.__SQLQ.S().expRead).length") == 1, "mark-as-read records progress")
        await pg.goto(url + "#/scenario/s1"); await pg.wait_for_selector("#sc-ans")
        await pg.fill("#sc-ans", "First I would check the data pipeline for delays, then split revenue into orders and AOV, then slice by city and payment mode.")
        await pg.click("#sc-go"); await pg.wait_for_timeout(300)
        check("Model answer" in await pg.inner_text("main"), "scenario self-check shows model answer in local mode")
        await pg.goto(url + "#/learn/de3"); await pg.wait_for_selector("#ls-read"); await pg.click("#ls-read"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("Object.keys(window.__SQLQ.S().lessonRead).length") == 1, "lesson mark-as-read records progress")
        await pg.goto(url + "#/learn?tab=interview"); await pg.wait_for_selector(".exp")
        check(await pg.locator(".exp").count() == await pg.evaluate("window.SQLQ_DATA.learn.interview.length"), "interview Q&A list renders")
        for bank in ["dbms", "bigdata", "de"]:
            await pg.goto(url + f"#/mcq?bank={bank}"); await pg.wait_for_selector(".mcq h2")
        n_dots = await pg.locator(".mcqnav .dot").count()
        check(n_dots == await pg.evaluate("window.SQLQ_DATA.mcq.filter(m => m.bank === 'de').length"), "MCQ banks switch (DE bank shows its questions)")
        for path in ["#/home", "#/list", "#/mcq", "#/oa", "#/sandbox", "#/badges", "#/board", "#/guide", "#/scenario", "#/learn"]:
            await pg.goto(url + path); await pg.wait_for_timeout(250)
        check(not errs, f"no page errors {errs}")
        await b.close()
    print("ALL PASSED" if not fails else f"{len(fails)} FAILED"); sys.exit(1 if fails else 0)

asyncio.run(main())
