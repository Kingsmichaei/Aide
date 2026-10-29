import app.models  # noqa: F401
from app.core.db import Base


def test_all_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {
        "users",
        "spending_rules",
        "conversations",
        "orders",
        "order_events",
        "notifications",
    }
