/* SQL Quest: gamified SQL placement practice. Plain JS, no external dependencies. */
(function () {
"use strict";
const CFG = window.SQLQ_CONFIG || {};
const D = window.SQLQ_DATA;
const QS = D.questions, MCQS = D.mcq, WORLDS = D.worlds, TDOCS = D.tableDocs, EXPS = D.experiences || [];
const QBY = {}; QS.forEach(q => QBY[q.id] = q);
const BASE_XP = { E: 10, M: 20, H: 30 }, DIFF_NAME = { E: "Easy", M: "Medium", H: "Hard" };
const LEVELS = [[0, "Rookie"], [80, "Query Cadet"], [200, "Filter Fighter"], [400, "Join Ninja"], [700, "Aggregation Ace"],
  [1100, "Window Wizard"], [1600, "SQL Sensei"], [2100, "Placement Ready"]];
const STORE_KEY = "sqlquest_v1";
const $ = (s, el) => (el || document).querySelector(s);
const main = () => $("#main");

// ---------- helpers ----------
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function md(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); }
function decode(s) { const k = "nst-sql"; const b = atob(s); let o = ""; for (let i = 0; i < b.length; i++) o += String.fromCharCode(b.charCodeAt(i) ^ k.charCodeAt(i % k.length)); return decodeURIComponent(escape(o)); }
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayDiff(a, b) { return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000); }
function toast(msg, kind) { const t = document.createElement("div"); t.className = "toast " + (kind || ""); t.innerHTML = msg; $("#toasts").appendChild(t); setTimeout(() => t.classList.add("show"), 10); setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3200); }

// ---------- state ----------
function blank() { return { profile: null, solved: {}, attempts: {}, hints: {}, revealed: {}, drafts: {}, mcq: {}, mcqTried: {}, oa: [], days: [], badges: {}, expRead: {}, pendingSync: false }; }
let S = blank();
try { const raw = localStorage.getItem(STORE_KEY); if (raw) S = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* storage unavailable: progress lives in memory */ }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { } }
function markDay() { const t = today(); if (!S.days.includes(t)) { S.days.push(t); S.days.sort(); } }

// ---------- gamification ----------
function xpFor(q, hintsUsed, firstTry, revealed) {
  if (revealed) return 0;
  const base = BASE_XP[q.diff];
  return Math.round(base * Math.max(0.25, 1 - 0.25 * hintsUsed)) + (firstTry && hintsUsed === 0 ? 5 : 0);
}
function totalXP() { let x = 0; for (const k in S.solved) x += S.solved[k].xp; for (const k in S.mcq) if (S.mcq[k]) x += 5; x += 2 * Object.keys(S.expRead || {}).length; return x; }
function levelInfo(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const cur = LEVELS[i], nxt = LEVELS[i + 1];
  return { idx: i + 1, name: cur[1], floor: cur[0], next: nxt ? nxt[0] : null, nextName: nxt ? nxt[1] : null, pct: nxt ? Math.round(100 * (xp - cur[0]) / (nxt[0] - cur[0])) : 100 };
}
function streak() {
  if (!S.days.length) return 0;
  const days = S.days.slice().sort(); const last = days[days.length - 1];
  if (dayDiff(today(), last) > 1) return 0;
  let n = 1; for (let i = days.length - 1; i > 0; i--) { if (dayDiff(days[i], days[i - 1]) === 1) n++; else break; }
  return n;
}
function bestStreak() { const d = S.days.slice().sort(); let best = d.length ? 1 : 0, cur = 1; for (let i = 1; i < d.length; i++) { cur = dayDiff(d[i], d[i - 1]) === 1 ? cur + 1 : 1; best = Math.max(best, cur); } return best; }
function solvedCount(filter) { return QS.filter(q => S.solved[q.id] && (!filter || filter(q))).length; }
function noHintSolves() { return Object.values(S.solved).filter(s => s.hints === 0 && !s.revealed).length; }
function oaBest() { return S.oa.reduce((m, o) => Math.max(m, o.pct), 0); }
function mcqCorrect() { return Object.values(S.mcq).filter(Boolean).length; }
function jdQs(company) { return QS.filter(q => q.jd.includes(company)); }

const BADGES = [
  { id: "first", icon: "🎯", name: "First Query", desc: "Solve your first question", test: () => solvedCount() >= 1 },
  { id: "s10", icon: "🔥", name: "Warming Up", desc: "Solve 10 questions", test: () => solvedCount() >= 10 },
  { id: "s25", icon: "⚡", name: "Quarter Century", desc: "Solve 25 questions", test: () => solvedCount() >= 25 },
  { id: "s50", icon: "🚀", name: "Half Way There", desc: "Solve 50 questions", test: () => solvedCount() >= 50 },
  { id: "s100", icon: "🏆", name: "Centurion", desc: "Solve all 100 questions", test: () => solvedCount() >= 100 },
  { id: "nohint10", icon: "🧠", name: "Hint-Free Hero", desc: "Solve 10 questions without any hint", test: () => noHintSolves() >= 10 },
  { id: "hard5", icon: "💪", name: "Hard Hitter", desc: "Solve 5 Hard questions", test: () => solvedCount(q => q.diff === "H") >= 5 },
  { id: "streak3", icon: "📅", name: "3-Day Streak", desc: "Practise 3 days in a row", test: () => bestStreak() >= 3 },
  { id: "streak7", icon: "🗓️", name: "7-Day Streak", desc: "Practise 7 days in a row", test: () => bestStreak() >= 7 },
  { id: "mcq20", icon: "📘", name: "Theory Buff", desc: "Answer 20 DBMS MCQs correctly", test: () => mcqCorrect() >= 20 },
  { id: "mcqall", icon: "🎓", name: "DBMS Brain", desc: "Answer all 40 DBMS MCQs correctly", test: () => mcqCorrect() >= MCQS.length },
  { id: "oa70", icon: "✅", name: "OA Ready", desc: "Score 70%+ in the OA Simulator", test: () => oaBest() >= 70 },
  { id: "oa90", icon: "🌟", name: "OA Topper", desc: "Score 90%+ in the OA Simulator", test: () => oaBest() >= 90 },
  { id: "exp10", icon: "🗣️", name: "Interview Insider", desc: "Read 10 interview experiences", test: () => Object.keys(S.expRead || {}).length >= 10 },
  { id: "exp30", icon: "📡", name: "Recruiter Radar", desc: "Read 30 interview experiences", test: () => Object.keys(S.expRead || {}).length >= Math.min(30, EXPS.length) },
].concat(WORLDS.map(w => ({ id: "w_" + w.key, icon: w.icon, name: w.name + " Cleared", desc: "Solve every question in " + w.name, test: () => QS.filter(q => q.world === w.name).every(q => S.solved[q.id]) })))
 .concat(["Tata CLiQ", "Swiggy", "Shadowfax", "Upstox", "Grab"].map(c => ({ id: "jd_" + c, icon: "💼", name: c + " Ready", desc: "Solve every question whose skill appears in the " + c + " JD", test: () => jdQs(c).every(q => S.solved[q.id]) })));

function checkBadges() {
  const fresh = [];
  BADGES.forEach(b => { if (!S.badges[b.id] && b.test()) { S.badges[b.id] = today(); fresh.push(b); } });
  fresh.forEach((b, i) => setTimeout(() => toast(`<b>${b.icon} Badge unlocked:</b> ${esc(b.name)}`, "gold"), 400 + i * 700));
  return fresh.length;
}

