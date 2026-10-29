from collections.abc import Iterator
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str, **kwargs: Any) -> Engine:
    """Postgres in production, SQLite for local development and tests."""
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True, **kwargs)

    # FastAPI runs sync endpoints in a thread pool, so connections cross threads.
    engine = create_engine(url, connect_args={"check_same_thread": False}, **kwargs)

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
        # SQLite ignores foreign keys unless asked, per connection; Postgres always enforces them.
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with SessionLocal() as session:
        yield session
