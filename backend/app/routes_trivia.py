"""Trivia: sfide a due sulle stesse 10 domande. I risultati si rivelano quando hanno finito entrambi."""
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .db import get_db
from .routes_planner import changed, ctx, new_id, notify, now
from .trivia_bank import CATEGORIES, QUESTIONS

router = APIRouter(prefix="/api/trivia")

N_QUESTIONS = 10
TIME_MS = 15000


def options_for(match_id: str, q: dict) -> tuple[list[str], int]:
    """Stesso ordine delle risposte per entrambi, diverso da partita a partita."""
    opts = [q["right"], *q["wrong"]]
    random.Random(f"{match_id}:{q['id']}").shuffle(opts)
    return opts, opts.index(q["right"])


def points(ok: bool, ms: int) -> int:
    return 100 + round(50 * max(0, TIME_MS - min(ms, TIME_MS)) / TIME_MS) if ok else 0


async def members_of(c: dict) -> list[str]:
    couple = await get_db().couples.find_one({"_id": c["cid"]})
    return couple["members"]


def player(m: dict, uid: str) -> dict:
    return (m.get("players") or {}).get(uid) or {"answers": [], "score": 0, "done_at": None}


def is_done(m: dict, uid: str) -> bool:
    return bool(player(m, uid)["done_at"])


class NewMatch(BaseModel):
    cat: str = Field(default="mix", max_length=20)


async def get_match(id: str, c: dict) -> dict:
    m = await get_db().trivia_matches.find_one({"_id": id, "couple_id": c["cid"]})
    if not m:
        raise HTTPException(404, "Sfida non trovata")
    return m


async def view(m: dict, c: dict, members: list[str]) -> dict:
    me, others = c["user"]["_id"], [u for u in members if u != c["user"]["_id"]]
    mine = player(m, me)
    qs = []
    for i, qid in enumerate(m["qids"]):
        q = QUESTIONS[qid]
        opts, right = options_for(m["_id"], q)
        item = {"q": q["q"], "options": opts}
        if i < len(mine["answers"]):  # solo dopo aver risposto si vede la soluzione
            a = mine["answers"][i]
            item.update(right=right, mine=a["c"], points=a["pts"])
        qs.append(item)
    all_done = all(is_done(m, u) for u in members)
    out = {
        "id": m["_id"], "cat": m["cat"], "created_by": m["created_by"], "created_at": m["created_at"],
        "questions": qs, "answered": len(mine["answers"]), "total": len(m["qids"]),
        "done": bool(mine["done_at"]), "score": mine["score"] if mine["done_at"] else None,
        "partner_done": all(is_done(m, u) for u in others) if others else None,
        "partner_answered": [len(player(m, u)["answers"]) for u in others][0] if others else None,
        "finished": all_done,
    }
    if all_done and others:
        p = player(m, others[0])
        out["partner_score"] = p["score"]
        out["partner_choices"] = [a["c"] for a in p["answers"]]
        out["winner"] = None if p["score"] == mine["score"] else (me if mine["score"] > p["score"] else others[0])
    return out


@router.get("/categories")
async def categories(c: dict = Depends(ctx)):
    counts: dict[str, int] = {}
    for q in QUESTIONS.values():
        counts[q["cat"]] = counts.get(q["cat"], 0) + 1
    return [{"id": k, "name": v[0], "emoji": v[1], "count": counts[k]} for k, v in CATEGORIES.items()]


@router.post("/matches", status_code=201)
async def create_match(body: NewMatch, c: dict = Depends(ctx)):
    if body.cat != "mix" and body.cat not in CATEGORIES:
        raise HTTPException(422, "Categoria non valida")
    db = get_db()
    recent = {qid async for m in db.trivia_matches.find({"couple_id": c["cid"]}).sort("created_at", -1).limit(8) for qid in m["qids"]}
    pool = [q["id"] for q in QUESTIONS.values() if body.cat == "mix" or q["cat"] == body.cat]
    fresh = [q for q in pool if q not in recent]
    pick_from = fresh if len(fresh) >= N_QUESTIONS else pool
    qids = random.sample(pick_from, min(N_QUESTIONS, len(pick_from)))
    members = await members_of(c)
    m = {"_id": new_id(), "couple_id": c["cid"], "cat": body.cat, "qids": qids, "created_by": c["user"]["_id"], "created_at": now(),
         "players": {u: {"answers": [], "score": 0, "done_at": None} for u in members}}
    await db.trivia_matches.insert_one(m)
    await changed(c, "trivia", "created", m["_id"])
    label = "Mix" if body.cat == "mix" else CATEGORIES[body.cat][0]
    await notify(c, "trivia", f"{c['user']['name']} ti ha sfidato a Trivia ({label}). Ci stai?", f"/trivia/{m['_id']}")
    return await view(m, c, members)


