"""End-to-end browser test of logins, sync, scenario marking and faculty tools against the local mock backend.
Run from the repo root:  python3 tools/test_portal_backend.py   (needs node + playwright)
Builds a temporary copy of the portal pointed at the mock, so index.html itself is not changed.
"""
import asyncio, functools, http.server, os, shutil, subprocess, sys, threading, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.environ.get("SHOTS", "")
PORT_API = 8799

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT); h.log_message = lambda *a, **k: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]

async def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py"), os.path.join(ROOT, "_mock_test.html")], check=True, stdout=subprocess.DEVNULL)
    p = os.path.join(ROOT, "_mock_test.html"); s = open(p, encoding="utf-8").read().replace('BACKEND_URL: ""', f'BACKEND_URL: "http://127.0.0.1:{PORT_API}/exec"'); open(p, "w", encoding="utf-8").write(s)
    api = subprocess.Popen(["node", os.path.join(ROOT, "tools", "mock_backend.js"), str(PORT_API)], stdout=subprocess.PIPE); time.sleep(1.2)
    url = f"http://127.0.0.1:{serve()}/_mock_test.html"
    fails = []
    def check(c, m): print(("PASS " if c else "FAIL ") + m); (None if c else fails.append(m))
    async def shot(pg, name):
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + ".png"))
    try:
        async with async_playwright() as pw:
            chrome = shutil.which("google-chrome")
            b = await pw.chromium.launch(**({"executable_path": chrome} if chrome else {}), args=["--no-sandbox"])
            ctx = await b.new_context(viewport={"width": 1320, "height": 900}); pg = await ctx.new_page()
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(url); await pg.wait_for_selector("#wl-student"); await shot(pg, "00_welcome")
            check("I'm a Student" in await pg.inner_text("main") and "I'm Faculty" in await pg.inner_text("main"), "welcome page with student and faculty buttons")
            await pg.click("#wl-student"); await pg.wait_for_selector("#lg-roll")
            await shot(pg, "01_login")
            check(await pg.locator("#nav").is_hidden(), "logged-out view hides navigation")
            await pg.fill("#lg-roll", "NST999"); await pg.fill("#lg-pin", "1234"); await pg.click("#lg-sgo"); await pg.wait_for_timeout(500)
            check("roster" in await pg.inner_text("#lg-err"), "unknown roll number gets a clear message")
            await pg.fill("#lg-roll", "nst001"); await pg.fill("#lg-pin", "2468"); await pg.click("#lg-sgo")
            await pg.wait_for_selector("#dash-extra .jdc"); await pg.wait_for_function("document.querySelector('#engine') && document.querySelector('#engine').className==='ok'", timeout=40000)
            check("Riya" in await pg.inner_text("main"), "student lands on dashboard after first login")
            await pg.goto(url + "#/q/1"); await pg.wait_for_selector("#sql")
            await pg.fill("#sql", "SELECT name, city FROM employees WHERE city = 'Pune'"); await pg.click("#submit"); await pg.wait_for_selector(".fb.good"); await pg.wait_for_timeout(1800)
            await pg.goto(url + "#/mcq?bank=bigdata"); await pg.wait_for_selector(".opt")
            correct = await pg.evaluate("(() => { const m = window.SQLQ_DATA.mcq.filter(x => x.bank==='bigdata')[0]; return m.ans; })()")
            await pg.click(f".opt[data-k='{correct}']"); await pg.wait_for_selector("#mcq-fb .fb.good")
            check(True, "Big Data MCQ bank answers and scores")
            await pg.goto(url + "#/learn/bd4"); await pg.wait_for_selector("#ls-read"); await shot(pg, "05_lesson"); await pg.click("#ls-read"); await pg.wait_for_timeout(200)
            await pg.goto(url + "#/scenario/s3"); await pg.wait_for_selector("#sc-ans")
            await pg.fill("#sc-ans", "WHERE filters rows before grouping, HAVING filters groups after aggregation. Logical order of execution is FROM, WHERE, GROUP BY, HAVING, SELECT. Example: WHERE status='delivered' then HAVING COUNT(*) > 5. Clear simple language for juniors.")
            await pg.click("#sc-go"); await pg.wait_for_selector(".scorebox", timeout=15000); await pg.wait_for_timeout(800)
            await shot(pg, "04_scenario")
            check("/10" in await pg.inner_text("#sc-results") and "Model answer" in await pg.inner_text("main"), "scenario answer is marked with rubric feedback and model answer")
            await pg.goto(url + "#/home"); await pg.wait_for_selector("#dash-board table", timeout=10000); await shot(pg, "02_student_dashboard")
            check("You're #" in await pg.inner_text("#dash-board"), "dashboard shows rank and mini leaderboard")
            xp_before = await pg.evaluate("document.querySelector('.xpbar span').textContent")
            # new device: wipe local storage, log in again, progress must come back from the server
            await pg.evaluate("localStorage.clear()"); await pg.goto(url + "#/home"); await pg.reload(); await pg.wait_for_selector("#wl-student"); await pg.click("#wl-student"); await pg.wait_for_selector("#lg-roll")
            await pg.fill("#lg-roll", "NST001"); await pg.fill("#lg-pin", "2468"); await pg.click("#lg-sgo"); await pg.wait_for_selector("#dash-extra .jdc"); await pg.wait_for_timeout(800)
            xp_after = await pg.evaluate("document.querySelector('.xpbar span').textContent")
            check(xp_before == xp_after and xp_after != "0 XP", f"progress restored on a new device ({xp_before} → {xp_after})")
            await pg.click("#btn-profile"); await pg.click("#ac-out"); await pg.wait_for_selector("#wl-faculty")
            check(True, "student logout returns to the welcome page")
            # faculty
            await pg.click("#wl-faculty"); await pg.wait_for_selector("#lg-user")
            check(await pg.locator("#lg-roll").is_hidden(), "faculty button opens the faculty login form"); await pg.fill("#lg-user", "omkar"); await pg.fill("#lg-pass", "ChangeMe@123"); await pg.click("#lg-fgo")
            await pg.wait_for_selector("tr[data-roll]"); await shot(pg, "06_faculty_students")
            t = await pg.inner_text("main"); check("Riya Desai" in t and "Arjun Mehta" in t, "faculty overview lists the roster")
            await pg.click("tr[data-roll='NST001']"); await pg.wait_for_selector("#fs h1"); await shot(pg, "07_faculty_student")
            check("Who works in Pune?" in await pg.inner_text("#fs"), "student drill-down shows solved questions and their SQL")
            await pg.goto(url + "#/f/questions"); await pg.wait_for_selector("#fq table"); await shot(pg, "08_question_analytics")
            await pg.goto(url + "#/f/review"); await pg.wait_for_selector(".rv"); await shot(pg, "09_review")
            await pg.fill(".rv .rv-score", "9"); await pg.fill(".rv .rv-comment", "Nice example"); await pg.click(".rv .rv-save"); await pg.wait_for_timeout(600)
            await pg.goto(url + "#/f/review?status=reviewed"); await pg.wait_for_selector(".rv"); check("Reviewed by faculty" in await pg.inner_text("#fr"), "faculty overrides an AI mark")
            await pg.goto(url + "#/f/roster"); await pg.fill("#ro-in", "NST010, Kabir Rao, 2027-B\nNST011\tMeera Iyer\t2027-B"); await pg.click("#ro-go"); await pg.wait_for_selector("#ro-msg .fb")
            check("Added 2" in await pg.inner_text("#ro-msg"), "roster paste adds students (CSV and tab-separated)")
            await pg.goto(url + "#/f/mcq"); await pg.wait_for_selector("#fm-q")
            await pg.select_option("#fm-bank", "de"); await pg.fill("#fm-topic", "Airflow"); await pg.fill("#fm-q", "What does DAG stand for?")
            for k, o in enumerate(["Directed Acyclic Graph", "Data Access Gateway", "Daily Aggregation Group", "Distributed App Grid"]): await pg.locator(".fm-opt").nth(k).fill(o)
            await pg.fill("#fm-exp", "Airflow pipelines are DAGs."); await pg.click("#fm-save"); await pg.wait_for_timeout(1200)
            check("What does DAG stand for?" in await pg.inner_text("#fm-list"), "faculty adds an MCQ")
            await pg.goto(url + "#/f/team"); await pg.wait_for_selector("#ft-list table")
            await pg.click("#ft-out"); await pg.wait_for_selector("#wl-student"); await pg.click("#wl-student"); await pg.wait_for_selector("#lg-roll")
            # student sees the faculty MCQ
            await pg.fill("#lg-roll", "NST002"); await pg.fill("#lg-pin", "1357"); await pg.click("#lg-sgo"); await pg.wait_for_selector("#dash-extra .jdc")
            await pg.goto(url + "#/mcq?bank=de&topic=Airflow"); await pg.wait_for_selector(".mcq h2")
            check("Added by faculty" in await pg.inner_text("main"), "students see faculty-added MCQs")
            await pg.goto(url + "#/board"); await pg.wait_for_selector("table.lb tbody tr"); await shot(pg, "03_leaderboard")
            check(await pg.locator("table.lb tbody tr").count() == 2, "leaderboard lists active students")
            check(not errs, f"no page errors {errs}")
            await b.close()
    finally:
        api.terminate(); os.remove(p)
    print("ALL PASSED" if not fails else f"{len(fails)} FAILED"); sys.exit(1 if fails else 0)

asyncio.run(main())
