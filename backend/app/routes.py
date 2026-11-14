import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo.errors import DuplicateKeyError

from . import logic
from .config import settings
from .db import get_db
from .routes_planner import home_data
from .routes_together import question_summary
from .routes_memories import last_note, release_capsules
from .realtime import emit
from .security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api")

MAX_PHOTO_CHARS = 400_000  # data URL, già ridimensionata dal client


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- modelli ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=40)
    invite_code: str | None = None

    @field_validator("email")
    @classmethod
    def lower(cls, v):
        return v.lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def lower(cls, v):
        return v.lower()


class JoinIn(BaseModel):
    invite_code: str


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    photo: str | None = None  # data URL; stringa vuota = rimuovi
    theme: str | None = None  # chiaro | scuro | auto
    notifications: dict | None = None

    @field_validator("theme")
    @classmethod
    def theme_ok(cls, v):
        if v is not None and v not in ("chiaro", "scuro", "auto"):
            raise ValueError("Tema non valido")
        return v

    @field_validator("photo")
    @classmethod
    def photo_ok(cls, v):
        if v and (not v.startswith("data:image/") or len(v) > MAX_PHOTO_CHARS):
            raise ValueError("Foto non valida o troppo grande")
        return v


class CoupleIn(BaseModel):
    start_date: date | None = None
    modules: dict[str, bool] | None = None


class DeleteIn(BaseModel):
    password: str


# ---------- helper ----------
def public_user(u: dict) -> dict:
    return {
        "id": u["_id"],
        "email": u["email"],
        "name": u["name"],
        "photo": u.get("photo"),
        "theme": u.get("theme", "auto"),
        "notifications": u.get("notifications", {"master": True, "types": dict(logic.NOTIFICATION_TYPES)}),
        "couple_id": u.get("couple_id"),
    }


async def public_couple(c: dict) -> dict:
    members = []
    async for m in get_db().users.find({"_id": {"$in": c["members"]}}):
        members.append({"id": m["_id"], "name": m["name"], "photo": m.get("photo")})
    return {
        "id": c["_id"],
        "invite_code": c["invite_code"],
        "start_date": c.get("start_date"),
        "modules": {**logic.MODULES, **c.get("modules", {})},
        "members": members,
        "paired": len(c["members"]) == 2,
    }


async def create_couple_for(user_id: str) -> dict:
    db = get_db()
    for _ in range(10):
        couple = {
            "_id": str(uuid.uuid4()),
            "invite_code": logic.new_invite_code(),
            "members": [user_id],
            "start_date": None,
            "modules": dict(logic.MODULES),
            "created_at": now(),
        }
        try:
            await db.couples.insert_one(couple)
            return couple
        except DuplicateKeyError:
            continue
    raise HTTPException(500, "Impossibile generare il codice invito")


async def attach_to_couple(user: dict, code: str) -> dict:
    """Collega `user` allo spazio con quel codice. Se aveva uno spazio proprio
    (da solo), i suoi contenuti passano in quello condiviso."""
    db = get_db()
    target = await db.couples.find_one({"invite_code": code.strip().upper()})
    if not target:
        raise HTTPException(404, "Codice invito non valido")
    if user["_id"] in target["members"]:
        raise HTTPException(400, "Sei già in questo spazio")
    if len(target["members"]) >= 2:
        raise HTTPException(400, "Questo spazio è già completo")

    old_id = user.get("couple_id")
    if old_id:
        old = await db.couples.find_one({"_id": old_id})
        if old and len(old["members"]) > 1:
            raise HTTPException(400, "Sei già collegato a un partner")
        for coll in logic.COUPLE_COLLECTIONS:
            await db[coll].update_many({"couple_id": old_id}, {"$set": {"couple_id": target["_id"]}})
        if old:
            await db.couples.delete_one({"_id": old_id})
            if not target.get("start_date") and old.get("start_date"):
                await db.couples.update_one({"_id": target["_id"]}, {"$set": {"start_date": old["start_date"]}})

    await db.couples.update_one({"_id": target["_id"]}, {"$push": {"members": user["_id"]}})
    await emit(target["_id"], "couple", "updated", None, user["_id"])
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"couple_id": target["_id"]}})
    return await db.couples.find_one({"_id": target["_id"]})


