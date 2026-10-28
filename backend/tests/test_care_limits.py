from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import get_channel3
from app.main import app
from app.models import CareLink, CareLinkStatus, Limit, Role, User
from app.services.channel3 import Category, Channel3Error
from app.services.orders import blocked_categories

KNOWN = {
    "health": Category(slug="health", title="Health", path=["Health"]),
    "vitamins": Category(slug="vitamins", title="Vitamins", path=["Health", "Vitamins"]),
    "alcohol": Category(slug="alcohol", title="Alcohol", path=["Food", "Alcohol"]),
}


class FakeChannel3:
    def __init__(self) -> None:
        self.down = False
        self.looked_up: list[str] = []

    async def list_root_categories(self) -> list[Category]:
        return [KNOWN["health"]]

    async def search_categories(self, query: str) -> list[Category]:
        return [c for c in KNOWN.values() if query.lower() in c.title.lower()]

    async def get_category(self, slug: str) -> Category | None:
        if self.down:
            raise Channel3Error("down")
        self.looked_up.append(slug)
        return KNOWN.get(slug)


@pytest.fixture
def channel3() -> FakeChannel3:
    return FakeChannel3()


@pytest.fixture
def client(session: Session, channel3: FakeChannel3) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_channel3] = lambda: channel3
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {
        "rosa": User(name="Rosa", role=Role.shopper),
        "sam": User(name="Sam", role=Role.caregiver),
        "kim": User(name="Kim", role=Role.caregiver),
    }
    session.add_all(people.values())
    session.flush()
    session.add(
        CareLink(
            shopper_id=people["rosa"].id,
            caregiver_id=people["sam"].id,
            status=CareLinkStatus.active,
        )
    )
    session.commit()
    return people


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


def limits_url(people: dict[str, User]) -> str:
    return f"/care/shoppers/{people['rosa'].id}/limits"


GOOD = {
    "per_order_max": "100.00",
    "monthly_max": "500.00",
    "currency": "USD",
    "blocked_categories": ["alcohol", "vitamins"],
}


def test_no_limits_yet(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    assert client.get(limits_url(people)).json() == {
        "is_set": False,
        "per_order_max": None,
        "monthly_max": None,
        "currency": "USD",
        "blocked_categories": [],
    }


def test_caregiver_saves_and_reads_limits(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    sign_in(client, people["sam"])

    response = client.put(limits_url(people), json=GOOD)

    assert response.status_code == 200
    body = response.json()
    assert body["is_set"] is True
    assert (body["per_order_max"], body["monthly_max"]) == ("100.00", "500.00")
    assert body["blocked_categories"] == [
        {"slug": "alcohol", "title": "Alcohol", "path": ["Food", "Alcohol"]},
        {"slug": "vitamins", "title": "Vitamins", "path": ["Health", "Vitamins"]},
    ]
    stored = session.get(Limit, people["rosa"].id)
    assert stored.blocked_categories == ["alcohol", "vitamins"]
    assert client.get(limits_url(people)).json() == body


def test_saved_blocks_apply_to_the_shoppers_searches(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    sign_in(client, people["sam"])

    client.put(limits_url(people), json=GOOD)

    assert blocked_categories(session, people["rosa"].id) == ["alcohol", "vitamins"]


def test_unknown_categories_are_refused(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    sign_in(client, people["sam"])

    response = client.put(
        limits_url(people), json={**GOOD, "blocked_categories": ["alcohol", "booze!!"]}
    )

    assert response.status_code == 422
    assert response.json()["detail"]["unknown_categories"] == ["booze!!"]
    assert session.get(Limit, people["rosa"].id) is None


def test_only_new_categories_are_checked(
    client: TestClient, session: Session, channel3: FakeChannel3, people: dict[str, User]
) -> None:
    # A slug saved earlier (e.g. by the seed script) is kept even if Channel3 dropped it.
    session.add(
        Limit(
            shopper_id=people["rosa"].id,
            per_order_max=100,
            monthly_max=500,
            currency="USD",
            blocked_categories=["legacy-slug"],
        )
    )
    session.commit()
    sign_in(client, people["sam"])

    response = client.put(
        limits_url(people), json={**GOOD, "blocked_categories": ["legacy-slug", "health"]}
    )

    assert response.status_code == 200
    assert response.json()["blocked_categories"][0] == {
        "slug": "legacy-slug",
        "title": "Legacy slug",
        "path": ["Legacy slug"],
    }


@pytest.mark.parametrize(
    "change",
    [
        {"per_order_max": "0"},
        {"per_order_max": "-5"},
        {"monthly_max": "0"},
        {"per_order_max": "abc"},
        {"per_order_max": "10.005"},
        {"per_order_max": "200", "monthly_max": "100"},  # a month must cover one order
        {"currency": "XYZ"},
    ],
)
def test_invalid_limits_are_refused(
    client: TestClient, people: dict[str, User], change: dict[str, str]
) -> None:
    sign_in(client, people["sam"])

    assert client.put(limits_url(people), json={**GOOD, **change}).status_code == 422


def test_monthly_equal_to_per_order_is_fine(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    body = {**GOOD, "per_order_max": "50", "monthly_max": "50"}
    assert client.put(limits_url(people), json=body).status_code == 200


def test_channel3_down_gives_502(
    client: TestClient, channel3: FakeChannel3, people: dict[str, User]
) -> None:
    sign_in(client, people["sam"])
    channel3.down = True

    assert client.put(limits_url(people), json=GOOD).status_code == 502


@pytest.mark.parametrize("who", ["kim", "rosa"])
def test_only_the_linked_caregiver_can_see_or_change_limits(
    client: TestClient, people: dict[str, User], who: str
) -> None:
    sign_in(client, people[who])

    assert client.get(limits_url(people)).status_code == 403
    assert client.put(limits_url(people), json=GOOD).status_code == 403


def test_categories_list_and_search(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    assert [c["slug"] for c in client.get("/care/categories").json()] == ["health"]
    found = client.get("/care/categories", params={"query": "vit"}).json()
    assert found == [{"slug": "vitamins", "title": "Vitamins", "path": ["Health", "Vitamins"]}]


def test_shoppers_cannot_list_categories(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    assert client.get("/care/categories").status_code == 403
