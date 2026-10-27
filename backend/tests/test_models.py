import app.models  # noqa: F401
from app.db import Base


def test_all_seven_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {
        "users",
        "care_links",
        "limits",
        "conversations",
        "orders",
        "approvals",
        "recurring_orders",
    }