async def user_couple(user: dict) -> dict:
    c = await get_db().couples.find_one({"_id": user.get("couple_id")})
    if not c:
        raise HTTPException(404, "Spazio di coppia non trovato")
    return c


# ---------- auth ----------
@router.post("/auth/register")
async def register(body: RegisterIn):
    db = get_db()
    if await db.users.count_documents({}) >= settings.max_users:
        raise HTTPException(403, "Questa app è privata: le registrazioni sono chiuse")
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(409, "Esiste già un account con questa email")

    if body.invite_code:  # valido il codice prima di creare l'utente
        target = await db.couples.find_one({"invite_code": body.invite_code.strip().upper()})
        if not target:
            raise HTTPException(404, "Codice invito non valido")
        if len(target["members"]) >= 2:
            raise HTTPException(400, "Questo spazio è già completo")

    user = {
        "_id": str(uuid.uuid4()),
        "email": body.email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "photo": None,
        "theme": "auto",
        "notifications": {"master": True, "types": dict(logic.NOTIFICATION_TYPES)},
        "couple_id": None,
        "created_at": now(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(409, "Esiste già un account con questa email")

    if body.invite_code:
        await attach_to_couple(user, body.invite_code)
    else:
        couple = await create_couple_for(user["_id"])
        user["couple_id"] = couple["_id"]
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"couple_id": couple["_id"]}})

    user = await db.users.find_one({"_id": user["_id"]})
    return {"token": create_token(user["_id"]), "user": public_user(user)}


class ResetIn(BaseModel):
    email: EmailStr
    code: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower(cls, v):
        return v.lower()


RESET_MINUTES = 15


@router.post("/auth/reset-code")
async def reset_code(user: dict = Depends(current_user)):
    """Il partner (già dentro) genera un codice monouso per far reimpostare la password all'altro."""
    couple = await get_db().couples.find_one({"_id": user.get("couple_id")})
    partner = next((m for m in (couple or {}).get("members", []) if m != user["_id"]), None)
    if not partner:
        raise HTTPException(400, "Il partner non è ancora collegato")
    code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
    await get_db().password_resets.replace_one(
        {"_id": partner},
        {"_id": partner, "code_hash": hash_password(code), "tries": 0,
         "expires": (datetime.now(timezone.utc) + timedelta(minutes=RESET_MINUTES)).isoformat()},
        upsert=True)
    return {"code": code, "minutes": RESET_MINUTES}


@router.post("/auth/reset")
async def reset_password(body: ResetIn):
    db = get_db()
    user = await db.users.find_one({"email": body.email})
    bad = HTTPException(400, "Codice non valido o scaduto")
    if not user:
        raise bad
    r = await db.password_resets.find_one({"_id": user["_id"]})
    if not r or r["expires"] < datetime.now(timezone.utc).isoformat() or r["tries"] >= 5:
        raise bad
    if not verify_password(body.code.strip().upper(), r["code_hash"]):
        await db.password_resets.update_one({"_id": user["_id"]}, {"$inc": {"tries": 1}})
        raise bad
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_resets.delete_one({"_id": user["_id"]})
    return {"token": create_token(user["_id"]), "user": public_user(user)}


@router.post("/auth/login")
async def login(body: LoginIn):
    user = await get_db().users.find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o password non corrette")
    return {"token": create_token(user["_id"]), "user": public_user(user)}


# ---------- profilo ----------
@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@router.patch("/me")
async def update_me(body: ProfileIn, user: dict = Depends(current_user)):
    update: dict = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.photo is not None:
        update["photo"] = body.photo or None
    if body.theme is not None:
        update["theme"] = body.theme
    if body.notifications is not None:
        current = public_user(user)["notifications"]
        types = {**current["types"]}
        for k, v in (body.notifications.get("types") or {}).items():
            if k in logic.NOTIFICATION_TYPES:
                types[k] = bool(v)
        update["notifications"] = {"master": bool(body.notifications.get("master", current["master"])), "types": types}
    if update:
        await get_db().users.update_one({"_id": user["_id"]}, {"$set": update})
    if user.get("couple_id"):
        await emit(user["couple_id"], "couple", "updated", None, user["_id"])
    return public_user(await get_db().users.find_one({"_id": user["_id"]}))


