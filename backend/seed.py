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
    await db.users.delete_many({}); await db.couples.delete_many({})
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
    print("Fatto: Marco e Giulia, insieme da 413 giorni.")

asyncio.run(main())
