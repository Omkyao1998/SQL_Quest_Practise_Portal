# Updating SQL Quest

`index.html` is **generated**. Never edit it by hand. Edit the files below, rebuild, test, then push.

| What you want to change | File |
|---|---|
| Practice questions (SQL) | `data/questions.json` (use `tools/qtool.py`, because solutions are stored encoded) |
| MCQs (DBMS, Big Data, DE) | `data/mcq.json`: each has `id` (m1, m2…; never reuse), `bank` (dbms/bigdata/de), `topic`, `q`, `opts`[4], `ans` (0-3), `explain`. Faculty can also add MCQs from the dashboard (stored in the Google Sheet). |
| Scenario questions + rubrics | `data/subjective.json`: `id`, `area`, `title`, `diff`, `prompt`, `rubric` [{point, marks}] adding up to 10, `model` answer. The backend reads this file from the live site to mark answers, so push before students use a new question. |
| Big Data / DE lessons and interview Q&A | `data/learn.json` (`lessons`, `interview`) |
| Interview experiences | `data/experiences.json` |
| Practice tables and rows | `data/schema.sql` |
| Worlds, table descriptions, cheat-sheet tables | `data/meta.json` |
| Backend URL (Apps Script /exec) | `data/config.json` → `backend_url` |
| Backend logic (logins, marking, faculty APIs) | `backend/Code.gs`; after changing it, paste it into Apps Script and deploy a **new version** |
| Page behaviour and look | `src/app.js`, `src/template.html` |

## Routine

```bash
python3 tools/qtool.py add new_questions.json   # or: edit 12 patch.json / add-exp new_exp.json
python3 tools/qtool.py check                    # every reference solution must return rows
python3 tools/build.py                          # regenerates index.html
python3 tools/test_portal.py                    # browser test (local mode); must print ALL PASSED
node tools/test_backend.js                      # backend logic against a local Apps Script stand-in
python3 tools/test_portal_backend.py            # full browser test: logins, sync, marking, faculty pages
git add -A && git commit -m "..." && git push   # GitHub Pages republishes in about a minute
```

## Question format (plain SQL in "sol"; qtool encodes it)

```json
{
  "world": "Window Wizardry", "title": "Short title", "diff": "M",
  "tables": ["orders", "order_items"],
  "prompt": "What to return, exact column order, sorting and rounding rules. Use `code` and **bold**.",
  "hints": ["nudge", "structure", "near-skeleton"],
  "sol": "SELECT ...",
  "explain": "Why it works plus the common trap.",
  "mysql": "MySQL difference, if any (optional)",
  "checks": "What the interviewer is evaluating.",
  "jd": ["Tata CLiQ"], "roles": ["DA", "BA"], "ordered": true
}
```
Rules: `ordered: true` only when the prompt fixes the row order with tie-breaks; state rounding (2 decimals) for any ratio; the solution must return at least 1 row.

## Experience format

```json
{
  "company": "Swiggy", "category": "Product company", "role": "Business Analyst", "roleType": "BA",
  "level": "Fresher (campus)", "year": "2025", "location": "Bengaluru", "outcome": "Not stated", "difficulty": "",
  "source": {"name": "GeeksforGeeks", "url": "https://..."},
  "rounds": [{"name": "Online test", "detail": "..."}],
  "asked": ["..."], "tips": ["..."],
  "topics": ["sql", "case"], "practice": ["win", "biz"], "jdBank": true
}
```
- `roleType`: DA, BA, BI, DS or DE.
- `topics`: sql, python, excel, powerbi, stats, ml, case, guesstimate, puzzle, aptitude, dsa, hr, datamodel.
- `practice` uses world keys: basics, agg, joins, sub, win, clean, biz, ds.
- Summaries must be in your own words, with one card per source. Never copy text from Glassdoor, LinkedIn or blogs, and never invent details the source doesn't state.
