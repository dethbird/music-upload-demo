# Music Upload System

1. API (FastAPI)
    - receives upload
    - stores metadata in Postgres
2. Storage
    - upload to object storage (GCS/S3)
3. Event emitted
    - "track.uploaded"
4. Workers consume event
    - transcode audio
    - generate waveform
    - update DB
5. Redis
    - caching metadata
6. Scaling
    - stateless API → horizontal scaling
    - queue handles spikes

Tradeoffs:

- async processing = eventual consistency
- need retry handling

## Technical Details from Job Decription

**Role Highlights:**

- Build end-to-end scalable products
- Work with Python (FastAPI), React, TypeScript
- Design event-driven systems (Redis, Pub/Sub)
- Use AI tools to accelerate development
- Collaborate across Product, Data & Engineering

**Tech Stack:**

- Backend: Python, FastAPI, SQLAlchemy, Postgres
- Frontend: React, TypeScript, Tailwind
- Infra: Docker, Kubernetes (GKE), GCP

---

# Implementation idea

Yes. Build a small demo called:

# Music Upload Event Pipeline

Core interview point:

> “The API should stay fast. Upload handling stores metadata and emits an event. Heavy work like transcoding and waveform generation happens asynchronously in workers.”

Important correction: **Redis Pub/Sub is not durable**. For real production, I’d prefer **GCP Pub/Sub, Redis Streams, Celery/RQ, or a queue**. Redis Pub/Sub is fine for a demo, but say that out loud.

---

# Minimal Project Shape

```txt
music-upload-demo/
  app/
    main.py
    db.py
    models.py
    events.py
    worker.py
  docker-compose.yml
  requirements.txt
```

---

# FastAPI Upload Endpoint

```py
# app/main.py

from fastapi import FastAPI, UploadFile, File
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Track
from app.events import publish_track_uploaded

app = FastAPI()

@app.post("/tracks/upload")
async def upload_track(file: UploadFile = File(...)):
    db: Session = SessionLocal()

    try:
        # In real life: upload file to GCS/S3 here
        storage_url = f"gs://music-uploads/{file.filename}"

        track = Track(
            filename=file.filename,
            storage_url=storage_url,
            status="uploaded"
        )

        db.add(track)
        db.commit()
        db.refresh(track)

        publish_track_uploaded({
            "track_id": track.id,
            "storage_url": storage_url,
            "filename": file.filename,
        })

        return {
            "track_id": track.id,
            "status": "uploaded",
            "message": "Processing started"
        }

    finally:
        db.close()
```

---

# SQLAlchemy Model

```py
# app/models.py

from sqlalchemy import Column, Integer, String
from app.db import Base

class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    storage_url = Column(String, nullable=False)
    status = Column(String, nullable=False, default="uploaded")
```

---

# DB Setup

```py
# app/db.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/music"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()
```

---

# Event Publisher

```py
# app/events.py

import json
import redis

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

def publish_track_uploaded(payload: dict):
    redis_client.publish("track.uploaded", json.dumps(payload))
```

---

# Worker

```py
# app/worker.py

import json
import time
import redis
from app.db import SessionLocal
from app.models import Track

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

pubsub = redis_client.pubsub()
pubsub.subscribe("track.uploaded")

print("Worker listening for track.uploaded events...")

for message in pubsub.listen():
    if message["type"] != "message":
        continue

    event = json.loads(message["data"])

    track_id = event["track_id"]
    print(f"Processing track {track_id}")

    db = SessionLocal()

    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            print(f"Track {track_id} not found")
            continue

        track.status = "processing"
        db.commit()

        # Simulate expensive work
        time.sleep(3)

        # Real life:
        # - transcode audio
        # - generate waveform
        # - extract metadata
        # - update search index

        track.status = "processed"
        db.commit()

        print(f"Finished processing track {track_id}")

    except Exception as e:
        print(f"Failed processing track {track_id}: {e}")

    finally:
        db.close()
```

---

# Interview Explanation

Memorize this:

```md
The upload API should do the minimum synchronous work needed:
1. validate request
2. store metadata
3. store the file
4. emit an event
5. return quickly

Anything expensive, like transcoding or waveform generation, belongs in async workers.

That makes the API more responsive and lets worker capacity scale independently.
```

---

# Production Caveat

Say this proactively:

```md
For a demo, Redis Pub/Sub is fine.

For production, I would not rely on plain Pub/Sub because messages can be lost if workers are offline.

I’d use:
- GCP Pub/Sub
- Redis Streams
- Celery/RQ
- or another durable queue

The important production features are:
- retries
- dead-letter queues
- idempotency
- observability
```

That is a very strong answer.

---

# Grilling Questions

Practice these:

1. What happens if the worker is down when the event is published?
2. What happens if the same event is processed twice?
3. How would you retry failed transcodes?
4. How would you prevent a user from accessing another artist’s tracks?
5. Where would you store the actual audio file?
6. Why not transcode inside the request?
7. How would you show upload progress in the UI?
8. How would you make this horizontally scalable?
9. What metrics would you track?
10. How would you test this?

Best answer theme:

> “The API is stateless, workers scale independently, the queue absorbs spikes, and every background job should be idempotent.”

That’s the interview language.