// ---------- SQL engine (sql.js in a Web Worker so infinite loops can be stopped) ----------
const Engine = (() => {
  let worker = null, ready = null, seq = 0; const pending = {};
  const wasm = (() => { const b = atob(document.getElementById("wasm-b64").textContent.trim()); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; })();
  const handler = `
    let SQL = null, base = null;
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.type === "init") {
          SQL = await initSqlJs({ wasmBinary: m.wasm });
          const db = new SQL.Database(); db.exec(m.schema); base = db.export(); db.close();
          self.postMessage({ id: m.id, ok: true }); return;
        }
        if (m.type === "run") {
          const db = new SQL.Database(base);
          try {
            const res = db.exec(m.sql);
            const last = res.length ? res[res.length - 1] : { columns: [], values: [] };
            self.postMessage({ id: m.id, ok: true, cols: last.columns, rows: last.values, empty: !res.length });
          } finally { db.close(); }
        }
      } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
    };`;
  const sqljsSrc = document.getElementById("sqljs-src").textContent;
  let mode = "worker", SQLm = null, base = null;

  // Fallback: run sql.js on the page itself when the browser/sandbox blocks Web Workers
  // (e.g. sandboxed previews, some iframe embeds). No 8-second stop button in this mode.
  function startMain() {
    mode = "main";
    try { if (worker) worker.terminate(); } catch (e) { }
    try {
      if (!window.initSqlJs) { const s = document.createElement("script"); s.textContent = sqljsSrc; document.head.appendChild(s); }
      return window.initSqlJs({ wasmBinary: wasm }).then(SQL => {
        const db = new SQL.Database(); db.exec(D.schema); base = db.export(); db.close(); SQLm = SQL;
        return { ok: true, fallback: true };
      }).catch(err => ({ ok: false, error: String(err && err.message || err) }));
    } catch (err) { return Promise.resolve({ ok: false, error: String(err && err.message || err) }); }
  }
  function runMain(sql) {
    let db;
    try {
      db = new SQLm.Database(base);
      const res = db.exec(sql);
      const last = res.length ? res[res.length - 1] : { columns: [], values: [] };
      return { ok: true, cols: last.columns, rows: last.values, empty: !res.length };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
    finally { if (db) db.close(); }
  }
  let url = null;
  try { url = URL.createObjectURL(new Blob([sqljsSrc + "\n" + handler], { type: "text/javascript" })); } catch (e) { }

  function start() {
    ready = new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done) { done = true; resolve(r); } };
      try {
        if (!url || typeof Worker === "undefined") throw new Error("no worker");
        worker = new Worker(url);
      } catch (e) { startMain().then(finish); return; }
      worker.onmessage = e => { const p = pending[e.data.id]; if (p) { clearTimeout(p.t); delete pending[e.data.id]; p.res(e.data); } };
      worker.onerror = ev => { if (!done) { if (ev && ev.preventDefault) ev.preventDefault(); startMain().then(finish); } };
      call({ type: "init", wasm: wasm, schema: D.schema }, 30000, true).then(r => { if (r.ok) finish(r); else startMain().then(finish); });
    });
    return ready;
  }
  function call(msg, timeout, isInit) {
    return new Promise(res => {
      const id = ++seq; msg.id = id;
      const t = setTimeout(() => {
        delete pending[id];
        if (isInit) return res({ ok: false, error: "worker init timed out" });
        worker.terminate(); start();
        res({ ok: false, error: "Query took too long and was stopped (more than " + (timeout / 1000) + " s). Check for an endless recursive CTE or a huge CROSS JOIN.", timeout: true });
      }, timeout);
      pending[id] = { res, t };
      try { worker.postMessage(msg); } catch (err) { clearTimeout(t); delete pending[id]; res({ ok: false, error: String(err && err.message || err) }); }
    });
  }
  start();
  return {
    ready: () => ready,
    mode: () => mode,
    run: async (sql) => { await ready; return mode === "main" ? runMain(sql) : call({ type: "run", sql }, 8000); }
  };
})();

// ---------- grading ----------
const expectedCache = {};
async function expected(q) {
  if (!expectedCache[q.id]) expectedCache[q.id] = await Engine.run(decode(q.sol));
  return expectedCache[q.id];
}
function numLike(v) { return typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null); }
function same(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a == null) && (b == null);
  const x = numLike(a), y = numLike(b);
  if (x !== null && y !== null && (typeof a === "number" || typeof b === "number")) return Math.abs(x - y) <= 0.011 + 1e-9 * Math.max(Math.abs(x), Math.abs(y));
  return String(a) === String(b);
}
function rowKey(r) { return r.map(v => v == null ? "\u0000" : (typeof v === "number" ? v.toFixed(2) : String(v))).join("\u0001"); }
function compare(q, mine, exp) {
  if (!mine.ok) return { pass: false, msg: "SQL error: " + mine.error };
  const ec = exp.cols.length, mc = mine.cols.length;
  if (mine.empty) return { pass: false, msg: "Your statement didn't return a result set. Write a SELECT query." };
  if (mc !== ec) return { pass: false, msg: `Your query returns <b>${mc}</b> column(s); expected <b>${ec}</b>: <code>${esc(exp.cols.join(", "))}</code>.` };
  if (mine.rows.length !== exp.rows.length) return { pass: false, msg: `You returned <b>${mine.rows.length}</b> row(s); expected <b>${exp.rows.length}</b>. Check your filters, joins and GROUP BY.` };
  const rowsEq = (A, B) => { for (let i = 0; i < A.length; i++) for (let j = 0; j < ec; j++) if (!same(A[i][j], B[i][j])) return { i, j }; return null; };
  const sortRows = rs => rs.slice().sort((a, b) => rowKey(a) < rowKey(b) ? -1 : rowKey(a) > rowKey(b) ? 1 : 0);
  const unorderedDiff = rowsEq(sortRows(mine.rows), sortRows(exp.rows));
  if (q.ordered) {
    const d = rowsEq(mine.rows, exp.rows);
    if (!d) return { pass: true };
    if (!unorderedDiff) return { pass: false, msg: "Right rows, <b>wrong order</b>. This question grades row order, so re-read the sorting rule and tie-breaks." };
    return { pass: false, msg: `Values differ at row <b>${d.i + 1}</b>, column <b>${esc(exp.cols[d.j])}</b>: yours <code>${esc(fmt(mine.rows[d.i][d.j]))}</code>, expected <code>${esc(fmt(exp.rows[d.i][d.j]))}</code>.` };
  }
  if (!unorderedDiff) return { pass: true };
  return { pass: false, msg: "Same number of rows and columns, but some values don't match. Check calculations, rounding (2 decimals unless stated), NULL handling and column order." };
}
function fmt(v) { if (v === null || v === undefined) return "NULL"; if (typeof v === "number" && !Number.isInteger(v)) return String(Math.round(v * 10000) / 10000); return String(v); }
function tableHTML(cols, rows, max) {
  max = max || 200;
  if (!cols.length) return `<div class="muted">No rows returned.</div>`;
  const body = rows.slice(0, max).map(r => "<tr>" + r.map(v => `<td class="${v === null ? "null" : ""}">${esc(fmt(v))}</td>`).join("") + "</tr>").join("");
  return `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>` +
    `<div class="muted small">${rows.length} row(s)${rows.length > max ? `, showing first ${max}` : ""}</div>`;
}

