"""Orders: drafting, the user's list, state changes and price re-checks.

Shared by the orders API, checkout and the agent.
"""

import enum
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, Upstream
from app.integrations.channel3 import Channel3Client, Channel3Error, Offer, ProductDetail
from app.models import Actor, Order, OrderEvent, OrderStatus
from app.services.rules import blocked_categories

PRICE_TOLERANCE = Decimal("0.05")  # CLAUDE.md payment rule 4


class RecheckResult(enum.StrEnum):
    unchanged = "unchanged"
    price_changed = "price_changed"
    retailer_changed = "retailer_changed"
    unavailable = "unavailable"


def total(order: Order) -> Decimal:
    """Full price the user pays. Channel3 has no delivery data yet, so delivery is 0."""
    return order.price


def record(
    session: Session,
    order: Order,
    actor: Actor,
    event: str,
    to_status: OrderStatus | None = None,
    note: str | None = None,
    **detail: Any,
) -> None:
    """Log a state change on the order; also moves it to `to_status` if given."""
    now = datetime.now(UTC)
    new_status = to_status or order.status
    session.add(
        OrderEvent(
            order_id=order.id,
            from_status=order.status,
            to_status=new_status,
            actor=actor,
            note=note,
            detail={"event": event, **{k: _jsonable(v) for k, v in detail.items()}},
            created_at=now,
        )
    )
    if new_status != order.status:
        order.status = new_status
        order.status_changed_at = now


def create_draft(session: Session, user_id: int, product: ProductDetail, actor: Actor) -> Order:
    """Draft an order for the product's best offer. Drafting never moves money."""
    if product.best_offer is None:
        raise ValueError(f"Product {product.id} has no offer to draft")
    offer = product.best_offer
    order = Order(
        user_id=user_id,
        channel3_product_id=product.id,
        title=product.title,
        retailer=offer.retailer,
        category=product.top_category,
        price=offer.price,
        currency=offer.currency,
        status=OrderStatus.draft,
    )
    session.add(order)
    session.flush()
    record(session, order, actor, "drafted", offer=offer)
    return order


async def draft_product(
    session: Session, channel3: Channel3Client, user_id: int, product_id: str
) -> Order:
    """Draft an order for a Channel3 product the user tapped Buy on."""
    try:
        product = await channel3.get_product(product_id, blocked_categories(session, user_id))
    except Channel3Error as error:
        raise Upstream("Product search is unavailable") from error
    if product is None or product.best_offer is None:
        raise NotFound("Product not available")
    order = create_draft(session, user_id, product, Actor.user)
    session.commit()
    return order


def own(session: Session, order_id: int, user_id: int) -> Order:
    """The order, if it belongs to the user. Others get "not found" (not
    "forbidden"), so order ids can't be probed."""
    order = session.get(Order, order_id)
    if order is None or order.user_id != user_id:
        raise NotFound("Order not found")
    return order


def placed(session: Session, user_id: int) -> list[Order]:
    """Every order the user confirmed or went further with, newest first."""
    return list(
        session.scalars(
            select(Order)
            .where(Order.user_id == user_id, Order.status != OrderStatus.draft)
            .order_by(Order.created_at.desc(), Order.id.desc())
        )
    )


def events(session: Session, order: Order) -> list[OrderEvent]:
    """The order's history, oldest first."""
    return list(
        session.scalars(
            select(OrderEvent).where(OrderEvent.order_id == order.id).order_by(OrderEvent.id)
        )
    )


async def recheck_price(
    session: Session, channel3: Channel3Client, order: Order
) -> tuple[RecheckResult, Offer | None]:
    """Compare the order with Channel3's live offer from the same retailer."""
    product = await channel3.get_product(
        order.channel3_product_id, blocked_categories(session, order.user_id)
    )
    if product is None or product.best_offer is None:
        return RecheckResult.unavailable, None
    same_retailer = next(
        (
            offer
            for offer in product.offers
            if offer.retailer == order.retailer and offer.currency == order.currency
        ),
        None,
    )
    if same_retailer is None:
        return RecheckResult.retailer_changed, product.best_offer
    if abs(same_retailer.price - order.price) > order.price * PRICE_TOLERANCE:
        return RecheckResult.price_changed, same_retailer
    return RecheckResult.unchanged, same_retailer


def apply_new_offer(
    session: Session, order: Order, result: RecheckResult, offer: Offer | None
) -> None:
    """Move the order to the live offer and drop the confirmation; the user must re-confirm."""
    old = {"price": order.price, "currency": order.currency, "retailer": order.retailer}
    if offer is not None:
        order.price, order.currency, order.retailer = offer.price, offer.currency, offer.retailer
    clear_confirmation(order)
    record(session, order, Actor.system, result.value, OrderStatus.draft, old=old, new=offer)


def clear_confirmation(order: Order) -> None:
    """Forget the user's yes; they will be asked again with the new figures."""
    order.confirmed_total = None
    order.confirmed_at = None
    order.confirmation_method = None
    order.confirmation_transcript = None


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump())
    return value
