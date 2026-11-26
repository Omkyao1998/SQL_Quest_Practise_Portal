// Runs backend/Code.gs against the local mock and checks every API flow. Usage: node tools/test_backend.js
const { makeContext, call } = require("./mock_backend");
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const ctx = makeContext();
const adm = call(ctx, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
ok(adm.ok && adm.role === "admin", "admin faculty login");
ok(!call(ctx, { action: "facultyLogin", username: "omkar", password: "nope" }).ok, "wrong faculty password rejected");
ok(call(ctx, { action: "rosterAdd", token: adm.token, rows: [{ roll: "nst001", name: "Riya", batch: "A" }, { roll: "NST002", name: "Arjun", batch: "B" }] }).added === 2, "roster upload adds 2");
ok(!call(ctx, { action: "studentLogin", roll: "NST999", pin: "1234" }).ok, "student not on roster rejected");
ok(!call(ctx, { action: "studentLogin", roll: "NST001", pin: "12" }).ok, "short first PIN rejected");
const s1 = call(ctx, { action: "studentLogin", roll: "NST001", pin: "1234" });
ok(s1.ok && s1.first && s1.profile.name === "Riya", "first login sets PIN");
ok(!call(ctx, { action: "studentLogin", roll: "NST001", pin: "9999" }).ok, "wrong PIN rejected");
ok(call(ctx, { action: "studentLogin", roll: "nst001", pin: "1234" }).ok, "login again (case-insensitive roll)");
ok(!call(ctx, { action: "overview", token: s1.token }).ok, "student cannot open faculty overview");
ok(!call(ctx, { action: "saveState", token: adm.token, state: {} }).ok, "faculty cannot save student state");
ok(!call(ctx, { action: "board", token: s1.token.slice(0, -2) + "xx" }).ok, "tampered token rejected");

const big = { solved: {}, note: "x".repeat(60000) };
for (let i = 1; i <= 100; i++) big.solved[i] = { xp: 20, query: "SELECT ".repeat(40) };
const sv = call(ctx, { action: "saveState", token: s1.token, state: big, summary: { xp: 640, solved: 100, hard: 10, level: "Window Wizard" }, qsum: { s: [1, 2, 3] }, event: { type: "solve", qid: 3 } });
ok(sv.ok, "save large state (compressed)");
const me = call(ctx, { action: "me", token: s1.token });
ok(me.ok && me.state && Object.keys(me.state.solved).length === 100 && me.state.note.length === 60000, "state round-trips intact");

const s2 = call(ctx, { action: "studentLogin", roll: "NST002", pin: "5555" });
call(ctx, { action: "saveState", token: s2.token, state: { solved: {} }, summary: { xp: 900, solved: 50 } });
const b = call(ctx, { action: "board", token: s1.token });
ok(b.ok && b.rows.length === 2 && b.rows[0].name === "Arjun", "leaderboard sorted by XP");
ok(call(ctx, { action: "board", token: s1.token, batch: "a" }).rows.length === 1, "leaderboard batch filter");

ok(!call(ctx, { action: "submitScenario", token: s1.token, qid: "s3", answer: "too short" }).ok, "too-short answer rejected");
const goodAns = "WHERE filters rows before grouping and HAVING filters groups after aggregation. Logical order of execution: FROM, WHERE, GROUP BY, HAVING, SELECT. Example: HAVING COUNT(*) > 5 with WHERE status='delivered'. Clear simple language.";
const sub = call(ctx, { action: "submitScenario", token: s1.token, qid: "s3", answer: goodAns });
ok(sub.ok && sub.submission.status === "ai_graded" && sub.submission.finalScore > 5, "scenario graded by (mock) AI: " + (sub.submission && sub.submission.finalScore));
ok(sub.submission.aiFeedback && sub.submission.aiFeedback.criteria.length === 4, "feedback has per-criterion marks");
call(ctx, { action: "submitScenario", token: s1.token, qid: "s3", answer: goodAns + " again" });
call(ctx, { action: "submitScenario", token: s1.token, qid: "s3", answer: goodAns + " third" });
ok(!call(ctx, { action: "submitScenario", token: s1.token, qid: "s3", answer: goodAns + " fourth" }).ok, "4th attempt blocked (max 3)");

ctx.__set("aiBusy", true);
const p = call(ctx, { action: "submitScenario", token: s2.token, qid: "d2", answer: "Atomicity means all or nothing, consistency keeps rules, isolation separates concurrent transfers, durability survives crash after commit." });
ok(p.ok && p.submission.status === "pending", "AI busy → stays pending");
ctx.__set("aiBusy", false);
ctx.gradePending();
const mine = call(ctx, { action: "myScenario", token: s2.token });
ok(mine.rows[0].status === "ai_graded", "5-minute trigger grades pending answers");

const g = call(ctx, { action: "grade", token: adm.token, id: sub.submission.id, score: 9.5, comment: "Great example" });
ok(g.ok, "faculty overrides AI mark");
const ov = call(ctx, { action: "overview", token: adm.token });
const riya = ov.rows.find(r => r.roll === "NST001");
ok(ov.ok && riya.xp === 640 && riya.scenarioAvg > 0 && riya.qsum.s.length === 3, "overview shows summary, scenario avg, qsum");
const det = call(ctx, { action: "student", token: adm.token, roll: "NST001" });
ok(det.ok && det.submissions.length === 3 && det.state.solved && det.log.length >= 1, "student drill-down");
ok(call(ctx, { action: "submissions", token: adm.token, status: "reviewed" }).rows.length === 1, "review queue filter");

ok(call(ctx, { action: "resetPin", token: adm.token, roll: "NST001" }).ok && call(ctx, { action: "studentLogin", roll: "NST001", pin: "4321" }).first, "PIN reset lets student set a new PIN");
ok(call(ctx, { action: "setStatus", token: adm.token, roll: "NST002", status: "disabled" }).ok && !call(ctx, { action: "studentLogin", roll: "NST002", pin: "5555" }).ok, "disabled student cannot log in");

ok(!call(ctx, { action: "mcqSave", token: adm.token, mcq: { bank: "dbms", q: "Q?", opts: ["a", "b"], ans: 0 } }).ok, "invalid MCQ rejected");
ok(call(ctx, { action: "mcqSave", token: adm.token, mcq: { bank: "de", topic: "Airflow", q: "=Airflow schedules?", opts: ["DAGs", "Tables", "Images", "Emails"], ans: 0, explain: "DAGs" } }).ok, "faculty adds MCQ");
const ml = call(ctx, { action: "mcqList", token: s1.token });
ok(ml.rows.length === 1 && ml.rows[0].q === "Airflow schedules?", "students see custom MCQ (formula prefix stripped)");

ok(call(ctx, { action: "facultyAdd", token: adm.token, username: "priya.k", name: "Priya K", password: "secret123" }).ok, "admin adds a faculty member");
const f2 = call(ctx, { action: "facultyLogin", username: "priya.k", password: "secret123" });
ok(f2.ok && f2.role === "faculty" && !call(ctx, { action: "facultyAdd", token: f2.token, username: "x1x", password: "12345678" }).ok, "non-admin faculty cannot add faculty");
ok(call(ctx, { action: "changePassword", token: f2.token, oldPassword: "secret123", newPassword: "newsecret1" }).ok, "faculty changes password");

const noAi = makeContext({ noAi: true });
const a2 = call(noAi, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
call(noAi, { action: "rosterAdd", token: a2.token, rows: [{ roll: "X1", name: "X", batch: "A" }] });
const x = call(noAi, { action: "studentLogin", roll: "X1", pin: "1111" });
ok(call(noAi, { action: "submitScenario", token: x.token, qid: "b3", answer: "3000 students, 80% present, 60% visit canteen, 1.5 purchases each, 75% UPI share gives about 1,770 transactions." }).submission.status === "pending", "no API key → submission waits for faculty");

console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);
