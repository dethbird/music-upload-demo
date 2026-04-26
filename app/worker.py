import json
import os

import redis
from dotenv import load_dotenv

from app.db import SessionLocal
from app.events import publish
from app.models import Track
from app.storage import upload_to_r2

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]
CHANNEL = "track.events"


def process_track(event: dict) -> None:
    track_id = event["track_id"]
    filename = event["filename"]

    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            print(f"[worker] Track {track_id} not found in DB — skipping")
            return

        local_path = track.local_path

        # --- processing ---
        track.status = "processing"
        db.commit()
        publish(event="track.processing", track_id=track_id, filename=filename)
        print(f"[worker] Processing track {track_id} ({filename})")

        # Upload to R2
        storage_url = upload_to_r2(local_path, key=filename)

        # --- processed ---
        track.status = "processed"
        track.storage_url = storage_url
        db.commit()
        publish(
            event="track.processed",
            track_id=track_id,
            filename=filename,
            storage_url=storage_url,
        )
        print(f"[worker] Finished track {track_id} → {storage_url}")

        # Clean up temp file
        if local_path and os.path.exists(local_path):
            os.remove(local_path)

    except Exception as exc:
        db.rollback()
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.status = "error"
                db.commit()
        except Exception:
            pass
        publish(
            event="track.error",
            track_id=track_id,
            filename=filename,
            message=str(exc),
        )
        print(f"[worker] Error processing track {track_id}: {exc}")

    finally:
        db.close()


def main() -> None:
    client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = client.pubsub()
    pubsub.subscribe(CHANNEL)
    print(f"[worker] Listening on channel '{CHANNEL}' ...")

    for message in pubsub.listen():
        if message["type"] != "message":
            continue

        try:
            payload = json.loads(message["data"])
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"[worker] Malformed message skipped: {exc}")
            continue

        # Only act on the initial upload event to avoid processing loops
        if payload.get("event") != "track.uploaded":
            continue

        process_track(payload)


if __name__ == "__main__":
    main()
