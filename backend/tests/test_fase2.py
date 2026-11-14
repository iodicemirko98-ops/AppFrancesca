from datetime import date, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient
from starlette.testclient import TestClient

from app import db as dbmod
from app import planner_logic as pl
from app import routes_planner
from app.main import app


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["test"])
    await dbmod.init_indexes()
    routes_planner.NUDGE_COOLDOWN_S = 0
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a["token"]))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


def H(t):
    return {"Authorization": f"Bearer {t['token'] if isinstance(t, dict) else t}"}


# ---------- logica pura ----------
def ev(start, end=None, rec="nessuna"):
    return {"_id": "e", "title": "T", "start": start, "end": end or start, "recurrence": rec}


def test_evento_singolo_nel_range():
    assert pl.expand(ev("2026-03-10T20:00"), date(2026, 3, 1), date(2026, 3, 31)) == [("2026-03-10T20:00", "2026-03-10T20:00")]
    assert pl.expand(ev("2026-03-10"), date(2026, 4, 1), date(2026, 4, 30)) == []


def test_evento_multi_giorno_che_tocca_il_range():
    occ = pl.expand(ev("2026-02-27", "2026-03-02"), date(2026, 3, 1), date(2026, 3, 31))
    assert occ == [("2026-02-27", "2026-03-02")]


def test_ricorrenze():
    assert len(pl.expand(ev("2026-01-01", rec="giornaliera"), date(2026, 3, 1), date(2026, 3, 31))) == 31
    sett = pl.expand(ev("2026-01-05", rec="settimanale"), date(2026, 3, 1), date(2026, 3, 31))
    assert [s for s, _ in sett] == ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"]
    mens = pl.expand(ev("2026-01-31", rec="mensile"), date(2026, 2, 1), date(2026, 4, 30))
    assert [s for s, _ in mens] == ["2026-02-28", "2026-03-31", "2026-04-30"]
    ann = pl.expand(ev("2020-06-15", rec="annuale"), date(2026, 6, 1), date(2026, 6, 30))
    assert ann == [("2026-06-15", "2026-06-15")]


def test_ricorrenza_non_prima_dell_inizio():
    assert pl.expand(ev("2026-05-10", rec="settimanale"), date(2026, 4, 1), date(2026, 5, 9)) == []


def test_solleciti_escalation_e_ultimo_ripetuto():
    t = [pl.nudge_text(i, "Marco", "bucato") for i in range(15)]
    assert t[0] != t[1] != t[2]
    assert t[9] == t[10] == t[14]
    assert "bucato" in t[0] and "Marco" in t[0]


# ---------- eventi ----------
async def test_eventi_crud_range_e_notifica(duo):
    c, a, b = duo
    r = await c.post("/api/events", headers=H(a), json={"title": "Cena", "start": "2026-03-10T20:00", "end": "2026-03-10T22:00"})
    assert r.status_code == 201
    eid = r.json()["id"]
    # il partner la vede
    lst = (await c.get("/api/events?from=2026-03-01&to=2026-03-31", headers=H(b))).json()
    assert [e["title"] for e in lst] == ["Cena"]
    # e riceve la notifica
    n = (await c.get("/api/notifications", headers=H(b))).json()
    assert n["unread"] == 1 and "Cena" in n["items"][0]["text"]
    # chi l'ha creato no
    assert (await c.get("/api/notifications", headers=H(a))).json()["unread"] == 0
    # modifica
    r = await c.patch(f"/api/events/{eid}", headers=H(b), json={"title": "Cena fuori", "recurrence": "settimanale"})
    assert r.json()["title"] == "Cena fuori"
    lst = (await c.get("/api/events?from=2026-03-01&to=2026-03-31", headers=H(a))).json()
    assert len(lst) == 4
    # valori non validi
    assert (await c.post("/api/events", headers=H(a), json={"title": "x", "start": "boh"})).status_code == 422
    assert (await c.post("/api/events", headers=H(a), json={"title": "x", "start": "2026-03-10", "recurrence": "mai"})).status_code == 422
    assert (await c.post("/api/events", headers=H(a), json={"title": "x", "start": "2026-03-10T10:00", "end": "2026-03-09T10:00"})).status_code == 422


async def test_eventi_isolati_tra_coppie(duo):
    c, a, b = duo
    eid = (await c.post("/api/events", headers=H(a), json={"title": "Privato", "start": "2026-03-10"})).json()["id"]
    x = (await c.post("/api/auth/register", json={"email": "z@x.it", "password": "password123", "name": "Terzo"}))
    # la registrazione oltre MAX_USERS è chiusa: la terza persona non entra, quindi nessun accesso agli eventi
    assert x.status_code == 403
    assert (await c.get(f"/api/events/{eid}")).status_code == 401


