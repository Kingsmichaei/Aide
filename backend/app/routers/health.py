from fastapi import APIRouter

from app.schemas.health import Health

router = APIRouter()


@router.get("/health")
def health() -> Health:
    return Health(status="ok")
