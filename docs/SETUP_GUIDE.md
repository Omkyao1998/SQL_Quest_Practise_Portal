# SQL Quest: guide for mentors

SQL Quest is a static website on GitHub Pages. A real SQL engine (SQLite) runs inside the student's browser, so every query is executed and checked automatically. An optional Google Sheet + Apps Script backend adds logins, saved progress, dashboards and AI marking.

**What's in the box**

| File | What it is |
|---|---|
| `index.html` | The whole portal (generated, so don't edit it by hand) |
| `backend/Code.gs` | Backend for logins, progress sync, leaderboard, faculty dashboard and scenario marking |
| `docs/BACKEND_SETUP.md` | Step-by-step backend setup (one time, about 20 min) |
| `docs/UPDATING.md` | How to add or change questions, MCQs, lessons and experiences |
| `docs/question_index.csv` | All 100 SQL questions with world, difficulty, roles and JD tags |
| `data/`, `src/`, `tools/` | Content, page code, build and test scripts |

## What students get

| Section | What's in it |
|---|---|
| 🏠 My Dashboard | Level, XP, streak, progress per world, MCQ / scenario / lesson progress, rank and top-5 leaderboard |
| 🧩 SQL Practice | 100 auto-graded SQL questions in 8 worlds, 3 hints each, solutions and interviewer notes |
| 📘 MCQ Quiz | 160 MCQs: DBMS & SQL (100), Big Data (30), Data Engineering (30), plus any faculty add; topic filter |
| ✍️ Scenario Questions | 24 interview-style written answers (SQL scenarios, DBMS concepts, business case/RCA, Big Data/DE), marked out of 10 against a rubric by AI, with faculty review |
| 📚 Big Data & DE | 16 short concept lessons and 22 interview questions with model answers |
| ⏱ OA Simulator | 3 SQL + 10 MCQs in 30 minutes |
| 🗣 Interview Experiences | 39 summarised real interview processes for data roles |
| 🏆 Leaderboard, 🏅 Badges, 🧪 Playground, 📄 Cheat sheet | Motivation, free SQL practice, SQLite vs MySQL reference |

## Two ways to run it

1. **With the backend (recommended for a class).** Students log in with roll number + PIN; faculty log in with their own username/password. Progress is saved to your Google Sheet, so students can switch devices. Faculty get the dashboard, analytics, review queue, roster and MCQ manager. Setup: [BACKEND_SETUP.md](BACKEND_SETUP.md).
2. **Without the backend (local mode).** No login. Progress stays in each student's browser, scenario questions become self-check (model answer only), and there's no leaderboard or faculty view. This happens automatically when `data/config.json` has no `backend_url`.

## How the gamification works

| Rule | Value |
|---|---|
| SQL questions | Easy 10 · Medium 20 · Hard 30 XP; each hint costs 25%; +5 for a first-try solve with no hints; opening the solution gives 0 XP |
| MCQs | +5 XP for each first-time correct answer |
| Scenario answers | Best score × 2 XP (up to 20 per question); 3 attempts per question |
| Lessons / experiences | +3 per lesson read, +2 per interview experience read |
| Levels | Rookie → Query Cadet → Filter Fighter → Join Ninja → Aggregation Ace → Window Wizard → SQL Sensei → Placement Ready |
| Badges | 34: milestones, streaks, hint-free solves, worlds cleared, OA scores, MCQ banks, lessons, scenario scores, reading, and "JD-ready" for Tata CLiQ, Swiggy, Shadowfax, Upstox, Grab |

## How the SQL questions map to your JD bank

Weighted towards **DA / BA / BI**, with a **DS** track. Each question is tagged with the companies from your JD bank whose JD asks for that skill:
- **ZenStatement / Eternz** (SELECT, WHERE, GROUP BY, joins) → Worlds 1-3
- **Tata CLiQ / Upstox** (window functions, AOV, retention, CLV) → Worlds 4, 5, 7
- **Snabbit / Grab / ShareChat / Sarvam AI** (funnels, product metrics, anomaly detection) → Q56, Q85, Q86, Q90
- **Swiggy** (CTR, ROAS, A/B readouts) → Q29, Q88, Q89, Q99
- **Shadowfax** (cost per shipment vs zonal targets, RTO) → Q14, Q25, Q41, Q44, Q82
- **Grab DS / Carousell / Spinny / Temple** (statistics in SQL) → World 8

A tag means "this skill appears in that company's JD", not "this company asked this exact question". All datasets are fictional.

## Suggested 4-week plan

| Week | SQL | Theory | In class | Self-practice |
|---|---|---|---|---|
| 1 | Worlds 1-2 | DBMS MCQs: keys, normalization | Q11 (integer trap), Q20 (WHERE vs HAVING), Q23 (pivot) | 30 SQL Qs + 20 MCQs |
| 2 | Worlds 3-4 | DBMS MCQs + scenario: DBMS concepts | Q33/Q34 (anti-join), Q46-Q50 (Nth highest) | 25 SQL Qs + 3 scenario answers |
| 3 | Worlds 5-6 | Big Data lessons + MCQs | Q60 (top-N per group), Q62 (MoM), Q69 (gaps & islands) | 25 SQL Qs + OA attempt #1 |
| 4 | Worlds 7-8 | DE lessons + scenario: Business/RCA, Big Data/DE | Q85 funnel + scenario b1 as live "think aloud" rounds | Finish + weekly OA until ≥70% |

Use **📈 Question analytics** each week to pick the 3-4 questions the class is most stuck on and re-teach them.

## Things to know (limits)

- **SQLite vs MySQL.** The engine is SQLite; most Indian OAs use MySQL. Logic is identical, and function differences are noted on each question and in the Cheat sheet.
- **Grading** compares result sets (columns, rows, values; row order only where stated). Numbers match to 2 decimals.
- **AI marks are a guide.** They're consistent with the rubric but not perfect, so faculty can review and change any mark.
- **Cheating.** XP is computed in the browser, and solutions and model answers are only lightly hidden in the page. Treat marks and the leaderboard as practice signals; run formal assessments in a proctored lab.

## Editing content later

See [UPDATING.md](UPDATING.md): edit files in `data/`, run the build and tests, then push. GitHub Pages updates in about a minute. Faculty can also add MCQs directly from the dashboard without any code.
