"""Promemoria automatici: eventi, domanda del giorno, attività in scadenza. Gira in background ogni minuto."""
import asyncio
from datetime import datetime, timedelta, timezone

from . import logic, planner_logic as pl
from .db import get_db
from .routes_planner import notify_to, now

MAX_LATE = timedelta(hours=6)  # dopo un'interruzione non recuperiamo promemoria troppo vecchi
QUESTION_HOUR = 19
TASK_HOUR = 8


async def _once(key: str) -> bool:
    """True solo la prima volta per questa chiave (evita doppioni)."""
    r = await get_db().reminders_sent.update_one({"_id": key}, {"$setOnInsert": {"at": now()}}, upsert=True)
    return r.upserted_id is not None


def human(minutes: int) -> str:
    if minutes % 1440 == 0:
        n = minutes // 1440
        return "1 giorno" if n == 1 else f"{n} giorni"
    if minutes >= 60 and minutes % 60 == 0:
        n = minutes // 60
        return "1 ora" if n == 1 else f"{n} ore"
    return f"{minutes} minuti"


async def tick(at: datetime | None = None):
    at = at or logic.now_rome()
    db = get_db()
    today = at.date()
    async for couple in db.couples.find({}):
        cid, members = couple["_id"], couple["members"]
        # 1) promemoria degli eventi
        async for ev in db.events.find({"couple_id": cid, "deleted_at": None, "reminder": {"$ne": None}}):
            for s, _e in pl.expand(ev, today, today + timedelta(days=15)):
                if len(s) == 10:
                    continue  # i promemoria valgono solo per eventi con orario
                start = pl.parse_when(s)[0]
                due = start - timedelta(minutes=ev["reminder"])
                if due <= at < due + MAX_LATE and at < start + timedelta(minutes=5) and await _once(f"ev:{ev['_id']}:{s}"):
                    text = f"Adesso: {ev['title']}" if ev["reminder"] == 0 else f"Tra {human(ev['reminder'])}: {ev['title']}"
                    for uid in members:
                        await notify_to(cid, uid, None, "eventi", text, "/calendario")
        # 2) domanda del giorno (la sera, a chi non ha ancora risposto)
        if at.hour >= QUESTION_HOUR:
            answered = {a["user_id"] async for a in db.answers.find({"couple_id": cid, "date": today.isoformat()})}
            for uid in members:
                if uid not in answered and await _once(f"dq:{cid}:{today}:{uid}"):
                    other = len(answered - {uid}) > 0
                    await notify_to(cid, uid, None, "domanda", "Il tuo partner ha risposto alla domanda di oggi: tocca a te!" if other
                                    else "La domanda del giorno ti aspetta 💬", "/domanda")
        # 3) attività che scadono oggi (la mattina)
        if at.hour >= TASK_HOUR:
            async for t in db.tasks.find({"couple_id": cid, "deleted_at": None, "done": False, "due": today.isoformat()}):
                targets = members if t.get("assignee") in (None, "both") else [t["assignee"]]
                for uid in targets:
                    if uid in members and await _once(f"td:{t['_id']}:{today}:{uid}"):
                        await notify_to(cid, uid, None, "attivita", f"Oggi scade: {t['title']}", "/attivita")
    # pulizia dei vecchi segnaposto
    limit = (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()
    await db.reminders_sent.delete_many({"at": {"$lt": limit}})


async def loop():
    while True:
        await asyncio.sleep(60)
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