// ---------- leaderboard sync ----------
const LB = {
  enabled: () => !!(CFG.LEADERBOARD_URL && CFG.LEADERBOARD_URL.startsWith("https://")),
  payload(event) {
    const p = S.profile || {}; const xp = totalXP(); const lv = levelInfo(xp);
    return { action: "progress", classCode: p.classCode || "", roll: p.roll, name: p.name, batch: p.batch, pin: p.pin,
      xp, level: lv.name, solved: solvedCount(), easy: solvedCount(q => q.diff === "E"), medium: solvedCount(q => q.diff === "M"), hard: solvedCount(q => q.diff === "H"),
      mcq: mcqCorrect(), streak: streak(), badges: Object.keys(S.badges).length, oaBest: oaBest(),
      hintsUsed: Object.values(S.hints).reduce((a, b) => a + b, 0), revealed: Object.keys(S.revealed).length, event: event || null };
  },
  async push(event) {
    if (!this.enabled() || !S.profile || !S.profile.roll) return;
    try {
      const r = await fetch(CFG.LEADERBOARD_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(this.payload(event)) });
      const j = await r.json();
      if (!j.ok) { toast("Leaderboard: " + esc(j.error || "not saved"), "bad"); S.pendingSync = true; } else S.pendingSync = false;
    } catch (e) { S.pendingSync = true; }
    save();
  },
  async board(batch) {
    const u = CFG.LEADERBOARD_URL + "?action=board&classCode=" + encodeURIComponent((S.profile && S.profile.classCode) || "") + (batch ? "&batch=" + encodeURIComponent(batch) : "");
    const r = await fetch(u); return r.json();
  }
};

// ---------- layout ----------
function renderHeader() {
  const xp = totalXP(), lv = levelInfo(xp), st = streak();
  $("#hdr-stats").innerHTML = `
    <div class="lvl" title="Level ${lv.idx}">Lv ${lv.idx} · ${esc(lv.name)}</div>
    <div class="xpbar" title="${lv.next ? (lv.next - xp) + " XP to " + lv.nextName : "Max level"}"><div style="width:${lv.pct}%"></div><span>${xp} XP</span></div>
    <div class="streak" title="Daily streak">🔥 ${st}</div>
    <button class="linkbtn" id="btn-profile">${esc((S.profile && S.profile.name) || "Set up profile")}</button>`;
  $("#btn-profile").onclick = profileModal;
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", location.hash.startsWith(a.getAttribute("href")) || (location.hash === "" && a.getAttribute("href") === "#/home")));
}

function profileModal(force) {
  const p = S.profile || {};
  const lb = LB.enabled();
  openModal(`<h2>${p.name ? "Your profile" : "Welcome to SQL Quest 👋"}</h2>
    <p class="muted">${lb ? "Your XP appears on the class leaderboard under this name." : "Progress is saved in this browser."}</p>
    <label>Full name<input id="pf-name" value="${esc(p.name || "")}" maxlength="40"></label>
    <label>Roll number<input id="pf-roll" value="${esc(p.roll || "")}" maxlength="20"></label>
    <label>Batch / Section<input id="pf-batch" value="${esc(p.batch || "")}" maxlength="20" placeholder="e.g. 2027-A"></label>
    ${lb ? `<label>4-digit PIN <span class="muted small">(protects your roll number on the leaderboard; remember it)</span><input id="pf-pin" value="${esc(p.pin || "")}" maxlength="4" inputmode="numeric"></label>
    <label>Class code <span class="muted small">(from your mentor)</span><input id="pf-code" value="${esc(p.classCode || "")}" maxlength="20"></label>` : ""}
    <div class="err" id="pf-err"></div>
    <div class="row gap"><button class="btn primary" id="pf-save">Save</button>${p.name && !force ? `<button class="btn" id="pf-cancel">Cancel</button>` : ""}</div>
    <hr><details><summary>Move progress to another device</summary>
      <p class="small muted">Copy this code on the old device, paste it on the new one.</p>
      <textarea id="pf-export" rows="3" readonly>${esc(btoa(unescape(encodeURIComponent(JSON.stringify(S)))))}</textarea>
      <textarea id="pf-import" rows="2" placeholder="Paste a progress code here"></textarea>
      <button class="btn small" id="pf-doimport">Import progress</button></details>`, !p.name || force);
  $("#pf-save").onclick = () => {
    const name = $("#pf-name").value.trim(), roll = $("#pf-roll").value.trim().toUpperCase(), batch = $("#pf-batch").value.trim();
    const pin = lb ? $("#pf-pin").value.trim() : "", code = lb ? $("#pf-code").value.trim() : "";
    if (name.length < 2) return $("#pf-err").textContent = "Please enter your name.";
    if (lb && !roll) return $("#pf-err").textContent = "Roll number is needed for the leaderboard.";
    if (lb && !/^\d{4}$/.test(pin)) return $("#pf-err").textContent = "PIN must be exactly 4 digits.";
    S.profile = { name, roll, batch, pin, classCode: code }; save(); closeModal(); renderHeader(); LB.push(); route();
  };
  if ($("#pf-cancel")) $("#pf-cancel").onclick = closeModal;
  $("#pf-doimport").onclick = () => {
    try { const obj = JSON.parse(decodeURIComponent(escape(atob($("#pf-import").value.trim())))); S = Object.assign(blank(), obj); save(); closeModal(); toast("Progress imported ✔", "good"); renderHeader(); route(); }
    catch (e) { $("#pf-err").textContent = "That code is not valid."; }
  };
}
function openModal(html, locked) { $("#modal-body").innerHTML = html; $("#modal").classList.add("open"); $("#modal").dataset.locked = locked ? "1" : ""; }
function closeModal() { $("#modal").classList.remove("open"); }

// ---------- views ----------
function viewHome() {
  const xp = totalXP(), lv = levelInfo(xp), n = solvedCount();
  const next = QS.find(q => !S.solved[q.id]);
  const companies = ["ZenStatement", "Tata CLiQ", "Upstox", "Swiggy", "Shadowfax", "Snabbit", "Grab", "Spinny"];
  main().innerHTML = `
  <section class="hero card">
    <div><h1>Hi ${esc((S.profile && S.profile.name || "there").split(" ")[0])} 👋</h1>
      <p>You are <b>Level ${lv.idx}: ${esc(lv.name)}</b>${lv.next ? `, <b>${lv.next - xp} XP</b> from <b>${esc(lv.nextName)}</b>` : ". Maximum level reached!"}</p>
      <div class="bigbar"><div style="width:${lv.pct}%"></div></div>
      <div class="row gap wrap mt">
        ${next ? `<a class="btn primary" href="#/q/${next.id}">▶ Continue: Q${next.id} ${esc(next.title)}</a>` : `<span class="pill good">All 100 solved 🏆</span>`}
        <a class="btn" href="#/oa">⏱ Take a mock OA</a><a class="btn" href="#/mcq">📘 DBMS quiz</a></div></div>
    <div class="stats">
      <div><b>${n}</b><span>/100 solved</span></div><div><b>${mcqCorrect()}</b><span>/${MCQS.length} MCQs</span></div>
      <div><b>🔥 ${streak()}</b><span>day streak</span></div><div><b>${Object.keys(S.badges).length}</b><span>badges</span></div></div>
  </section>
  <h2>Worlds <span class="muted small">Work top to bottom. Each world builds on the previous one.</span></h2>
  <div class="grid worlds">${WORLDS.map((w, i) => {
    const qs = QS.filter(q => q.world === w.name), d = qs.filter(q => S.solved[q.id]).length;
    return `<a class="card world" href="#/list?world=${encodeURIComponent(w.name)}"><div class="wicon">${w.icon}</div>
      <div class="wname">${i + 1}. ${esc(w.name)}</div><div class="muted small">${esc(w.desc)}</div>
      <div class="minibar"><div style="width:${Math.round(100 * d / qs.length)}%"></div></div><div class="small">${d}/${qs.length} solved</div></a>`;
  }).join("")}</div>
  <h2>JD readiness <span class="muted small">Share of practice questions solved whose skill appears in that company's JD (from your placement cell's JD bank)</span></h2>
  <div class="grid jd">${companies.map(c => {
    const qs = jdQs(c), d = qs.filter(q => S.solved[q.id]).length, pct = Math.round(100 * d / qs.length);
    return `<a class="card jdc" href="#/list?jd=${encodeURIComponent(c)}"><div class="row between"><b>${esc(c)}</b><span>${pct}%</span></div>
      <div class="minibar ${pct >= 80 ? "good" : ""}"><div style="width:${pct}%"></div></div><div class="small muted">${d}/${qs.length} questions</div></a>`;
  }).join("")}</div>`;
}