# ---------- attività ----------
async def test_attivita_assegnazione_completamento_e_solleciti(duo):
    c, a, b = duo
    me, partner = a["user"]["id"], b["user"]["id"]
    r = await c.post("/api/tasks", headers=H(a), json={"title": "Bolletta luce", "assignee": partner, "due": "2026-03-12"})
    assert r.status_code == 201
    tid = r.json()["id"]
    assert (await c.get("/api/notifications", headers=H(b))).json()["unread"] == 1
    assert (await c.post("/api/tasks", headers=H(a), json={"title": "x", "assignee": "intruso"})).status_code == 422
    # solleciti crescenti
    t1 = (await c.post(f"/api/tasks/{tid}/nudge", headers=H(a))).json()["text"]
    t2 = (await c.post(f"/api/tasks/{tid}/nudge", headers=H(a))).json()["text"]
    assert t1 != t2
    # completamento → notifica a chi l'aveva creata
    await c.patch(f"/api/tasks/{tid}", headers=H(b), json={"done": True})
    n = (await c.get("/api/notifications", headers=H(a))).json()
    assert "completato" in n["items"][0]["text"]
    # sollecito su attività completata → 409
    assert (await c.post(f"/api/tasks/{tid}/nudge", headers=H(a))).status_code == 409
    # riapri
    t = (await c.patch(f"/api/tasks/{tid}", headers=H(a), json={"done": False})).json()
    assert t["done"] is False and t["done_by"] is None


async def test_categorie_attivita(duo):
    c, a, b = duo
    cat = (await c.post("/api/task-categories", headers=H(a), json={"name": "Casa", "color": "#6E9B6B"})).json()
    t = (await c.post("/api/tasks", headers=H(b), json={"title": "Aspirapolvere", "category_id": cat["id"]})).json()
    assert t["category_id"] == cat["id"]
    assert (await c.post("/api/tasks", headers=H(b), json={"title": "x", "category_id": "nope"})).status_code == 422
    await c.delete(f"/api/task-categories/{cat['id']}", headers=H(a))
    assert (await c.get("/api/tasks", headers=H(a))).json()[0]["category_id"] is None


async def test_notifiche_rispettano_le_preferenze(duo):
    c, a, b = duo
    await c.patch("/api/me", headers=H(b), json={"notifications": {"master": True, "types": {"solleciti": False}}})
    tid = (await c.post("/api/tasks", headers=H(a), json={"title": "Prova"})).json()["id"]
    await c.post(f"/api/tasks/{tid}/nudge", headers=H(a))
    assert (await c.get("/api/notifications", headers=H(b))).json()["unread"] == 0
    await c.patch("/api/me", headers=H(b), json={"notifications": {"master": False, "types": {}}})
    await c.post("/api/events", headers=H(a), json={"title": "E", "start": "2026-03-10"})
    assert (await c.get("/api/notifications", headers=H(b))).json()["items"] == []


async def test_segna_notifiche_come_lette(duo):
    c, a, b = duo
    await c.post("/api/events", headers=H(a), json={"title": "E", "start": "2026-03-10"})
    await c.post("/api/notifications/read", headers=H(b))
    assert (await c.get("/api/notifications", headers=H(b))).json()["unread"] == 0


# ---------- liste ----------
async def test_liste_voci_e_svuota_completate(duo):
    c, a, b = duo
    lid = (await c.post("/api/lists", headers=H(a), json={"name": "Spesa", "kind": "spesa"})).json()["id"]
    await c.post(f"/api/lists/{lid}/items", headers=H(a), json={"text": "Latte"})
    r = (await c.post(f"/api/lists/{lid}/items", headers=H(b), json={"text": "Pane"})).json()
    assert r["total"] == 2
    iid = r["items"][0]["id"]
    r = (await c.patch(f"/api/lists/{lid}/items/{iid}", headers=H(b), json={"done": True})).json()
    assert r["done_count"] == 1 and r["items"][0]["done_by"] == b["user"]["id"]
    summary = (await c.get("/api/lists", headers=H(a))).json()
    assert summary[0]["total"] == 2 and "items" not in summary[0]
    r = (await c.post(f"/api/lists/{lid}/clear-done", headers=H(a))).json()
    assert [i["text"] for i in r["items"]] == ["Pane"]
    assert (await c.post("/api/lists", headers=H(a), json={"name": "x", "kind": "boh"})).status_code == 422
    assert (await c.delete(f"/api/lists/{lid}/items/zzz", headers=H(a))).status_code == 404


