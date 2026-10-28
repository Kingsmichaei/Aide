"""Agent tools. The model can search and draft orders; it can never confirm or move money.

Confirming, creating PayPal orders, authorizing, capturing and voiding are server-only
(app/routers/orders.py, app/services/paypal.py) and must never be added here.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.agent.llm import ToolSpec
from app.models import Actor, Order
from app.services.channel3 import Channel3Client, Product
from app.services.orders import create_draft, total

MAX_OPTIONS = 3  # CLAUDE.md: at most three options at a time
LANGUAGES = ("en", "es", "fr", "ar")


@dataclass
class ToolContext:
    session: Session
    channel3: Channel3Client
    shopper_id: int
    blocked_categories: list[str]
    language: str = "en"  # the shopper's language setting
    products: list[Product] = field(default_factory=list)  # cards to show with the reply
    draft_order: Order | None = None
    reply_language: str | None = None  # set when the reply is in another language


@dataclass(frozen=True)
class Tool:
    spec: ToolSpec
    run: Callable[[ToolContext, dict[str, Any]], Awaitable[dict[str, Any]]]


class ToolInputError(Exception):
    pass


async def search_products(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    products = await ctx.channel3.search_products(
        _str(args, "query"),
        max_price=_optional_decimal(args, "max_price"),
        limit=MAX_OPTIONS,
        blocked_categories=ctx.blocked_categories,
    )
    return {"products": _show(ctx, products)}


async def compare_offers(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    product = await ctx.channel3.get_product(_str(args, "product_id"), ctx.blocked_categories)
    if product is None:
        return {"error": "This product is not available."}
    offers = sorted(product.offers, key=lambda offer: offer.price)[:MAX_OPTIONS]
    return {
        "product_id": product.id,
        "title": product.title,
        "offers": [
            {"retailer": o.retailer, "price": str(o.price), "currency": o.currency} for o in offers
        ],
    }


async def find_cheaper(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    product_id = _str(args, "product_id")
    current = await ctx.channel3.get_product(product_id, ctx.blocked_categories)
    if current is None or current.best_offer is None:
        return {"error": "This product is not available."}
    similar = await ctx.channel3.find_similar(
        product_id, limit=10, blocked_categories=ctx.blocked_categories
    )
    cheaper = [
        p
        for p in similar
        if p.best_offer is not None
        and p.best_offer.currency == current.best_offer.currency
        and p.best_offer.price < current.best_offer.price
    ]
    cheaper.sort(key=lambda p: p.best_offer.price if p.best_offer else Decimal(0))
    return {
        "current_price": str(current.best_offer.price),
        "cheaper_products": _show(ctx, cheaper[:MAX_OPTIONS]),
    }


async def propose_order(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    product = await ctx.channel3.get_product(_str(args, "product_id"), ctx.blocked_categories)
    if product is None or product.best_offer is None:
        return {"error": "This product is not available."}
    order = create_draft(ctx.session, ctx.shopper_id, product, Actor.system)
    ctx.draft_order = order
    return {
        "order_id": order.id,
        "title": order.title,
        "retailer": order.retailer,
        "price": str(order.price),
        "delivery": "0.00",
        "total": str(total(order)),
        "currency": order.currency,
        "next_step": "Read the total to the shopper. They confirm with the 'Yes, buy it' button.",
    }


async def reply_in_language(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    language = _str(args, "language")
    if language not in LANGUAGES:
        return {"error": f"Aide speaks only {', '.join(LANGUAGES)}. Reply in {ctx.language}."}
    ctx.reply_language = None if language == ctx.language else language
    return {
        "ok": True,
        "next_step": "Reply in this language. At the end, ask in one short sentence if they "
        "want to use it from now on. The app shows a button for that; you cannot change it.",
    }


def _spec(name: str, description: str, properties: dict[str, Any], required: list[str]):
    return ToolSpec(
        name=name,
        description=description,
        parameters={"type": "object", "properties": properties, "required": required},
    )


PRODUCT_ID = {"type": "string", "description": "Product id from an earlier search result."}

TOOLS: dict[str, Tool] = {
    tool.spec.name: tool
    for tool in [
        Tool(
            _spec(
                "search_products",
                "Search for products to buy. Returns at most 3 in-stock options with prices.",
                {
                    "query": {
                        "type": "string",
                        "description": "What the shopper wants, in English.",
                    },
                    "max_price": {"type": "number", "description": "Highest price, if given."},
                },
                ["query"],
            ),
            search_products,
        ),
        Tool(
            _spec(
                "compare_offers",
                "Compare prices for one product across stores.",
                {"product_id": PRODUCT_ID},
                ["product_id"],
            ),
            compare_offers,
        ),
        Tool(
            _spec(
                "find_cheaper",
                "Find similar products that cost less than this one.",
                {"product_id": PRODUCT_ID},
                ["product_id"],
            ),
            find_cheaper,
        ),
        Tool(
            _spec(
                "propose_order",
                "Draft an order once the shopper has picked a product. This does NOT buy "
                "anything; the shopper must confirm the total on screen first.",
                {"product_id": PRODUCT_ID},
                ["product_id"],
            ),
            propose_order,
        ),
        Tool(
            _spec(
                "reply_in_language",
                "Call this before replying when the shopper clearly writes in a different "
                "language from their setting. The app then reads your reply in that language "
                "and offers the shopper a button to switch. It changes nothing by itself.",
                {"language": {"type": "string", "enum": list(LANGUAGES)}},
                ["language"],
            ),
            reply_in_language,
        ),
    ]
}


def _show(ctx: ToolContext, products: list[Product]) -> list[dict[str, Any]]:
    ctx.products.extend(products)
    return [
        {
            "product_id": p.id,
            "title": p.title,
            "price": str(p.best_offer.price),
            "currency": p.best_offer.currency,
            "retailer": p.best_offer.retailer,
        }
        for p in products
        if p.best_offer is not None
    ]


def _str(args: dict[str, Any], key: str) -> str:
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ToolInputError(f"'{key}' must be a non-empty string")
    return value.strip()


def _optional_decimal(args: dict[str, Any], key: str) -> Decimal | None:
    value = args.get(key)
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation as error:
        raise ToolInputError(f"'{key}' must be a number") from error
