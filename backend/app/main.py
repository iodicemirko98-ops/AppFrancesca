from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_indexes
from .realtime import router as ws_router
from .routes import router
from .routes_planner import router as planner_router
from .routes_together import router as together_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_indexes()
    yield


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
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"ok": True}
