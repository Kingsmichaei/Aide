import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import SpendingRule


def test_sqlite_enforces_foreign_keys(session: Session) -> None:
    session.add(SpendingRule(user_id=999, blocked_categories=[]))

    with pytest.raises(IntegrityError):
        session.commit()
