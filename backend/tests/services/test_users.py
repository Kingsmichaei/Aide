import pytest
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models import Theme, User
from app.services import users


@pytest.fixture
def maya(session: Session) -> User:
    user = User(name="Maya Chen")
    session.add_all([user, User(name="Leo Martin")])
    session.commit()
    return user


def test_everyone_is_listed_in_sign_up_order(session: Session, maya: User) -> None:
    assert [u.name for u in users.everyone(session)] == ["Maya Chen", "Leo Martin"]


def test_get_finds_a_user_or_says_not_found(session: Session, maya: User) -> None:
    assert users.get(session, maya.id) is maya
    with pytest.raises(NotFound):
        users.get(session, 999)


def test_update_profile_trims_text_and_saves(session: Session, maya: User) -> None:
    users.update_profile(session, maya, {"name": "  Maya C.  ", "theme": Theme.dark})

    session.expire_all()
    saved = session.get(User, maya.id)
    assert saved is not None
    assert saved.name == "Maya C."
    assert saved.theme == Theme.dark


def test_update_profile_refuses_fields_that_are_not_the_profile(
    session: Session, maya: User
) -> None:
    with pytest.raises(ValueError, match="id"):
        users.update_profile(session, maya, {"id": 2})
