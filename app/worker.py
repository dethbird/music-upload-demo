import json
import os
import subprocess

import redis
from dotenv import load_dotenv

from app.db import SessionLocal
from app.events import publish
from app.models import Track
from app.storage import upload_to_r2

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]
CHANNEL = "track.events"


def transcode_to_mp3(local_path: str) -> tuple[str, str]:
    """
    If local_path is not already an MP3, transcode it with ffmpeg.
    Returns (output_path, output_filename). Caller is responsible for
    deleting output_path when done if it differs from local_path.
    """
    base, ext = os.path.splitext(local_path)
    if ext.lower() == ".mp3":
        return local_path, os.path.basename(local_path)

    output_path = base + ".mp3"
    result = subprocess.run(
        [
            "ffmpeg", "-y",        # overwrite if exists
            "-i", local_path,
            "-vn",                 # drop video/cover-art streams
            "-ar", "44100",        # sample rate
            "-ac", "2",            # stereo
            "-b:a", "192k",        # bitrate
            output_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")

    return output_path, os.path.basename(output_path)


def process_track(event: dict) -> None:
    track_id = event["track_id"]
    filename = event["filename"]

    db = SessionLocal()
    transcoded_path: str | None = None
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            print(f"[worker] Track {track_id} not found in DB — skipping")
            return

        local_path = track.local_path

        # --- transcoding ---
        track.status = "transcoding"
        db.commit()
        publish(event="track.transcoding", track_id=track_id, filename=filename)
        print(f"[worker] Transcoding track {track_id} ({filename})")

        upload_path, upload_filename = transcode_to_mp3(local_path)
        if upload_path != local_path:
            transcoded_path = upload_path  # remember for cleanup
            print(f"[worker] Transcoded to {upload_filename}")
        else:
            print(f"[worker] Already MP3, skipping transcode")

        # --- processing ---
        track.status = "processing"
        db.commit()
        publish(event="track.processing", track_id=track_id, filename=upload_filename)
        print(f"[worker] Uploading track {track_id} ({upload_filename})")

        # Upload to R2
        storage_url = upload_to_r2(upload_path, key=upload_filename)

        # --- processed ---
        track.status = "processed"
        track.storage_url = storage_url
        track.filename = upload_filename
        db.commit()
        publish(
            event="track.processed",
            track_id=track_id,
            filename=upload_filename,
            storage_url=storage_url,
        )
        print(f"[worker] Finished track {track_id} → {storage_url}")

        # Clean up temp files
        if local_path and os.path.exists(local_path):
            os.remove(local_path)
        if transcoded_path and os.path.exists(transcoded_path):
            os.remove(transcoded_path)

    except Exception as exc:
        db.rollback()
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.status = "error"
                db.commit()
        except Exception:
            pass
        if transcoded_path and os.path.exists(transcoded_path):
            os.remove(transcoded_path)
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
