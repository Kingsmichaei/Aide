from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import error_handlers
from app.core import logging as app_logging
from app.core.config import get_settings
from app.routers import auth, chat, health, insights, me, notifications, orders, rules

app_logging.configure(get_settings().log_level)

app = FastAPI(title="Aide API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
error_handlers.install(app)

for router in (auth, me, chat, orders, rules, insights, notifications, health):
    app.include_router(router.router)