function viewList(params) {
  const f = { world: params.get("world") || "", diff: params.get("diff") || "", jd: params.get("jd") || "", role: params.get("role") || "", status: params.get("status") || "", s: params.get("s") || "" };
  const jds = Array.from(new Set(QS.flatMap(q => q.jd))).sort();
  const opt = (name, vals, labels) => `<select data-f="${name}"><option value="">${labels[0]}</option>${vals.map((v, i) => `<option value="${esc(v)}" ${f[name] === v ? "selected" : ""}>${esc(labels[i + 1] || v)}</option>`).join("")}</select>`;
  const list = QS.filter(q => (!f.world || q.world === f.world) && (!f.diff || q.diff === f.diff) && (!f.jd || q.jd.includes(f.jd)) && (!f.role || q.roles.includes(f.role)) &&
    (!f.status || (f.status === "solved" ? S.solved[q.id] : f.status === "todo" ? !S.solved[q.id] : (S.attempts[q.id] && !S.solved[q.id]))) &&
    (!f.s || (q.title + " " + q.prompt + " " + q.tables.join(" ")).toLowerCase().includes(f.s.toLowerCase())));
  main().innerHTML = `<h1>Practice questions</h1>
    <div class="filters">${opt("world", WORLDS.map(w => w.name), ["All worlds"])}${opt("diff", ["E", "M", "H"], ["All levels", "Easy", "Medium", "Hard"])}
    ${opt("jd", jds, ["Any company JD"])}${opt("role", ["DA", "BA", "BI", "DS", "DE"], ["Any role", "Data Analyst", "Business Analyst", "BI Analyst", "Data Scientist", "Data Engineer"])}
    ${opt("status", ["todo", "tried", "solved"], ["Any status", "Not solved", "Tried, not solved", "Solved"])}
    <input type="search" data-f="s" placeholder="Search…" value="${esc(f.s)}"></div>
    <div class="muted small">${list.length} question(s)</div>
    <div class="qlist">${list.map(q => {
      const s = S.solved[q.id], tried = S.attempts[q.id] && !s;
      return `<a class="qrow" href="#/q/${q.id}"><span class="status ${s ? (s.revealed ? "rev" : "ok") : tried ? "tried" : ""}">${s ? (s.revealed ? "👁" : "✔") : tried ? "…" : ""}</span>
      <span class="qid">Q${q.id}</span><span class="qt">${esc(q.title)}</span><span class="chip d${q.diff}">${DIFF_NAME[q.diff]}</span>
      <span class="qworld small muted">${esc(q.world)}</span><span class="qjd small">${q.jd.slice(0, 3).map(esc).join(" · ")}</span>
      <span class="qxp small">${s ? "+" + s.xp + " XP" : BASE_XP[q.diff] + " XP"}</span></a>`;
    }).join("")}</div>`;
  main().querySelectorAll("[data-f]").forEach(el => {
    const ev = el.tagName === "INPUT" ? "change" : "change";
    el.addEventListener(ev, () => { const p = new URLSearchParams(); main().querySelectorAll("[data-f]").forEach(x => { if (x.value) p.set(x.dataset.f, x.value); }); location.hash = "#/list?" + p.toString(); });
  });
}

function tablesPanel(tables) {
  return tables.map(t => `<button class="tbtn" data-table="${esc(t)}">🗂 ${esc(t)}</button>`).join("");
}
async function showTable(t) {
  const doc = TDOCS[t] || {};
  openModal(`<h2>🗂 ${esc(t)}</h2><p class="muted">${esc(doc.domain || "")}: ${md(doc.desc || "")}</p><div id="tbl-cols">Loading…</div><h3>Sample rows</h3><div id="tbl-rows"></div>`);
  const cols = await Engine.run(`SELECT name, type, pk FROM pragma_table_info('${t}')`);
  const cnt = await Engine.run(`SELECT COUNT(*) FROM ${t}`);
  const rows = await Engine.run(`SELECT * FROM ${t} LIMIT 8`);
  $("#tbl-cols").innerHTML = `<div class="small muted">${cnt.ok ? cnt.rows[0][0] : "?"} rows in total</div>` + (cols.ok ? tableHTML(["column", "type", "primary key"], cols.rows.map(r => [r[0], r[1], r[2] ? "yes" : ""]), 50) : "");
  $("#tbl-rows").innerHTML = rows.ok ? tableHTML(rows.cols, rows.rows, 8) : "";
}

function editorHTML(id, value) {
  return `<div class="editor"><textarea id="${id}" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(value || "")}</textarea></div>`;
}
function wireEditor(el, onRun, onSubmit) {
  el.addEventListener("keydown", e => {
    if (e.key === "Tab") { e.preventDefault(); const s = el.selectionStart; el.value = el.value.slice(0, s) + "  " + el.value.slice(el.selectionEnd); el.selectionStart = el.selectionEnd = s + 2; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.shiftKey && onSubmit ? onSubmit : onRun)(); }
  });
}

