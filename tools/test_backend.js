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


// ---- demo data ----
const demo = makeContext();
const msg = demo.seedDemo();
ok(/Demo ready: 12 students/.test(msg), "seedDemo creates 12 demo students: " + msg);
const df = call(demo, { action: "facultyLogin", username: "demo.faculty1", password: "DemoFaculty@1" });
ok(df.ok && df.role === "faculty", "demo faculty can log in");
const ds = call(demo, { action: "studentLogin", roll: "DEMO012", pin: "1234" });
ok(ds.ok && !ds.first && ds.state && Object.keys(ds.state.solved).length > 0, "demo student logs in with PIN 1234 and has progress (" + (ds.state ? Object.keys(ds.state.solved).length : 0) + " solved)");
const dov = call(demo, { action: "overview", token: df.token });
ok(dov.rows.length === 12 && dov.rows.every(r => r.activated) && dov.rows.some(r => r.xp > 500) && dov.rows.some(r => r.scenarioAvg > 0), "overview shows varied demo progress");
ok(call(demo, { action: "submissions", token: df.token, status: "pending" }).rows.length === 2, "two demo answers left pending for real AI marking");
ok(call(demo, { action: "board", token: ds.token }).rows.length === 12, "leaderboard shows demo students");
ok(demo.seedDemo() && call(demo, { action: "overview", token: df.token }).rows.length === 12, "running seedDemo twice doesn't duplicate students");
const cm = demo.clearDemo();
ok(/Removed \d+ demo rows/.test(cm) && call(demo, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" }).ok && !call(demo, { action: "facultyLogin", username: "demo.faculty1", password: "DemoFaculty@1" }).ok, "clearDemo removes demo data but keeps the admin: " + cm);
const adm3 = call(demo, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
ok(call(demo, { action: "overview", token: adm3.token }).rows.length === 0, "no demo students remain");

// ---- admin panel ----
const A = makeContext();
const crypto = require("crypto");
const boot = "pub:" + crypto.createHash("sha256").update("fac:portal.admin:Test-Boot-Pass-1|sqlquest-bootstrap").digest("base64");
A.__sheets.Faculty.rows.push(["portal.admin", "Portal Admin", boot, "admin", "", "", "active", ""]);
ok(!call(A, { action: "facultyLogin", username: "portal.admin", password: "wrong-pass" }).ok, "bootstrap admin: wrong password rejected");
const pa = call(A, { action: "facultyLogin", username: "portal.admin", password: "Test-Boot-Pass-1" });
ok(pa.ok && pa.role === "admin" && pa.mustChange === true, "bootstrap admin logs in and is asked to change password");
ok(A.__sheets.Faculty.rows.find(r => r[0] === "portal.admin")[2].indexOf("pub:") !== 0, "bootstrap hash replaced by a secret hash after first login");
ok(call(A, { action: "facultyLogin", username: "portal.admin", password: "Test-Boot-Pass-1" }).ok, "same password still works after upgrade");
ok(!call(A, { action: "changePassword", token: pa.token, oldPassword: "Test-Boot-Pass-1", newPassword: "Test-Boot-Pass-1" }).ok, "new password must differ");
ok(call(A, { action: "changePassword", token: pa.token, oldPassword: "Test-Boot-Pass-1", newPassword: "Brand-New-Pass-2" }).ok
  && call(A, { action: "facultyLogin", username: "portal.admin", password: "Brand-New-Pass-2" }).mustChange === false, "password change clears the must-change flag");
const sm = call(A, { action: "adminSummary", token: pa.token });
ok(sm.ok && sm.faculty.admins === 2 && sm.version === "2.1", "admin summary works");
ok(call(A, { action: "rosterAdd", token: pa.token, rows: [{ roll: "R1", name: "Asha", batch: "A" }, { roll: "R2", name: "Ben", batch: "A" }, { roll: "R3", name: "Chirag", batch: "B" }] }).added === 3, "admin adds students");
ok(call(A, { action: "facultyAdd", token: pa.token, username: "fac.one", name: "Faculty One", password: "FacOne@123" }).ok, "admin adds faculty");
const f1 = call(A, { action: "facultyLogin", username: "fac.one", password: "FacOne@123" });
ok(f1.ok && f1.mustChange === true, "new faculty must change temporary password");
ok(!call(A, { action: "rosterAdd", token: f1.token, rows: [{ roll: "R9", name: "X" }] }).ok && !call(A, { action: "adminSummary", token: f1.token }).ok, "faculty cannot use admin actions");
ok(call(A, { action: "resetPin", token: f1.token, roll: "R1" }).ok, "faculty can still reset a PIN");
ok(call(A, { action: "studentUpdate", token: pa.token, roll: "R1", name: "Asha Rao", batch: "C" }).ok && call(A, { action: "adminStudents", token: pa.token }).rows.find(r => r.roll === "R1").batch === "C", "admin edits a student");
call(A, { action: "studentLogin", roll: "R2", pin: "4321" });
ok(call(A, { action: "studentsBulk", token: pa.token, rolls: ["R2", "R3"], op: "batch", batch: "2027-Z" }).count === 2, "bulk move to batch");
const r2 = call(A, { action: "studentLogin", roll: "R2", pin: "4321" });
ok(call(A, { action: "studentsBulk", token: pa.token, rolls: ["R2"], op: "disable" }).ok && !call(A, { action: "saveState", token: r2.token, state: {}, summary: {} }).ok && !call(A, { action: "studentLogin", roll: "R2", pin: "4321" }).ok, "disabled student is logged out and blocked");
ok(call(A, { action: "studentsBulk", token: pa.token, rolls: ["R2"], op: "enable" }).ok && call(A, { action: "studentLogin", roll: "R2", pin: "4321" }).ok, "re-enabled student can log in");
ok(call(A, { action: "studentsBulk", token: pa.token, rolls: ["R3"], op: "delete" }).count === 1 && call(A, { action: "adminStudents", token: pa.token }).rows.length === 2, "admin deletes a student");
ok(call(A, { action: "facultyUpdate", token: pa.token, username: "fac.one", role: "admin" }).ok && call(A, { action: "adminSummary", token: f1.token }).ok, "promotion to admin applies to an existing session");
ok(call(A, { action: "facultyUpdate", token: pa.token, username: "fac.one", role: "faculty" }).ok && !call(A, { action: "adminSummary", token: f1.token }).ok, "demotion applies at once");
ok(call(A, { action: "facultyUpdate", token: pa.token, username: "fac.one", status: "disabled" }).ok && !call(A, { action: "overview", token: f1.token }).ok && /disabled/.test(call(A, { action: "facultyLogin", username: "fac.one", password: "FacOne@123" }).error), "disabled faculty blocked");
ok(call(A, { action: "facultyResetPassword", token: pa.token, username: "fac.one", password: "Reset@1234" }).ok, "admin resets a faculty password");
ok(!call(A, { action: "facultyUpdate", token: pa.token, username: "portal.admin", role: "faculty" }).ok && !call(A, { action: "facultyRemove", token: pa.token, username: "portal.admin" }).ok, "admin can't demote or delete self");
ok(call(A, { action: "facultyRemove", token: pa.token, username: "omkar" }).ok, "admin deletes another admin");
const lg = call(A, { action: "adminLog", token: pa.token });
ok(lg.ok && lg.rows.some(r => r.type === "admin" && /deleted account omkar/.test(r.detail)), "admin actions are logged");
const B = makeContext();
const ob = call(B, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
call(B, { action: "facultyAdd", token: ob.token, username: "x.admin", name: "X", password: "Xadmin@123", role: "admin" });
ok(!call(B, { action: "facultyUpdate", token: ob.token, username: "x.admin", status: "disabled" }).ok === false, "can disable one admin while another remains");
const xb = call(B, { action: "facultyLogin", username: "x.admin", password: "Xadmin@123" });
ok(!xb.ok, "disabled admin can't log in");
const C = makeContext();
C.__sheets.Faculty.rows = [C.__sheets.Faculty.rows[0], ["boss", "Boss", "pub:x", "admin", "", "", "active", ""]];
C.setup();
ok(!C.__sheets.Faculty.rows.some(r => r[0] === "omkar"), "setup doesn't create SETUP_ADMIN when an admin already exists");

// ---- class-size load: saves must not read whole sheets ----
const L = makeContext();
const la = call(L, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
call(L, { action: "rosterAdd", token: la.token, rows: Array.from({ length: 300 }, (_, i) => ({ roll: "L" + i, name: "Student " + i, batch: i % 2 ? "A" : "B" })) });
const bigState = { solved: {}, note: "x".repeat(20000) };
const lt = call(L, { action: "studentLogin", roll: "L150", pin: "1111" }).token;
const st0 = L.__sheets.Students.fullReads || 0, lg0 = L.__sheets.Log.fullReads || 0, t0 = Date.now();
for (let k = 0; k < 20; k++) call(L, { action: "saveState", token: lt, state: bigState, summary: { xp: k }, event: { type: "solve", qid: k } });
ok((L.__sheets.Students.fullReads || 0) === st0 && (L.__sheets.Log.fullReads || 0) === lg0, "20 saves read one row each, never the whole Students or Log sheet");
ok(L.__sheets.Students.rows.find(r => r[0] === "L150")[7] === 19 && L.__sheets.Log.rows.length > 20, "single-row save writes the right row and logs events");
const b1 = call(L, { action: "board", token: lt }), r0 = L.__sheets.Students.fullReads;
call(L, { action: "board", token: lt });
ok(b1.rows.length === 1 && L.__sheets.Students.fullReads === r0, "leaderboard served from a 30-second cache");
call(L, { action: "studentLogin", roll: "L7", pin: "2222" });
ok(call(L, { action: "board", token: lt }).rows.length === 2, "cache refreshes when a new student joins");
console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);
