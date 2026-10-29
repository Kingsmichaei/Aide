"""The one place service errors become HTTP responses."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.errors import ServiceError


def install(app: FastAPI) -> None:
    @app.exception_handler(ServiceError)
    async def handle(_: Request, error: ServiceError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"detail": error.body()})