// Shared question workspace. mode: "practice" | "oa"
function questionWorkspace(q, mode, host, opts) {
  opts = opts || {};
  const practice = mode === "practice";
  const solvedRec = S.solved[q.id];
  const draftKey = (practice ? "" : "oa_") + q.id;
  const startVal = (practice ? S.drafts[draftKey] : (opts.oaState.drafts[q.id])) || (solvedRec && practice ? solvedRec.query : "") || "-- Write your SQL here. Ctrl+Enter = Run, Ctrl+Shift+Enter = Submit\nSELECT ";
  host.innerHTML = `
  <div class="qgrid">
    <div class="qleft card">
      <div class="row between wrap"><div class="muted small">${esc(q.world)} · Q${q.id}</div>
        <div><span class="chip d${q.diff}">${DIFF_NAME[q.diff]}</span> ${q.roles.map(r => `<span class="chip">${r}</span>`).join(" ")}</div></div>
      <h1 class="qtitle">${esc(q.title)}</h1>
      <div class="prompt">${md(q.prompt)}</div>
      <div class="meta"><div><b>Expected columns:</b> <span id="exp-cols" class="mono small">…</span></div>
        <div><b>Row order:</b> ${q.ordered ? "graded. Follow the sort rule exactly." : "not graded"}</div>
        ${practice ? `<div><b>Skill appears in JDs of:</b> ${q.jd.map(j => `<span class="chip jdchip">${esc(j)}</span>`).join(" ")}</div>` : ""}</div>
      <div class="tables"><b>Tables:</b> ${tablesPanel(q.tables)}</div>
      ${practice ? `<div class="hints" id="hints"></div><div id="solbox"></div>` : `<div class="muted small mt">OA mode: no hints, no solutions. Submit as many times as you like before time runs out.</div>`}
    </div>
    <div class="qright">
      ${editorHTML("sql", startVal)}
      <div class="row gap wrap mt"><button class="btn" id="run">▶ Run</button><button class="btn primary" id="submit">✔ Submit</button>
        <button class="btn ghost" id="reset">Reset</button><span class="muted small" id="attempt-info"></span></div>
      <div id="feedback"></div><div id="output" class="card output"><div class="muted small">Run your query to see the output here.</div></div>
      ${practice ? `<div id="after"></div>` : ""}
    </div></div>`;
  const ta = $("#sql", host);
  ta.addEventListener("input", () => { if (practice) { S.drafts[draftKey] = ta.value; save(); } else opts.oaState.drafts[q.id] = ta.value; });
  host.querySelectorAll(".tbtn").forEach(b => b.onclick = () => showTable(b.dataset.table));
  expected(q).then(e => { $("#exp-cols", host).textContent = e.ok ? e.cols.join(", ") : "(error)"; });

  const attemptsInfo = () => { if (practice) $("#attempt-info", host).textContent = S.solved[q.id] ? "Solved ✔ (practice again any time)" : (S.attempts[q.id] ? `${S.attempts[q.id]} wrong attempt(s)` : ""); };
  attemptsInfo();

  function renderHints() {
    if (!practice) return;
    const used = S.hints[q.id] || 0;
    let h = `<h3>Hints <span class="muted small">(each hint −25% of this question's XP)</span></h3>`;
    for (let i = 0; i < 3; i++) {
      if (i < used) h += `<div class="hint open"><b>Hint ${i + 1}.</b> ${md(q.hints[i])}</div>`;
      else if (i === used) h += `<button class="btn small" id="hint-btn">💡 Show hint ${i + 1}</button>`;
    }
    $("#hints", host).innerHTML = h;
    const hb = $("#hint-btn", host);
    if (hb) hb.onclick = () => { if (!S.solved[q.id]) S.hints[q.id] = used + 1; else S.hints[q.id] = used + 1; save(); renderHints(); };
    renderSolution();
  }
  function renderSolution() {
    if (!practice) return;
    const box = $("#solbox", host), s = S.solved[q.id], rev = S.revealed[q.id], tries = S.attempts[q.id] || 0;
    if (s || rev) { box.innerHTML = learnBlock(q); return; }
    if (tries >= 3) {
      box.innerHTML = `<button class="btn small warn" id="rev">👁 Show solution (you will earn 0 XP for this question)</button>`;
      $("#rev", host).onclick = function () {
        if (this.dataset.c !== "1") { this.dataset.c = "1"; this.textContent = "Click again to confirm: 0 XP for this question"; return; }
        S.revealed[q.id] = true; save(); renderSolution(); LB.push({ type: "reveal", qid: q.id });
      };
    } else box.innerHTML = `<div class="muted small mt">🔒 Solution unlocks after 3 wrong submissions (${tries}/3).</div>`;
  }
  renderHints();

  async function run(isSubmit) {
    const sql = ta.value.trim();
    if (!sql || /^(--[^\n]*\n?)*\s*SELECT\s*$/i.test(sql)) { $("#feedback", host).innerHTML = `<div class="fb bad">Write a query first.</div>`; return; }
    $("#output", host).innerHTML = `<div class="muted small">Running…</div>`;
    const mine = await Engine.run(sql);
    $("#output", host).innerHTML = mine.ok ? (mine.empty ? `<div class="muted">Statement ran but returned no result set.</div>` : tableHTML(mine.cols, mine.rows)) : `<div class="fb bad mono">${esc(mine.error)}</div>`;
    if (!isSubmit) { $("#feedback", host).innerHTML = ""; return; }
    const exp = await expected(q);
    const r = compare(q, mine, exp);
    if (!practice) { opts.onOAResult(q, r.pass, sql); $("#feedback", host).innerHTML = r.pass ? `<div class="fb good">✔ Correct! Saved for this OA.</div>` : `<div class="fb bad">✘ Not yet. ${r.msg}</div>`; return; }
    markDay();
    if (r.pass) {
      const already = S.solved[q.id];
      if (!already) {
        const hints = S.hints[q.id] || 0, firstTry = !(S.attempts[q.id] > 0);
        const xp = xpFor(q, hints, firstTry, !!S.revealed[q.id]);
        S.solved[q.id] = { xp, hints, firstTry, revealed: !!S.revealed[q.id], ts: Date.now(), query: sql };
        save(); celebrate(xp, firstTry && hints === 0);
        checkBadges(); save(); renderHeader();
        LB.push({ type: "solve", qid: q.id, xp, query: sql.slice(0, 1500) });
      } else { S.solved[q.id].query = sql; save(); }
      $("#feedback", host).innerHTML = `<div class="fb good">✔ Correct! ${already ? "(already solved earlier)" : ""}</div>`;
      renderSolution(); attemptsInfo(); renderNextBtn();
    } else {
      if (!S.solved[q.id]) S.attempts[q.id] = (S.attempts[q.id] || 0) + 1;
      save();
      $("#feedback", host).innerHTML = `<div class="fb bad">✘ Not yet. ${r.msg}</div>`;
      renderSolution(); attemptsInfo();
      if (S.attempts[q.id] === 3 && !S.solved[q.id]) toast("Stuck? The solution is now unlocked (0 XP if you open it). Try the hints first!", "");
    }
  }
  function renderNextBtn() {
    const nx = QS.find(x => x.id > q.id && !S.solved[x.id]) || QS.find(x => !S.solved[x.id]);
    $("#after", host).innerHTML = nx ? `<a class="btn primary mt" href="#/q/${nx.id}">Next: Q${nx.id} ${esc(nx.title)} →</a>` : "";
  }
  if (practice && S.solved[q.id]) renderNextBtn();
  $("#run", host).onclick = () => run(false);
  $("#submit", host).onclick = () => run(true);
  $("#reset", host).onclick = () => { ta.value = "SELECT "; ta.dispatchEvent(new Event("input")); ta.focus(); };
  wireEditor(ta, () => run(false), () => run(true));
}
function learnBlock(q) {
  return `<div class="learn"><h3>✅ Solution</h3><pre class="mono">${esc(decode(q.sol))}</pre>
    <h3>Why it works</h3><p>${md(q.explain)}</p>
    ${q.mysql ? `<h3>MySQL / other databases</h3><p>${md(q.mysql)}</p>` : ""}
    <h3>What the interviewer is checking</h3><p>${md(q.checks)}</p></div>`;
}
function celebrate(xp, perfect) {
  const c = document.createElement("div"); c.className = "celebrate";
  c.innerHTML = `<div>${perfect ? "🎯 Perfect solve!" : "🎉 Solved!"}<b>+${xp} XP</b></div>`;
  document.body.appendChild(c);
  for (let i = 0; i < 24; i++) { const s = document.createElement("i"); s.style.left = (Math.random() * 100) + "%"; s.style.animationDelay = (Math.random() * 0.4) + "s"; s.style.background = ["#6c5ce7", "#00b894", "#fdcb6e", "#e17055", "#0984e3"][i % 5]; c.appendChild(s); }
  setTimeout(() => c.remove(), 1800);
}

function viewQuestion(id) {
  const q = QBY[id]; if (!q) return viewList(new URLSearchParams());
  main().innerHTML = `<div class="row between mb"><a href="#/list" class="linkbtn">← All questions</a>
    <div class="row gap">${id > 1 ? `<a class="btn small" href="#/q/${id - 1}">← Prev</a>` : ""}${id < 100 ? `<a class="btn small" href="#/q/${id + 1}">Next →</a>` : ""}</div></div><div id="ws"></div>`;
  questionWorkspace(q, "practice", $("#ws"));
}

