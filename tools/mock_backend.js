// Local stand-in for Google Apps Script so backend/Code.gs can be tested without deploying.
// Usage: node tools/mock_backend.js [port]   → serves the API at http://127.0.0.1:<port>/exec
// The Gemini API is faked: score depends on how many rubric keywords the answer mentions.
const fs = require("fs"), path = require("path"), vm = require("vm"), http = require("http"), crypto = require("crypto"), zlib = require("zlib");
const ROOT = path.join(__dirname, "..");

function makeContext(opts = {}) {
  const sheets = {}, props = { GEMINI_API_KEY: opts.noAi ? "" : "test-key" }, cache = {};
  let aiBusy = !!opts.aiBusy;
  function Sheet(name) { this.name = name; this.rows = []; }
  Sheet.prototype = {
    appendRow(a) { this.rows.push(a.slice()); },
    setFrozenRows() {},
    getDataRange() { const s = this; return { getValues: () => s.rows.map(r => r.slice()) }; },
    deleteRow(r) { this.rows.splice(r - 1, 1); },
    getRange(r, c, nr, nc) { const s = this; return { setValues(v) { for (let i = 0; i < v.length; i++) { const row = s.rows[r - 1 + i] || (s.rows[r - 1 + i] = []); for (let j = 0; j < v[i].length; j++) row[c - 1 + j] = v[i][j]; } } }; },
  };
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
  const blob = (bytes, type) => ({ bytes: Buffer.from(bytes), getBytes() { return this.bytes; }, getDataAsString() { return this.bytes.toString("utf8"); } });
  const subjective = fs.readFileSync(path.join(ROOT, "data", "subjective.json"), "utf8");
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Error, encodeURIComponent, Boolean,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (alg, s) => [...crypto.createHash("sha256").update(s, "utf8").digest()],
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac("sha256", k).update(v, "utf8").digest()],
      base64Encode: b => Buffer.from(typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("base64"),
      base64EncodeWebSafe: b => Buffer.from(typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      base64Decode: s => [...Buffer.from(s, "base64")],
      base64DecodeWebSafe: s => [...Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")],
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => d.toISOString().slice(0, 10),
      newBlob: (d, type) => blob(typeof d === "string" ? Buffer.from(d, "utf8") : d, type),
      gzip: b => blob(zlib.gzipSync(b.getBytes())),
      ungzip: b => blob(zlib.gunzipSync(b.getBytes())),
    },
    UrlFetchApp: {
      fetch(url, o) {
        if (url.indexOf("data/subjective.json") >= 0) return { getResponseCode: () => 200, getContentText: () => subjective };
        const m = url.match(/data\/(questions|mcq)\.json$/);
        if (m) { const txt = fs.readFileSync(path.join(ROOT, "data", m[1] + ".json"), "utf8"); return { getResponseCode: () => 200, getContentText: () => txt }; }
        if (aiBusy) return { getResponseCode: () => 429, getContentText: () => "busy" };
        const prompt = JSON.parse(o.payload).contents[0].parts[0].text;
        const answer = (prompt.split("<answer>")[1] || "").split("</answer>")[0].toLowerCase();
        const crit = prompt.split("RUBRIC:")[1].split("REFERENCE ANSWER")[0].trim().split("\n").filter(Boolean).map(l => {
          const m = l.match(/^\d+\. (.*) \(([\d.]+) marks\)$/); return { point: m[1], max: +m[2] };
        });
        const criteria = crit.map(c => {
          const words = c.point.toLowerCase().match(/[a-z]{5,}/g) || [];
          const hit = words.filter(w => answer.includes(w)).length / Math.max(1, words.length);
          return { point: c.point, max: c.max, awarded: Math.round(c.max * Math.min(1, hit * 1.5) * 2) / 2, comment: hit > 0.3 ? "Covered." : "Missing or thin." };
        });
        const text = JSON.stringify({ criteria, score: 0, strengths: ["Clear structure"], improve: ["Add a concrete example"], summary: "Mock feedback." });
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "backend", "Code.gs"), "utf8"), ctx);
  ctx.setup();
  ctx.__set = (k, v) => { if (k === "aiBusy") aiBusy = v; else props[k] = v; };
  ctx.__sheets = sheets;
  return ctx;
}

function call(ctx, body) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()); }

if (require.main === module) {
  const port = +process.argv[2] || 8799;
  const ctx = makeContext();
  // seed a roster so the UI can be tried immediately
  const adm = call(ctx, { action: "facultyLogin", username: "omkar", password: "ChangeMe@123" });
  call(ctx, { action: "rosterAdd", token: adm.token, rows: [{ roll: "NST001", name: "Riya Desai", batch: "2027-A" }, { roll: "NST002", name: "Arjun Mehta", batch: "2027-A" }, { roll: "NST003", name: "Sana Khan", batch: "2027-B" }] });
  http.createServer((req, res) => {
    const h = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (req.method === "OPTIONS") { res.writeHead(204, h); return res.end(); }
    let b = ""; req.on("data", c => b += c); req.on("end", () => {
      if (req.method === "POST" && b.indexOf('"__control"') >= 0) { const c = JSON.parse(b); ctx.__set(c.key, c.value); res.writeHead(200, h); return res.end('{"ok":true}'); }
      const out = req.method === "POST" ? ctx.doPost({ postData: { contents: b } }) : ctx.doGet({ parameter: {} });
      res.writeHead(200, h); res.end(out.getContent());
    });
  }).listen(port, "127.0.0.1", () => console.log("mock backend on http://127.0.0.1:" + port + "/exec"));
}
module.exports = { makeContext, call };
