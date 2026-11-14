"""Fase 2: calendario, attività, liste, cestino, notifiche (tutto con sync in tempo reale)."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import logic, planner_logic as pl
from .db import get_db
from .realtime import emit, rooms
from .security import current_user

router = APIRouter(prefix="/api")

TRASH_DAYS = 7
NUDGE_COOLDOWN_S = 20
TRASHABLE = {"events": "evento", "tasks": "attività", "lists": "lista", "polls": "decisione", "bucket": "idea da fare insieme",
             "wishes": "desiderio", "facts": "informazione", "notes": "nota", "trips": "luogo",
             "goals": "obiettivo", "expenses": "spesa", "drawings": "disegno", "photos": "foto"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


async def ctx(user: dict = Depends(current_user)) -> dict:
    """Utente + coppia. Serve una coppia con almeno l'utente."""
    couple = await get_db().couples.find_one({"_id": user.get("couple_id")})
    if not couple:
        raise HTTPException(404, "Spazio di coppia non trovato")
    partner_id = next((m for m in couple["members"] if m != user["_id"]), None)
    return {"user": user, "couple": couple, "cid": couple["_id"], "partner_id": partner_id}


_BG: set = set()


async def notify_to(cid: str, to: str, from_: str | None, ntype: str, text: str, link: str | None = None) -> bool:
    """Notifica in-app + push a un utente, rispettando le sue preferenze."""
    user = await get_db().users.find_one({"_id": to})
    prefs = (user or {}).get("notifications") or {}
    if not user or prefs.get("master") is False or (prefs.get("types") or {}).get(ntype) is False:
        return False
    doc = {"_id": new_id(), "couple_id": cid, "to": to, "from": from_, "type": ntype,
           "text": text, "link": link, "read": False, "created_at": now()}
    await get_db().notifications.insert_one(doc)
    await emit(cid, "notifications", "new", doc["_id"], from_, only_user=to)
    from .push import push_user  # import tardivo: push.py usa questo modulo
    # il push (rete verso FCM/Apple) può richiedere secondi: non deve far aspettare chi sta giocando/scrivendo
    t = asyncio.create_task(push_user(to, "NoiDue", text, link or "/", tag=ntype))
    _BG.add(t)
    t.add_done_callback(_BG.discard)
    return True


async def notify(c: dict, ntype: str, text: str, link: str | None = None):
    """Notifica al partner di chi sta agendo."""
    if c["partner_id"]:
        await notify_to(c["cid"], c["partner_id"], c["user"]["_id"], ntype, text, link)


async def changed(c: dict, entity: str, op: str, id: str):
    await emit(c["cid"], entity, op, id, c["user"]["_id"])


def clean(d: dict) -> dict:
    d = dict(d)
    d["id"] = d.pop("_id")
    d.pop("couple_id", None)
    return d


async def get_owned(coll: str, id: str, c: dict, include_deleted: bool = False) -> dict:
    q = {"_id": id, "couple_id": c["cid"]}
    if not include_deleted:
        q["deleted_at"] = None
    doc = await get_db()[coll].find_one(q)
    if not doc:
        raise HTTPException(404, "Elemento non trovato")
    return doc


async def soft_delete(coll: str, id: str, c: dict):
    doc = await get_owned(coll, id, c)
    await get_db()[coll].update_one({"_id": id}, {"$set": {"deleted_at": now(), "deleted_by": c["user"]["_id"]}})
    await changed(c, coll, "deleted", id)
    return doc


# ================= EVENTI =================
class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    start: str
    end: str | None = None
    location: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    category: str = "noi"
    type: str = "evento"
    recurrence: str = "nessuna"
    reminder: int | None = Field(default=None, ge=0, le=60 * 24 * 14)  # minuti prima

    @field_validator("start", "end")
    @classmethod
    def when_ok(cls, v):
        if v is None:
            return v
        try:
            pl.parse_when(v)
        except ValueError:
            raise ValueError("Data non valida")
        return v

    @field_validator("category")
    @classmethod
    def cat_ok(cls, v):
        if v not in pl.EVENT_CATEGORIES:
            raise ValueError("Categoria non valida")
        return v

    @field_validator("type")
    @classmethod
    def type_ok(cls, v):
        if v not in pl.EVENT_TYPES:
            raise ValueError("Tipo non valido")
        return v

    @field_validator("recurrence")
    @classmethod
    def rec_ok(cls, v):
        if v not in pl.RECURRENCES:
            raise ValueError("Ricorrenza non valida")
        return v


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    start: str | None = None
    end: str | None = None
    location: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    category: str | None = None
    type: str | None = None
    recurrence: str | None = None
    reminder: int | None = Field(default=None, ge=0, le=60 * 24 * 14)


