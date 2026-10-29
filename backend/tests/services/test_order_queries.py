"""Drafting, ownership and the order list (state changes are covered via the API)."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.errors import NotFound, Upstream
from app.integrations.channel3 import Channel3Error, Offer, ProductDetail
from app.models import Order, OrderStatus, User
from app.services import orders

OFFER = Offer(price=Decimal("39.99"), currency="USD", retailer="target.com", url="https://x")


class FakeChannel3:
    def __init__(self, product: ProductDetail | None = None, down: bool = False) -> None:
        self.product = product
        self.down = down
        self.blocked: list[str] | None = None

    async def get_product(self, product_id: str, blocked: list[str]) -> ProductDetail | None:
        if self.down:
            raise Channel3Error("down")
        self.blocked = list(blocked)
        return self.product


def kettle(offer: Offer | None = OFFER) -> ProductDetail:
    return ProductDetail(
        id="c3-1",
        title="Kettle",
        image_url=None,
        category="kettles",
        top_category="Kitchen",
        best_offer=offer,
        description=None,
        offers=[offer] if offer else [],
    )


@pytest.fixture
def maya(session: Session) -> User:
    user = User(name="Maya")
    session.add(user)
    session.commit()
    return user


@pytest.mark.anyio
async def test_draft_product_drafts_the_best_offer(session: Session, maya: User) -> None:
    order = await orders.draft_product(session, FakeChannel3(kettle()), maya.id, "c3-1")  # type: ignore[arg-type]

    assert order.status == OrderStatus.draft
    assert (order.title, order.price, order.retailer, order.category) == (
        "Kettle",
        Decimal("39.99"),
        "target.com",
        "Kitchen",
    )


@pytest.mark.anyio
@pytest.mark.parametrize("product", [None, kettle(offer=None)])
async def test_draft_product_refuses_what_cannot_be_bought(
    session: Session, maya: User, product: ProductDetail | None
) -> None:
    with pytest.raises(NotFound):
        await orders.draft_product(session, FakeChannel3(product), maya.id, "c3-1")  # type: ignore[arg-type]


@pytest.mark.anyio
async def test_draft_product_reports_channel3_down(session: Session, maya: User) -> None:
    with pytest.raises(Upstream):
        await orders.draft_product(session, FakeChannel3(down=True), maya.id, "c3-1")  # type: ignore[arg-type]


def test_own_hides_other_peoples_orders(session: Session, maya: User) -> None:
    leo = User(name="Leo")
    session.add(leo)
    session.flush()
    order = Order(
        user_id=leo.id,
        channel3_product_id="c3-1",
        title="Kettle",
        retailer="target.com",
        price=Decimal("39.99"),
        currency="USD",
    )
    session.add(order)
    session.commit()

    assert orders.own(session, order.id, leo.id) is order
    with pytest.raises(NotFound):
        orders.own(session, order.id, maya.id)


def test_placed_leaves_out_drafts(session: Session, maya: User) -> None:
    for status in (OrderStatus.draft, OrderStatus.captured):
        session.add(
            Order(
                user_id=maya.id,
                channel3_product_id="c3-1",
                title=status.value,
                retailer="target.com",
                price=Decimal("1"),
                currency="USD",
                status=status,
            )
        )
    session.commit()

    assert [o.title for o in orders.placed(session, maya.id)] == ["captured"]
