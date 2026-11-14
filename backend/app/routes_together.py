"""Fase 3: domanda del giorno, decidere insieme (sondaggi), da fare insieme."""
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import logic
from .db import get_db
from .questions import question_for
from .routes_planner import changed, clean, ctx, get_owned, new_id, notify, now, soft_delete

router = APIRouter(prefix="/api")



# ================= DOMANDA DEL GIORNO =================
class AnswerIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)

    @field_validator("text")
    @classmethod
    def strip(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Scrivi una risposta")
        return v


async def answers_of(c: dict, day: str) -> dict[str, dict]:
    return {a["user_id"]: a async for a in get_db().answers.find({"couple_id": c["cid"], "date": day})}


async def question_view(c: dict, day) -> dict:
    d = day.isoformat()
    ans = await answers_of(c, d)
    mine, theirs = ans.get(c["user"]["_id"]), ans.get(c["partner_id"]) if c["partner_id"] else None
    past = day < logic.today_rome()
    revealed = bool(mine and (theirs or not c["partner_id"])) or past
    return {"date": d, "question": question_for(day), "my_answer": mine["text"] if mine else None,
            "partner_answered": bool(theirs), "paired": bool(c["partner_id"]),
            "partner_answer": theirs["text"] if theirs and revealed else None, "revealed": revealed}


@router.get("/question/today")
async def question_today(c: dict = Depends(ctx)):
    return await question_view(c, logic.today_rome())


@router.put("/question/today")
async def answer_today(body: AnswerIn, c: dict = Depends(ctx)):
    day = logic.today_rome().isoformat()
    db = get_db()
    existing = await db.answers.find_one({"couple_id": c["cid"], "date": day, "user_id": c["user"]["_id"]})
    if existing:
        await db.answers.update_one({"_id": existing["_id"]}, {"$set": {"text": body.text, "updated_at": now()}})
    else:
        await db.answers.insert_one({"_id": new_id(), "couple_id": c["cid"], "date": day, "user_id": c["user"]["_id"],
                                     "text": body.text, "created_at": now(), "updated_at": now()})
        both = c["partner_id"] and await db.answers.find_one({"couple_id": c["cid"], "date": day, "user_id": c["partner_id"]})
        name = c["user"]["name"]
        await notify(c, "risposta_partner", f"{name} ha risposto alla domanda di oggi. Ora potete leggervi!" if both
                     else f"{name} ha risposto alla domanda di oggi. Tocca a te!", "/domanda")
    await changed(c, "answers", "updated", day)
    return await question_view(c, logic.today_rome())


@router.get("/question/history")
async def question_history(c: dict = Depends(ctx)):
    today = logic.today_rome().isoformat()
    days = sorted({a["date"] async for a in get_db().answers.find({"couple_id": c["cid"], "date": {"$lt": today}})}, reverse=True)[:60]
    out = []
    from datetime import date
    for d in days:
        v = await question_view(c, date.fromisoformat(d))
        out.append({"date": d, "question": v["question"], "mine": v["my_answer"], "partner": v["partner_answer"]})
    return out


# ================= DECIDERE INSIEME =================
class PollIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    options: list[str] = Field(min_length=2, max_length=8)

    @field_validator("options")
    @classmethod
    def opts(cls, v):
        v = [o.strip() for o in v if o and o.strip()]
        if len(v) < 2 or any(len(o) > 80 for o in v):
            raise ValueError("Servono almeno due opzioni (max 80 caratteri)")
        if len({o.lower() for o in v}) != len(v):
            raise ValueError("Le opzioni devono essere diverse")
        return v


class VoteIn(BaseModel):
    option_id: str


def poll_view(p: dict, c: dict) -> dict:
    me = c["user"]["_id"]
    votes = p.get("votes", {})
    paired = bool(c["partner_id"])
    partner_voted = bool(c["partner_id"]) and c["partner_id"] in votes
    closed = p["status"] == "closed"
    revealed = closed or (me in votes and (partner_voted or not paired))
    counts = {o["id"]: sum(1 for v in votes.values() if v == o["id"]) for o in p["options"]}
    top = max(counts.values()) if counts else 0
    leaders = [k for k, n in counts.items() if n == top and top > 0]
    out = {"id": p["_id"], "title": p["title"], "status": p["status"], "created_by": p["created_by"],
           "created_at": p["created_at"], "my_vote": votes.get(me), "partner_voted": partner_voted,
           "revealed": revealed, "winner_id": p.get("winner_id"), "tie_broken": p.get("tie_broken", False),
           "tie": revealed and not closed and len(leaders) > 1,
           "options": [{"id": o["id"], "text": o["text"], **({"votes": counts[o["id"]]} if revealed else {})} for o in p["options"]]}
    return out


async def finish_if_ready(p: dict, c: dict):
    """Se hanno votato tutti e c'è un solo vincitore, il sondaggio si chiude da solo."""
    votes = p.get("votes", {})
    need = len(c["couple"]["members"])
    if len(votes) < need:
        return
    counts: dict[str, int] = {}
    for v in votes.values():
        counts[v] = counts.get(v, 0) + 1
    top = max(counts.values())
    leaders = [k for k, n in counts.items() if n == top]
    if len(leaders) == 1:
        await get_db().polls.update_one({"_id": p["_id"]}, {"$set": {"status": "closed", "winner_id": leaders[0], "closed_at": now()}})


@router.post("/polls", status_code=201)
async def create_poll(body: PollIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], "title": body.title.strip(),
           "options": [{"id": new_id()[:8], "text": o} for o in body.options], "votes": {}, "status": "open",
           "winner_id": None, "tie_broken": False, "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await get_db().polls.insert_one(doc)
    await changed(c, "polls", "created", doc["_id"])
    await notify(c, "sondaggi", f"{c['user']['name']} vuole decidere con te: «{doc['title']}»", "/decidere")
    return poll_view(doc, c)


@router.get("/polls")
async def list_polls(c: dict = Depends(ctx)):
    docs = [p async for p in get_db().polls.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda p: p["created_at"], reverse=True)
    return [poll_view(p, c) for p in docs]


@router.post("/polls/{id}/vote")
async def vote(id: str, body: VoteIn, c: dict = Depends(ctx)):
    p = await get_owned("polls", id, c)
    if p["status"] == "closed":
        raise HTTPException(409, "Questa decisione è già stata presa")
    if body.option_id not in {o["id"] for o in p["options"]}:
        raise HTTPException(422, "Opzione non valida")
    first_time = c["user"]["_id"] not in p.get("votes", {})
    await get_db().polls.update_one({"_id": id}, {"$set": {f"votes.{c['user']['_id']}": body.option_id}})
    p = await get_owned("polls", id, c)
    await finish_if_ready(p, c)
    p = await get_owned("polls", id, c)
    if first_time:
        if c["partner_id"] and c["partner_id"] in p["votes"]:
            await notify(c, "sondaggi", f"Avete votato entrambi «{p['title']}»: guardate il risultato!", "/decidere")
        else:
            await notify(c, "sondaggi", f"{c['user']['name']} ha votato «{p['title']}». Tocca a te!", "/decidere")
    await changed(c, "polls", "updated", id)
    return poll_view(p, c)


@router.post("/polls/{id}/draw")
async def draw(id: str, c: dict = Depends(ctx)):
    """Pareggio: lascia decidere alla sorte tra le opzioni a pari merito."""
    p = await get_owned("polls", id, c)
    if p["status"] == "closed":
        raise HTTPException(409, "Questa decisione è già stata presa")
    votes = p.get("votes", {})
    if len(votes) < len(c["couple"]["members"]):
        raise HTTPException(409, "Devono votare tutti e due prima")
    counts: dict[str, int] = {}
    for v in votes.values():
        counts[v] = counts.get(v, 0) + 1
    top = max(counts.values())
    pick = random.choice([k for k, n in counts.items() if n == top])
    await get_db().polls.update_one({"_id": id}, {"$set": {"status": "closed", "winner_id": pick, "tie_broken": True, "closed_at": now()}})
    await changed(c, "polls", "updated", id)
    return poll_view(await get_owned("polls", id, c), c)


@router.post("/polls/{id}/reopen")
async def reopen(id: str, c: dict = Depends(ctx)):
    await get_owned("polls", id, c)
    await get_db().polls.update_one({"_id": id}, {"$set": {"status": "open", "winner_id": None, "tie_broken": False, "votes": {}}})
    await changed(c, "polls", "updated", id)
    return poll_view(await get_owned("polls", id, c), c)


@router.delete("/polls/{id}")
async def delete_poll(id: str, c: dict = Depends(ctx)):
    await soft_delete("polls", id, c)
    return {"ok": True}


# ================= DA FARE INSIEME =================
BUCKET_CATEGORIES = ["esperienze", "viaggi", "cibo", "casa", "natura", "cultura", "altro"]


class BucketIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    category: str = "esperienze"
    notes: str | None = Field(default=None, max_length=600)

    @field_validator("category")
    @classmethod
    def cat_ok(cls, v):
        if v not in BUCKET_CATEGORIES:
            raise ValueError("Categoria non valida")
        return v


class BucketPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    category: str | None = None
    notes: str | None = Field(default=None, max_length=600)
    done: bool | None = None
    memory: str | None = Field(default=None, max_length=800)  # ricordo scritto dopo averla fatta


@router.get("/bucket")
async def list_bucket(c: dict = Depends(ctx)):
    docs = [clean(d) async for d in get_db().bucket.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda d: (d["done"], d["created_at"]))
    return docs


@router.post("/bucket", status_code=201)
async def create_bucket(body: BucketIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], **body.model_dump(), "done": False, "done_on": None, "done_by": None,
           "memory": None, "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await get_db().bucket.insert_one(doc)
    await changed(c, "bucket", "created", doc["_id"])
    return clean(doc)


@router.patch("/bucket/{id}")
async def patch_bucket(id: str, body: BucketPatch, c: dict = Depends(ctx)):
    b = await get_owned("bucket", id, c)
    data = body.model_dump(exclude_unset=True)
    if data.get("category") and data["category"] not in BUCKET_CATEGORIES:
        raise HTTPException(422, "Categoria non valida")
    if "done" in data:
        if data["done"] and not b["done"]:
            data.update(done_on=logic.today_rome().isoformat(), done_by=c["user"]["_id"])
            await notify(c, "attivita", f"Avete fatto «{b['title']}»! 🎉", "/fare-insieme")
        elif not data["done"]:
            data.update(done_on=None, done_by=None)
    await get_db().bucket.update_one({"_id": id}, {"$set": data})
    await changed(c, "bucket", "updated", id)
    return clean(await get_owned("bucket", id, c))


@router.delete("/bucket/{id}")
async def delete_bucket(id: str, c: dict = Depends(ctx)):
    await soft_delete("bucket", id, c)
    return {"ok": True}


@router.post("/bucket/random")
async def random_bucket(c: dict = Depends(ctx)):
    """Estrae una cosa ancora da fare: «cosa facciamo oggi?»."""
    docs = [d async for d in get_db().bucket.find({"couple_id": c["cid"], "deleted_at": None, "done": False})]
    if not docs:
        raise HTTPException(404, "Non c'è niente in lista: aggiungete qualche idea!")
    return clean(random.choice(docs))


# ================= per la home =================
async def question_summary(c: dict) -> dict:
    v = await question_view(c, logic.today_rome())
    return {"question": v["question"], "answered": v["my_answer"] is not None, "partner_answered": v["partner_answered"]}