@router.get("/matches")
async def list_matches(c: dict = Depends(ctx)):
    db = get_db()
    members = await members_of(c)
    me = c["user"]["_id"]
    docs = [m async for m in db.trivia_matches.find({"couple_id": c["cid"]}).sort("created_at", -1)]
    wins = {u: 0 for u in members}
    draws = played = 0
    totals = {u: 0 for u in members}
    for m in docs:
        if all(is_done(m, u) for u in members) and len(members) == 2:
            played += 1
            s = {u: player(m, u)["score"] for u in members}
            for u in members:
                totals[u] += s[u]
            a, b = members
            if s[a] == s[b]:
                draws += 1
            else:
                wins[a if s[a] > s[b] else b] += 1
    items = []
    for m in docs[:30]:
        others = [u for u in members if u != me]
        mine = player(m, me)
        done_all = all(is_done(m, u) for u in members)
        item = {"id": m["_id"], "cat": m["cat"], "created_at": m["created_at"], "created_by": m["created_by"],
                "answered": len(mine["answers"]), "total": len(m["qids"]),
                "status": "finita" if done_all else ("tocca_a_te" if not mine["done_at"] else "attesa")}
        if done_all:
            item["score"] = mine["score"]
            if others:
                item["partner_score"] = player(m, others[0])["score"]
        items.append(item)
    return {"stats": {"wins": wins, "draws": draws, "played": played, "points": totals}, "matches": items}


@router.get("/matches/{id}")
async def one_match(id: str, c: dict = Depends(ctx)):
    return await view(await get_match(id, c), c, await members_of(c))


class AnswerIn(BaseModel):
    q: int = Field(ge=0, lt=50)
    choice: int | None = Field(default=None, ge=0, le=3)  # None = tempo scaduto
    ms: int = Field(default=TIME_MS, ge=0, le=600000)


@router.post("/matches/{id}/answer")
async def answer(id: str, body: AnswerIn, c: dict = Depends(ctx)):
    db = get_db()
    m = await get_match(id, c)
    me = c["user"]["_id"]
    mine = player(m, me)
    if mine["done_at"] or body.q != len(mine["answers"]) or body.q >= len(m["qids"]):
        raise HTTPException(409, "Domanda già risposta")
    q = QUESTIONS[m["qids"][body.q]]
    _, right = options_for(m["_id"], q)
    ok = body.choice == right
    pts = points(ok, body.ms)
    entry = {"c": body.choice, "ms": min(body.ms, TIME_MS), "ok": ok, "pts": pts}
    last = body.q == len(m["qids"]) - 1
    upd = {"$push": {f"players.{me}.answers": entry}, "$inc": {f"players.{me}.score": pts}}
    if last:
        upd["$set"] = {f"players.{me}.done_at": now()}
    await db.trivia_matches.update_one({"_id": id, f"players.{me}": {"$exists": False}},
                                       {"$set": {f"players.{me}": {"answers": [], "score": 0, "done_at": None}}})
    # aggiornamento condizionato: la risposta vale solo se è davvero la prossima (niente doppi invii)
    res = await db.trivia_matches.update_one({"_id": id, f"players.{me}.answers": {"$size": body.q}}, upd)
    if res.matched_count == 0:
        raise HTTPException(409, "Domanda già risposta")
    members = await members_of(c)
    fresh = await get_match(id, c)
    finished = all(is_done(fresh, u) for u in members)
    await changed(c, "trivia", "updated", id)
    if last and finished and c["partner_id"]:
        await notify(c, "trivia", f"Sfida Trivia conclusa! {c['user']['name']} ha finito: guarda i risultati.", f"/trivia/{id}")
    return {"ok": ok, "right": right, "points": pts, "done": last, "finished": finished}
