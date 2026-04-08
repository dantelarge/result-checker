# Claude Instructions — Result Checker

Always read this file before touching any file in this project.

---

## Project Overview

**CheckResult.ng** — A school result checker web app.
Admins enter results manually or upload files; students look up results using a PIN.

- **Stack:** Node.js + Express, no build tools, no TypeScript
- **Storage:** JSON file (`database/data.json`) — no native database bindings
- **Entry point:** `server.js`
- **Port:** 8000 (local) / set via `PORT` env var on Render

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
│   ├── admin.html          # Admin dashboard (split-screen login + tabbed dashboard)
│   └── style.css           # Shared styles
└── uploads/
    └── images/             # Uploaded result sheet images (served statically)
```

---

## Routes

| Method | Path                        | Auth     | Purpose                        |
|--------|-----------------------------|----------|--------------------------------|
| GET    | `/`                         | Public   | Student portal                 |
| GET    | `/admin`                    | Public   | Admin panel (HTML)             |
| GET    | `/api/admin/status`         | None     | Check login state              |
| POST   | `/api/admin/login`          | None     | Admin login                    |
| POST   | `/api/admin/logout`         | Session  | Admin logout                   |
| GET    | `/api/admin/batches`        | Session  | List all batches               |
| GET    | `/api/admin/stats`          | Session  | Dashboard stats                |
| POST   | `/api/admin/upload`         | Session  | Upload file (CSV/Excel/image)  |
| POST   | `/api/admin/entry`          | Session  | Manual single-student entry    |
| GET    | `/api/admin/batches/:id/pins` | Session | Download PIN list as CSV     |
| DELETE | `/api/admin/batches/:id`    | Session  | Delete a batch                 |
| POST   | `/api/results/check`        | Public   | PIN lookup                     |
| GET    | `/uploads/images/:file`     | Public   | Serve uploaded result images   |
| GET    | `/ping`                     | Public   | UptimeRobot health check       |

---

## File Upload

Accepts: **CSV**, **Excel (.xlsx/.xls)**, **PNG**, **JPEG**

- CSV/Excel required columns: `Student_Name`, `Subject`
- CSV/Excel optional columns: `PIN`, `School`, `Class`, `Term`, `Year`, `Score`, `Grade`, `Remark`
- Column names are case-insensitive; spaces normalized to underscores on import
- One row per subject per student; multiple rows share the same PIN
- If no `PIN` column, PINs are **auto-generated** in `EX{year}{seq}` format (e.g. `EX2026001`)
- PNG/JPEG uploads run OCR (tesseract.js) to extract data; image is always stored and shown to students

## Manual Entry (`POST /api/admin/entry`)

Accepts JSON body:
```json
{
  "batch_name": "JSS3 First Term 2024/2025",
  "student_name": "John Doe",
  "school": "Royal Academy",
  "class": "JSS3A",
  "term": "First",
  "year": "2024/2025",
  "pin": "",
  "subjects": [
    { "subject": "Mathematics", "score": "85", "grade": "A", "remark": "Excellent" }
  ]
}
```
PIN is auto-generated if blank.

---

## Environment Variables

```
PORT=8000
SESSION_SECRET=change-this-to-a-random-string
ADMIN_PASSWORD=admin123
```

---

## Storage — db.js API

No SQL. All data lives in `database/data.json`.

```js
db.getBatches()                    // returns batches with student_count, row_count, image_path
db.getStats()                      // returns { total_students, total_rows, total_batches }
db.getAllPins()                     // returns all unique PINs (used for auto-PIN sequencing)
db.getBatchPins(batchId)           // returns [{ pin, student_name }] for PIN download
db.insertBatch(name, rows, imagePath) // inserts batch + rows, returns { id, count }
db.deleteBatch(id)                 // deletes batch and all its results
db.checkPin(pin)                   // returns result object (includes image_url) or null
```

---

## npm Packages

| Package       | Purpose                        |
|---------------|--------------------------------|
| express       | Web framework                  |
| express-session | Session management           |
| multer        | File upload handling           |
| csv-parse     | CSV parsing                    |
| xlsx          | Excel file parsing             |
| tesseract.js  | OCR for image uploads          |
| dotenv        | Load .env variables            |

---

## Hosting

- **Platform:** Render (free tier — ephemeral filesystem, data wipes on restart)
- **Build command:** *(none)*
- **Start command:** `npm start`
- **Env vars to set on Render:** `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORT`
- **Known limitation:** `data.json` and uploaded images are lost on restart. Cloudinary + MongoDB planned for future persistence.

---

## Admin UI

- **Login:** Split-screen (teal brand panel left, form right). Password show/hide toggle.
- **Dashboard:** Teal hero banner with live stats. Two tabs:
  - **Manual Entry** — form to type student name, class, subjects, scores. PIN auto-generated.
  - **Bulk Upload** — drag-and-drop zone for CSV/Excel/PNG/JPEG.
- **Batches table:** Shows all uploaded batches. PIN download button per batch (hidden if 0 students).
- **Student portal:** Shows result slip + attached image (if any) when PIN is entered.

---

## Code Rules

- No TypeScript, no React, no build step — pure Node.js + vanilla HTML/CSS/JS
- `'use strict'` at top of every JS file
- Never use `alert()` — use the toast system in the frontend
- Always use `escapeHtml()` for dynamic user-facing content in HTML
- Never hardcode colours — use CSS variables defined in `style.css`
- Keep all frontend code inside the respective HTML file unless a new file is needed
- Do not add native npm packages that require compilation (no `better-sqlite3`, etc.)
- Use ` - ` (hyphen) not `—` (em dash) in template literals to avoid Windows encoding corruption

---

## Test Data

Use `sample.csv` to test uploads. Test PINs: `EX2024001`, `EX2024002`, `EX2024003`.
