"""Notifiche push (Web Push / VAPID). Le chiavi si generano da sole al primo avvio e restano nel database."""
import asyncio
import base64
import json
import logging

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


log = logging.getLogger("noidue.push")
LAST_ERROR = {"text": ""}
SUBJECT = "https://app-francesca.vercel.app"  # Apple rifiuta soggetti non validi (es. mailto: con dominio inesistente)


def _send(sub: dict, payload: str, vapid: Vapid):
    """Invia una notifica. Restituisce None se ok, altrimenti lo status HTTP (0/-1 se sconosciuto)."""
    from pywebpush import WebPushException, webpush
    LAST_ERROR["text"] = ""
    try:
        webpush(subscription_info=sub, data=payload, vapid_private_key=vapid, vapid_claims={"sub": SUBJECT}, ttl=86400, timeout=10,
                headers={"Urgency": "high"})
        return None
    except WebPushException as e:
        code = getattr(e.response, "status_code", None) or 0
        body = ""
        try:
            body = e.response.text[:200]
        except Exception:
            pass
        LAST_ERROR["text"] = f"{code} {body or e}"
        log.warning("push rifiutato: %s", LAST_ERROR["text"])
        return code
    except Exception as e:  # noqa: BLE001
        LAST_ERROR["text"] = f"{type(e).__name__}: {e}"
        log.exception("push non inviato")
        return -1


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


@router.post("/test")
async def test_push(c: dict = Depends(ctx)):
    """Notifica di prova a tutti i dispositivi dell'utente, con l'esito vero di ogni invio."""
    db = get_db()
    subs = [x async for x in db.push_subs.find({"user_id": c["user"]["_id"]})]
    if not subs:
        return {"devices": 0, "results": []}
    vapid = await get_vapid()
    payload = json.dumps({"title": "NoiDue", "body": "Prova riuscita: le notifiche funzionano ✅", "url": "/", "tag": "prova"})
    loop = asyncio.get_running_loop()
    results = []
    for x in subs:
        st = await loop.run_in_executor(None, _send, {"endpoint": x["endpoint"], "keys": x["keys"]}, payload, vapid)
        host = x["endpoint"].split("/")[2]
        results.append({"host": host, "ok": st is None, "status": st, "error": LAST_ERROR["text"] if st is not None else ""})
        if st in (404, 410):
            await db.push_subs.delete_one({"_id": x["_id"]})
    return {"devices": len(subs), "results": results}
