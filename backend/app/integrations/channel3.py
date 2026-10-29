"""Channel3 product search and categories.

Docs: https://channel3.ai/docs/api-reference/v1/search and .../v1/list-categories
"""

from collections.abc import Collection
from decimal import Decimal
from typing import Any

import httpx
from pydantic import BaseModel

BASE_URL = "https://api.trychannel3.com"
MAX_LIMIT = 30  # API maximum for search and similar
CATEGORY_PAGE_SIZE = 100  # API maximum for /v1/categories
CATEGORY_SEARCH_LIMIT = 20  # API maximum for /v1/categories/search


class Channel3Error(Exception):
    pass


class Offer(BaseModel):
    price: Decimal
    # The retailer's "was" price when the item is on sale.
    compare_at_price: Decimal | None = None
    currency: str
    retailer: str
    url: str


class Product(BaseModel):
    id: str
    title: str
    image_url: str | None
    category: str | None  # the product's own category slug, e.g. "vitamins"
    # Title of the top-level category, e.g. "Health": what spending is grouped by.
    top_category: str | None = None
    best_offer: Offer | None


class ProductDetail(Product):
    description: str | None
    offers: list[Offer]


class Category(BaseModel):
    slug: str
    title: str
    # Titles from the root down to this category, e.g. ["Health", "Vitamins"].
    path: list[str]


class Channel3Client:
    def __init__(self, api_key: str, http: httpx.AsyncClient | None = None) -> None:
        self._http = http or httpx.AsyncClient(base_url=BASE_URL, timeout=15)
        self._headers = {"x-api-key": api_key}

    async def search_products(
        self,
        query: str,
        max_price: Decimal | None = None,
        limit: int = 5,
        blocked_categories: Collection[str] = (),
    ) -> list[Product]:
        body: dict[str, Any] = {"query": query, "limit": _fetch_limit(limit, blocked_categories)}
        if max_price is not None:
            body["filters"] = {"price": {"max_price": float(max_price)}}
        data = await self._request("POST", "/v1/search", json=body)
        return _summaries(data["products"], limit, blocked_categories)

    async def get_product(
        self, product_id: str, blocked_categories: Collection[str] = ()
    ) -> ProductDetail | None:
        """Return the product, or None if it doesn't exist or is in a blocked category."""
        data = await self._request("GET", f"/v1/products/{product_id}", allow_404=True)
        if data is None or _is_blocked(data, blocked_categories):
            return None
        offers = _in_stock_offers(data)
        return ProductDetail(
            **_summary(data, offers).model_dump(),
            description=data.get("description"),
            offers=offers,
        )

    async def find_similar(
        self, product_id: str, limit: int = 5, blocked_categories: Collection[str] = ()
    ) -> list[Product]:
        body = {"product_id": product_id, "limit": _fetch_limit(limit, blocked_categories)}
        data = await self._request("POST", "/v1/similar", json=body)
        return _summaries(data["products"], limit, blocked_categories)

    async def list_root_categories(self, max_pages: int = 5) -> list[Category]:
        """Top-level categories. Blocking one blocks everything under it."""
        categories: list[Category] = []
        for page in range(1, max_pages + 1):
            params = {"roots_only": "true", "page": page, "page_size": CATEGORY_PAGE_SIZE}
            data = await self._request("GET", "/v1/categories", params=params)
            categories += [_category(raw) for raw in data["items"]]
            if page * data["page_size"] >= data["total"]:
                break
        return categories

    async def search_categories(self, query: str) -> list[Category]:
        params = {"query": query, "limit": CATEGORY_SEARCH_LIMIT}
        data = await self._request("GET", "/v1/categories/search", params=params)
        return [_category(raw) for raw in data["categories"]]

    async def get_category(self, slug: str) -> Category | None:
        data = await self._request("GET", f"/v1/categories/{slug}", allow_404=True)
        return None if data is None else _category(data)

    async def _request(
        self, method: str, path: str, *, allow_404: bool = False, **kwargs: Any
    ) -> Any:
        response = await self._http.request(method, path, headers=self._headers, **kwargs)
        if allow_404 and response.status_code == 404:
            return None
        if response.is_error:
            raise Channel3Error(f"Channel3 {method} {path} failed: HTTP {response.status_code}")
        return response.json()


def _category(raw: dict[str, Any]) -> Category:
    path = [ref["title"] for ref in raw.get("path") or []] or [raw["title"]]
    return Category(slug=raw["slug"], title=raw["title"], path=path)


def _fetch_limit(limit: int, blocked_categories: Collection[str]) -> int:
    # Ask for extra when we may drop some, so the user still gets `limit` results.
    return min(limit * 2 if blocked_categories else limit, MAX_LIMIT)


def _summaries(
    products: list[dict[str, Any]], limit: int, blocked_categories: Collection[str]
) -> list[Product]:
    results: list[Product] = []
    for raw in products:
        if _is_blocked(raw, blocked_categories):
            continue
        summary = _summary(raw, _in_stock_offers(raw))
        if summary.best_offer is None:
            continue
        results.append(summary)
        if len(results) == limit:
            break
    return results


def _is_blocked(raw: dict[str, Any], blocked_categories: Collection[str]) -> bool:
    """True if the product's category, or any ancestor of it, is blocked."""
    if not blocked_categories:
        return False
    category = raw.get("category") or {}
    slugs = {category.get("slug")} | {ref.get("slug") for ref in category.get("path") or []}
    return not slugs.isdisjoint(blocked_categories)


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _was_price(price: dict[str, Any]) -> Decimal | None:
    was = price.get("compare_at_price")
    if was is None:
        return None
    # Only a real discount counts as a sale.
    return _money(was) if _money(was) > _money(price["price"]) else None


def _in_stock_offers(raw: dict[str, Any]) -> list[Offer]:
    return [
        Offer(
            price=_money(offer["price"]["price"]),
            compare_at_price=_was_price(offer["price"]),
            currency=offer["price"]["currency"],
            retailer=offer["domain"],
            url=offer["url"],
        )
        for offer in raw.get("offers") or []
        if offer.get("availability") == "InStock"
    ]


def _summary(raw: dict[str, Any], offers: list[Offer]) -> Product:
    return Product(
        id=raw["id"],
        title=raw["title"],
        image_url=_main_image(raw.get("images") or []),
        category=(raw.get("category") or {}).get("slug"),
        top_category=_top_category(raw.get("category") or {}),
        best_offer=min(offers, key=lambda offer: offer.price, default=None),
    )


def _top_category(category: dict[str, Any]) -> str | None:
    path = category.get("path") or []
    root = path[0] if path else category
    return root.get("title") or None


def _main_image(images: list[dict[str, Any]]) -> str | None:
    if not images:
        return None
    image = next((img for img in images if img.get("is_main_image")), images[0])
    return image.get("cleaned_url") or image.get("url")
