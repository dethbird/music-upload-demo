from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.db import Base


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    storage_url = Column(String, nullable=True)
    local_path = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
