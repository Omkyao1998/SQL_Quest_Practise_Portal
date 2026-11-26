# Backend setup: logins, dashboards and AI marking (one time, about 20 minutes)

The portal itself stays on GitHub Pages. Logins, saved progress, the faculty dashboard and scenario marking run on a small **Google Apps Script** attached to a **Google Sheet** that you own. It's free.

You need: a Google account, and (for AI marking) a free Gemini API key.

---

## Step 1: Create the Sheet and paste the script (5 min)

1. Go to [sheets.new](https://sheets.new) and name the sheet **SQL Quest – Backend**.
2. Click **Extensions → Apps Script**. A code editor opens.
3. Delete everything in `Code.gs`, then paste the whole content of [`backend/Code.gs`](../backend/Code.gs) from this repo.
4. At the top of the code, change **SETUP_ADMIN**:
   ```js
   const SETUP_ADMIN = { username: "omkar", name: "Omkar Gokhale", password: "ChangeMe@123" };
   ```
   This is your first faculty (admin) login. Use a temporary password; you'll change it inside the portal later.
5. Click 💾 **Save**.

## Step 2: Run setup once (2 min)

1. In the toolbar's function dropdown, choose **setup**, then click **▶ Run**.
2. Google asks for permission: **Review permissions → choose your account → Advanced → Go to project (unsafe) → Allow**. ("Unsafe" only means Google hasn't reviewed your own script.)
3. When it finishes, your Sheet has 5 tabs: **Students, Faculty, Submissions, CustomMCQ, Log** (already-existing tabs are kept). A 5-minute timer is also created to mark any answers that were queued.

## Step 2b (optional): Load demo data for testing

In the same function dropdown choose **seedDemo → ▶ Run**. It adds:
- 12 demo students **DEMO001 … DEMO012** (batches 2027-A and 2027-B), all with **PIN 1234**, with realistic practice progress so the dashboards, analytics and leaderboard have data
- 2 demo faculty: **demo.faculty1 / DemoFaculty@1** and **demo.faculty2 / DemoFaculty@2**
- some marked scenario answers to review, plus 2 left "waiting for AI" so you can watch real Gemini marking

When you're done testing, run **clearDemo** to remove all of it (your own admin account stays).

## Step 3: Add the Gemini API key for AI marking (5 min)

1. Open [aistudio.google.com](https://aistudio.google.com), sign in, and click **Get API key → Create API key**. Copy it.
2. Back in Apps Script: **⚙ Project Settings** (left bar) → **Script properties → Add script property**
   - Property: `GEMINI_API_KEY`, Value: *your key*
   - Optional: `GEMINI_MODEL`, Value: e.g. `gemini-2.5-flash` (the default). If Google renames models later, change it here; no code change needed.
3. **Save script properties.**

> Keep the key private. Never paste it into the portal, GitHub or chat; Script Properties are only visible to you.
> Without a key everything still works, but scenario answers wait in the **Review answers** queue for faculty to mark.

## Step 4: Deploy as a web app (3 min)

1. Click **Deploy → New deployment → ⚙ (Select type) → Web app**.
2. Description: `SQL Quest v2` · Execute as: **Me** · Who has access: **Anyone**.
3. Click **Deploy** and copy the **Web app URL** (ends with `/exec`).
4. Quick check: open that URL in a browser. You should see `{"ok":true,"app":"SQL Quest backend",...}`.

"Anyone" is needed so students' browsers can reach it. They still need a roster entry + PIN (students) or a password (faculty), and every request is checked with a signed token.

## Step 5: Connect the portal (1 min)

Send the `/exec` URL to Claude, which puts it in `data/config.json`, rebuilds and pushes. Or do it yourself:
```json
{ "backend_url": "https://script.google.com/macros/s/XXXX/exec" }
```
then `python3 tools/build.py` and push.

## Step 6: First login and roster (5 min)

1. Open the portal → **Faculty** tab → log in with your SETUP_ADMIN username/password.
2. **🔑 Team & password**: change your password, then add other faculty (each gets their own login and sees all students).
3. **👥 Roster & PINs**: paste students as `roll, name, batch` (one per line; you can copy three columns from Excel).
4. Tell students: *"Open the link, choose Student, type your roll number and pick a 4–6 digit PIN. That becomes your PIN."*

---

## Everyday use

| Task | Where |
|---|---|
| See every student's progress, export CSV | 📋 Students |
| One student's full detail (questions, their SQL, hints, solutions seen, scenario answers) | click a student |
| Find the questions the class is stuck on | 📈 Question analytics |
| Check or change AI marks | ✅ Review answers |
| Add students, reset a forgotten PIN | 👥 Roster & PINs |
| Add your own MCQs (DBMS, Big Data or DE) | ➕ MCQ manager |
| Add faculty, change password | 🔑 Team & password |

The Google Sheet is the raw data. You can sort or filter it, but don't rename the tabs or the header row.

## Updating the script later

Paste the new `Code.gs`, then **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same.

## Troubleshooting

- **"Who has access" doesn't offer "Anyone"** (common on college Google Workspace accounts, where admins allow only "Anyone within <college>"): students' browsers then can't reach the backend. Ask your Workspace admin to allow external access for Apps Script web apps, or create the Sheet and script with a personal Gmail account instead. Nothing else changes.

- **Answers stay "Waiting for AI"**: check that `GEMINI_API_KEY` is set. Busy periods (many students submitting together) are queued and retried every 5 minutes. If a brand-new key keeps failing with quota errors, Google may require a billing account on that Google Cloud project before the free tier works, so check AI Studio's usage page.
- **"Please log in again"**: tokens last 14 days; just log in again.
- **A student forgot their PIN**: Roster & PINs → Reset PIN. They choose a new one at their next login. Their progress is kept.
- **Limits**: Apps Script handles a few hundred students comfortably. The free Gemini tier has per-minute limits, which is why marking can queue during a busy class.
- **Privacy**: names, roll numbers and answers live only in your Google Sheet. Scenario answers are sent to Google's Gemini API for marking.
- **Honest limits**: XP is calculated in the browser, so a determined student could fake it. Scenario model answers are in the page source. Use marks as practice signals; run formal assessments in a proctored setting.
