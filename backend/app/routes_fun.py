"""Fase 5 (insieme): disegno condiviso in tempo reale e riepilogo annuale."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import logic
from .db import get_db
from .realtime import emit
from .routes_money import balance, euro
from .routes_planner import changed, clean, ctx, get_owned, new_id, now, soft_delete

router = APIRouter(prefix="/api")

MAX_STROKES = 4000
MAX_POINTS = 1500


# ================= DISEGNO CONDIVISO =================
class DrawingIn(BaseModel):
    name: str = Field(default="Senza titolo", min_length=1, max_length=60)


class StrokeIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    size: float = Field(ge=0.002, le=0.2)  # frazione della larghezza della tela
    eraser: bool = False
    pts: list[list[float]] = Field(min_length=1, max_length=MAX_POINTS)

    @field_validator("pts")
    @classmethod
    def pts_ok(cls, v):
        for p in v:
            if len(p) != 2 or not (-0.01 <= p[0] <= 1.01 and -0.01 <= p[1] <= 1.01):
                raise ValueError("Punto non valido")
        return v


def d_view(d: dict, full: bool) -> dict:
    out = {"id": d["_id"], "name": d["name"], "created_by": d["created_by"], "updated_at": d.get("updated_at"),
           "strokes_count": len(d.get("strokes", []))}
    if full:
        out["strokes"] = d.get("strokes", [])
    else:
        out["strokes"] = d.get("strokes", [])[-400:]  # per l'anteprima nella galleria
    return out


@router.get("/drawings")
async def list_drawings(c: dict = Depends(ctx)):
    docs = [d_view(d, False) async for d in get_db().drawings.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda d: d["updated_at"] or "", reverse=True)
    return docs


@router.post("/drawings", status_code=201)
async def create_drawing(body: DrawingIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], "name": body.name.strip(), "strokes": [], "created_by": c["user"]["_id"],
           "created_at": now(), "updated_at": now(), "deleted_at": None}
    await get_db().drawings.insert_one(doc)
    await changed(c, "drawings", "created", doc["_id"])
    return d_view(doc, True)


@router.get("/drawings/{id}")
async def get_drawing(id: str, c: dict = Depends(ctx)):
    return d_view(await get_owned("drawings", id, c), True)


@router.patch("/drawings/{id}")
async def rename_drawing(id: str, body: DrawingIn, c: dict = Depends(ctx)):
    await get_owned("drawings", id, c)
    await get_db().drawings.update_one({"_id": id}, {"$set": {"name": body.name.strip()}})
    await changed(c, "drawings", "updated", id)
    return d_view(await get_owned("drawings", id, c), True)


@router.delete("/drawings/{id}")
async def delete_drawing(id: str, c: dict = Depends(ctx)):
    await soft_delete("drawings", id, c)
    return {"ok": True}


@router.post("/drawings/{id}/strokes", status_code=201)
async def add_stroke(id: str, body: StrokeIn, c: dict = Depends(ctx)):
    d = await get_owned("drawings", id, c)
    if len(d.get("strokes", [])) >= MAX_STROKES:
        raise HTTPException(409, "La tela è piena: ripulitela o iniziate un nuovo disegno")
    stroke = {**body.model_dump(), "by": c["user"]["_id"]}
    await get_db().drawings.update_one({"_id": id}, {"$push": {"strokes": stroke}, "$set": {"updated_at": now()}})
    await emit(c["cid"], "drawings", "stroke", id, c["user"]["_id"], data=stroke)
    return {"ok": True}


@router.delete("/drawings/{id}/strokes/{sid}")
async def undo_stroke(id: str, sid: str, c: dict = Depends(ctx)):
    """Annulla un tratto (solo un proprio tratto)."""
    d = await get_owned("drawings", id, c)
    s = next((s for s in d.get("strokes", []) if s["id"] == sid), None)
    if not s:
        raise HTTPException(404, "Tratto non trovato")
    if s["by"] != c["user"]["_id"]:
        raise HTTPException(403, "Puoi annullare solo i tuoi tratti")
    await get_db().drawings.update_one({"_id": id}, {"$pull": {"strokes": {"id": sid}}, "$set": {"updated_at": now()}})
    await emit(c["cid"], "drawings", "undo", id, c["user"]["_id"], data={"id": sid})
    return {"ok": True}


@router.post("/drawings/{id}/clear")
async def clear_drawing(id: str, c: dict = Depends(ctx)):
    await get_owned("drawings", id, c)
    await get_db().drawings.update_one({"_id": id}, {"$set": {"strokes": [], "updated_at": now()}})
    await emit(c["cid"], "drawings", "clear", id, c["user"]["_id"])
    return {"ok": True}


# ================= IL NOSTRO ANNO =================
@router.get("/year")
async def year_recap(year: int | None = Query(default=None, ge=2000, le=2100), c: dict = Depends(ctx)):
    db = get_db()
    today = logic.today_rome()
    y = year or today.year
    lo, hi = f"{y}-01-01", f"{y}-12-31"
    base = {"couple_id": c["cid"], "deleted_at": None}
    inyear = lambda s: bool(s) and lo <= s[:10] <= hi
    out = {"year": y, "couple_start": c["couple"].get("start_date")}
    start = c["couple"].get("start_date")
    if start:
        end = min(date(y, 12, 31), today)
        out["days_together"] = logic.days_together(date.fromisoformat(start), end) if end >= date.fromisoformat(start) else 0
    events = [e async for e in db.events.find(base)]
    out["events"] = sum(1 for e in events if inyear(e["start"]) or (e.get("recurrence", "nessuna") != "nessuna" and e["start"][:10] <= hi))
    tasks = [t async for t in db.tasks.find({**base, "done": True})]
    out["tasks_done"] = sum(1 for t in tasks if inyear(t.get("done_at")))
    out["lists_items_done"] = sum(1 for l in [x async for x in db.lists.find(base)] for i in l.get("items", []) if inyear(i.get("created_at")) and i["done"])
    bucket = [b async for b in db.bucket.find({**base, "done": True})]
    done_b = [b for b in bucket if inyear(b.get("done_on"))]
    out["together_done"] = [{"title": b["title"], "date": b["done_on"], "memory": b.get("memory")} for b in sorted(done_b, key=lambda b: b["done_on"])]
    members = c["couple"]["members"]
    answers = [a async for a in db.answers.find({"couple_id": c["cid"]})]
    by_day: dict[str, set] = {}
    for a in answers:
        if inyear(a["date"]):
            by_day.setdefault(a["date"], set()).add(a["user_id"])
    out["questions_answered"] = len(by_day)
    out["questions_both"] = sum(1 for s in by_day.values() if len(s) >= len(members) and len(members) == 2)
    out["polls_decided"] = sum(1 for p in [x async for x in db.polls.find({**base, "status": "closed"})] if inyear(p.get("closed_at")))
    trips = [t async for t in db.trips.find(base)]
    ty = [t for t in trips if (t.get("when") or "")[:4] == str(y)]
    out["places"] = [{"name": t["name"], "country": t.get("country"), "when": t.get("when"), "notes": t.get("notes")} for t in sorted(ty, key=lambda t: t["when"])]
    out["countries"] = len({(t.get("country") or "").strip().lower() for t in ty if t.get("country")})
    out["notes_written"] = sum(1 for n in [x async for x in db.notes.find(base)] if inyear(n["created_at"]) and n["kind"] != "capsula")
    out["capsules"] = sum(1 for n in [x async for x in db.notes.find({**base, "kind": "capsula"})] if inyear(n["created_at"]))
    out["gifts_received"] = sum(1 for w in [x async for x in db.wishes.find({**base, "received": True})])
    exps = [e async for e in db.expenses.find(base) if e["category"] != "saldo" and e["date"][:4] == str(y)]
    tot: dict[str, int] = {}
    for e in exps:
        tot[e["category"]] = tot.get(e["category"], 0) + e["amount_cents"]
    out["expenses_total"] = euro(sum(tot.values()))
    out["top_expense_category"] = max(tot, key=tot.get) if tot else None
    saved = 0
    async for g in db.goals.find(base):
        saved += sum(d["cents"] for d in g.get("deposits", []) if d["date"][:4] == str(y))
    out["saved"] = euro(saved)
    years = sorted({int(start[:4]), today.year} if start else {today.year})
    out["years"] = list(range(years[0], years[-1] + 1))
    return out
