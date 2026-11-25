"""Helper for editing SQL Quest content without touching index.html directly.

Run from the repo root:
  python3 tools/qtool.py list [world-name]       list questions
  python3 tools/qtool.py show 12                 print a question with its decoded solution
  python3 tools/qtool.py add new.json            add question(s); "sol" in plain SQL, ids assigned automatically
  python3 tools/qtool.py edit 12 patch.json      replace fields of question 12 (plain "sol" allowed)
  python3 tools/qtool.py check                   run every reference solution against data/schema.sql
  python3 tools/qtool.py add-exp new.json        append interview experience(s)
Then: python3 tools/build.py && python3 tools/test_portal.py
"""
import base64, json, os, sqlite3, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QF = os.path.join(ROOT, "data", "questions.json")
EF = os.path.join(ROOT, "data", "experiences.json")
MF = os.path.join(ROOT, "data", "meta.json")
KEY = b"nst-sql"
REQUIRED = ["world", "title", "diff", "tables", "prompt", "hints", "sol", "explain", "checks", "jd", "roles"]

def enc(s):
    b = s.encode("utf-8"); return base64.b64encode(bytes(c ^ KEY[i % len(KEY)] for i, c in enumerate(b))).decode()
def dec(s):
    b = base64.b64decode(s); return bytes(c ^ KEY[i % len(KEY)] for i, c in enumerate(b)).decode("utf-8")
def load(p): return json.load(open(p, encoding="utf-8"))
def save(p, d): json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def db():
    c = sqlite3.connect(":memory:"); c.executescript(open(os.path.join(ROOT, "data", "schema.sql"), encoding="utf-8").read()); return c

def run(c, sql):
    cur = c.execute(sql); rows = cur.fetchall(); return [d[0] for d in cur.description], rows

def validate(q, c, worlds):
    miss = [k for k in REQUIRED if k not in q]
    if miss: raise SystemExit(f"missing fields: {miss}")
    if q["world"] not in worlds: raise SystemExit(f"unknown world '{q['world']}'. Use one of: {sorted(worlds)}")
    if q["diff"] not in ("E", "M", "H"): raise SystemExit("diff must be E, M or H")
    if len(q["hints"]) != 3: raise SystemExit("exactly 3 hints needed")
    cols, rows = run(c, q["sol"])
    if not rows: raise SystemExit(f"'{q['title']}': solution returns 0 rows; adjust the question or data")
    print(f"  ok: {q['title']} -> {len(rows)} rows, columns {cols}; first rows {rows[:3]}")

def main():
    a = sys.argv[1:]
    if not a: print(__doc__); return
    qs = load(QF); worlds = {w["name"] for w in load(MF)["worlds"]}
    if a[0] == "list":
        for q in qs:
            if len(a) < 2 or q["world"] == a[1]: print(f"Q{q['id']:>3} {q['diff']} {q['world']:<26} {q['title']}")
    elif a[0] == "show":
        q = next(x for x in qs if x["id"] == int(a[1])); q = dict(q, sol=dec(q["sol"])); print(json.dumps(q, ensure_ascii=False, indent=1))
    elif a[0] in ("add", "edit"):
        c = db()
        new = load(a[-1]); new = new if isinstance(new, list) else [new]
        if a[0] == "add":
            for q in new:
                q.setdefault("mysql", ""); q.setdefault("ordered", False)
                validate(q, c, worlds)
                q["id"] = len(qs) + 1; q["sol"] = enc(q["sol"]); qs.append(q)
                print(f"added Q{q['id']}")
        else:
            i = int(a[1]); q = next(x for x in qs if x["id"] == i)
            plain = dict(q, sol=dec(q["sol"])); plain.update(new[0]); plain["id"] = i
            validate(plain, c, worlds); plain["sol"] = enc(plain["sol"]); qs[i - 1] = plain
            print(f"updated Q{i}")
        save(QF, qs)
    elif a[0] == "check":
        c = db(); bad = 0
        for q in qs:
            try:
                cols, rows = run(c, dec(q["sol"]))
                if not rows: bad += 1; print(f"Q{q['id']}: 0 rows")
            except Exception as e:
                bad += 1; print(f"Q{q['id']}: ERROR {e}")
        print(f"{len(qs) - bad}/{len(qs)} solutions ok")
        sys.exit(1 if bad else 0)
    elif a[0] == "add-exp":
        ex = load(EF); new = load(a[1]); new = new if isinstance(new, list) else [new]
        for e in new:
            for k in ("company", "category", "role", "roleType", "level", "source", "rounds", "asked", "tips", "topics"):
                if k not in e: raise SystemExit(f"experience missing '{k}'")
            e.setdefault("practice", []); e.setdefault("jdBank", False); e.setdefault("difficulty", ""); e.setdefault("year", ""); e.setdefault("location", ""); e.setdefault("outcome", "Not stated")
            ex.append(e); e["id"] = len(ex); print(f"added experience {e['id']}: {e['company']} - {e['role']}")
        save(EF, ex)
    else:
        print(__doc__)

if __name__ == "__main__":
    main()
