import json
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import httpx
import pytest

from app.integrations.channel3 import BASE_URL, Channel3Client, Channel3Error

pytestmark = pytest.mark.anyio


def offer(
    price: float, domain: str, availability: str = "InStock", was: float | None = None
) -> dict[str, Any]:
    return {
        "url": f"https://buy.example/{domain}",
        "domain": domain,
        "price": {"price": price, "compare_at_price": was, "currency": "USD"},
        "availability": availability,
    }


def product(
    pid: str, category: str = "kettles", parent: str = "kitchen", **extra: Any
) -> dict[str, Any]:
    return {
        "id": pid,
        "title": f"Product {pid}",
        "images": [
            {"url": "https://img.example/a.jpg", "is_main_image": False},
            {
                "url": "https://img.example/b.jpg",
                "cleaned_url": "https://cdn.example/b.png",
                "is_main_image": True,
            },
        ],
        "category": {
            "slug": category,
            "title": category.title(),
            "has_children": False,
            "path": [
                {"slug": parent, "title": parent.title()},
                {"slug": category, "title": category.title()},
            ],
        },
        "offers": [
            offer(24.99, "target.com"),
            offer(19.5, "walmart.com"),
            offer(9.99, "cheap.com", "OutOfStock"),
        ],
        **extra,
    }


def client_for(
    handler: Callable[[httpx.Request], httpx.Response],
) -> tuple[Channel3Client, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    http = httpx.AsyncClient(base_url=BASE_URL, transport=httpx.MockTransport(record))
    return Channel3Client("test-key", http=http), seen


async def test_search_sends_query_and_returns_typed_products() -> None:
    client, seen = client_for(lambda _: httpx.Response(200, json={"products": [product("p1")]}))

    results = await client.search_products("kettle", max_price=Decimal("30"), limit=3)

    request = seen[0]
    assert request.method == "POST"
    assert request.url.path == "/v1/search"
    assert request.headers["x-api-key"] == "test-key"
    assert json.loads(request.content) == {
        "query": "kettle",
        "limit": 3,
        "filters": {"price": {"max_price": 30.0}},
    }
    [result] = results
    assert result.id == "p1"
    assert result.image_url == "https://cdn.example/b.png"
    assert result.category == "kettles"
    assert result.top_category == "Kitchen"  # spending is grouped by the top category
    # Cheapest in-stock offer wins; the out-of-stock $9.99 is ignored.
    assert result.best_offer is not None
    assert result.best_offer.price == Decimal("19.50")
    assert result.best_offer.retailer == "walmart.com"


@pytest.mark.parametrize(("was", "expected"), [(25, Decimal("25.00")), (19.5, None), (None, None)])
async def test_offer_keeps_was_price_only_for_a_real_discount(
    was: float | None, expected: Decimal | None
) -> None:
    on_sale = product("s", offers=[offer(19.5, "target.com", was=was)])
    client, _ = client_for(lambda _: httpx.Response(200, json={"products": [on_sale]}))

    [result] = await client.search_products("kettle")

    assert result.best_offer is not None
    assert result.best_offer.compare_at_price == expected


async def test_search_filters_blocked_categories_including_parents() -> None:
    products = [
        product("ok"),
        product("wine", category="red-wine", parent="alcohol"),
        product("knife", category="knives"),
    ]
    client, seen = client_for(lambda _: httpx.Response(200, json={"products": products}))

    results = await client.search_products(
        "gift", limit=5, blocked_categories={"alcohol", "knives"}
    )

    assert [p.id for p in results] == ["ok"]
    assert json.loads(seen[0].content)["limit"] == 10  # over-fetch to make up for dropped items


async def test_search_skips_products_with_no_in_stock_offer() -> None:
    sold_out = product("gone", offers=[offer(5, "x.com", "OutOfStock")])
    client, _ = client_for(lambda _: httpx.Response(200, json={"products": [sold_out]}))

    assert await client.search_products("anything") == []


async def test_search_truncates_to_limit() -> None:
    products = [product(f"p{i}") for i in range(5)]
    client, _ = client_for(lambda _: httpx.Response(200, json={"products": products}))

    assert len(await client.search_products("kettle", limit=2)) == 2


async def test_get_product_returns_detail_with_all_in_stock_offers() -> None:
    client, seen = client_for(
        lambda _: httpx.Response(200, json=product("p1", description="A kettle."))
    )

    detail = await client.get_product("p1")

    assert seen[0].method == "GET"
    assert seen[0].url.path == "/v1/products/p1"
    assert detail is not None
    assert detail.description == "A kettle."
    assert [o.retailer for o in detail.offers] == ["target.com", "walmart.com"]


async def test_get_product_returns_none_when_not_found() -> None:
    client, _ = client_for(lambda _: httpx.Response(404, json={"detail": "Product not found"}))

    assert await client.get_product("missing") is None


async def test_get_product_returns_none_when_blocked() -> None:
    client, _ = client_for(lambda _: httpx.Response(200, json=product("p1")))

    assert await client.get_product("p1", blocked_categories={"kitchen"}) is None


async def test_find_similar_posts_product_id() -> None:
    client, seen = client_for(lambda _: httpx.Response(200, json={"products": [product("p2")]}))

    results = await client.find_similar("p1", limit=4)

    assert seen[0].url.path == "/v1/similar"
    assert json.loads(seen[0].content) == {"product_id": "p1", "limit": 4}
    assert [p.id for p in results] == ["p2"]


async def test_errors_raise_channel3_error() -> None:
    client, _ = client_for(lambda _: httpx.Response(402, json={"detail": "No credits"}))

    with pytest.raises(Channel3Error, match="HTTP 402"):
        await client.search_products("kettle")


def category(slug: str, title: str, *parents: tuple[str, str]) -> dict[str, Any]:
    path = [{"slug": s, "title": t} for s, t in parents] + [{"slug": slug, "title": title}]
    return {"slug": slug, "title": title, "path": path, "has_children": False}


async def test_root_categories_follow_pages() -> None:
    pages = {
        "1": [category(f"c{i}", f"Cat {i}") for i in range(100)],
        "2": [category("health", "Health")],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        page = request.url.params["page"]
        return httpx.Response(
            200, json={"items": pages[page], "page": int(page), "page_size": 100, "total": 101}
        )

    client, seen = client_for(handler)

    roots = await client.list_root_categories()

    assert len(roots) == 101
    assert roots[-1].slug == "health"
    assert seen[0].url.path == "/v1/categories"
    assert seen[0].url.params["roots_only"] == "true"
    assert len(seen) == 2


async def test_search_categories_returns_paths() -> None:
    hit = category("vitamins", "Vitamins", ("health", "Health"))
    client, seen = client_for(lambda _: httpx.Response(200, json={"categories": [hit]}))

    [result] = await client.search_categories("vitamins")

    assert (result.slug, result.title, result.path) == (
        "vitamins",
        "Vitamins",
        ["Health", "Vitamins"],
    )
    assert seen[0].url.path == "/v1/categories/search"
    assert seen[0].url.params["query"] == "vitamins"


async def test_get_category_is_none_when_unknown() -> None:
    client, _ = client_for(lambda _: httpx.Response(404, json={"detail": "Not found"}))

    assert await client.get_category("not-a-category") is None
