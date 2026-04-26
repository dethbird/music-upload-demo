# music-upload-demo

A full-stack demo of an event-driven audio upload pipeline. The API stays fast by doing minimal synchronous work — metadata storage and event emission — while a worker handles the heavy lifting asynchronously.

![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-Storage-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

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
       ├─ Upload file → Cloudflare R2
       ├─ Update DB status
       └─ Publish track.processed / track.error
```

**Event flow:** `track.uploaded` → `track.processing` → `track.processed` (or `track.error`)

> **Note:** Redis Pub/Sub is used here for demo simplicity. In production, use GCP Pub/Sub, Redis Streams, or Celery/RQ for durability, retries, and dead-letter queues.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker + Docker Compose
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket with API credentials

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/music
REDIS_URL=redis://localhost:6379/0

R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxx.r2.dev
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

Starts Postgres (`:5432`) and Redis (`:6379`). Wait for both to report healthy.

### 3. Install Python dependencies

```bash
python -m venv .venv
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
python -m app.worker
```
Listens for `track.uploaded` events, uploads to R2, and publishes status updates.

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
   - `track.processing` — worker started the R2 upload
   - `track.processed` — file is in R2, DB updated
   - `track.error` — something went wrong (message shown inline)

---

## Project Structure

```
music-upload-demo/
  app/
    main.py       ← FastAPI: upload endpoint, SSE stream, static mount
    db.py         ← SQLAlchemy engine + session
    models.py     ← Track model
    events.py     ← Redis publish helper
    worker.py     ← Event consumer + R2 upload + DB updates
    storage.py    ← boto3 R2 client
  ui/
    src/
      App.tsx
      components/
        UploadForm.tsx   ← XHR upload with progress bar
        EventFeed.tsx    ← SSE consumer, live event table
    vite.config.ts
  uploads/             ← Temp file storage (gitignored)
  docker-compose.yml   ← Postgres + Redis
  requirements.txt
  .env.example
```
