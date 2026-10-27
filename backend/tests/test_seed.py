from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CareLink, Limit, Role, User
from app.seed import seed


def test_seed_creates_shopper_caregiver_link_and_limit(session: Session) -> None:
    shopper, caregiver = seed(session)

    assert shopper.role == Role.shopper
    assert caregiver.role == Role.caregiver
    assert session.get(CareLink, (shopper.id, caregiver.id)) is not None
    limit = session.get(Limit, shopper.id)
    assert limit is not None
    assert limit.per_order_max == Decimal("100.00")


def test_seed_is_idempotent(session: Session) -> None:
    seed(session)
    seed(session)

    assert session.scalar(select(func.count()).select_from(User)) == 2
