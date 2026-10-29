import enum


class OrderStatus(enum.StrEnum):
    """CLAUDE.md: draft -> confirmed -> awaiting_payment -> authorized -> captured."""

    draft = "draft"  # Aide proposed it; nothing agreed yet
    confirmed = "confirmed"  # the user said yes to these exact figures
    awaiting_payment = "awaiting_payment"  # PayPal order created; the user approves in PayPal
    authorized = "authorized"  # PayPal holds the money; capture comes next
    captured = "captured"  # paid
    voided = "voided"  # the hold was released; nothing was paid
    refunded = "refunded"
    failed = "failed"  # payment did not go through


class ConfirmationMethod(enum.StrEnum):
    voice = "voice"
    button = "button"


class Actor(enum.StrEnum):
    user = "user"
    system = "system"


class Theme(enum.StrEnum):
    light = "light"
    dark = "dark"
    system = "system"
