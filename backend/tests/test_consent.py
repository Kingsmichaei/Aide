import pytest

from app.services.consent import classify


@pytest.mark.parametrize(
    "answer",
    [
        # English
        "yes",
        "Yes.",
        "Yeah!",
        "yes please",
        "Yes, buy it.",
        # Spanish, with and without the accent speech engines sometimes drop
        "sí",
        "Sí.",
        "si",
        "Sí, por favor",
        "Sí, cómpralo",
        # French
        "oui",
        "Oui !",
        "Oui, s'il vous plaît",
        "oui merci",
        # Arabic, with and without short-vowel marks and hamza
        "نعم",
        "نَعَم",
        "أجل",
        "نعم، من فضلك",
    ],
)
def test_explicit_yes_in_each_language(answer: str) -> None:
    assert classify(answer) == "yes"


@pytest.mark.parametrize(
    "answer", ["no", "No.", "no thanks", "Don't", "no gracias", "Non, merci", "لا", "لا، شكراً"]
)
def test_explicit_no(answer: str) -> None:
    assert classify(answer) == "no"


@pytest.mark.parametrize(
    "answer",
    [
        "maybe",
        "how much again?",
        "yes, how much again?",  # a question, not a yes
        "I think so",
        "yes no",
        "sure",  # not on the list: only short, explicit answers count
        "okay",
        "",
        "   ",
        "¿cuánto cuesta?",
        "peut-être",
        "ربما",
    ],
)
def test_anything_else_is_unclear(answer: str) -> None:
    assert classify(answer) == "unclear"
