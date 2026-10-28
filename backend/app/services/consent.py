"""Is a spoken answer to "Shall I buy it?" a clear yes?

Only short, explicit answers count. The whole answer must match the list after
light cleaning, so "yes, how much again?", "maybe" or "I think so" are never a
yes. Answers in any of Aide's languages count: a Spanish speaker saying "yes"
still means yes.
"""

import re
import unicodedata
from typing import Literal

Answer = Literal["yes", "no", "unclear"]

YES: dict[str, set[str]] = {
    "en": {
        "yes",
        "yeah",
        "yep",
        "yes please",
        "yes buy it",
        "yes please buy it",
        "yes i do",
        "yes i want it",
    },
    "es": {
        "si",  # accents are removed before matching, so this is also "sí"
        "si por favor",
        "si compralo",
        "si lo quiero",
        "si gracias",
        "claro que si",
    },
    "fr": {
        "oui",
        "ouais",
        "oui merci",
        "oui s il vous plait",
        "oui achetez le",
        "oui achete le",
        "oui je le veux",
    },
    "ar": {
        "نعم",
        "اجل",
        "ايوه",
        "ايوا",
        "نعم من فضلك",
        "نعم اشتره",
        "نعم اشتريه",
        "نعم اريده",
    },
}

NO: dict[str, set[str]] = {
    "en": {"no", "nope", "no thanks", "no thank you", "don't", "do not", "cancel"},
    "es": {"no", "no gracias", "no lo quiero", "cancelar"},
    "fr": {"non", "non merci", "je ne veux pas", "annuler"},
    "ar": {"لا", "لا شكرا", "لا اريده", "الغاء"},
}

# Arabic short vowels and other marks, plus the tatweel stretch character.
_ARABIC_MARKS = re.compile("[\u064b-\u065f\u0670\u0640]")
_ARABIC_ALEF = re.compile("[\u0622\u0623\u0625]")  # alef with madda or hamza


def normalise(text: str) -> str:
    text = _ARABIC_ALEF.sub("\u0627", _ARABIC_MARKS.sub("", text))  # -> bare alef
    # Drop accents on Latin letters (sí -> si) but keep Arabic letters intact.
    text = "".join(
        char
        for char in unicodedata.normalize("NFD", text.casefold())
        if not unicodedata.combining(char)
    )
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[^\w\s']", " ", text).replace("'", " ")
    return " ".join(text.split())


# Cleaned the same way as answers, so "don't" and "sí" match.
_YES = {normalise(yes) for words in YES.values() for yes in words}
_NO = {normalise(no) for words in NO.values() for no in words}


def classify(transcript: str) -> Answer:
    answer = normalise(transcript)
    if answer in _YES:
        return "yes"
    if answer in _NO:
        return "no"
    return "unclear"
