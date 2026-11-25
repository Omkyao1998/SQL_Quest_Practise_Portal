"""Builds index.html from data/, src/ and vendor/.

Usage (from the repo root):
    python3 tools/build.py

The leaderboard URL is read from data/config.json ("leaderboard_url"), so it survives rebuilds.
"""
import base64, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

def load(name):
    with open(P("data", name), encoding="utf-8") as f:
        return json.load(f)

def main():
    meta = load("meta.json")
    questions = load("questions.json")
    mcq = load("mcq.json")
    exps = load("experiences.json")
    cfg = load("config.json") if os.path.exists(P("data", "config.json")) else {}
    with open(P("data", "schema.sql"), encoding="utf-8") as f:
        schema = f.read()

    ids = [q["id"] for q in questions]
    assert ids == list(range(1, len(ids) + 1)), "question ids must be 1..N with no gaps"
    worlds = {w["name"] for w in meta["worlds"]}
    for q in questions:
        assert q["world"] in worlds, f"Q{q['id']}: unknown world {q['world']}"
        assert q["diff"] in ("E", "M", "H") and len(q["hints"]) == 3, f"Q{q['id']}: needs diff E/M/H and 3 hints"
    for i, e in enumerate(exps, 1):
        e["id"] = i
        for k in ("company", "role", "source", "rounds", "asked", "topics"):
            assert e.get(k), f"experience {i}: missing {k}"

    data = dict(questions=questions, mcq=mcq, worlds=meta["worlds"], tableDocs=meta["tableDocs"],
                dialect=meta["dialect"], patterns=meta["patterns"], experiences=exps, schema=schema)
    djson = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    sqljs = open(P("vendor", "sql-wasm.js"), encoding="utf-8").read()
    wasm = base64.b64encode(open(P("vendor", "sql-wasm.wasm"), "rb").read()).decode()
    app = open(P("src", "app.js"), encoding="utf-8").read()
    assert "</script" not in sqljs.lower() and "</script" not in app.lower()
    html = open(P("src", "template.html"), encoding="utf-8").read()
    html = (html.replace("{{LEADERBOARD_URL}}", cfg.get("leaderboard_url", ""))
                .replace("{{SQLJS}}", sqljs).replace("{{WASM}}", wasm)
                .replace("{{DATA}}", djson).replace("{{APP}}", app))
    out = sys.argv[1] if len(sys.argv) > 1 else P("index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"built {os.path.relpath(out, ROOT)}: {len(questions)} questions, {len(mcq)} MCQs, {len(exps)} experiences, {round(len(html)/1024)} KB")

if __name__ == "__main__":
    main()
