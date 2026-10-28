import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CareLink, CareLinkStatus


def test_sqlite_enforces_foreign_keys(session: Session) -> None:
    session.add(CareLink(shopper_id=998, caregiver_id=999, status=CareLinkStatus.active))

    with pytest.raises(IntegrityError):
        session.commit()