// ---------- MCQ quiz ----------
function viewMCQ(params) {
  const i = Math.max(0, Math.min(MCQS.length - 1, parseInt(params.get("i") || "0", 10) || 0));
  const m = MCQS[i], answered = S.mcqTried[i];
  main().innerHTML = `<h1>📘 DBMS & SQL theory <span class="muted small">${mcqCorrect()}/${MCQS.length} correct · +5 XP for each first correct answer</span></h1>
  <div class="mcqnav">${MCQS.map((x, k) => `<a href="#/mcq?i=${k}" class="dot ${S.mcq[k] ? "ok" : S.mcqTried[k] ? "bad" : ""} ${k === i ? "cur" : ""}">${k + 1}</a>`).join("")}</div>
  <div class="card mcq"><div class="muted small">${esc(m.topic)} · Question ${i + 1} of ${MCQS.length}</div><h2>${md(m.q)}</h2>
    <div class="opts">${m.opts.map((o, k) => `<button class="opt" data-k="${k}">${String.fromCharCode(65 + k)}. ${md(o)}</button>`).join("")}</div>
    <div id="mcq-fb"></div>
    <div class="row gap mt">${i > 0 ? `<a class="btn" href="#/mcq?i=${i - 1}">← Prev</a>` : ""}${i < MCQS.length - 1 ? `<a class="btn primary" href="#/mcq?i=${i + 1}">Next →</a>` : ""}</div></div>`;
  const reveal = (pick) => {
    main().querySelectorAll(".opt").forEach(b => { const k = +b.dataset.k; b.disabled = true; if (k === m.ans) b.classList.add("right"); else if (k === pick) b.classList.add("wrong"); });
    $("#mcq-fb").innerHTML = `<div class="fb ${pick === m.ans ? "good" : "bad"}">${pick === m.ans ? "✔ Correct." : "✘ Not quite."} ${md(m.explain)}</div>`;
  };
  if (answered !== undefined) reveal(answered);
  main().querySelectorAll(".opt").forEach(b => b.onclick = () => {
    const k = +b.dataset.k;
    if (S.mcqTried[i] === undefined) { S.mcqTried[i] = k; if (k === m.ans) { S.mcq[i] = true; markDay(); toast("+5 XP", "good"); } else S.mcq[i] = false; checkBadges(); save(); renderHeader(); LB.push(); }
    reveal(k);
  });
}

