"""Typed service errors. app.core.error_handlers maps them to HTTP responses.

Services raise these instead of HTTPException, so they stay free of FastAPI.
"""

from typing import Any


class ServiceError(Exception):
    status_code = 400

    def __init__(self, message: str, **detail: Any) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail

    def body(self) -> Any:
        # Plain message, or a message plus machine-readable detail for the app.
        return {"message": self.message, **self.detail} if self.detail else self.message


class NotFound(ServiceError):
    status_code = 404


class Forbidden(ServiceError):
    status_code = 403


class Invalid(ServiceError):
    status_code = 422


class Conflict(ServiceError):
    """The request no longer fits the order's state (e.g. already paid)."""

    status_code = 409


class Upstream(ServiceError):
    """A partner API (PayPal, Channel3, the LLM) failed; nothing was changed."""

    status_code = 502


class Unavailable(ServiceError):
    status_code = 503