@router.delete("/me", status_code=204)
async def delete_me(body: DeleteIn, user: dict = Depends(current_user)):
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(403, "Password errata")
    db = get_db()
    couple = await db.couples.find_one({"_id": user.get("couple_id")})
    if couple:
        remaining = [m for m in couple["members"] if m != user["_id"]]
        if remaining:
            await db.couples.update_one({"_id": couple["_id"]}, {"$set": {"members": remaining}})
        else:
            for coll in logic.COUPLE_COLLECTIONS:
                await db[coll].delete_many({"couple_id": couple["_id"]})
            await db.couples.delete_one({"_id": couple["_id"]})
    await db.cycle.delete_many({"user_id": user["_id"]})
    await db.cycle_settings.delete_many({"user_id": user["_id"]})
    await db.users.delete_one({"_id": user["_id"]})


# ---------- coppia ----------
@router.post("/couple/join")
async def join(body: JoinIn, user: dict = Depends(current_user)):
    couple = await attach_to_couple(user, body.invite_code)
    return await public_couple(couple)


@router.get("/couple")
async def get_couple(user: dict = Depends(current_user)):
    return await public_couple(await user_couple(user))


@router.patch("/couple")
async def update_couple(body: CoupleIn, user: dict = Depends(current_user)):
    couple = await user_couple(user)
    update: dict = {}
    if body.start_date is not None:
        if body.start_date > logic.today_rome():
            raise HTTPException(400, "La data di inizio non può essere nel futuro")
        update["start_date"] = body.start_date.isoformat()
    if body.modules is not None:
        update["modules"] = {**couple.get("modules", {}), **{k: v for k, v in body.modules.items() if k in logic.MODULES}}
    if update:
        await get_db().couples.update_one({"_id": couple["_id"]}, {"$set": update})
        await emit(couple["_id"], "couple", "updated", None, user["_id"])
    return await public_couple(await user_couple(user))


# ---------- home ----------
@router.get("/home")
async def home(user: dict = Depends(current_user)):
    couple = await user_couple(user)
    pc = await public_couple(couple)
    today = logic.today_rome()
    out = {"couple": pc, "days_together": None, "milestone": None, "today": today.isoformat(),
           # riempiti dai moduli delle fasi successive
           "daily_question": None, "next_events": [], "due_tasks": [], "last_note": None}
    out.update(await home_data({"cid": couple["_id"]}))
    _c = {"cid": couple["_id"], "user": user, "couple": couple}
    await release_capsules(_c)
    out["unread_notifications"] = await get_db().notifications.count_documents(
        {"couple_id": couple["_id"], "to": user["_id"], "read": False})
    out["last_note"] = await last_note(_c)
    out["daily_question"] = await question_summary({"cid": couple["_id"], "user": user, "couple": couple,
        "partner_id": next((m for m in couple["members"] if m != user["_id"]), None)})
    if couple.get("start_date"):
        start = date.fromisoformat(couple["start_date"])
        out["days_together"] = logic.days_together(start, today)
        out["milestone"] = logic.milestone_info(start, today)
    return out


# ---------- esportazione ----------
@router.get("/export")
async def export(user: dict = Depends(current_user)):
    db = get_db()
    couple = await user_couple(user)
    data = {"exported_at": now(), "user": public_user(user), "couple": await public_couple(couple)}
    for coll in logic.COUPLE_COLLECTIONS:
        data[coll] = [d async for d in db[coll].find({"couple_id": couple["_id"]})]
    for d in data.get("vault", []):  # i segreti restano cifrati nel database: non si esportano
        d.pop("secret_enc", None)
    data["cycle"] = [d async for d in db.cycle.find({"user_id": user["_id"]})]  # solo i propri dati
    return data