def check_range(start: str, end: str | None):
    if end:
        s, sa = pl.parse_when(start)
        e, ea = pl.parse_when(end)
        if sa != ea:
            raise HTTPException(422, "Inizio e fine devono avere lo stesso formato (giorno intero o con orario)")
        if e < s:
            raise HTTPException(422, "La fine non può precedere l'inizio")


@router.post("/events", status_code=201)
async def create_event(body: EventIn, c: dict = Depends(ctx)):
    check_range(body.start, body.end)
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    if not doc["end"]:
        doc["end"] = doc["start"]
    await get_db().events.insert_one(doc)
    await changed(c, "events", "created", doc["_id"])
    await notify(c, "eventi", f"{c['user']['name']} ha aggiunto «{doc['title']}» al calendario", "/calendario")
    return clean(doc)


@router.get("/events")
async def list_events(from_: str | None = Query(default=None, alias="from"), to: str | None = None,
                      c: dict = Depends(ctx)):
    """Occorrenze nell'intervallo [from, to] (YYYY-MM-DD). Senza intervallo: i prossimi 60 giorni."""
    from datetime import date, timedelta as td
    try:
        a = date.fromisoformat(from_) if from_ else logic.today_rome()
        b = date.fromisoformat(to) if to else a + td(days=60)
    except ValueError:
        raise HTTPException(422, "Intervallo non valido")
    if (b - a).days > 400:
        raise HTTPException(422, "Intervallo troppo ampio")
    out = []
    async for ev in get_db().events.find({"couple_id": c["cid"], "deleted_at": None}):
        for s, e in pl.expand(ev, a, b):
            out.append(pl.occurrence_doc(ev, s, e))
    out.sort(key=lambda o: (o["start"], o["title"]))
    return out


@router.get("/events/{id}")
async def get_event(id: str, c: dict = Depends(ctx)):
    return clean(await get_owned("events", id, c))


@router.patch("/events/{id}")
async def patch_event(id: str, body: EventPatch, c: dict = Depends(ctx)):
    ev = await get_owned("events", id, c)
    data = body.model_dump(exclude_unset=True)
    merged = {**ev, **data}
    # validazioni come in creazione
    EventIn(**{k: merged.get(k) for k in EventIn.model_fields if k in merged})
    check_range(merged["start"], merged.get("end"))
    if "start" in data and "end" not in data and (not ev.get("end") or ev["end"] == ev["start"]):
        data["end"] = data["start"]
    await get_db().events.update_one({"_id": id}, {"$set": data})
    await changed(c, "events", "updated", id)
    return clean(await get_owned("events", id, c))


@router.delete("/events/{id}")
async def delete_event(id: str, c: dict = Depends(ctx)):
    await soft_delete("events", id, c)
    return {"ok": True}


# ================= ATTIVITÀ =================
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    notes: str | None = Field(default=None, max_length=1000)
    due: str | None = None  # YYYY-MM-DD
    assignee: str | None = None  # id utente | "both" | None
    category_id: str | None = None

    @field_validator("due")
    @classmethod
    def due_ok(cls, v):
        if v:
            from datetime import date
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("Data non valida")
        return v or None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    notes: str | None = Field(default=None, max_length=1000)
    due: str | None = None
    assignee: str | None = None
    category_id: str | None = None
    done: bool | None = None

    @field_validator("due")
    @classmethod
    def due_ok(cls, v):
        return TaskIn.due_ok(v)


def check_assignee(c: dict, a: str | None):
    if a and a != "both" and a not in c["couple"]["members"]:
        raise HTTPException(422, "Assegnatario non valido")


async def check_category(c: dict, cat: str | None):
    if cat and not await get_db().task_categories.find_one({"_id": cat, "couple_id": c["cid"]}):
        raise HTTPException(422, "Categoria non valida")


