import pytest
from sqlalchemy.orm import Session

from app.models import Conversation, User
from app.services import conversations
from app.services.conversations import Message


@pytest.fixture
def maya(session: Session) -> User:
    user = User(name="Maya", language="fr")
    session.add(user)
    session.commit()
    return user


def test_a_new_conversation_starts_in_the_users_language(session: Session, maya: User) -> None:
    conversation = conversations.latest_or_new(session, maya)
    session.commit()

    assert conversation.language == "fr"
    assert conversation.messages == []
    assert conversations.latest_or_new(session, maya).id == conversation.id


def test_transcript_keeps_what_was_said_not_tool_calls(session: Session, maya: User) -> None:
    session.add(
        Conversation(
            user_id=maya.id,
            language="en",
            messages=[
                {"role": "user", "text": "A kettle"},
                {"role": "model", "text": "", "raw": [{"type": "function_call"}]},
                {"role": "tool", "text": "{}"},
                {"role": "model", "text": "Here are three."},
                {"role": "user", "text": "The second"},
            ],
        )
    )
    session.commit()

    assert conversations.transcript(session, maya.id, limit=2) == [
        Message(role="aide", text="Here are three."),
        Message(role="user", text="The second"),
    ]


def test_transcript_is_empty_before_any_chat(session: Session, maya: User) -> None:
    assert conversations.transcript(session, maya.id, limit=30) == []
