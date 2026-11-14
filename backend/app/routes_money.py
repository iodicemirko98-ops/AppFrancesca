"""Fase 5 (soldi): obiettivi di risparmio e spese comuni. Gli importi sono gestiti in centesimi interi."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import logic
from .db import get_db
from .routes_planner import changed, clean, ctx, get_owned, new_id, notify, now, soft_delete

router = APIRouter(prefix="/api")


def cents(x: float) -> int:
    return int(round(x * 100))


def euro(c: int) -> float:
    return c / 100


def check_day(v: str | None):
    if v:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("Data non valida")
    return v or None


# ================= RISPARMI =================
class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target: float = Field(gt=0, le=10_000_000)
    deadline: str | None = None
    emoji: str | None = Field(default=None, max_length=4)

    @field_validator("deadline")
    @classmethod
    def d_ok(cls, v):
        return check_day(v)


class GoalPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    target: float | None = Field(default=None, gt=0, le=10_000_000)
    deadline: str | None = None

    @field_validator("deadline")
    @classmethod
    def d_ok(cls, v):
        return check_day(v)


class DepositIn(BaseModel):
    amount: float = Field(le=10_000_000, ge=-10_000_000)  # negativo = prelievo
    note: str | None = Field(default=None, max_length=120)
    date: str | None = None

    @field_validator("amount")
    @classmethod
    def nz(cls, v):
        if cents(v) == 0:
            raise ValueError("L'importo non può essere zero")
        return v

    @field_validator("date")
    @classmethod
    def d_ok(cls, v):
        return check_day(v)


def goal_view(g: dict, c: dict) -> dict:
    deps = g.get("deposits", [])
    saved = sum(d["cents"] for d in deps)
    target = g["target_cents"]
    by = {}
    for d in deps:
        by[d["by"]] = by.get(d["by"], 0) + d["cents"]
    out = {"id": g["_id"], "name": g["name"], "emoji": g.get("emoji"), "target": euro(target), "saved": euro(saved),
           "remaining": euro(max(0, target - saved)), "pct": min(100, int(saved * 100 // target)) if target else 0,
           "reached": saved >= target, "deadline": g.get("deadline"), "created_at": g["created_at"],
           "by_member": {k: euro(v) for k, v in by.items()},
           "deposits": [{"id": d["id"], "amount": euro(d["cents"]), "by": d["by"], "date": d["date"], "note": d.get("note")}
                        for d in sorted(deps, key=lambda d: (d["date"], d["created_at"]), reverse=True)]}
    if g.get("deadline") and saved < target:
        left = (date.fromisoformat(g["deadline"]) - logic.today_rome()).days
        out["days_left"] = left
        months = max(1, left / 30.44)
        out["monthly_needed"] = round(euro(target - saved) / months, 2) if left > 0 else None
    return out


@router.get("/goals")
async def list_goals(c: dict = Depends(ctx)):
    docs = [goal_view(g, c) async for g in get_db().goals.find({"couple_id": c["cid"], "deleted_at": None})]
    docs.sort(key=lambda g: (g["reached"], g["created_at"]))
    return docs


@router.get("/goals/{id}")
async def get_goal(id: str, c: dict = Depends(ctx)):
    return goal_view(await get_owned("goals", id, c), c)


@router.post("/goals", status_code=201)
async def create_goal(body: GoalIn, c: dict = Depends(ctx)):
    doc = {"_id": new_id(), "couple_id": c["cid"], "name": body.name.strip(), "target_cents": cents(body.target),
           "deadline": body.deadline, "emoji": body.emoji, "deposits": [], "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    await get_db().goals.insert_one(doc)
    await changed(c, "goals", "created", doc["_id"])
    return goal_view(doc, c)


@router.patch("/goals/{id}")
async def patch_goal(id: str, body: GoalPatch, c: dict = Depends(ctx)):
    await get_owned("goals", id, c)
    data = body.model_dump(exclude_unset=True)
    if "target" in data:
        data["target_cents"] = cents(data.pop("target"))
    if data:
        await get_db().goals.update_one({"_id": id}, {"$set": data})
    await changed(c, "goals", "updated", id)
    return goal_view(await get_owned("goals", id, c), c)


@router.delete("/goals/{id}")
async def delete_goal(id: str, c: dict = Depends(ctx)):
    await soft_delete("goals", id, c)
    return {"ok": True}


@router.post("/goals/{id}/deposits", status_code=201)
async def add_deposit(id: str, body: DepositIn, c: dict = Depends(ctx)):
    g = await get_owned("goals", id, c)
    saved = sum(d["cents"] for d in g.get("deposits", []))
    if saved + cents(body.amount) < 0:
        raise HTTPException(422, "Non puoi prelevare più di quanto hai messo da parte")
    dep = {"id": new_id(), "cents": cents(body.amount), "by": c["user"]["_id"],
           "date": body.date or logic.today_rome().isoformat(), "note": body.note, "created_at": now()}
    await get_db().goals.update_one({"_id": id}, {"$push": {"deposits": dep}})
    g = await get_owned("goals", id, c)
    await changed(c, "goals", "updated", id)
    if body.amount > 0:
        reached = sum(d["cents"] for d in g["deposits"]) >= g["target_cents"] > saved
        await notify(c, "eventi", (f"Obiettivo raggiunto: «{g['name']}»! 🎉" if reached
                                   else f"{c['user']['name']} ha messo da parte {body.amount:.2f} € per «{g['name']}»".replace(".", ",")), "/risparmi")
    return goal_view(g, c)


@router.delete("/goals/{id}/deposits/{did}")
async def delete_deposit(id: str, did: str, c: dict = Depends(ctx)):
    g = await get_owned("goals", id, c)
    deps = [d for d in g.get("deposits", []) if d["id"] != did]
    if len(deps) == len(g.get("deposits", [])):
        raise HTTPException(404, "Versamento non trovato")
    if sum(d["cents"] for d in deps) < 0:
        raise HTTPException(422, "Così il totale andrebbe sotto zero")
    await get_db().goals.update_one({"_id": id}, {"$set": {"deposits": deps}})
    await changed(c, "goals", "updated", id)
    return goal_view(await get_owned("goals", id, c), c)


# ================= SPESE COMUNI =================
EXP_CATEGORIES = ["casa", "spesa", "viaggi", "bollette", "uscite", "regali", "altro", "saldo"]
SPLITS = ["equal", "other", "self"]  # a metà | lo deve tutto l'altro | spesa personale (non si divide)


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, le=10_000_000)
    paid_by: str
    date: str | None = None
    category: str = "altro"
    split: str = "equal"

    @field_validator("category")
    @classmethod
    def cat_ok(cls, v):
        if v not in EXP_CATEGORIES:
            raise ValueError("Categoria non valida")
        return v

    @field_validator("split")
    @classmethod
    def split_ok(cls, v):
        if v not in SPLITS:
            raise ValueError("Divisione non valida")
        return v

    @field_validator("date")
    @classmethod
    def d_ok(cls, v):
        return check_day(v)


class ExpensePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    amount: float | None = Field(default=None, gt=0, le=10_000_000)
    paid_by: str | None = None
    date: str | None = None
    category: str | None = None
    split: str | None = None

    @field_validator("date")
    @classmethod
    def d_ok(cls, v):
        return check_day(v)


def net_for(e: dict, members: list[str]) -> dict[str, int]:
    """Quanto ciascuno ha 'anticipato' in più (+) o in meno (−) rispetto alla sua quota."""
    payer, a = e["paid_by"], e["amount_cents"]
    others = [m for m in members if m != payer]
    if not others or e["split"] == "self":
        return {}
    if e["split"] == "other":
        return {payer: a, others[0]: -a}
    half = a // 2  # il centesimo dispari resta a carico di chi ha pagato
    return {payer: half, others[0]: -half}


def balance(expenses: list[dict], members: list[str]) -> dict:
    net = {m: 0 for m in members}
    for e in expenses:
        for k, v in net_for(e, members).items():
            net[k] = net.get(k, 0) + v
    if len(members) < 2:
        return {"amount": 0.0, "from": None, "to": None}
    a, b = members[0], members[1]
    owe = net[a]  # >0: b deve ad a
    if owe == 0:
        return {"amount": 0.0, "from": None, "to": None}
    return {"amount": euro(abs(owe)), "from": b if owe > 0 else a, "to": a if owe > 0 else b}


def exp_view(e: dict) -> dict:
    return {"id": e["_id"], "title": e["title"], "amount": euro(e["amount_cents"]), "paid_by": e["paid_by"], "date": e["date"],
            "category": e["category"], "split": e["split"], "settlement": e["category"] == "saldo"}


def check_payer(c: dict, paid_by: str):
    if paid_by not in c["couple"]["members"]:
        raise HTTPException(422, "Chi ha pagato non è valido")


@router.get("/expenses")
async def list_expenses(month: str | None = Query(default=None), c: dict = Depends(ctx)):
    today = logic.today_rome()
    month = month or today.strftime("%Y-%m")
    try:
        date.fromisoformat(month + "-01")
    except ValueError:
        raise HTTPException(422, "Mese non valido")
    allx = [e async for e in get_db().expenses.find({"couple_id": c["cid"], "deleted_at": None})]
    mem = c["couple"]["members"]
    mx = sorted([e for e in allx if e["date"][:7] == month], key=lambda e: (e["date"], e["created_at"]), reverse=True)
    real = [e for e in mx if e["category"] != "saldo"]
    cat: dict[str, int] = {}
    for e in real:
        cat[e["category"]] = cat.get(e["category"], 0) + e["amount_cents"]
    paid: dict[str, int] = {}
    for e in real:
        paid[e["paid_by"]] = paid.get(e["paid_by"], 0) + e["amount_cents"]
    total = sum(cat.values())
    return {"month": month, "items": [exp_view(e) for e in mx], "total": euro(total),
            "paid_by": {k: euro(v) for k, v in paid.items()},
            "by_category": [{"category": k, "amount": euro(v), "pct": round(v * 100 / total) if total else 0}
                            for k, v in sorted(cat.items(), key=lambda kv: -kv[1])],
            "month_balance": balance(mx, mem), "balance": balance(allx, mem)}


@router.post("/expenses", status_code=201)
async def create_expense(body: ExpenseIn, c: dict = Depends(ctx)):
    check_payer(c, body.paid_by)
    if body.category == "saldo":
        raise HTTPException(422, "Per saldare usa il pulsante «Salda»")
    doc = {"_id": new_id(), "couple_id": c["cid"], "title": body.title.strip(), "amount_cents": cents(body.amount),
           "paid_by": body.paid_by, "date": body.date or logic.today_rome().isoformat(), "category": body.category,
           "split": body.split, "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await get_db().expenses.insert_one(doc)
    await changed(c, "expenses", "created", doc["_id"])
    return exp_view(doc)


@router.patch("/expenses/{id}")
async def patch_expense(id: str, body: ExpensePatch, c: dict = Depends(ctx)):
    e = await get_owned("expenses", id, c)
    data = body.model_dump(exclude_unset=True)
    if data.get("paid_by"):
        check_payer(c, data["paid_by"])
    if data.get("category") and (data["category"] not in EXP_CATEGORIES or (data["category"] == "saldo") != (e["category"] == "saldo")):
        raise HTTPException(422, "Categoria non valida")
    if data.get("split") and data["split"] not in SPLITS:
        raise HTTPException(422, "Divisione non valida")
    if "amount" in data:
        data["amount_cents"] = cents(data.pop("amount"))
    if data:
        await get_db().expenses.update_one({"_id": id}, {"$set": data})
    await changed(c, "expenses", "updated", id)
    return exp_view(await get_owned("expenses", id, c))


@router.delete("/expenses/{id}")
async def delete_expense(id: str, c: dict = Depends(ctx)):
    await soft_delete("expenses", id, c)
    return {"ok": True}


@router.post("/expenses/settle", status_code=201)
async def settle(c: dict = Depends(ctx)):
    """Registra il pagamento che azzera il saldo complessivo."""
    allx = [e async for e in get_db().expenses.find({"couple_id": c["cid"], "deleted_at": None})]
    bal = balance(allx, c["couple"]["members"])
    if not bal["from"]:
        raise HTTPException(409, "Siete già pari")
    doc = {"_id": new_id(), "couple_id": c["cid"], "title": "Saldo", "amount_cents": cents(bal["amount"]), "paid_by": bal["from"],
           "date": logic.today_rome().isoformat(), "category": "saldo", "split": "other", "created_by": c["user"]["_id"],
           "created_at": now(), "deleted_at": None}
    await get_db().expenses.insert_one(doc)
    await changed(c, "expenses", "created", doc["_id"])
    return exp_view(doc)
