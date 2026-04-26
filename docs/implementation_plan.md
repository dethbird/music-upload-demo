Let me read the planning prompt carefully and research a few things before drafting the plan. 

Research existing workspace structure

Read [](file:///home/dethbird/code/music-upload-demo)

Read [](file:///home/dethbird/code/music-upload-demo/docs/basic_details.md)

Read [](file:///home/dethbird/code/music-upload-demo/docs/planning_prompt.md)

Searched for files matching `music-upload-demo` · `**/.*`, 1 match

Searched for files matching `music-upload-demo` · `**/*.{py,js,json,yaml,yml,env,txt,cfg,ini,conf}`, no matches

Read [](file:///home/dethbird/code/music-upload-demo/docs)

Read [](file:///home/dethbird/code/music-upload-demo/README.md)

Read [](file:///home/dethbird/code/music-upload-demo/.gitignore#1-1), lines 1 to 100

Good — clean slate. Let me ask a couple of quick questions before writing the plan. 

Analyzing your answers...

Now I have everything I need. Let me write the plan. 

Created memory file [](file:///home/dethbird/.config/Code/User/workspaceStorage/ce9f3c1b4c757cc8457e269a99a3a1ae/GitHub.copilot-chat/memory-tool/memories/ODBiYzkxZTItOTc2Yy00MDdjLWEyN2YtMGU3ZmY2YThmMmVm/plan.md)

Here's the plan:

---

## Plan: Music Upload Event Pipeline Demo

**TL;DR:** Full-stack demo with a Vite/React frontend and FastAPI backend wired together via Redis Pub/Sub. The API stores file metadata + temp file, publishes an event, and returns immediately. A separate worker consumes the event, uploads the file to Cloudflare R2, and broadcasts status updates back through the same Redis channel — all visible live in the frontend via SSE.

---

### Project Structure

```
music-upload-demo/
  app/
    __init__.py
    main.py        ← FastAPI: upload + SSE + static mount
    db.py          ← SQLAlchemy engine, SessionLocal, Base
    models.py      ← Track model
    events.py      ← Redis publish helper
    worker.py      ← event consumer + R2 upload + DB updates
    storage.py     ← boto3 R2 upload helper
  ui/
    src/
      App.tsx
      components/
        UploadForm.tsx   ← XHR upload, progress bar, error display
        EventFeed.tsx    ← SSE consumer, live scrolling event list
    index.html
    vite.config.ts
    package.json
    tsconfig.json
  uploads/             ← gitignored temp storage for API→worker handoff
  docker-compose.yml   ← postgres + redis only
  requirements.txt
  .env.example
```

---

### Phase 1: Scaffolding & Config
1. `docker-compose.yml` — postgres:15 + redis:7 services only (ports 5432, 6379)
2. `requirements.txt` — fastapi, uvicorn[standard], sqlalchemy, psycopg2-binary, redis, boto3, python-multipart, python-dotenv, aiofiles
3. `.env.example` — `DATABASE_URL`, `REDIS_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
4. `uploads/.gitkeep`, `app/__init__.py`

### Phase 2: Backend Core
5. `app/db.py` — `DATABASE_URL` from env, `engine`, `SessionLocal`, `Base`
6. `app/models.py` — `Track` model: id, filename, storage_url (nullable), local_path, status, created_at

### Phase 3: Backend Services *(parallel with Phase 2)*
7. `app/events.py` — `redis.Redis` from `REDIS_URL`; `publish(event_type, payload)` → pushes to `track.events` channel
8. `app/storage.py` — `boto3` S3 client pointed at `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; `upload_to_r2(local_path, key)` returns public URL

### Phase 4: FastAPI App *(depends on 2, 3)*
9. `app/main.py`:
   - **Lifespan** — creates DB tables on startup
   - **`POST /tracks/upload`** — validates audio MIME type, rejects > 50 MB, saves to `uploads/{uuid}_{filename}`, inserts `Track(status="pending")`, publishes `track.uploaded`, returns `{track_id, status, message}`
   - **`GET /events/stream`** — `StreamingResponse` (`text/event-stream`), uses `redis.asyncio` pubsub to subscribe to `track.events`, yields `data: {json}\n\n` per message, cleans up on disconnect
   - **`app.mount("/")`** — `StaticFiles(directory="ui/dist", html=True)` added **last** so API routes win

### Phase 5: Worker *(depends on 2, 3)*
10. `app/worker.py` — subscribes to `track.events`, filters to `track.uploaded` events only (avoids loops), then:
    1. Publish `track.processing`, update DB
    2. `upload_to_r2(local_path, filename)` → get `storage_url`
    3. Update DB `status="processed"`, `storage_url`; publish `track.processed`
    4. Delete temp file
    5. On exception: publish `track.error`, update DB

### Phase 6: Frontend Scaffolding *(parallel with phases 2–5)*
11. `npm create vite@latest ui -- --template react-ts`
12. Install Tailwind CSS (v3) + postcss + autoprefixer
13. `vite.config.ts` — `server.proxy` forwards `/tracks` and `/events` to `http://localhost:8000`

### Phase 7: Frontend Components *(depends on 6)*
14. `UploadForm.tsx` — `accept="audio/*"` file input; client-side 50 MB guard (no request sent); `XMLHttpRequest` with `xhr.upload.onprogress` for live progress bar; states: idle / uploading / success / error
15. `EventFeed.tsx` — `new EventSource("/events/stream")`; JSON-parsed events appended to state; color-coded badge per event type (`track.uploaded` / `track.processing` / `track.processed` / `track.error`); auto-scroll to bottom
16. `App.tsx` — two-column layout (upload left, feed right), Tailwind styled

---

### Redis Event Payload (all events share this shape)
```json
{ "event": "track.uploaded", "track_id": 1, "filename": "song.mp3",
  "storage_url": null, "timestamp": "2026-04-26T...", "message": null }
```

---

### Verification Steps
1. `docker-compose up -d` — postgres + redis healthy
2. `python -c "from app.db import engine; from app.models import Base; Base.metadata.create_all(engine)"` — no errors
3. `uvicorn app.main:app --reload` → `GET /` serves React app
4. `python -m app.worker` → prints "Worker listening..."
5. `cd ui && npm run dev` → upload a small audio file, watch progress bar fill
6. EventFeed shows `track.uploaded` → `track.processing` → `track.processed` in sequence
7. Test error paths: non-audio file rejected before upload; oversized file blocked client-side
8. `cd ui && npm run build` then verify FastAPI serves built UI at `localhost:8000`

---

**Relevant files (all new):**
- `app/main.py`, `app/db.py`, `app/models.py`, `app/events.py`, `app/worker.py`, `app/storage.py`
- `ui/src/components/UploadForm.tsx`, `ui/src/components/EventFeed.tsx`, `ui/src/App.tsx`
- `ui/vite.config.ts`, `docker-compose.yml`, `requirements.txt`, `.env.example`

**Scope exclusions:** No auth, no pagination of tracks, no file cleanup scheduling (worker deletes on success only), no production Pub/Sub swap-out (just noted in comments).