# ---------- cestino ----------
async def test_cestino_ripristino_e_scadenza(duo):
    c, a, b = duo
    eid = (await c.post("/api/events", headers=H(a), json={"title": "Concerto", "start": "2026-03-10"})).json()["id"]
    tid = (await c.post("/api/tasks", headers=H(a), json={"title": "Prenota"})).json()["id"]
    await c.delete(f"/api/events/{eid}", headers=H(a))
    await c.delete(f"/api/tasks/{tid}", headers=H(b))
    assert (await c.get(f"/api/events/{eid}", headers=H(a))).status_code == 404
    tr = (await c.get("/api/trash", headers=H(a))).json()
    assert {t["title"] for t in tr} == {"Concerto", "Prenota"}
    assert (await c.post(f"/api/trash/events/{eid}/restore", headers=H(b))).status_code == 200
    assert (await c.get(f"/api/events/{eid}", headers=H(a))).status_code == 200
    # scadenza a 7 giorni
    old = (datetime.utcnow() - timedelta(days=8)).isoformat() + "+00:00"
    await dbmod.get_db().tasks.update_one({"_id": tid}, {"$set": {"deleted_at": old}})
    assert (await c.get("/api/trash", headers=H(a))).json() == []
    # eliminazione definitiva e svuota
    lid = (await c.post("/api/lists", headers=H(a), json={"name": "L"})).json()["id"]
    await c.delete(f"/api/lists/{lid}", headers=H(a))
    assert (await c.delete(f"/api/trash/lists/{lid}", headers=H(a))).status_code == 200
    assert (await c.post("/api/trash/boh/x/restore", headers=H(a))).status_code == 404


# ---------- home ed esportazione ----------
async def test_home_mostra_prossimi_eventi_e_scadenze(duo):
    c, a, b = duo
    soon = (date.today() + timedelta(days=2)).isoformat()
    await c.post("/api/events", headers=H(a), json={"title": "Weekend al lago", "start": soon})
    await c.post("/api/events", headers=H(a), json={"title": "Passato", "start": "2020-01-01"})
    await c.post("/api/tasks", headers=H(a), json={"title": "Scaduta", "due": "2020-01-01"})
    await c.post("/api/tasks", headers=H(a), json={"title": "Lontana", "due": "2099-01-01"})
    h = (await c.get("/api/home", headers=H(b))).json()
    assert [e["title"] for e in h["next_events"]] == ["Weekend al lago"]
    assert [t["title"] for t in h["due_tasks"]] == ["Scaduta"] and h["due_tasks"][0]["overdue"]
    assert h["unread_notifications"] >= 1
    ex = (await c.get("/api/export", headers=H(a))).json()
    assert len(ex["events"]) == 2 and len(ex["tasks"]) == 2


async def test_unione_porta_con_se_i_dati_creati_prima(duo):
    """Chi crea dati prima dell'abbinamento li ritrova dopo (migrazione alla coppia)."""
    dbmod.set_db(AsyncMongoMockClient()["t2"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "p@x.it", "password": "password123", "name": "P"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "q@x.it", "password": "password123", "name": "Q"})).json()
        await c.post("/api/events", headers=H(b), json={"title": "Mio", "start": "2026-03-10"})
        await c.post("/api/couple/join", headers=H(b), json={"invite_code": code})
        lst = (await c.get("/api/events?from=2026-03-01&to=2026-03-31", headers=H(a))).json()
        assert [e["title"] for e in lst] == ["Mio"]


# ---------- websocket ----------
def test_websocket_sync_tra_partner():
    dbmod.set_db(AsyncMongoMockClient()["t3"])
    with TestClient(app) as tc:
        a = tc.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "A"}).json()
        code = tc.get("/api/couple", headers=H(a)).json()["invite_code"]
        b = tc.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "B", "invite_code": code}).json()
        with tc.websocket_connect(f"/ws?token={b['token']}") as ws:
            assert ws.receive_json()["entity"] == "hello"
            tc.post("/api/tasks", headers=H(a), json={"title": "Sync"})
            msg = ws.receive_json()
            assert msg["entity"] == "tasks" and msg["op"] == "created" and msg["origin"] == a["user"]["id"]
        with pytest.raises(Exception):
            with tc.websocket_connect("/ws?token=falso"):
                pass
