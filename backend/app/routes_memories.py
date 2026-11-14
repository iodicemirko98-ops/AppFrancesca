"""Fase 4: desideri e radar regali, buono a sapersi, note/capsule/storie, viaggi."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import logic
from .db import get_db
from .realtime import emit
from .routes_planner import changed, clean, ctx, get_owned, new_id, notify, notify_to, now, soft_delete

router = APIRouter(prefix="/api")


def check_date(v: str | None, month_ok: bool = False):
    if not v:
        return None
    try:
        date.fromisoformat(v if len(v) == 10 else v + "-01") if month_ok else date.fromisoformat(v)
    except ValueError:
        raise ValueError("Data non valida")
    return v


# ================= DESIDERI E RADAR REGALI =================
class WishIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    url: str | None = Field(default=None, max_length=500)
    price: float | None = Field(default=None, ge=0, le=1_000_000)
    notes: str | None = Field(default=None, max_length=600)
    for_partner: bool = False  # True = idea regalo segreta per il partner

    @field_validator("url")
    @classmethod
    def url_ok(cls, v):
        if v and not v.lower().startswith(("http://", "https://")):
            raise ValueError("Il link deve iniziare con http:// o https://")
        return v or None


class WishPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    url: str | None = Field(default=None, max_length=500)
    price: float | None = Field(default=None, ge=0, le=1_000_000)
    notes: str | None = Field(default=None, max_length=600)

    @field_validator("url")
    @classmethod
    def url_ok(cls, v):
        return WishIn.url_ok(v)


def wish_view(w: dict, c: dict) -> dict:
    me = c["user"]["_id"]
    mine = w["owner"] == me
    out = {"id": w["_id"], "title": w["title"], "url": w.get("url"), "price": w.get("price"), "notes": w.get("notes"),
           "owner": w["owner"], "mine": mine, "secret": w.get("secret", False), "received": w.get("received", False),
           "created_at": w["created_at"]}
    # chi riceve il regalo non deve mai sapere se qualcuno l'ha già preso
    out["claimed"] = (not mine) and bool(w.get("claimed_by"))
    return out


def can_see(w: dict, me: str) -> bool:
    return not w.get("secret") or w["added_by"] == me


@router.get("/wishes")
async def list_wishes(c: dict = Depends(ctx)):
    me = c["user"]["_id"]
    docs = [w async for w in get_db().wishes.find({"couple_id": c["cid"], "deleted_at": None}) if can_see(w, me)]
    docs.sort(key=lambda w: (w.get("received", False), w["created_at"]))
    return [wish_view(w, c) for w in docs]


@router.post("/wishes", status_code=201)
async def create_wish(body: WishIn, c: dict = Depends(ctx)):
    me = c["user"]["_id"]
    if body.for_partner and not c["partner_id"]:
        raise HTTPException(409, "Collega prima il tuo partner")
    doc = {"_id": new_id(), "couple_id": c["cid"], "title": body.title.strip(), "url": body.url, "price": body.price,
           "notes": body.notes, "owner": c["partner_id"] if body.for_partner else me, "secret": body.for_partner,
           "added_by": me, "claimed_by": None, "received": False, "created_at": now(), "deleted_at": None}
    await get_db().wishes.insert_one(doc)
    if body.for_partner:  # nessun evento al partner: è una sorpresa
        await emit(c["cid"], "wishes", "created", doc["_id"], me, only_user=me)
    else:
        await changed(c, "wishes", "created", doc["_id"])
        await notify(c, "regali", f"{c['user']['name']} ha aggiunto «{doc['title']}» ai suoi desideri", "/desideri")
    return wish_view(doc, c)


async def get_wish(id: str, c: dict) -> dict:
    w = await get_owned("wishes", id, c)
    if not can_see(w, c["user"]["_id"]):
        raise HTTPException(404, "Elemento non trovato")
    return w


async def wish_changed(c: dict, w: dict, op: str):
    me = c["user"]["_id"]
    await emit(c["cid"], "wishes", op, w["_id"], me, only_user=me if w.get("secret") else None)


@router.patch("/wishes/{id}")
async def patch_wish(id: str, body: WishPatch, c: dict = Depends(ctx)):
    w = await get_wish(id, c)
    me = c["user"]["_id"]
    if w["owner"] != me and w["added_by"] != me:
        raise HTTPException(403, "Puoi modificare solo i tuoi desideri")
    data = body.model_dump(exclude_unset=True)
    if data:
        await get_db().wishes.update_one({"_id": id}, {"$set": data})
    await wish_changed(c, w, "updated")
    return wish_view(await get_owned("wishes", id, c), c)


@router.delete("/wishes/{id}")
async def delete_wish(id: str, c: dict = Depends(ctx)):
    w = await get_wish(id, c)
    me = c["user"]["_id"]
    if w["owner"] != me and w["added_by"] != me:
        raise HTTPException(403, "Puoi eliminare solo i tuoi desideri")
    await get_db().wishes.update_one({"_id": id}, {"$set": {"deleted_at": now(), "deleted_by": me}})
    await wish_changed(c, w, "deleted")
    return {"ok": True}


@router.post("/wishes/{id}/claim")
async def claim_wish(id: str, c: dict = Depends(ctx)):
    """«Lo regalo io»: lo sa solo chi lo regala, mai chi lo riceve."""
    w = await get_wish(id, c)
    me = c["user"]["_id"]
    if w["owner"] == me or w.get("secret"):
        raise HTTPException(409, "Puoi prenotare solo i desideri del partner")
    val = None if w.get("claimed_by") == me else me
    await get_db().wishes.update_one({"_id": id}, {"$set": {"claimed_by": val}})
    await emit(c["cid"], "wishes", "updated", id, me, only_user=me)
    return wish_view(await get_owned("wishes", id, c), c)


@router.post("/wishes/{id}/received")
async def received_wish(id: str, c: dict = Depends(ctx)):
    w = await get_wish(id, c)
    if w["owner"] != c["user"]["_id"]:
        raise HTTPException(403, "Solo chi lo riceve può segnarlo come ricevuto")
    await get_db().wishes.update_one({"_id": id}, {"$set": {"received": not w.get("received", False), "claimed_by": None}})
    await changed(c, "wishes", "updated", id)
    return wish_view(await get_owned("wishes", id, c), c)


# ================= BUONO A SAPERSI =================
FACT_CATEGORIES = ["taglie", "gusti", "famiglia", "salute", "indirizzi", "altro"]


class FactIn(BaseModel):
    subject: str  # id utente oppure "both"
    category: str = "altro"
    label: str = Field(min_length=1, max_length=60)
    value: str = Field(min_length=1, max_length=300)

    @field_validator("category")
    @classmethod
    def cat_ok(cls, v):
        if v not in FACT_CATEGORIES:
            raise ValueError("Categoria non valida")
        return v


class FactPatch(BaseModel):
    category: str | None = None
    label: str | None = Field(default=None, min_length=1, max_length=60)
    value: str | None = Field(default=None, min_length=1, max_length=300)


@router.get("/facts")
async def list_facts(c: dict = Depends(ctx)):
    docs = [clean(f) async for f in get_db().facts.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda f: (f["category"], f["label"].lower()))
    return docs


@router.post("/facts", status_code=201)
async def create_fact(body: FactIn, c: dict = Depends(ctx)):
    if body.subject != "both" and body.subject not in c["couple"]["members"]:
        raise HTTPException(422, "Persona non valida")
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    await get_db().facts.insert_one(doc)
    await changed(c, "facts", "created", doc["_id"])
    return clean(doc)


@router.patch("/facts/{id}")
async def patch_fact(id: str, body: FactPatch, c: dict = Depends(ctx)):
    await get_owned("facts", id, c)
    data = body.model_dump(exclude_unset=True)
    if data.get("category") and data["category"] not in FACT_CATEGORIES:
        raise HTTPException(422, "Categoria non valida")
    if data:
        await get_db().facts.update_one({"_id": id}, {"$set": data})
    await changed(c, "facts", "updated", id)
    return clean(await get_owned("facts", id, c))


@router.delete("/facts/{id}")
async def delete_fact(id: str, c: dict = Depends(ctx)):
    await soft_delete("facts", id, c)
    return {"ok": True}


# ================= NOTE, CAPSULE, STORIE =================
NOTE_KINDS = ["nota", "capsula", "storia"]


class NoteIn(BaseModel):
    kind: str = "nota"
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=8000)
    unlock_on: str | None = None  # capsule: giorno di apertura
    on_date: str | None = None  # storie: giorno del ricordo (YYYY-MM-DD o YYYY-MM)
    pinned: bool = False

    @field_validator("kind")
    @classmethod
    def kind_ok(cls, v):
        if v not in NOTE_KINDS:
            raise ValueError("Tipo non valido")
        return v

    @field_validator("unlock_on")
    @classmethod
    def unlock_ok(cls, v):
        return check_date(v)

    @field_validator("on_date")
    @classmethod
    def on_ok(cls, v):
        return check_date(v, month_ok=True)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=8000)
    unlock_on: str | None = None
    on_date: str | None = None
    pinned: bool | None = None

    @field_validator("unlock_on")
    @classmethod
    def unlock_ok(cls, v):
        return check_date(v)

    @field_validator("on_date")
    @classmethod
    def on_ok(cls, v):
        return check_date(v, month_ok=True)


def note_view(n: dict) -> dict:
    out = clean(n)
    out.pop("released", None)
    if n["kind"] == "capsula" and n["unlock_on"] > logic.today_rome().isoformat():
        out["locked"] = True
        out["body"] = None
        out["days_left"] = (date.fromisoformat(n["unlock_on"]) - logic.today_rome()).days
    else:
        out["locked"] = False
    return out


async def release_capsules(c: dict):
    """Quando una capsula si apre, avvisa entrambi (una sola volta)."""
    db = get_db()
    today = logic.today_rome().isoformat()
    async for n in db.notes.find({"couple_id": c["cid"], "kind": "capsula", "deleted_at": None, "released": {"$ne": True},
                                  "unlock_on": {"$lte": today}}):
        await db.notes.update_one({"_id": n["_id"]}, {"$set": {"released": True}})
        for uid in c["couple"]["members"]:
            await notify_to(c["cid"], uid, n["created_by"], "capsule", f"La capsula «{n['title']}» si è aperta! ✉️", "/note")


@router.get("/notes")
async def list_notes(kind: str | None = Query(default=None), c: dict = Depends(ctx)):
    await release_capsules(c)
    q = {"couple_id": c["cid"], "deleted_at": None}
    if kind:
        if kind not in NOTE_KINDS:
            raise HTTPException(422, "Tipo non valido")
        q["kind"] = kind
    docs = [d async for d in get_db().notes.find(q)]
    docs.sort(key=lambda n: (not n.get("pinned", False), n.get("on_date") or n.get("unlock_on") or n["created_at"]), reverse=False)
    # le più recenti prima, ma le fissate in cima
    pinned = sorted([n for n in docs if n.get("pinned")], key=lambda n: n["created_at"], reverse=True)
    rest = sorted([n for n in docs if not n.get("pinned")], key=lambda n: (n.get("on_date") or n["created_at"]) if n["kind"] == "storia" else n["created_at"], reverse=True)
    return [note_view(n) for n in pinned + rest]


@router.post("/notes", status_code=201)
async def create_note(body: NoteIn, c: dict = Depends(ctx)):
    if body.kind == "capsula":
        if not body.unlock_on or body.unlock_on <= logic.today_rome().isoformat():
            raise HTTPException(422, "Scegli un giorno futuro per aprire la capsula")
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "created_by": c["user"]["_id"],
           "created_at": now(), "updated_at": now(), "deleted_at": None, "released": False}
    if body.kind != "capsula":
        doc["unlock_on"] = None
    await get_db().notes.insert_one(doc)
    await changed(c, "notes", "created", doc["_id"])
    if body.kind == "capsula":
        await notify(c, "capsule", f"{c['user']['name']} ha sigillato una capsula: si aprirà il {body.unlock_on}", "/note")
    return note_view(doc)


@router.patch("/notes/{id}")
async def patch_note(id: str, body: NotePatch, c: dict = Depends(ctx)):
    n = await get_owned("notes", id, c)
    if n["kind"] == "capsula" and n["unlock_on"] > logic.today_rome().isoformat() and n["created_by"] != c["user"]["_id"]:
        raise HTTPException(403, "La capsula è sigillata: la può modificare solo chi l'ha scritta")
    data = body.model_dump(exclude_unset=True)
    if "unlock_on" in data and n["kind"] == "capsula" and (not data["unlock_on"] or data["unlock_on"] <= logic.today_rome().isoformat()):
        raise HTTPException(422, "Scegli un giorno futuro per aprire la capsula")
    data["updated_at"] = now()
    await get_db().notes.update_one({"_id": id}, {"$set": data})
    await changed(c, "notes", "updated", id)
    return note_view(await get_owned("notes", id, c))


@router.delete("/notes/{id}")
async def delete_note(id: str, c: dict = Depends(ctx)):
    await soft_delete("notes", id, c)
    return {"ok": True}


# ================= VIAGGI =================
class TripIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    when: str | None = None  # YYYY-MM o YYYY-MM-DD
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("when")
    @classmethod
    def when_ok(cls, v):
        return check_date(v, month_ok=True)


class TripPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    when: str | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("when")
    @classmethod
    def when_ok(cls, v):
        return check_date(v, month_ok=True)


@router.get("/trips")
async def list_trips(c: dict = Depends(ctx)):
    docs = [clean(t) async for t in get_db().trips.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda t: t.get("when") or "", reverse=True)
    countries = {t["country"].strip().lower() for t in docs if t.get("country")}
    return {"items": docs, "places": len(docs), "countries": len(countries)}


@router.post("/trips", status_code=201)
async def create_trip(body: TripIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    await get_db().trips.insert_one(doc)
    await changed(c, "trips", "created", doc["_id"])
    return clean(doc)


@router.patch("/trips/{id}")
async def patch_trip(id: str, body: TripPatch, c: dict = Depends(ctx)):
    await get_owned("trips", id, c)
    data = body.model_dump(exclude_unset=True)
    if data:
        await get_db().trips.update_one({"_id": id}, {"$set": data})
    await changed(c, "trips", "updated", id)
    return clean(await get_owned("trips", id, c))


@router.delete("/trips/{id}")
async def delete_trip(id: str, c: dict = Depends(ctx)):
    await soft_delete("trips", id, c)
    return {"ok": True}


# ================= per la home =================
async def last_note(c: dict) -> dict | None:
    docs = [n async for n in get_db().notes.find({"couple_id": c["cid"], "deleted_at": None, "kind": {"$ne": "capsula"}})]
    if not docs:
        return None
    n = max(docs, key=lambda n: n["created_at"])
    return {"id": n["_id"], "title": n["title"], "kind": n["kind"], "created_by": n["created_by"], "created_at": n["created_at"]}
