from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app import logic, push, scheduler
from app.main import app
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t6"])
    push.reset_vapid()
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


SUB = {"endpoint": "https://push.example.com/abc123", "keys": {"p256dh": "BPk", "auth": "xyz"}}


async def test_chiave_vapid_stabile_e_sottoscrizione(duo):
    c, a, b = duo
    k1 = (await c.get("/api/push/key")).json()["key"]
    push.reset_vapid()
    assert (await c.get("/api/push/key")).json()["key"] == k1 and len(k1) > 80  # persistita nel database
    assert (await c.post("/api/push/subscribe", headers=H(a), json=SUB)).status_code == 201
    assert (await c.post("/api/push/subscribe", headers=H(a), json=SUB)).status_code == 201  # idempotente
    assert (await c.get("/api/push/status", headers=H(a))).json() == {"devices": 1}
    assert (await c.post("/api/push/subscribe", headers=H(a), json={"endpoint": "http://x.it/1234567", "keys": {}})).status_code == 422
    assert (await c.post("/api/push/subscribe", headers=H(a), json={**SUB, "keys": {"p256dh": "x"}})).status_code == 422
    assert (await c.post("/api/push/subscribe")).status_code in (401, 422)
    await c.post("/api/push/unsubscribe", headers=H(a), json={"endpoint": SUB["endpoint"]})
    assert (await c.get("/api/push/status", headers=H(a))).json() == {"devices": 0}


async def test_le_notifiche_partono_anche_in_push_e_rispettano_le_preferenze(duo, monkeypatch):
    c, a, b = duo
    sent = []
    monkeypatch.setattr(push, "_send", lambda sub, payload, vapid: sent.append((sub["endpoint"], payload)))
    await c.post("/api/push/subscribe", headers=H(b), json=SUB)
    await c.post("/api/tasks", headers=H(a), json={"title": "Bucato", "assignee": b["user"]["id"]})
    assert len(sent) == 1 and "Bucato" in sent[0][1] and sent[0][0] == SUB["endpoint"]
    await c.patch("/api/me", headers=H(b), json={"notifications": {"master": True, "types": {"attivita": False}}})
    await c.post("/api/tasks", headers=H(a), json={"title": "Altro", "assignee": b["user"]["id"]})
    assert len(sent) == 1  # disattivate per quel tipo: niente push
    # dispositivo scaduto → viene rimosso
    await c.patch("/api/me", headers=H(b), json={"notifications": {"master": True, "types": {"attivita": True}}})
    monkeypatch.setattr(push, "_send", lambda *a: 410)
    await c.post("/api/tasks", headers=H(a), json={"title": "Terzo", "assignee": b["user"]["id"]})
    assert (await c.get("/api/push/status", headers=H(b))).json() == {"devices": 0}


async def test_promemoria_evento_una_sola_volta(duo):
    c, a, b = duo
    giorno = logic.today_rome() + timedelta(days=1)
    await c.post("/api/events", headers=H(a), json={"title": "Cena da Luigi", "start": f"{giorno}T20:00", "end": f"{giorno}T22:00", "reminder": 60})
    await c.post("/api/events", headers=H(a), json={"title": "Senza avviso", "start": f"{giorno}T20:00"})
    await c.post("/api/events", headers=H(a), json={"title": "Tutto il giorno", "start": str(giorno), "reminder": 30})
    prima = datetime.combine(giorno, datetime.min.time()).replace(hour=18, minute=30)
    await scheduler.tick(prima)
    n = (await c.get("/api/notifications", headers=H(b))).json()["items"]
    assert not any("Tra 1 ora" in i["text"] for i in n)  # troppo presto
    dopo = prima.replace(hour=19, minute=1)
    await scheduler.tick(dopo)
    await scheduler.tick(dopo + timedelta(minutes=1))
    for who in (a, b):
        n = [i["text"] for i in (await c.get("/api/notifications", headers=H(who))).json()["items"] if "Tra 1 ora" in i["text"]]
        assert n == ["Tra 1 ora: Cena da Luigi"]
    await scheduler.tick(prima.replace(hour=23))  # troppo tardi: l'evento è finito
    assert sum("Tra 1 ora" in i["text"] for i in (await c.get("/api/notifications", headers=H(a))).json()["items"]) == 1


async def test_promemoria_domanda_e_attivita_in_scadenza(duo):
    c, a, b = duo
    oggi = logic.today_rome()
    await c.post("/api/tasks", headers=H(a), json={"title": "Pagare TARI", "due": str(oggi), "assignee": b["user"]["id"]})
    await c.put("/api/question/today", headers=H(a), json={"text": "x"})
    mattina = datetime.combine(oggi, datetime.min.time()).replace(hour=9)
    await scheduler.tick(mattina)
    tb = [i["text"] for i in (await c.get("/api/notifications", headers=H(b))).json()["items"]]
    assert "Oggi scade: Pagare TARI" in tb
    assert not any("tocca a te!" in t and "Il tuo partner" in t for t in tb)  # il promemoria della domanda è serale
    assert not any("scade" in i["text"] for i in (await c.get("/api/notifications", headers=H(a))).json()["items"])  # non è di A
    sera = mattina.replace(hour=19, minute=30)
    await scheduler.tick(sera); await scheduler.tick(sera + timedelta(minutes=5))
    tb = [i["text"] for i in (await c.get("/api/notifications", headers=H(b))).json()["items"] if i["text"].startswith("Il tuo partner")]
    assert tb == ["Il tuo partner ha risposto alla domanda di oggi: tocca a te!"]
    assert not any("ti aspetta" in i["text"] for i in (await c.get("/api/notifications", headers=H(a))).json()["items"])  # A ha già risposto


async def test_recupero_password_con_codice_del_partner(duo):
    c, a, b = duo
    r = await c.post("/api/auth/reset-code", headers=H(a))
    code = r.json()["code"]
    assert len(code) == 8
    body = {"email": "b@x.it", "code": code, "password": "nuovapassword1"}
    assert (await c.post("/api/auth/reset", json={**body, "code": "SBAGLIAT"})).status_code == 400
    ok = await c.post("/api/auth/reset", json=body)
    assert ok.status_code == 200 and ok.json()["token"]
    assert (await c.post("/api/auth/login", json={"email": "b@x.it", "password": "nuovapassword1"})).status_code == 200
    assert (await c.post("/api/auth/login", json={"email": "b@x.it", "password": "password123"})).status_code == 401
    assert (await c.post("/api/auth/reset", json=body)).status_code == 400  # monouso
    # tentativi limitati
    code = (await c.post("/api/auth/reset-code", headers=H(a))).json()["code"]
    for _ in range(5):
        await c.post("/api/auth/reset", json={**body, "code": "SBAGLIAT"})
    assert (await c.post("/api/auth/reset", json={**body, "code": code})).status_code == 400
    assert (await c.post("/api/auth/reset-code")).status_code in (401, 403)
