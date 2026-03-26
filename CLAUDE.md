# Claude Instructions — Result Checker

Always read this file before touching any file in this project.

---

## Project Overview

**CheckResult.ng** — A school result checker web app.
Admins upload CSV result sheets; students look up results using a PIN.

- **Stack:** Node.js + Express, no build tools, no TypeScript
- **Storage:** JSON file (`database/data.json`) — no native database bindings
- **Entry point:** `server.js`
- **Port:** 3000 (local) / set via `PORT` env var on Render

---

## Owner Info

| Field   | Value                        |
|---------|------------------------------|
| Name    | Daniel Enantomhen            |
| Alias   | @dantelarge                  |
| Email   | danielenantomhen@gmail.com   |

---

## File Structure

```
result-checker/
├── server.js               # Express app entry point
├── .env                    # Env vars (not committed)
├── sample.csv              # Sample data for testing
├── database/
│   ├── db.js               # JSON file storage API
│   └── data.json           # Live data (auto-created, not committed)
├── routes/
│   ├── admin.js            # Admin API (/api/admin/*)
│   └── results.js          # PIN lookup API (/api/results/check)
├── public/
│   ├── index.html          # Student portal
│   ├── admin.html          # Admin dashboard
│   └── style.css           # Shared styles
└── uploads/                # Temp CSV uploads (auto-cleared)
```

---

## Routes

| Method | Path                      | Auth     | Purpose               |
|--------|---------------------------|----------|-----------------------|
| GET    | `/`                       | Public   | Student portal        |
| GET    | `/admin`                  | Public   | Admin panel (HTML)    |
| GET    | `/api/admin/status`       | None     | Check login state     |
| POST   | `/api/admin/login`        | None     | Admin login           |
| POST   | `/api/admin/logout`       | Session  | Admin logout          |
| GET    | `/api/admin/batches`      | Session  | List all batches      |
| GET    | `/api/admin/stats`        | Session  | Dashboard stats       |
| POST   | `/api/admin/upload`       | Session  | Upload CSV            |
| DELETE | `/api/admin/batches/:id`  | Session  | Delete a batch        |
| POST   | `/api/results/check`      | Public   | PIN lookup            |

---

## CSV Format

Required columns: `PIN`, `Student_Name`, `Subject`
Optional columns: `School`, `Class`, `Term`, `Year`, `Score`, `Grade`, `Remark`

Column names are case-insensitive and spaces are normalized to underscores on import.
One row per subject per student. Multiple rows share the same PIN.

---

## Environment Variables

```
PORT=3000
SESSION_SECRET=change-this-to-a-random-string
ADMIN_PASSWORD=admin123
```

---

## Storage — db.js API

No SQL. All data lives in `database/data.json`.

```js
db.getBatches()           // returns batches with student_count, row_count
db.getStats()             // returns { total_students, total_rows, total_batches }
db.insertBatch(name, rows) // inserts batch + rows, returns { id, count }
db.deleteBatch(id)        // deletes batch and all its results
db.checkPin(pin)          // returns result object or null
```

---

## Hosting

- **Platform:** Render (free tier)
- **Build command:** *(none)*
- **Start command:** `npm start`
- **Env vars to set:** `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORT`

---

## Code Rules

- No TypeScript, no React, no build step — pure Node.js + vanilla HTML/CSS/JS
- `'use strict'` at top of every JS file
- Never use `alert()` — use the toast system in the frontend
- Always use `escapeHtml()` for dynamic user-facing content in HTML
- Never hardcode colours — use CSS variables defined in `style.css`
- Keep all frontend code inside the respective HTML file unless a new file is needed
- Do not add native npm packages that require compilation (no `better-sqlite3`, etc.)

---

## Test Data

Use `sample.csv` to test uploads. Test PINs: `EX2024001`, `EX2024002`, `EX2024003`.
