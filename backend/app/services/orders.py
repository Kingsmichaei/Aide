"""Order state changes and price re-checks shared by the order endpoints."""

import enum
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import Actor, Limit, Order, OrderEvent, OrderStatus
from app.services.channel3 import Channel3Client, Offer, ProductDetail

PRICE_TOLERANCE = Decimal("0.05")  # CLAUDE.md payment rule 4


class RecheckResult(enum.StrEnum):
    unchanged = "unchanged"
    price_changed = "price_changed"
    retailer_changed = "retailer_changed"
    unavailable = "unavailable"


def total(order: Order) -> Decimal:
    """Full price the shopper pays. Channel3 has no delivery data yet, so delivery is 0."""
    return order.price


def record(
    session: Session,
    order: Order,
    actor: Actor,
    event: str,
    to_status: OrderStatus | None = None,
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
            detail={"event": event, **{k: _jsonable(v) for k, v in detail.items()}},
            created_at=now,
        )
    )
    if new_status != order.status:
        order.status = new_status
        order.status_changed_at = now


def create_draft(session: Session, shopper_id: int, product: ProductDetail, actor: Actor) -> Order:
    """Draft an order for the product's best offer. Drafting never moves money."""
    if product.best_offer is None:
        raise ValueError(f"Product {product.id} has no offer to draft")
    offer = product.best_offer
    order = Order(
        shopper_id=shopper_id,
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


def blocked_categories(session: Session, shopper_id: int) -> list[str]:
    limit = session.get(Limit, shopper_id)
    return list(limit.blocked_categories) if limit else []


async def recheck_price(
    session: Session, channel3: Channel3Client, order: Order
) -> tuple[RecheckResult, Offer | None]:
    """Compare the order with Channel3's live offer from the same retailer."""
    product = await channel3.get_product(
        order.channel3_product_id, blocked_categories(session, order.shopper_id)
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
    """Move the draft to the live offer and drop the confirmation; the shopper must re-confirm."""
    old = {"price": order.price, "currency": order.currency, "retailer": order.retailer}
    if offer is not None:
        order.price, order.currency, order.retailer = offer.price, offer.currency, offer.retailer
    order.confirmed_total = None
    order.confirmed_at = None
    order.confirmation_method = None
    order.confirmation_transcript = None
    record(session, order, Actor.system, result.value, OrderStatus.draft, old=old, new=offer)


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump())
    return value