// ---------- OA simulator ----------
let OA = null;
function pick(arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
function viewOA() {
  if (!OA) {
    const hist = S.oa.slice(-5).reverse();
    main().innerHTML = `<h1>⏱ OA Simulator</h1>
    <div class="card"><p>Simulates the SQL section of a typical Indian online assessment (HackerRank / Mettl style).</p>
    <ul><li><b>3 SQL questions</b> (1 Easy, 1 Medium, 1 Hard), 20 marks each, picked at random</li><li><b>10 DBMS MCQs</b>, 4 marks each</li><li><b>30 minutes</b>. No hints, no solutions until you finish</li><li>Score 70%+ for the <b>OA Ready</b> badge. Your best score goes to the leaderboard</li></ul>
    <button class="btn primary" id="oa-start">Start OA</button></div>
    ${hist.length ? `<h2>Recent attempts</h2><div class="card">${hist.map(o => `<div class="row between"><span>${esc(o.date)}</span><span>${o.score}/100 · ${o.mins} min</span></div>`).join("")}</div>` : ""}`;
    $("#oa-start").onclick = () => {
      const pickD = d => pick(QS.filter(q => q.diff === d), 1)[0].id;
      OA = { sql: [pickD("E"), pickD("M"), pickD("H")], mcq: pick(MCQS.map((_, k) => k), 10), solved: {}, mcqAns: {}, drafts: {}, start: Date.now(), dur: 30 * 60000, tab: "s0" };
      OA.timer = setInterval(() => { const el = $("#oa-time"); if (!OA) return; const left = OA.dur - (Date.now() - OA.start); if (left <= 0) finishOA(); else if (el) el.textContent = mmss(left); }, 500);
      viewOA();
    };
    return;
  }
  if (OA.done) return renderOAResult();
  const tabs = OA.sql.map((id, k) => `<button class="tab ${OA.tab === "s" + k ? "on" : ""}" data-t="s${k}">SQL ${k + 1} ${OA.solved[id] ? "✔" : ""}</button>`).join("") + `<button class="tab ${OA.tab === "m" ? "on" : ""}" data-t="m">MCQs (${Object.keys(OA.mcqAns).length}/10)</button>`;
  main().innerHTML = `<div class="oabar card row between wrap"><div class="row gap wrap">${tabs}</div><div class="row gap"><span class="timer">⏱ <span id="oa-time">${mmss(OA.dur - (Date.now() - OA.start))}</span></span><button class="btn warn" id="oa-finish">Finish & score</button></div></div><div id="oa-body"></div>`;
  main().querySelectorAll(".tab").forEach(b => b.onclick = () => { OA.tab = b.dataset.t; viewOA(); });
  $("#oa-finish").onclick = function () { if (this.dataset.c !== "1") { this.dataset.c = "1"; this.textContent = "Click again to finish"; return; } finishOA(); };
  if (OA.tab === "m") {
    $("#oa-body").innerHTML = OA.mcq.map((k, n) => { const m = MCQS[k]; return `<div class="card mcq"><div class="muted small">Q${n + 1}</div><h3>${md(m.q)}</h3><div class="opts">${m.opts.map((o, j) => `<button class="opt ${OA.mcqAns[k] === j ? "picked" : ""}" data-k="${k}" data-j="${j}">${String.fromCharCode(65 + j)}. ${md(o)}</button>`).join("")}</div></div>`; }).join("");
    $("#oa-body").querySelectorAll(".opt").forEach(b => b.onclick = () => { OA.mcqAns[+b.dataset.k] = +b.dataset.j; viewOA(); });
  } else {
    const q = QBY[OA.sql[+OA.tab.slice(1)]];
    questionWorkspace(q, "oa", $("#oa-body"), { oaState: OA, onOAResult: (qq, pass) => { if (pass) { OA.solved[qq.id] = true; main().querySelectorAll(".tab")[OA.sql.indexOf(qq.id)].textContent = "SQL " + (OA.sql.indexOf(qq.id) + 1) + " ✔"; } } });
  }
}
function mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function finishOA() {
  if (!OA || OA.done) return;
  clearInterval(OA.timer);
  const sqlScore = OA.sql.filter(id => OA.solved[id]).length * 20;
  const mcqScore = OA.mcq.filter(k => OA.mcqAns[k] === MCQS[k].ans).length * 4;
  OA.done = true; OA.score = sqlScore + mcqScore; OA.mins = Math.min(30, Math.round((Date.now() - OA.start) / 60000));
  S.oa.push({ date: today(), score: OA.score, pct: OA.score, mins: OA.mins }); markDay(); checkBadges(); save(); renderHeader();
  LB.push({ type: "oa", qid: "", xp: 0, query: "OA score " + OA.score });
  if (location.hash.startsWith("#/oa")) viewOA(); else toast("Time's up! Your OA was scored: " + OA.score + "/100");
}
function renderOAResult() {
  main().innerHTML = `<h1>OA result: ${OA.score}/100 ${OA.score >= 70 ? "✅" : ""}</h1>
  <div class="card"><p>SQL: ${OA.sql.filter(id => OA.solved[id]).length}/3 correct · MCQ: ${OA.mcq.filter(k => OA.mcqAns[k] === MCQS[k].ans).length}/10 correct · Time used: ${OA.mins} min</p>
  <p class="muted">${OA.score >= 70 ? "Good. Real OAs often have a 60-70% cut-off. Try another set to confirm it wasn't luck." : "Review below, then practise the weak worlds and retake the OA."}</p>
  <div class="row gap"><button class="btn primary" id="oa-again">New OA</button><a class="btn" href="#/home">Home</a></div></div>
  <h2>Review</h2>${OA.sql.map(id => { const q = QBY[id]; return `<div class="card"><b>${OA.solved[id] ? "✔" : "✘"} Q${q.id} ${esc(q.title)}</b> <span class="chip d${q.diff}">${DIFF_NAME[q.diff]}</span> <a class="small" href="#/q/${q.id}">practise it</a>${learnBlock(q)}</div>`; }).join("")}
  <div class="card">${OA.mcq.map(k => { const m = MCQS[k], ok = OA.mcqAns[k] === m.ans; return `<p>${ok ? "✔" : "✘"} ${md(m.q)}<br><span class="small">Answer: <b>${md(m.opts[m.ans])}</b>. ${md(m.explain)}</span></p>`; }).join("")}</div>`;
  $("#oa-again").onclick = () => { OA = null; viewOA(); };
}

// ---------- sandbox ----------
function viewSandbox() {
  const groups = {}; Object.keys(TDOCS).forEach(t => { (groups[TDOCS[t].domain] = groups[TDOCS[t].domain] || []).push(t); });
  main().innerHTML = `<h1>🧪 Playground</h1><p class="muted">Free practice on all tables. Nothing here affects XP. Every run starts from a fresh copy of the data, so even DROP TABLE is safe.</p>
  <div class="card">${Object.keys(groups).map(g => `<div class="tgroup"><b>${esc(g)}</b> ${tablesPanel(groups[g])}</div>`).join("")}</div>
  ${editorHTML("sbx", S.drafts.sandbox || "SELECT * FROM employees LIMIT 10;")}
  <div class="row gap mt"><button class="btn primary" id="sbx-run">▶ Run (Ctrl+Enter)</button></div><div id="sbx-out" class="card output"></div>`;
  main().querySelectorAll(".tbtn").forEach(b => b.onclick = () => showTable(b.dataset.table));
  const ta = $("#sbx"); ta.oninput = () => { S.drafts.sandbox = ta.value; save(); };
  const go = async () => { $("#sbx-out").innerHTML = "Running…"; const r = await Engine.run(ta.value); $("#sbx-out").innerHTML = r.ok ? (r.empty ? "Statement ran; no result set." : tableHTML(r.cols, r.rows, 500)) : `<div class="fb bad mono">${esc(r.error)}</div>`; };
  $("#sbx-run").onclick = go; wireEditor(ta, go);
}

// ---------- badges ----------
function viewBadges() {
  main().innerHTML = `<h1>🏅 Badges <span class="muted small">${Object.keys(S.badges).length}/${BADGES.length} unlocked</span></h1>
  <div class="grid badges">${BADGES.map(b => `<div class="card badge ${S.badges[b.id] ? "got" : ""}"><div class="bicon">${b.icon}</div><b>${esc(b.name)}</b><div class="small muted">${esc(b.desc)}</div>${S.badges[b.id] ? `<div class="small good">Unlocked ${esc(S.badges[b.id])}</div>` : ""}</div>`).join("")}</div>
  <h2>Levels</h2><div class="card">${LEVELS.map((l, i) => `<div class="row between ${totalXP() >= l[0] ? "" : "muted"}"><span>Lv ${i + 1} · ${esc(l[1])}</span><span>${l[0]} XP</span></div>`).join("")}
  <p class="small muted">XP rules: Easy 10, Medium 20, Hard 30. Each hint costs 25% of a question's XP. Solving first try with no hints gives +5 bonus. Opening the solution gives 0 XP for that question. Each first-time correct MCQ gives +5. Each interview experience you mark as read gives +2.</p></div>`;
}

// ---------- leaderboard ----------
async function viewBoard(params) {
  if (!LB.enabled()) {
    main().innerHTML = `<h1>🏆 Leaderboard</h1><div class="card"><p>The class leaderboard isn't switched on for this copy of the portal.</p><p class="muted small">Mentor: follow the setup guide (Google Sheet + Apps Script) and paste the web-app URL into <code>LEADERBOARD_URL</code> at the top of this file.</p>
    <h3>Your stats</h3><p>${totalXP()} XP · ${solvedCount()} solved · best OA ${oaBest()}%</p></div>`; return;
  }
  const batch = params.get("batch") || "";
  main().innerHTML = `<h1>🏆 Leaderboard</h1><div class="row gap mb"><input id="lb-batch" placeholder="Filter by batch" value="${esc(batch)}"><button class="btn" id="lb-go">Apply</button>${S.pendingSync ? `<button class="btn warn" id="lb-sync">Sync my progress</button>` : ""}</div><div id="lb-out" class="card">Loading…</div>`;
  $("#lb-go").onclick = () => location.hash = "#/board?batch=" + encodeURIComponent($("#lb-batch").value.trim());
  if ($("#lb-sync")) $("#lb-sync").onclick = () => LB.push().then(() => viewBoard(params));
  try {
    const j = await LB.board(batch);
    if (!j.ok) throw new Error(j.error || "error");
    const me = S.profile && S.profile.roll;
    $("#lb-out").innerHTML = `<div class="tablewrap"><table class="lb"><thead><tr><th>#</th><th>Name</th><th>Batch</th><th>XP</th><th>Level</th><th>Solved</th><th>Hard</th><th>MCQ</th><th>🔥</th><th>Best OA</th></tr></thead><tbody>
      ${j.rows.map((r, k) => `<tr class="${r.rollTail && me && me.endsWith(r.rollTail) && r.name === S.profile.name ? "me" : ""}"><td>${k < 3 ? ["🥇", "🥈", "🥉"][k] : k + 1}</td><td>${esc(r.name)}</td><td>${esc(r.batch)}</td><td><b>${r.xp}</b></td><td>${esc(r.level)}</td><td>${r.solved}</td><td>${r.hard}</td><td>${r.mcq}</td><td>${r.streak}</td><td>${r.oaBest}%</td></tr>`).join("")}</tbody></table></div>
      <div class="small muted">Updated ${new Date().toLocaleTimeString()} · ${j.rows.length} students</div>`;
  } catch (e) { $("#lb-out").innerHTML = `<p>Couldn't load the leaderboard right now. Check your internet connection. Your progress is saved on this device and will sync later.</p>`; }
}

// ---------- guide ----------
function viewGuide() {
  main().innerHTML = `<h1>📄 Cheat sheet</h1>
  <div class="card"><h2>How to use this portal</h2><ol><li>Go world by world. Aim for 3-5 questions a day (streaks give badges).</li><li>Try first without hints. If stuck for 10+ minutes, take Hint 1, then Hint 2.</li><li>Read the explanation and "what the interviewer checks" even after you solve. That is the interview answer.</li><li>Once 60+ questions are done, take the OA Simulator weekly.</li></ol>
  <p class="small muted">This portal runs <b>SQLite</b> in your browser. Most Indian OAs use <b>MySQL</b>. The query logic is the same; only some function names differ (table below). JD tags show where a skill appears in a company's JD from your placement cell's JD bank. They do not mean the company asked this exact question. All data is fictional.</p></div>
  <div class="card"><h2>SQLite (this portal) vs MySQL (most OAs)</h2>${tableHTML(["Task", "SQLite", "MySQL 8"], D.dialect, 100)}</div>
  <div class="card"><h2>Logical order of a query</h2><p class="mono">FROM / JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → window functions → ORDER BY → LIMIT</p></div>
  <div class="card"><h2>10 patterns that solve most interview questions</h2>${tableHTML(["Pattern", "When you see…", "Tool", "Practise"], D.patterns, 100)}</div>`;
}


// ---------- interview experiences ----------
const TOPIC = { sql: "SQL", python: "Python", excel: "Excel", powerbi: "Power BI / Tableau", stats: "Statistics & probability", ml: "Machine learning",
  case: "Business case / RCA", guesstimate: "Guesstimates", puzzle: "Puzzles", aptitude: "Aptitude test", dsa: "Coding / DSA", hr: "HR / behavioural", datamodel: "Data modelling / DBMS" };
const ROLE_NAME = { DA: "Data Analyst", BA: "Business Analyst", BI: "BI / MIS", DS: "Data Scientist", DE: "Data Engineer" };
function viewExperiences(params) {
  const f = { cat: params.get("cat") || "", co: params.get("co") || "", role: params.get("role") || "", topic: params.get("topic") || "", s: params.get("s") || "", unread: params.get("unread") || "" };
  const read = S.expRead || (S.expRead = {});
  const cats = Array.from(new Set(EXPS.map(e => e.category))).sort();
  const cos = Array.from(new Set(EXPS.map(e => e.company))).sort();
  const list = EXPS.filter(e => (!f.cat || e.category === f.cat) && (!f.co || e.company === f.co) && (!f.role || e.roleType === f.role) &&
    (!f.topic || e.topics.includes(f.topic)) && (!f.unread || !read[e.id]) &&
    (!f.s || JSON.stringify([e.company, e.role, e.rounds, e.asked, e.tips]).toLowerCase().includes(f.s.toLowerCase())));
  const tcount = {}; EXPS.forEach(e => e.topics.forEach(t => tcount[t] = (tcount[t] || 0) + 1));
  const top = Object.keys(tcount).sort((a, b) => tcount[b] - tcount[a]).slice(0, 8);
  const opt = (name, vals, first, labels) => `<select data-f="${name}"><option value="">${first}</option>${vals.map(v => `<option value="${esc(v)}" ${f[name] === v ? "selected" : ""}>${esc((labels && labels[v]) || v)}</option>`).join("")}</select>`;
  const wname = k => (WORLDS.find(w => w.key === k) || {}).name;
  main().innerHTML = `<h1>🗣 Interview experiences <span class="muted small">${Object.keys(read).length}/${EXPS.length} read · +2 XP each</span></h1>
  <div class="card"><p>Real interview processes for data roles in India: what each round looked like, what was asked, and the candidate's own tips. Each card is a short summary <b>in our own words</b> of one publicly shared experience, with a link to the original. Processes change from year to year, so use these to see the pattern, not as a fixed script.</p>
  <div class="muted small">What came up most across ${EXPS.length} experiences from ${cos.length} companies:</div>
  <div class="topicbars">${top.map(t => `<a class="tbar" href="#/exp?topic=${t}"><span>${esc(TOPIC[t] || t)}</span><div class="minibar"><div style="width:${Math.round(100 * tcount[t] / EXPS.length)}%"></div></div><b>${tcount[t]}</b></a>`).join("")}</div></div>
  <div class="filters">${opt("cat", cats, "All company types")}${opt("co", cos, "All companies")}${opt("role", Object.keys(ROLE_NAME), "All roles", ROLE_NAME)}${opt("topic", Object.keys(TOPIC), "Any topic", TOPIC)}
    <select data-f="unread"><option value="">Read + unread</option><option value="1" ${f.unread ? "selected" : ""}>Unread only</option></select>
    <input type="search" data-f="s" placeholder="Search questions, e.g. window, guesstimate" value="${esc(f.s)}"></div>
  <div class="muted small mb">${list.length} experience(s)</div>
  <div class="exps">${list.map(e => `
    <details class="card exp ${read[e.id] ? "read" : ""}" data-id="${e.id}">
      <summary><div class="row between wrap gap"><div><b class="eco">${esc(e.company)}</b> ${e.jdBank ? `<span class="chip jdchip">In your JD bank</span>` : ""}
        <div class="small">${esc(e.role)} · <span class="muted">${esc(e.level)}${e.year ? " · " + esc(e.year) : ""}${e.location ? " · " + esc(e.location) : ""}</span></div></div>
        <div class="right small"><span class="chip">${esc(e.category)}</span> ${read[e.id] ? `<span class="chip good">✔ Read</span>` : ""}<div class="muted">${esc(e.outcome || "")}${e.difficulty ? " · " + esc(e.difficulty) : ""}</div></div></div>
        <div class="mt">${e.topics.map(t => `<span class="chip tchip">${esc(TOPIC[t] || t)}</span>`).join(" ")}</div></summary>
      <div class="expbody">
        <h3>Rounds</h3><ol>${e.rounds.map(r => `<li><b>${esc(r.name)}</b>: ${esc(r.detail)}</li>`).join("")}</ol>
        <h3>What was asked</h3><ul>${e.asked.map(q => `<li>${esc(q)}</li>`).join("")}</ul>
        ${e.tips && e.tips.length ? `<h3>Takeaways</h3><ul>${e.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${e.practice && e.practice.length ? `<h3>Prepare for this in SQL Quest</h3><div>${e.practice.filter(wname).map(k => `<a class="btn small" href="#/list?world=${encodeURIComponent(wname(k))}">${esc(wname(k))} →</a>`).join(" ")}</div>` : ""}
        <div class="row between wrap gap mt"><a href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">Read the original on ${esc(e.source.name)} ↗</a>
          ${read[e.id] ? `<span class="muted small">Read ✔</span>` : `<button class="btn small primary" data-read="${e.id}">Mark as read (+2 XP)</button>`}</div>
      </div></details>`).join("")}</div>
  <p class="small muted">Sources: GeeksforGeeks, Glassdoor, LeetCode Discuss, Coding Ninjas, Aced and Board Infinity. Summaries are paraphrased; SQL Quest is not affiliated with these sites or companies.</p>`;
  main().querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => {
    const p = new URLSearchParams(); main().querySelectorAll("[data-f]").forEach(x => { if (x.value) p.set(x.dataset.f, x.value); }); location.hash = "#/exp?" + p.toString();
  }));
  main().querySelectorAll("[data-read]").forEach(b => b.onclick = () => {
    const id = b.dataset.read; if (read[id]) return;
    read[id] = today(); markDay(); toast("+2 XP", "good"); checkBadges(); save(); renderHeader(); LB.push();
    const card = b.closest(".exp"); card.classList.add("read"); b.outerHTML = `<span class="muted small">Read ✔</span>`;
  });
}

// ---------- router ----------
function route() {
  const h = location.hash || "#/home";
  const [path, qs] = h.slice(1).split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  if (!$("#modal").dataset.locked) closeModal();
  if (parts[0] === "q") viewQuestion(parseInt(parts[1], 10));
  else if (parts[0] === "list") viewList(params);
  else if (parts[0] === "mcq") viewMCQ(params);
  else if (parts[0] === "oa") viewOA();
  else if (parts[0] === "sandbox") viewSandbox();
  else if (parts[0] === "badges") viewBadges();
  else if (parts[0] === "board") viewBoard(params);
  else if (parts[0] === "guide") viewGuide();
  else if (parts[0] === "exp") viewExperiences(params);
  else viewHome();
  renderHeader();
}
window.addEventListener("hashchange", route);
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" && !$("#modal").dataset.locked) closeModal(); });
$("#modal-close").onclick = () => { if (!$("#modal").dataset.locked) closeModal(); };
route();
Engine.ready().then(r => { $("#engine").textContent = r.ok ? (r.fallback ? "SQL engine ready (compatibility mode)" : "SQL engine ready") : "Engine error: " + r.error; $("#engine").className = r.ok ? "ok" : "bad"; });
if (!S.profile || !S.profile.name) profileModal(true);
else if (S.pendingSync) LB.push();
checkBadges(); save();
window.__SQLQ = { S: () => S, Engine, QS, compare, expected, decode };
})();