@router.post("/tasks", status_code=201)
async def create_task(body: TaskIn, c: dict = Depends(ctx)):
    check_assignee(c, body.assignee)
    await check_category(c, body.category_id)
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "done": False, "done_by": None,
           "done_at": None, "nudges": 0, "last_nudge_at": None, "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    await get_db().tasks.insert_one(doc)
    await changed(c, "tasks", "created", doc["_id"])
    if body.assignee in (c["partner_id"], "both"):
        await notify(c, "attivita", f"{c['user']['name']} ti ha assegnato «{doc['title']}»", "/attivita")
    return clean(doc)


@router.get("/tasks")
async def list_tasks(c: dict = Depends(ctx)):
    docs = [clean(d) async for d in get_db().tasks.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda t: (t["done"], t["due"] or "9999", t["created_at"]))
    return docs


@router.patch("/tasks/{id}")
async def patch_task(id: str, body: TaskPatch, c: dict = Depends(ctx)):
    t = await get_owned("tasks", id, c)
    data = body.model_dump(exclude_unset=True)
    if "assignee" in data:
        check_assignee(c, data["assignee"])
    if "category_id" in data:
        await check_category(c, data["category_id"])
    if "done" in data:
        if data["done"] and not t["done"]:
            data.update(done_by=c["user"]["_id"], done_at=now())
            await notify(c, "attivita", f"{c['user']['name']} ha completato «{t['title']}» ✓", "/attivita")
        elif not data["done"]:
            data.update(done_by=None, done_at=None)
    await get_db().tasks.update_one({"_id": id}, {"$set": data})
    await changed(c, "tasks", "updated", id)
    return clean(await get_owned("tasks", id, c))


@router.delete("/tasks/{id}")
async def delete_task(id: str, c: dict = Depends(ctx)):
    await soft_delete("tasks", id, c)
    return {"ok": True}


@router.post("/tasks/{id}/nudge")
async def nudge_task(id: str, c: dict = Depends(ctx)):
    t = await get_owned("tasks", id, c)
    if t["done"]:
        raise HTTPException(409, "L'attività è già completata")
    if not c["partner_id"]:
        raise HTTPException(409, "Collega prima il tuo partner")
    last = t.get("last_nudge_at")
    if last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < NUDGE_COOLDOWN_S:
        raise HTTPException(429, "Hai appena mandato un sollecito, dagli un attimo")
    text = pl.nudge_text(t.get("nudges", 0), c["user"]["name"], t["title"])
    await get_db().tasks.update_one({"_id": id}, {"$inc": {"nudges": 1}, "$set": {"last_nudge_at": now()}})
    await notify(c, "solleciti", text, "/attivita")
    await changed(c, "tasks", "updated", id)
    return {"ok": True, "text": text, "nudges": t.get("nudges", 0) + 1}


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    color: str = Field(default=pl.CATEGORY_COLORS[0], pattern=r"^#[0-9A-Fa-f]{6}$")


@router.get("/task-categories")
async def list_categories(c: dict = Depends(ctx)):
    return [clean(d) async for d in get_db().task_categories.find({"couple_id": c["cid"]})]


@router.post("/task-categories", status_code=201)
async def create_category(body: CategoryIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "created_at": now()}
    await get_db().task_categories.insert_one(doc)
    await changed(c, "task_categories", "created", doc["_id"])
    return clean(doc)


@router.delete("/task-categories/{id}")
async def delete_category(id: str, c: dict = Depends(ctx)):
    db = get_db()
    r = await db.task_categories.delete_one({"_id": id, "couple_id": c["cid"]})
    if not r.deleted_count:
        raise HTTPException(404, "Categoria non trovata")
    await db.tasks.update_many({"couple_id": c["cid"], "category_id": id}, {"$set": {"category_id": None}})
    await changed(c, "task_categories", "deleted", id)
    await changed(c, "tasks", "updated", id)
    return {"ok": True}


# ================= LISTE =================
LIST_KINDS = ["spesa", "viaggio", "film", "ristoranti", "regali", "generica"]


class ListIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: str = "generica"

    @field_validator("kind")
    @classmethod
    def kind_ok(cls, v):
        if v not in LIST_KINDS:
            raise ValueError("Tipo di lista non valido")
        return v


class ListPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    kind: str | None = None


class ItemIn(BaseModel):
    text: str = Field(min_length=1, max_length=160)


class ItemPatch(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=160)
    done: bool | None = None


