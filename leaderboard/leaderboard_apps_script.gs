/**
 * SQL Quest – class leaderboard backend (Google Apps Script).
 * Paste this whole file into Extensions → Apps Script of a new Google Sheet, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Copy the /exec URL into LEADERBOARD_URL in index.html.
 *
 * Sheets created automatically:
 *   Progress – one row per student (your teacher dashboard; sort/filter freely)
 *   Log      – every solve / solution reveal / OA attempt, with the student's SQL (for spot-checking)
 */

// Students must type this code in their profile. Change it per batch; set to "" to disable the check.
const CLASS_CODE = "NST2027";

const PROGRESS_HEADERS = ["roll", "name", "batch", "pin_hash", "xp", "level", "solved", "easy", "medium", "hard",
  "mcq_correct", "streak", "badges", "oa_best", "hints_used", "solutions_revealed", "last_active"];
const LOG_HEADERS = ["timestamp", "roll", "name", "batch", "event", "question", "xp", "query"];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "board") {
    if (CLASS_CODE && p.classCode !== CLASS_CODE) return json_({ ok: false, error: "Wrong class code" });
    return json_(board_(p.batch || ""));
  }
  return json_({ ok: true, message: "SQL Quest leaderboard is running." });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  if (CLASS_CODE && d.classCode !== CLASS_CODE) return json_({ ok: false, error: "Wrong class code. Ask your mentor." });
  const roll = String(d.roll || "").trim().toUpperCase();
  if (!roll || !/^\d{4}$/.test(String(d.pin || ""))) return json_({ ok: false, error: "Roll number and 4-digit PIN are required" });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = sheet_(ss, "Progress", PROGRESS_HEADERS);
    const pinHash = hash_(roll + ":" + d.pin);
    const values = sh.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < values.length; i++) if (String(values[i][0]).toUpperCase() === roll) { rowIdx = i; break; }
    if (rowIdx > 0 && values[rowIdx][3] && values[rowIdx][3] !== pinHash) {
      return json_({ ok: false, error: "PIN does not match this roll number" });
    }
    const n = v => Math.max(0, Math.min(100000, Number(v) || 0));
    const row = [roll, clean_(d.name, 40), clean_(d.batch, 20), pinHash, n(d.xp), clean_(d.level, 30), n(d.solved), n(d.easy),
      n(d.medium), n(d.hard), n(d.mcq), n(d.streak), n(d.badges), n(d.oaBest), n(d.hintsUsed), n(d.revealed), new Date()];
    if (rowIdx > 0) sh.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);

    if (d.event && d.event.type) {
      const log = sheet_(ss, "Log", LOG_HEADERS);
      log.appendRow([new Date(), roll, clean_(d.name, 40), clean_(d.batch, 20), clean_(d.event.type, 20),
        clean_(d.event.qid, 10), n(d.event.xp), clean_(d.event.query, 1500)]);
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function board_(batch) {
  const sh = sheet_(SpreadsheetApp.getActiveSpreadsheet(), "Progress", PROGRESS_HEADERS);
  const v = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (!r[0]) continue;
    if (batch && String(r[2]).toLowerCase() !== batch.toLowerCase()) continue;
    rows.push({ rollTail: String(r[0]).slice(-3), name: r[1], batch: r[2], xp: r[4], level: r[5], solved: r[6], hard: r[9],
      mcq: r[10], streak: r[11], badges: r[12], oaBest: r[13] });
  }
  rows.sort((a, b) => b.xp - a.xp || b.solved - a.solved || String(a.name).localeCompare(String(b.name)));
  return { ok: true, rows: rows.slice(0, 300) };
}

function sheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}
function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s));
}
function clean_(v, max) {
  // strip leading = + - @ so student text can never become a spreadsheet formula
  return String(v == null ? "" : v).replace(/^[=+\-@]+/, "").slice(0, max);
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
