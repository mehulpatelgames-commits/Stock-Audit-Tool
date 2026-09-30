# 📊 PIL Stock Audit

A mobile-first stock audit web application built with **FastAPI + PostgreSQL**, hosted on **Railway**.

## Features
- 📱 **Mobile-only UI** — designed for phone screens, thumb-friendly
- 📂 **Department-wise stock** — import separate Excel files per department
- ✅ **Live verification** — team verifies stock one by one with physical qty
- ⚙️ **User-configurable filters** — each person chooses their own filter columns
- ⚠️ **Concurrent edit warnings** — shows who else is editing an item
- 📊 **Live progress dashboard** — see % verified per department in real time
- 📤 **Excel export** — color-coded report with discrepancies highlighted
- 📸 **Photo upload** — photos go to Google Drive, logged in DB

---

## Project Structure

```
PIL Stock Audit/
├── main.py              # FastAPI app entry point
├── config.py            # Settings from environment variables
├── database.py          # PostgreSQL async connection
├── models.py            # SQLAlchemy ORM models
├── schemas.py           # Pydantic request/response schemas
├── requirements.txt     # Python dependencies
├── Dockerfile           # For Railway deployment
├── railway.toml         # Railway config
├── .env.example         # Environment variable template
├── routers/
│   ├── auth.py          # Login endpoint
│   ├── audit.py         # Audit session management
│   ├── department.py    # Department + Excel import
│   ├── stock.py         # Stock items CRUD + export
│   └── photo.py         # Photo upload to Google Drive
├── services/
│   ├── excel.py         # Excel parser (auto-detect columns)
│   ├── drive.py         # Google Drive upload service
│   └── export.py        # Excel export generator
├── templates/
│   └── index.html       # Mobile HTML shell
└── static/
    ├── style.css        # Mobile-first CSS
    └── app.js           # Frontend logic
```

---

## Local Setup

### 1. Install Python dependencies
```bash
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### 2. Create `.env` file
```bash
copy .env.example .env
```
Fill in your values in `.env`.

### 3. Run locally (without DB — for UI preview)
```bash
uvicorn main:app --reload
```
Open: http://localhost:8000

### 4. Run with PostgreSQL (full local test)
Install PostgreSQL locally or use a Railway PostgreSQL URL in `.env`.

---

## Deployment on Railway

### Step 1 — Create Railway account
Go to [railway.app](https://railway.app) → Sign up with new email → Verify

### Step 2 — Create GitHub repo
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/PIL-Stock-Audit.git
git push -u origin main
```

### Step 3 — New Railway project
1. Railway dashboard → **New Project**
2. **Deploy from GitHub repo** → Select `PIL-Stock-Audit`
3. Railway auto-detects `Dockerfile` ✅

### Step 4 — Add PostgreSQL
1. In your Railway project → **+ New** → **Database** → **PostgreSQL**
2. Railway auto-sets `DATABASE_URL` environment variable ✅

### Step 5 — Set environment variables
In Railway project → **Variables** tab → Add:

| Variable | Value |
|---|---|
| `SECRET_KEY` | Any random string |
| `ADMIN_NAMES` | `Jay Samani,Admin` |
| `GOOGLE_SA_JSON` | Paste your service account JSON |
| `DRIVE_FOLDER_ID` | Your Google Drive folder ID |

### Step 6 — Deploy
Railway auto-deploys on every GitHub push. Your app URL will be:
`https://your-app-name.up.railway.app`

---

## Google Drive Setup (for Photo Upload)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable **Google Drive API**
4. Create **Service Account** → Download JSON key
5. Create a folder in Google Drive → Share it with the service account email
6. Copy the folder ID from the URL and set `DRIVE_FOLDER_ID`
7. Paste the JSON key content into `GOOGLE_SA_JSON` in Railway variables

---

## Admin Guide

### Starting an Audit
1. Log in as Admin name (configured in `ADMIN_NAMES`)
2. The app auto-creates an audit session on first Excel import
3. Import Excel files department by department

### Importing Stock Data
1. Dashboard → **Import Excel** button
2. Enter department name (e.g. "Fabric")
3. Upload Excel file (any format, columns auto-detected)
4. Select which column holds the Management Qty

### Exporting Report
1. Go to Audit tab → select department
2. Dashboard → **Export Report** button
3. Downloads color-coded Excel: ✅ Green = match, 🔴 Red = discrepancy, 🟡 Yellow = pending

### Re-importing (Wrong File)
Same department name → re-import → automatically replaces previous data

---

## User Guide (Auditors)

1. Open app on phone → select your name → tap Continue
2. On Dashboard, tap a department card to start auditing
3. Use search bar and filter fields to find the item
4. Tap the stock card → enter physical qty
5. Tap **"Same as Management"** if qty matches, or enter your own count
6. Save → moves to next item
