from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, care, chat, health, notifications, orders, shoppers

app = FastAPI(title="Aide API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(care.router)
app.include_router(notifications.router)
app.include_router(orders.router)
app.include_router(chat.router)
app.include_router(shoppers.router)
