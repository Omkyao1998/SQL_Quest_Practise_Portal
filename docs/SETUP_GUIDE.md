# SQL Quest: setup guide for mentors

SQL Quest is a single HTML file. It needs no server and no login. A real SQL engine (SQLite) runs inside the student's browser, so every query is executed and checked automatically.

**What's in the box**

| File | What it is |
|---|---|
| `index.html` | The whole portal: 100 SQL questions, 40 DBMS MCQs, OA simulator, playground, badges, leaderboard page |
| `leaderboard/leaderboard_apps_script.gs` | Backend for the class leaderboard (Google Sheet + Apps Script, free) |
| `docs/question_index.csv` | List of all 100 questions with world, difficulty, roles and JD tags, for planning sessions |
| `data/`, `src/`, `tools/` | Content files, page code and the build/test scripts (see `docs/UPDATING.md`) |

---

## Step 1: Set up the leaderboard (15 minutes, one time)

1. Create a new Google Sheet, e.g. "SQL Quest – 2027 Leaderboard".
2. Open **Extensions → Apps Script**. Delete the sample code and paste all of `leaderboard_apps_script.gs`.
3. On line 12, change `CLASS_CODE` to your own code (e.g. `"NST2027"`). Students type this in their profile. It stops outsiders from posting.
4. Click **Save**, then **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and approve the permissions (Google shows an "unverified app" screen; click *Advanced → Go to project*). This is your own script.
6. Copy the **Web app URL** (ends with `/exec`).
7. Put the URL into `data/config.json` (`"leaderboard_url": "https://script.google.com/.../exec"`) and rebuild with `python3 tools/build.py`. Or just send the URL to Claude, which will do it and push.

Quick check: open the `/exec` URL in your browser. You should see `{"ok":true,"message":"SQL Quest leaderboard is running."}`.

Your Google Sheet now gets two tabs once students start:
- **Progress**: one row per student (XP, solved count, hard count, MCQs, streak, best OA score, hints used, solutions revealed, last active). This is your teacher dashboard; sort and filter as you like.
- **Log**: every solve, solution reveal and OA attempt, with the student's SQL. Use it to spot-check copied answers.

> If you change the script later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Step 2: Host the file (10 minutes, free)

**Option A: GitHub Pages (recommended)**
1. Create a public repo, e.g. `sql-quest`.
2. Upload `index.html` (only this file is needed).
3. **Settings → Pages → Source: Deploy from a branch → main / root → Save**.
4. After about a minute your link is `https://<your-username>.github.io/SQL_Quest_Practise_Portal/` (this repo). Share it with students.

**Option B: anything else that serves a file.** Google Sites (embed), the college LMS, Netlify drop, or simply share the file. Students can also double-click it offline; everything except the leaderboard works without internet.

## Step 3: Share with students

Send them:
- the link
- the class code
- one instruction: *"Use the same roll number and 4-digit PIN every time. Your PIN protects your leaderboard entry."*

Progress is saved in each student's browser. To move to a new laptop, they use **Profile → Move progress to another device** (copy code → paste code).

---

## How the gamification works

| Rule | Value |
|---|---|
| XP per question | Easy 10 · Medium 20 · Hard 30 |
| Hints | 3 per question; each costs 25% of that question's XP |
| Perfect solve | +5 bonus for solving on the first submit with no hints |
| Solution | Unlocks after 3 wrong submissions; opening it gives 0 XP for that question |
| MCQs | +5 XP for each first-time correct answer |
| Levels | Rookie → Query Cadet → Filter Fighter → Join Ninja → Aggregation Ace → Window Wizard → SQL Sensei → Placement Ready |
| Badges | 26 (milestones, streaks, hint-free, each world cleared, OA scores, and "JD-ready" for Tata CLiQ, Swiggy, Shadowfax, Upstox, Grab) |
| Attempts | Unlimited. Wrong submissions only count towards unlocking the solution |

Max XP is about 2,520 (100 questions + bonuses + MCQs).

## How the questions map to your JD bank

The 100 questions are weighted towards **DA / BA / BI** roles (95 tagged DA, 80 BA) with a **DS/AI-ML SQL** track (24 tagged DS), as you asked. Every question is tagged with the companies from your JD bank whose JD asks for that skill:

- **ZenStatement / Eternz** (SQL floor: SELECT, WHERE, GROUP BY, joins) → Worlds 1-3
- **Tata CLiQ / Upstox** (window functions named as must-have; AOV, retention, CLV) → Worlds 4, 5, 7
- **Snabbit / Grab / ShareChat / Sarvam AI** (funnels, product metrics, anomaly detection) → Q56, Q85, Q86, Q90
- **Swiggy** (CTR, ROAS, A/B readouts) → Q29, Q88, Q89, Q99
- **Shadowfax** (cost per shipment vs zonal targets, RTO) → Q14, Q25, Q41, Q44, Q82
- **Grab DS / Carousell / Spinny / Temple** (statistics in SQL) → World 8

The portal tells students that a tag means "this skill appears in that company's JD", **not** "this company asked this exact question". All datasets are fictional, Indian-context business data.

## Suggested 4-week use in a workshop

| Week | Worlds | In class | Self-practice target |
|---|---|---|---|
| 1 | 1-2 | Demo Q1, Q11 (integer trap), Q20 (WHERE vs HAVING), Q23 (pivot) | 30 questions |
| 2 | 3-4 | Q33/Q34 (anti-join + NOT IN trap), Q43, Q46-Q50 (Nth highest family) | 25 questions + 20 MCQs |
| 3 | 5-6 | Q60 (top-N per group), Q62 (MoM), Q69 (gaps & islands) | 25 questions + OA attempt #1 |
| 4 | 7-8 | Q85 funnel and Q88 A/B as live "think aloud" case rounds | Finish + OA weekly until ≥70% |

Tip: for Worlds 7-8, have students explain their query out loud in pairs. The "What the interviewer is checking" note on each question is the rubric.

## Things to know (limits)

- **SQLite vs MySQL.** The engine is SQLite; most Indian OAs use MySQL. Logic is identical. Date and string function names differ, and every question with a difference has a "MySQL" note. There is also a comparison table on the Cheat sheet page.
- **Grading** compares the result set (column count, row count, values; row order only where the question says so). Column names don't matter. Numbers are matched to 2 decimals.
- **Cheating.** XP is computed in the browser, so a determined student could fake it, and reference solutions are only lightly obfuscated in the file. Treat the leaderboard as motivation, not assessment. Use the **Log** sheet to spot-check, and run graded OAs in a proctored lab.
- **Runaway queries** (e.g. an endless recursive CTE) are stopped after 8 seconds; the page doesn't freeze.

## Editing questions, experiences or data later

See [UPDATING.md](UPDATING.md). In short: edit the files in `data/`, run `tools/build.py`, run `tools/test_portal.py`, then push. GitHub Pages updates in about a minute.
