"""Demo data: one shopper with a $100 per-order limit, and one linked caregiver.

Run with `uv run python -m app.seed`. Safe to run more than once.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CareLink, CareLinkStatus, Limit, Role, User

SHOPPER_NAME = "Rosa"
CAREGIVER_NAME = "Sam"


def seed(session: Session) -> tuple[User, User]:
    shopper = _user(session, SHOPPER_NAME, Role.shopper, address="12 Elm Street, Springfield")
    caregiver = _user(session, CAREGIVER_NAME, Role.caregiver)
    if session.get(CareLink, (shopper.id, caregiver.id)) is None:
        session.add(
            CareLink(shopper_id=shopper.id, caregiver_id=caregiver.id, status=CareLinkStatus.active)
        )
    if session.get(Limit, shopper.id) is None:
        session.add(
            Limit(
                shopper_id=shopper.id,
                per_order_max=Decimal("100.00"),
                monthly_max=Decimal("500.00"),
                currency="USD",
                blocked_categories=[],
            )
        )
    session.commit()
    return shopper, caregiver


def _user(session: Session, name: str, role: Role, address: str | None = None) -> User:
    user = session.scalar(select(User).where(User.name == name, User.role == role))
    if user is None:
        user = User(name=name, role=role, language="en", address=address)
        session.add(user)
        session.flush()
    return user


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as session:
        shopper, caregiver = seed(session)
        print(f"Shopper {shopper.name}: id {shopper.id} (set VITE_DEMO_SHOPPER_ID to this)")
        print(f"Caregiver {caregiver.name}: id {caregiver.id}")