def list_view(d: dict, full: bool = True) -> dict:
    out = clean(d)
    items = out.get("items", [])
    out["total"] = len(items)
    out["done_count"] = sum(1 for i in items if i["done"])
    if not full:
        out.pop("items", None)
    return out


@router.get("/lists")
async def list_lists(c: dict = Depends(ctx)):
    docs = [list_view(d, full=False) async for d in get_db().lists.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda d: d["created_at"])
    return docs


@router.post("/lists", status_code=201)
async def create_list(body: ListIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "items": [],
           "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await get_db().lists.insert_one(doc)
    await changed(c, "lists", "created", doc["_id"])
    return list_view(doc)


@router.get("/lists/{id}")
async def get_list(id: str, c: dict = Depends(ctx)):
    return list_view(await get_owned("lists", id, c))


@router.patch("/lists/{id}")
async def patch_list(id: str, body: ListPatch, c: dict = Depends(ctx)):
    await get_owned("lists", id, c)
    data = body.model_dump(exclude_unset=True)
    if data.get("kind") and data["kind"] not in LIST_KINDS:
        raise HTTPException(422, "Tipo di lista non valido")
    if data:
        await get_db().lists.update_one({"_id": id}, {"$set": data})
    await changed(c, "lists", "updated", id)
    return list_view(await get_owned("lists", id, c))


@router.delete("/lists/{id}")
async def delete_list(id: str, c: dict = Depends(ctx)):
    await soft_delete("lists", id, c)
    return {"ok": True}


@router.post("/lists/{id}/items", status_code=201)
async def add_item(id: str, body: ItemIn, c: dict = Depends(ctx)):
    lst = await get_owned("lists", id, c)
    if len(lst["items"]) >= 500:
        raise HTTPException(422, "Lista troppo lunga")
    item = {"id": new_id(), "text": body.text.strip(), "done": False, "added_by": c["user"]["_id"],
            "done_by": None, "created_at": now()}
    await get_db().lists.update_one({"_id": id}, {"$push": {"items": item}})
    await changed(c, "lists", "updated", id)
    return list_view(await get_owned("lists", id, c))


@router.patch("/lists/{id}/items/{iid}")
async def patch_item(id: str, iid: str, body: ItemPatch, c: dict = Depends(ctx)):
    lst = await get_owned("lists", id, c)
    items = lst["items"]
    item = next((i for i in items if i["id"] == iid), None)
    if not item:
        raise HTTPException(404, "Voce non trovata")
    data = body.model_dump(exclude_unset=True)
    if "text" in data:
        item["text"] = data["text"].strip()
    if "done" in data:
        item["done"] = data["done"]
        item["done_by"] = c["user"]["_id"] if data["done"] else None
    await get_db().lists.update_one({"_id": id}, {"$set": {"items": items}})
    await changed(c, "lists", "updated", id)
    return list_view(await get_owned("lists", id, c))


@router.delete("/lists/{id}/items/{iid}")
async def delete_item(id: str, iid: str, c: dict = Depends(ctx)):
    lst = await get_owned("lists", id, c)
    items = [i for i in lst["items"] if i["id"] != iid]
    if len(items) == len(lst["items"]):
        raise HTTPException(404, "Voce non trovata")
    await get_db().lists.update_one({"_id": id}, {"$set": {"items": items}})
    await changed(c, "lists", "updated", id)
    return list_view(await get_owned("lists", id, c))


@router.post("/lists/{id}/clear-done")
async def clear_done(id: str, c: dict = Depends(ctx)):
    lst = await get_owned("lists", id, c)
    items = [i for i in lst["items"] if not i["done"]]
    await get_db().lists.update_one({"_id": id}, {"$set": {"items": items}})
    await changed(c, "lists", "updated", id)
    return list_view(await get_owned("lists", id, c))


# ================= CESTINO =================
def title_of(coll: str, d: dict) -> str:
    if coll == "photos":
        return d.get("caption") or "Foto"
    return d.get("title") or d.get("name") or d.get("label") or "Senza titolo"


async def purge_old(c: dict):
    limit = (datetime.now(timezone.utc) - timedelta(days=TRASH_DAYS)).isoformat()
    for coll in TRASHABLE:
        await get_db()[coll].delete_many({"couple_id": c["cid"], "deleted_at": {"$ne": None, "$lt": limit}})


@router.get("/trash")
async def trash(c: dict = Depends(ctx)):
    await purge_old(c)
    out = []
    for coll, label in TRASHABLE.items():
        async for d in get_db()[coll].find({"couple_id": c["cid"], "deleted_at": {"$ne": None}}):
            expires = (datetime.fromisoformat(d["deleted_at"]) + timedelta(days=TRASH_DAYS)).isoformat()
            out.append({"collection": coll, "kind": label, "id": d["_id"], "title": title_of(coll, d),
                        "deleted_at": d["deleted_at"], "deleted_by": d.get("deleted_by"), "expires_at": expires})
    out.sort(key=lambda x: x["deleted_at"], reverse=True)
    return out


BULK = {"events", "tasks", "lists", "photos"}


class BulkIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)


