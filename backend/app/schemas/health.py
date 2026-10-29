"""Request and response models for /health."""

from pydantic import BaseModel


class Health(BaseModel):
    status: str
