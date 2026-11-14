"""Popola un database SOLO di prova con due utenti d'esempio (mai quello vero).
Uso:  DB_NAME=noidue_demo python seed.py
Accessi: marco@demo.it / giulia@demo.it, password "demo12345"."""
import asyncio
import uuid
from datetime import timedelta

from app import logic
from app.config import settings
from app.db import get_db, init_indexes
from app.routes import now
from app.security import hash_password


async def main():
    if not settings.db_name.endswith("_demo"):
        raise SystemExit("Per sicurezza il seed gira solo su un database che finisce con _demo (es. DB_NAME=noidue_demo).")
    db = get_db()
    for c in ("users", "couples", *logic.COUPLE_COLLECTIONS):
        await db[c].delete_many({})
    await init_indexes()
    cid = str(uuid.uuid4())
    ids = []
    for nome, email in (("Marco", "marco@demo.it"), ("Giulia", "giulia@demo.it")):
        uid = str(uuid.uuid4()); ids.append(uid)
        await db.users.insert_one({"_id": uid, "email": email, "password_hash": hash_password("demo12345"), "name": nome,
            "photo": None, "theme": "auto", "notifications": {"master": True, "types": dict(logic.NOTIFICATION_TYPES)},
            "couple_id": cid, "created_at": now()})
    start = logic.today_rome() - timedelta(days=412)
    await db.couples.insert_one({"_id": cid, "invite_code": logic.new_invite_code(), "members": ids,
        "start_date": start.isoformat(), "modules": dict(logic.MODULES), "created_at": now()})
    M, G = ids
    t = logic.today_rome()
    d = lambda n: (t + timedelta(days=n)).isoformat()
    base = {"couple_id": cid, "created_at": now(), "deleted_at": None}
    ev = lambda title, start, **k: {"_id": uuid.uuid4().hex, **base, "title": title, "start": start, "end": k.pop("end", start),
        "location": k.pop("location", None), "notes": None, "category": k.pop("category", "noi"), "type": k.pop("type", "evento"),
        "recurrence": k.pop("recurrence", "nessuna"), "reminder": None, "created_by": M}
    await db.events.insert_many([
        ev("Cena da Luigi", f"{d(2)}T20:30", end=f"{d(2)}T22:30", location="Trattoria da Luigi", category="amici"),
        ev("Weekend a Chiusi", d(9), end=d(11), category="viaggi", location="Lago di Chiusi"),
        ev("Compleanno di Giulia", d(30), type="compleanno", recurrence="annuale", category="famiglia"),
        ev("Yoga insieme", f"{d(-3)}T18:30", end=f"{d(-3)}T19:30", recurrence="settimanale", category="noi"),
        ev("Anniversario", (start).isoformat(), type="anniversario", recurrence="annuale"),
    ])
    cats = [{"_id": uuid.uuid4().hex, "couple_id": cid, "name": n, "color": c, "created_at": now()}
            for n, c in (("Casa", "#6E9B6B"), ("Burocrazia", "#4F8FA8"), ("Spesa", "#D49A3A"))]
    await db.task_categories.insert_many(cats)
    task = lambda title, due, who, cat, **k: {"_id": uuid.uuid4().hex, **base, "title": title, "notes": None, "due": due,
        "assignee": who, "category_id": cat["_id"], "done": k.get("done", False), "done_by": k.get("by"), "done_at": None,
        "nudges": 0, "last_nudge_at": None, "created_by": M}
    await db.tasks.insert_many([
        task("Pagare la bolletta della luce", d(-1), G, cats[1]),
        task("Prenotare il tagliando dell'auto", d(4), M, cats[1]),
        task("Portare giù la differenziata", d(0), "both", cats[0]),
        task("Comprare il regalo per la mamma", d(6), G, cats[2]),
        task("Cambiare le lenzuola", d(-5), M, cats[0], done=True, by=M),
    ])
    item = lambda text, done=False: {"id": uuid.uuid4().hex, "text": text, "done": done, "added_by": M,
                                     "done_by": G if done else None, "created_at": now()}
    await db.lists.insert_many([
        {"_id": uuid.uuid4().hex, **base, "name": "Spesa della settimana", "kind": "spesa", "created_by": M,
         "items": [item("Latte"), item("Pane integrale"), item("Pomodori", True), item("Pasta", True), item("Parmigiano")]},
        {"_id": uuid.uuid4().hex, **base, "name": "Film da vedere", "kind": "film", "created_by": G,
         "items": [item("La grande bellezza"), item("Perfect Days"), item("Il ragazzo e l'airone")]},
        {"_id": uuid.uuid4().hex, **base, "name": "Idee per l'estate", "kind": "viaggio", "created_by": G,
         "items": [item("Costiera Amalfitana"), item("Dolomiti, qualche giorno di trekking")]},
    ])
    await db.notifications.insert_one({"_id": uuid.uuid4().hex, "couple_id": cid, "to": G, "from": M, "type": "eventi",
        "text": "Marco ha aggiunto «Cena da Luigi» al calendario", "link": "/calendario", "read": False, "created_at": now()})
    from app.questions import question_for
    for n, (a_m, a_g) in enumerate([("Il giorno in cui abbiamo cucinato la carbonara sbagliata e abbiamo riso per un'ora.", "La prima sera sul lungomare, quando mi hai prestato la giacca."),
                                    ("Un weekend senza programmi, solo noi e il divano.", "Lisbona, senza dubbio: il tram 28 e i pastéis de nata.")], start=1):
        day = t - timedelta(days=n)
        await db.answers.insert_many([
            {"_id": uuid.uuid4().hex, "couple_id": cid, "date": day.isoformat(), "user_id": M, "text": a_m, "created_at": now(), "updated_at": now()},
            {"_id": uuid.uuid4().hex, "couple_id": cid, "date": day.isoformat(), "user_id": G, "text": a_g, "created_at": now(), "updated_at": now()}])
    await db.answers.insert_one({"_id": uuid.uuid4().hex, "couple_id": cid, "date": t.isoformat(), "user_id": G,
        "text": "Quando fai le vocine mentre cucini.", "created_at": now(), "updated_at": now()})
    opt = lambda *xs: [{"id": uuid.uuid4().hex[:8], "text": x} for x in xs]
    o1 = opt("Pizza da Gigi", "Sushi", "Osteria del Borgo")
    o2 = opt("Dolomiti", "Costiera Amalfitana")
    await db.polls.insert_many([
        {"_id": uuid.uuid4().hex, **base, "title": "Dove mangiamo sabato?", "options": o1, "votes": {M: o1[0]["id"]}, "status": "open",
         "winner_id": None, "tie_broken": False, "created_by": M},
        {"_id": uuid.uuid4().hex, **base, "title": "Dove andiamo ad agosto?", "options": o2, "votes": {M: o2[1]["id"], G: o2[1]["id"]},
         "status": "closed", "winner_id": o2[1]["id"], "tie_broken": False, "created_by": G},
    ])
    bk = lambda title, cat, **k: {"_id": uuid.uuid4().hex, **base, "title": title, "category": cat, "notes": None, "done": k.get("done", False),
        "done_on": k.get("on"), "done_by": M if k.get("done") else None, "memory": k.get("memory"), "created_by": G}
    await db.bucket.insert_many([
        bk("Vedere l'alba al mare", "natura"), bk("Corso di cucina di coppia", "cibo"), bk("Notte in un rifugio in montagna", "viaggi"),
        bk("Ballare sotto la pioggia", "esperienze"), bk("Cena al buio", "cibo"),
        bk("Picnic al tramonto", "natura", done=True, on=d(-20), memory="Con le zanzare, ma bellissimo."),
        bk("Fare il giro dei mercatini di Natale", "esperienze", done=True, on=d(-60), memory="Vin brulé e mani gelate."),
    ])
    print("Fatto: Marco e Giulia, insieme da 413 giorni.")

asyncio.run(main())
