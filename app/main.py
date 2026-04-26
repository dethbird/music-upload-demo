import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import aiofiles
import redis.asyncio as aioredis
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.db import SessionLocal, engine
from app.events import publish
from app.models import Base, Track

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]
CHANNEL = "track.events"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
UPLOADS_DIR = "uploads"
AUDIO_MIME_PREFIXES = ("audio/",)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)


@app.post("/tracks/upload")
async def upload_track(file: UploadFile):
    # Validate MIME type
    content_type = file.content_type or ""
    if not any(content_type.startswith(p) for p in AUDIO_MIME_PREFIXES):
        raise HTTPException(status_code=415, detail="Only audio files are accepted.")

    # Stream file to disk while enforcing size limit
    safe_filename = os.path.basename(file.filename or "upload")
    local_filename = f"{uuid.uuid4().hex}_{safe_filename}"
    local_path = os.path.join(UPLOADS_DIR, local_filename)

    bytes_written = 0
    try:
        async with aiofiles.open(local_path, "wb") as out:
            while chunk := await file.read(256 * 1024):  # 256 KB chunks
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 50 MB size limit.",
                    )
                await out.write(chunk)
    except HTTPException:
        # Clean up partial file before re-raising
        if os.path.exists(local_path):
            os.remove(local_path)
        raise

    # Persist metadata
    db = SessionLocal()
    try:
        track = Track(
            filename=safe_filename,
            local_path=local_path,
            status="pending",
        )
        db.add(track)
        db.commit()
        db.refresh(track)
        track_id = track.id
    finally:
        db.close()

    # Emit event — worker picks this up and does the heavy lifting
    publish(
        event="track.uploaded",
        track_id=track_id,
        filename=safe_filename,
    )

    return {"track_id": track_id, "status": "pending", "message": "Processing started"}


@app.get("/events/stream")
async def events_stream():
    """Server-Sent Events endpoint. Streams all track.events Redis messages."""

    async def generator():
        client = aioredis.from_url(REDIS_URL, decode_responses=True)
        pubsub = client.pubsub()
        await pubsub.subscribe(CHANNEL)
        try:
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
                else:
                    # Keepalive comment so the connection stays open
                    yield ": keepalive\n\n"
                    await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(CHANNEL)
            await client.aclose()

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# Static mount MUST be last — API routes above take priority
UI_DIST = os.path.join("ui", "dist")
if os.path.isdir(UI_DIST):
    app.mount("/", StaticFiles(directory=UI_DIST, html=True), name="ui")
