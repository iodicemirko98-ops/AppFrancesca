"""Fase 5 (privato): cassaforte con PIN e cifratura, ciclo (dati personali, condivisibili solo su scelta)."""
import base64
import hashlib
from datetime import date, datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import logic
from .config import settings
from .db import get_db
from .routes_planner import changed, clean, ctx, get_owned, new_id, now
from .security import hash_password, verify_password

router = APIRouter(prefix="/api")

VAULT_TOKEN_MIN = 10
MAX_PIN_TRIES = 5
LOCK_MIN = 5


def fernet() -> Fernet:
    key = hashlib.sha256(("vault:" + (settings.vault_key or settings.jwt_secret)).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


# ================= CASSAFORTE =================
VAULT_KINDS = ["codice", "documento", "accesso", "altro"]


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class PinChange(BaseModel):
    old_pin: str
    new_pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class VaultIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    secret: str = Field(min_length=1, max_length=2000)
    kind: str = "altro"
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("kind")
    @classmethod
    def kind_ok(cls, v):
        if v not in VAULT_KINDS:
            raise ValueError("Tipo non valido")
        return v


class VaultPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    secret: str | None = Field(default=None, min_length=1, max_length=2000)
    kind: str | None = None
    notes: str | None = Field(default=None, max_length=300)


def vault_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=VAULT_TOKEN_MIN)
    return jwt.encode({"sub": user_id, "vault": True, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def require_unlock(c: dict, token: str | None):
    try:
        p = jwt.decode(token or "", settings.jwt_secret, algorithms=["HS256"])
        ok = p.get("vault") and p.get("sub") == c["user"]["_id"]
    except jwt.PyJWTError:
        ok = False
    if not ok:
        raise HTTPException(403, "Cassaforte bloccata: inserisci il PIN")


@router.get("/vault/status")
async def vault_status(c: dict = Depends(ctx)):
    return {"has_pin": bool(c["user"].get("vault_pin_hash"))}


@router.post("/vault/pin", status_code=201)
async def set_pin(body: PinIn, c: dict = Depends(ctx)):
    if c["user"].get("vault_pin_hash"):
        raise HTTPException(409, "Hai già un PIN: usa «Cambia PIN»")
    await get_db().users.update_one({"_id": c["user"]["_id"]}, {"$set": {"vault_pin_hash": hash_password(body.pin), "vault_fails": 0}})
    return {"token": vault_token(c["user"]["_id"]), "minutes": VAULT_TOKEN_MIN}


@router.post("/vault/unlock")
async def unlock(body: PinIn, c: dict = Depends(ctx)):
    u = c["user"]
    if not u.get("vault_pin_hash"):
        raise HTTPException(409, "Crea prima un PIN")
    lock = u.get("vault_locked_until")
    if lock and datetime.fromisoformat(lock) > datetime.now(timezone.utc):
        raise HTTPException(429, f"Troppi tentativi: riprova tra qualche minuto")
    if not verify_password(body.pin, u["vault_pin_hash"]):
        fails = u.get("vault_fails", 0) + 1
        upd = {"vault_fails": fails}
        if fails >= MAX_PIN_TRIES:
            upd = {"vault_fails": 0, "vault_locked_until": (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MIN)).isoformat()}
        await get_db().users.update_one({"_id": u["_id"]}, {"$set": upd})
        raise HTTPException(403, "PIN errato")
    await get_db().users.update_one({"_id": u["_id"]}, {"$set": {"vault_fails": 0, "vault_locked_until": None}})
    return {"token": vault_token(u["_id"]), "minutes": VAULT_TOKEN_MIN}


@router.post("/vault/pin/change")
async def change_pin(body: PinChange, c: dict = Depends(ctx)):
    u = c["user"]
    if not u.get("vault_pin_hash") or not verify_password(body.old_pin, u["vault_pin_hash"]):
        raise HTTPException(403, "PIN attuale errato")
    await get_db().users.update_one({"_id": u["_id"]}, {"$set": {"vault_pin_hash": hash_password(body.new_pin)}})
    return {"ok": True}


def vault_view(d: dict, reveal: bool) -> dict:
    out = {"id": d["_id"], "label": d["label"], "kind": d["kind"], "notes": d.get("notes"), "created_by": d["created_by"],
           "created_at": d["created_at"]}
    if reveal:
        try:
            out["secret"] = fernet().decrypt(d["secret_enc"].encode()).decode()
        except InvalidToken:
            out["secret"] = None
            out["error"] = "Non decifrabile: la chiave di cifratura è cambiata"
    return out


@router.get("/vault")
async def list_vault(c: dict = Depends(ctx), x_vault_token: str | None = Header(default=None)):
    require_unlock(c, x_vault_token)
    docs = [d async for d in get_db().vault.find({"couple_id": c["cid"]})]
    docs.sort(key=lambda d: d["label"].lower())
    return [vault_view(d, True) for d in docs]


@router.post("/vault", status_code=201)
async def add_vault(body: VaultIn, c: dict = Depends(ctx), x_vault_token: str | None = Header(default=None)):
    require_unlock(c, x_vault_token)
    doc = {"_id": new_id(), "couple_id": c["cid"], "label": body.label.strip(), "kind": body.kind, "notes": body.notes,
           "secret_enc": fernet().encrypt(body.secret.encode()).decode(), "created_by": c["user"]["_id"], "created_at": now()}
    await get_db().vault.insert_one(doc)
    await changed(c, "vault", "created", doc["_id"])
    return vault_view(doc, True)


@router.patch("/vault/{id}")
async def patch_vault(id: str, body: VaultPatch, c: dict = Depends(ctx), x_vault_token: str | None = Header(default=None)):
    require_unlock(c, x_vault_token)
    d = await get_db().vault.find_one({"_id": id, "couple_id": c["cid"]})
    if not d:
        raise HTTPException(404, "Elemento non trovato")
    data = body.model_dump(exclude_unset=True)
    if data.get("kind") and data["kind"] not in VAULT_KINDS:
        raise HTTPException(422, "Tipo non valido")
    if "secret" in data:
        data["secret_enc"] = fernet().encrypt(data.pop("secret").encode()).decode()
    if data:
        await get_db().vault.update_one({"_id": id}, {"$set": data})
    await changed(c, "vault", "updated", id)
    return vault_view(await get_db().vault.find_one({"_id": id}), True)


@router.delete("/vault/{id}")
async def delete_vault(id: str, c: dict = Depends(ctx), x_vault_token: str | None = Header(default=None)):
    require_unlock(c, x_vault_token)
    r = await get_db().vault.delete_one({"_id": id, "couple_id": c["cid"]})
    if not r.deleted_count:
        raise HTTPException(404, "Elemento non trovato")
    await changed(c, "vault", "deleted", id)
    return {"ok": True}


# ================= CICLO (privato) =================
class PeriodIn(BaseModel):
    start: str
    end: str | None = None

    @field_validator("start", "end")
    @classmethod
    def d_ok(cls, v):
        if v:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("Data non valida")
        return v


class CycleSettings(BaseModel):
    share: bool | None = None
    cycle_length: int | None = Field(default=None, ge=20, le=45)
    period_length: int | None = Field(default=None, ge=2, le=10)


def predict(periods: list[dict], st: dict, today: date) -> dict:
    starts = sorted(date.fromisoformat(p["start"]) for p in periods)
    gaps = [(b - a).days for a, b in zip(starts, starts[1:]) if 15 <= (b - a).days <= 60][-6:]
    length = round(sum(gaps) / len(gaps)) if gaps else st.get("cycle_length", 28)
    out = {"cycle_length": length, "estimated": not gaps, "day": None, "next_start": None, "ovulation": None,
           "fertile_from": None, "fertile_to": None, "days_to_next": None}
    if not starts:
        return out
    last = starts[-1]
    nxt = last + timedelta(days=length)
    ov = nxt - timedelta(days=14)
    out.update(day=(today - last).days + 1, next_start=nxt.isoformat(), ovulation=ov.isoformat(),
               fertile_from=(ov - timedelta(days=5)).isoformat(), fertile_to=(ov + timedelta(days=1)).isoformat(),
               days_to_next=(nxt - today).days)
    return out


async def my_cycle(c: dict) -> dict:
    uid = c["user"]["_id"]
    db = get_db()
    st = await db.cycle_settings.find_one({"user_id": uid}) or {"share": False, "cycle_length": 28, "period_length": 5}
    periods = [p async for p in db.cycle.find({"user_id": uid})]
    periods.sort(key=lambda p: p["start"], reverse=True)
    return {"settings": {"share": st.get("share", False), "cycle_length": st.get("cycle_length", 28), "period_length": st.get("period_length", 5)},
            "periods": [{"id": p["_id"], "start": p["start"], "end": p.get("end")} for p in periods],
            "prediction": predict(periods, st, logic.today_rome())}


@router.get("/cycle")
async def get_cycle(c: dict = Depends(ctx)):
    return await my_cycle(c)


@router.post("/cycle/periods", status_code=201)
async def add_period(body: PeriodIn, c: dict = Depends(ctx)):
    if body.end and body.end < body.start:
        raise HTTPException(422, "La fine non può precedere l'inizio")
    if body.start > logic.today_rome().isoformat():
        raise HTTPException(422, "La data non può essere nel futuro")
    db = get_db()
    if await db.cycle.find_one({"user_id": c["user"]["_id"], "start": body.start}):
        raise HTTPException(409, "C'è già un ciclo che inizia quel giorno")
    await db.cycle.insert_one({"_id": new_id(), "user_id": c["user"]["_id"], "start": body.start, "end": body.end, "created_at": now()})
    return await my_cycle(c)


@router.patch("/cycle/periods/{id}")
async def patch_period(id: str, body: PeriodIn, c: dict = Depends(ctx)):
    r = await get_db().cycle.update_one({"_id": id, "user_id": c["user"]["_id"]}, {"$set": {"start": body.start, "end": body.end}})
    if not r.matched_count:
        raise HTTPException(404, "Elemento non trovato")
    return await my_cycle(c)


@router.delete("/cycle/periods/{id}")
async def delete_period(id: str, c: dict = Depends(ctx)):
    r = await get_db().cycle.delete_one({"_id": id, "user_id": c["user"]["_id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Elemento non trovato")
    return await my_cycle(c)


@router.put("/cycle/settings")
async def put_settings(body: CycleSettings, c: dict = Depends(ctx)):
    data = body.model_dump(exclude_unset=True, exclude_none=True)
    if data:
        await get_db().cycle_settings.update_one({"user_id": c["user"]["_id"]}, {"$set": data}, upsert=True)
    return await my_cycle(c)


@router.get("/cycle/partner")
async def partner_cycle(c: dict = Depends(ctx)):
    """Solo un riassunto minimo, e solo se il partner ha scelto di condividerlo."""
    pid = c["partner_id"]
    st = await get_db().cycle_settings.find_one({"user_id": pid}) if pid else None
    if not st or not st.get("share"):
        return None  # il partner non condivide nulla
    periods = [p async for p in get_db().cycle.find({"user_id": pid})]
    pr = predict(periods, st, logic.today_rome())
    return {"day": pr["day"], "next_start": pr["next_start"], "days_to_next": pr["days_to_next"], "estimated": pr["estimated"]}
