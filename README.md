# music-upload-demo

A full-stack demo of an event-driven audio upload pipeline. The API stays fast by doing minimal synchronous work — metadata storage and event emission — while a worker handles the heavy lifting asynchronously.

![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-Storage-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![ffmpeg](https://img.shields.io/badge/ffmpeg-transcoding-007808?style=flat-square&logo=ffmpeg&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

---

![Screenshot of the Music Upload Pipeline UI showing the upload form and live event feed](docs/screenshot.png)

---

## Architecture

```
Browser
  │
  ├─ POST /tracks/upload ──→ FastAPI
  │                              │
  │                              ├─ Save metadata → Postgres
  │                              ├─ Save file     → uploads/ (temp)
  │                              └─ Publish       → Redis "track.events"
  │
  ├─ GET /events/stream (SSE) ←─ FastAPI (re-broadcasts Redis messages)
  │
Worker (separate process)
  └─ Subscribe "track.events"
       ├─ Transcode to MP3  → uploads/ (temp)
       ├─ Upload MP3        → Cloudflare R2
       ├─ Update DB status
       └─ Publish status events
```

**Event flow:** `track.uploaded` → `track.transcoding` → `track.processing` → `track.processed` (or `track.error`)

> **Note:** Redis Pub/Sub is used here for demo simplicity. In production, use GCP Pub/Sub, Redis Streams, or Celery/RQ for durability, retries, and dead-letter queues.

---

## Prerequisites

- Python 3.11+ (`python3-venv` must be available — `sudo apt install python3-venv` on Debian/Ubuntu)
- Node.js 18+
- PostgreSQL running locally (system service or Docker)
- Redis running locally (system service or Docker)
- **ffmpeg** installed and on your `$PATH` (`sudo apt install ffmpeg` on Debian/Ubuntu)
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket with API credentials

> **Docker Compose** is included but only needed if you want containerised Postgres/Redis. The commented-out service blocks in `docker-compose.yml` can be re-enabled if you prefer containers over system services.

---

## Setup

### 1. Clone & configure environment

```bash
git clone <repo-url>
cd music-upload-demo
cp .env.example .env
```

Edit `.env` and fill in your Cloudflare R2 credentials:

```env
# Use 127.0.0.1 (not localhost) to force TCP and avoid peer auth issues
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/music
REDIS_URL=redis://localhost:6379/0

R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxx.r2.dev
```

### 2. Set up PostgreSQL

Create the `music` database. If your system Postgres uses peer authentication, run as the `postgres` OS user:

```bash
sudo -u postgres createdb music
```

Then set a password on the `postgres` role so SQLAlchemy can connect over TCP:

```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

> **Note:** The `DATABASE_URL` in `.env` uses `127.0.0.1` (not `localhost`) to force a TCP connection, which uses password auth and bypasses peer auth.

### 3. Install Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Build the frontend

```bash
cd ui
npm install
npm run build
cd ..
```

---

## Running

Open **three terminals** (with the virtualenv activated in each):

**Terminal 1 — API server**
```bash
uvicorn app.main:app --reload
```
→ [http://localhost:8000](http://localhost:8000) serves the React UI and the API.

**Terminal 2 — Worker**
```bash
python3 -m app.worker
```
Listens for `track.uploaded` events, transcodes non-MP3 files to MP3 via ffmpeg, uploads to R2, and publishes status updates.

**Terminal 3 — (Optional) Frontend dev server with HMR**
```bash
cd ui && npm run dev
```
→ [http://localhost:5173](http://localhost:5173) — proxies `/tracks` and `/events` to `:8000`.

---

## Usage

1. Open the app in your browser.
2. Click the upload area and select an audio file (≤ 50 MB).
3. Watch the progress bar fill as the file uploads.
4. The **Live Event Feed** panel shows each stage in real time:
   - `track.uploaded` — API received the file
   - `track.transcoding` — worker is converting the file to MP3 (skipped if already MP3)
   - `track.processing` — worker started the R2 upload
   - `track.processed` — MP3 is in R2, DB updated with the final filename and URL
   - `track.error` — something went wrong (message shown inline)
5. The **Track List** table updates automatically once processing completes, showing the final MP3 filename and a link to the R2 URL.

---

## Project Structure

```
music-upload-demo/
  app/
    main.py       ← FastAPI: upload endpoint, SSE stream, static mount
    db.py         ← SQLAlchemy engine + session
    models.py     ← Track model
    events.py     ← Redis publish helper
    worker.py     ← Event consumer + ffmpeg transcoding + R2 upload + DB updates
    storage.py    ← boto3 R2 client
  ui/
    src/
      App.tsx
      components/
        UploadForm.tsx   ← XHR upload with progress bar
        EventFeed.tsx    ← SSE consumer, live event table; triggers TrackList refresh on terminal events
        TrackList.tsx    ← Fetches all tracks from DB; auto-refreshes on track.processed / track.error
    vite.config.ts
  uploads/             ← Temp file storage (gitignored)
  docker-compose.yml   ← Postgres + Redis (commented out if using system services)
  requirements.txt
  .env.example
```
