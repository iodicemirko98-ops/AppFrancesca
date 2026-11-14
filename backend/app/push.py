"""Notifiche push (Web Push / VAPID). Le chiavi si generano da sole al primo avvio e restano nel database."""
import asyncio
import base64
import json

from cryptography.hazmat.primitives import serialization
from fastapi import APIRouter, Depends, HTTPException
from py_vapid import Vapid
from pydantic import BaseModel, Field

from .db import get_db
from .routes_planner import ctx, new_id, now

router = APIRouter(prefix="/api/push")

_vapid: Vapid | None = None


async def get_vapid() -> Vapid:
    global _vapid
    if _vapid is None:
        db = get_db()
        doc = await db.config.find_one({"_id": "vapid"})
        if doc:
            _vapid = Vapid.from_pem(doc["pem"].encode())
        else:
            v = Vapid()
            v.generate_keys()
            await db.config.update_one({"_id": "vapid"}, {"$setOnInsert": {"pem": v.private_pem().decode()}}, upsert=True)
            doc = await db.config.find_one({"_id": "vapid"})  # se due avvii corrono insieme vince il primo
            _vapid = Vapid.from_pem(doc["pem"].encode())
    return _vapid


def reset_vapid():
    global _vapid
    _vapid = None


def public_key_b64(v: Vapid) -> str:
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _send(sub: dict, payload: str, vapid: Vapid):
    from pywebpush import WebPushException, webpush
    try:
        webpush(subscription_info=sub, data=payload, vapid_private_key=vapid, vapid_claims={"sub": "mailto:noreply@noidue.invalid"}, ttl=86400, timeout=10)
        return None
    except WebPushException as e:
        return getattr(e.response, "status_code", None) or 0


async def push_user(user_id: str, title: str, body: str, url: str = "/", tag: str | None = None):
    """Manda una notifica a tutti i dispositivi dell'utente. Non solleva mai errori."""
    try:
        db = get_db()
        subs = [s async for s in db.push_subs.find({"user_id": user_id})]
        if not subs:
            return
        vapid = await get_vapid()
        payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
        loop = asyncio.get_running_loop()
        for s in subs:
            status = await loop.run_in_executor(None, _send, {"endpoint": s["endpoint"], "keys": s["keys"]}, payload, vapid)
            if status in (404, 410):  # il dispositivo si è disiscritto
                await db.push_subs.delete_one({"_id": s["_id"]})
    except Exception:
        pass


class SubIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000, pattern=r"^https://")
    keys: dict[str, str]


class UnsubIn(BaseModel):
    endpoint: str


@router.get("/key")
async def push_key():
    return {"key": public_key_b64(await get_vapid())}


@router.post("/subscribe", status_code=201)
async def subscribe(body: SubIn, c: dict = Depends(ctx)):
    if not body.keys.get("p256dh") or not body.keys.get("auth"):
        raise HTTPException(422, "Sottoscrizione non valida")
    await get_db().push_subs.update_one({"endpoint": body.endpoint}, {"$set": {"user_id": c["user"]["_id"], "keys": {"p256dh": body.keys["p256dh"], "auth": body.keys["auth"]}, "created_at": now()},
                                                                      "$setOnInsert": {"_id": new_id()}}, upsert=True)
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(body: UnsubIn, c: dict = Depends(ctx)):
    await get_db().push_subs.delete_many({"endpoint": body.endpoint, "user_id": c["user"]["_id"]})
    return {"ok": True}


@router.get("/status")
async def status(c: dict = Depends(ctx)):
    return {"devices": await get_db().push_subs.count_documents({"user_id": c["user"]["_id"]})}
