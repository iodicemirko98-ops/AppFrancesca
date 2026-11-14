from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
import asyncio

from .db import init_indexes
from . import scheduler
from .push import router as push_router
from .realtime import router as ws_router
from .routes import router
from .routes_planner import router as planner_router
from .routes_together import router as together_router
from .routes_memories import router as memories_router
from .routes_money import router as money_router
from .routes_private import router as private_router
from .routes_fun import router as fun_router
from .routes_trivia import router as trivia_router
from .routes_photos import router as photos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_indexes()
    if settings.reset_email and len(settings.reset_password) >= 8:
        from .db import get_db
        from .security import hash_password
        await get_db().users.update_one({"email": settings.reset_email.strip().lower()}, {"$set": {"password_hash": hash_password(settings.reset_password)}})
    task = asyncio.create_task(scheduler.loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="NoiDue", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(planner_router)
app.include_router(together_router)
app.include_router(memories_router)
app.include_router(money_router)
app.include_router(private_router)
app.include_router(fun_router)
app.include_router(trivia_router)
app.include_router(photos_router)
app.include_router(ws_router)
app.include_router(push_router)


@app.get("/health")
async def health():
    return {"ok": True}
