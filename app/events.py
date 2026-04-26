import json
import os
from datetime import datetime, timezone

import redis
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.environ["REDIS_URL"]
CHANNEL = "track.events"

_redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)


def publish(event: str, track_id: int, filename: str, storage_url: str | None = None, message: str | None = None) -> None:
    payload = {
        "event": event,
        "track_id": track_id,
        "filename": filename,
        "storage_url": storage_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": message,
    }
    _redis_client.publish(CHANNEL, json.dumps(payload))