@router.post("/bulk/{coll}/delete")
async def bulk_delete(coll: str, body: BulkIn, c: dict = Depends(ctx)):
    """Elimina (nel cestino) più elementi insieme; quelli che non esistono più vengono ignorati."""
    if coll not in BULK:
        raise HTTPException(404, "Non disponibile")
    done = []
    for i in dict.fromkeys(body.ids):
        try:
            await soft_delete(coll, i, c)
            done.append(i)
        except HTTPException:
            pass
    return {"deleted": done}


@router.post("/bulk/{coll}/restore")
async def bulk_restore(coll: str, body: BulkIn, c: dict = Depends(ctx)):
    if coll not in BULK:
        raise HTTPException(404, "Non disponibile")
    done = []
    for i in dict.fromkeys(body.ids):
        try:
            await get_owned(coll, i, c, include_deleted=True)
        except HTTPException:
            continue
        await get_db()[coll].update_one({"_id": i}, {"$set": {"deleted_at": None, "deleted_by": None}})
        await changed(c, coll, "created", i)
        done.append(i)
    return {"restored": done}


@router.post("/trash/{coll}/{id}/restore")
async def restore(coll: str, id: str, c: dict = Depends(ctx)):
    if coll not in TRASHABLE:
        raise HTTPException(404, "Elemento non trovato")
    await get_owned(coll, id, c, include_deleted=True)
    await get_db()[coll].update_one({"_id": id}, {"$set": {"deleted_at": None, "deleted_by": None}})
    await changed(c, coll, "created", id)
    return {"ok": True}


@router.delete("/trash/{coll}/{id}")
async def purge_one(coll: str, id: str, c: dict = Depends(ctx)):
    if coll not in TRASHABLE:
        raise HTTPException(404, "Elemento non trovato")
    r = await get_db()[coll].delete_one({"_id": id, "couple_id": c["cid"], "deleted_at": {"$ne": None}})
    if not r.deleted_count:
        raise HTTPException(404, "Elemento non trovato")
    return {"ok": True}


@router.delete("/trash")
async def empty_trash(c: dict = Depends(ctx)):
    for coll in TRASHABLE:
        await get_db()[coll].delete_many({"couple_id": c["cid"], "deleted_at": {"$ne": None}})
    return {"ok": True}


# ================= NOTIFICHE =================
@router.get("/notifications")
async def notifications(c: dict = Depends(ctx)):
    docs = [clean(d) async for d in get_db().notifications.find({"couple_id": c["cid"], "to": c["user"]["_id"]})]
    docs.sort(key=lambda d: d["created_at"], reverse=True)
    docs = docs[:100]
    return {"unread": sum(1 for d in docs if not d["read"]), "items": docs}


@router.post("/notifications/read")
async def mark_read(c: dict = Depends(ctx)):
    await get_db().notifications.update_many({"couple_id": c["cid"], "to": c["user"]["_id"], "read": False},
                                              {"$set": {"read": True}})
    return {"ok": True}


# ================= per la home =================
async def home_data(c: dict) -> dict:
    now_dt = logic.now_rome()
    events = [e async for e in get_db().events.find({"couple_id": c["cid"], "deleted_at": None})]
    tasks = [clean(t) async for t in get_db().tasks.find({"couple_id": c["cid"], "deleted_at": None, "done": False})]
    today = logic.today_rome().isoformat()
    tasks = [t for t in tasks if t["due"] and t["due"] <= (logic.today_rome() + timedelta(days=7)).isoformat()]
    tasks.sort(key=lambda t: t["due"])
    for t in tasks:
        t["overdue"] = t["due"] < today
    return {"next_events": pl.upcoming(events, now_dt, 3), "due_tasks": tasks[:5]}
