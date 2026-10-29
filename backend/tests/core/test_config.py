import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize("url", ["postgres://u:p@h/db", "postgresql://u:p@h/db"])
def test_database_url_uses_psycopg_driver(url: str) -> None:
    assert Settings(database_url=url).database_url == "postgresql+psycopg://u:p@h/db"


def test_sqlite_url_is_left_alone() -> None:
    assert Settings(database_url="sqlite:///aide.db").database_url == "sqlite:///aide.db"


def test_paypal_must_be_sandbox() -> None:
    with pytest.raises(ValidationError):
        Settings(paypal_environment="LIVE")


def test_blank_secret_key_gets_a_random_one() -> None:
    first, second = Settings(secret_key="").secret_key, Settings(secret_key="").secret_key
    assert len(first) >= 32
    assert first != second
