import enum


class Role(enum.StrEnum):
    shopper = "shopper"
    caregiver = "caregiver"


class CareLinkStatus(enum.StrEnum):
    pending = "pending"
    active = "active"
    revoked = "revoked"


class OrderStatus(enum.StrEnum):
    draft = "draft"
    awaiting_shopper = "awaiting_shopper"
    awaiting_caregiver = "awaiting_caregiver"
    captured = "captured"
    voided = "voided"
    refunded = "refunded"


class Decision(enum.StrEnum):
    approved = "approved"
    declined = "declined"


class ConfirmationMethod(enum.StrEnum):
    voice = "voice"
    button = "button"


class AlertKind(enum.StrEnum):
    approval_needed = "approval_needed"  # to the caregiver: an order is over a limit
    approved = "approved"  # to the shopper: the caregiver said yes, the order is paid
    declined = "declined"  # to the shopper: the caregiver said no (maybe with a note)
    payment_expired = "payment_expired"  # to the shopper: confirm and pay again


class Actor(enum.StrEnum):
    shopper = "shopper"
    caregiver = "caregiver"
    system = "system"
