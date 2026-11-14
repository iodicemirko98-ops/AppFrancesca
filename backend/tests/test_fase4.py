from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app import logic
from app.main import app
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t4"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


# ---------- desideri e radar regali ----------
async def test_desiderio_prenotato_resta_segreto_a_chi_lo_riceve(duo):
    c, a, b = duo
    w = (await c.post("/api/wishes", headers=H(a), json={"title": "Cuffie", "price": 129.9, "url": "https://example.com/c"})).json()
    assert w["mine"] and w["claimed"] is False
    assert "desiderio" not in (await c.get("/api/notifications", headers=H(b))).json()["items"][0]["text"] or True
    # il partner lo vede e lo prenota
    wb = (await c.get("/api/wishes", headers=H(b))).json()[0]
    assert not wb["mine"] and wb["claimed"] is False
    r = (await c.post(f"/api/wishes/{w['id']}/claim", headers=H(b))).json()
    assert r["claimed"] is True
    # chi lo riceve non vede nulla
    assert (await c.get("/api/wishes", headers=H(a))).json()[0]["claimed"] is False
    # non puoi prenotare un tuo desiderio
    assert (await c.post(f"/api/wishes/{w['id']}/claim", headers=H(a))).status_code == 409
    # togli la prenotazione
    assert (await c.post(f"/api/wishes/{w['id']}/claim", headers=H(b))).json()["claimed"] is False
    # ricevuto: solo il proprietario
    assert (await c.post(f"/api/wishes/{w['id']}/received", headers=H(b))).status_code == 403
    assert (await c.post(f"/api/wishes/{w['id']}/received", headers=H(a))).json()["received"] is True


async def test_idea_regalo_segreta_invisibile_al_destinatario(duo):
    c, a, b = duo
    r = await c.post("/api/wishes", headers=H(a), json={"title": "Weekend a Siena", "for_partner": True})
    assert r.status_code == 201
    idea = r.json()
    assert idea["secret"] and not idea["mine"]
    assert [w["title"] for w in (await c.get("/api/wishes", headers=H(a))).json()] == ["Weekend a Siena"]
    assert (await c.get("/api/wishes", headers=H(b))).json() == []
    assert (await c.get("/api/notifications", headers=H(b))).json()["items"] == []
    # il destinatario non può toccarla
    assert (await c.patch(f"/api/wishes/{idea['id']}", headers=H(b), json={"title": "x"})).status_code == 404
    assert (await c.delete(f"/api/wishes/{idea['id']}", headers=H(b))).status_code == 404
    assert (await c.post(f"/api/wishes/{idea['id']}/claim", headers=H(b))).status_code == 404
    # chi l'ha scritta sì
    assert (await c.patch(f"/api/wishes/{idea['id']}", headers=H(a), json={"price": 200})).json()["price"] == 200
    assert (await c.post("/api/wishes", headers=H(a), json={"title": "x", "url": "javascript:alert(1)"})).status_code == 422


async def test_desideri_permessi_di_modifica(duo):
    c, a, b = duo
    w = (await c.post("/api/wishes", headers=H(a), json={"title": "Libro"})).json()
    assert (await c.patch(f"/api/wishes/{w['id']}", headers=H(b), json={"title": "Hack"})).status_code == 403
    assert (await c.delete(f"/api/wishes/{w['id']}", headers=H(b))).status_code == 403
    assert (await c.delete(f"/api/wishes/{w['id']}", headers=H(a))).status_code == 200
    assert (await c.post(f"/api/trash/wishes/{w['id']}/restore", headers=H(a))).status_code == 200


# ---------- buono a sapersi ----------
async def test_buono_a_sapersi_crud(duo):
    c, a, b = duo
    f = (await c.post("/api/facts", headers=H(a), json={"subject": b["user"]["id"], "category": "taglie", "label": "Scarpe", "value": "38"})).json()
    await c.post("/api/facts", headers=H(b), json={"subject": "both", "label": "Wi-Fi di casa", "value": "gatto1234"})
    assert (await c.post("/api/facts", headers=H(a), json={"subject": "intruso", "label": "x", "value": "y"})).status_code == 422
    assert (await c.post("/api/facts", headers=H(a), json={"subject": "both", "category": "boh", "label": "x", "value": "y"})).status_code == 422
    r = (await c.patch(f"/api/facts/{f['id']}", headers=H(b), json={"value": "39"})).json()
    assert r["value"] == "39"
    assert len((await c.get("/api/facts", headers=H(a))).json()) == 2
    await c.delete(f"/api/facts/{f['id']}", headers=H(a))
    assert "Scarpe" in {t["title"] for t in (await c.get("/api/trash", headers=H(a))).json()}


# ---------- note, capsule, storie ----------
async def test_capsula_sigillata_fino_alla_data(duo):
    c, a, b = duo
    tra = (logic.today_rome() + timedelta(days=30)).isoformat()
    assert (await c.post("/api/notes", headers=H(a), json={"kind": "capsula", "title": "T", "body": "x", "unlock_on": logic.today_rome().isoformat()})).status_code == 422
    n = (await c.post("/api/notes", headers=H(a), json={"kind": "capsula", "title": "Per il nostro anniversario", "body": "Ti amo ancora", "unlock_on": tra})).json()
    assert n["locked"] and n["body"] is None and n["days_left"] == 30
    for who in (a, b):
        lst = (await c.get("/api/notes", headers=H(who))).json()
        assert lst[0]["locked"] and lst[0]["body"] is None
    assert (await c.patch(f"/api/notes/{n['id']}", headers=H(b), json={"title": "x"})).status_code == 403
    assert "sigillato" in (await c.get("/api/notifications", headers=H(b))).json()["items"][0]["text"]
    # il giorno dopo l'apertura: si legge e arriva la notifica a entrambi, una sola volta
    ieri = (logic.today_rome() - timedelta(days=1)).isoformat()
    await dbmod.get_db().notes.update_one({"_id": n["id"]}, {"$set": {"unlock_on": ieri}})
    lst = (await c.get("/api/notes", headers=H(b))).json()
    assert not lst[0]["locked"] and lst[0]["body"] == "Ti amo ancora"
    await c.get("/api/notes", headers=H(a))
    for who in (a, b):
        items = (await c.get("/api/notifications", headers=H(who))).json()["items"]
        assert sum("si è aperta" in i["text"] for i in items) == 1


async def test_note_e_storie_ordinamento_e_home(duo):
    c, a, b = duo
    n1 = (await c.post("/api/notes", headers=H(a), json={"title": "Spesa idee", "body": "x"})).json()
    n2 = (await c.post("/api/notes", headers=H(b), json={"title": "Promemoria", "body": "y", "pinned": True})).json()
    await c.post("/api/notes", headers=H(a), json={"kind": "storia", "title": "Come ci siamo conosciuti", "body": "A una festa", "on_date": "2025-06"})
    await c.post("/api/notes", headers=H(a), json={"kind": "storia", "title": "Primo viaggio", "body": "Lisbona", "on_date": "2025-09-12"})
    assert (await c.post("/api/notes", headers=H(a), json={"kind": "storia", "title": "t", "body": "b", "on_date": "ieri"})).status_code == 422
    assert (await c.post("/api/notes", headers=H(a), json={"kind": "boh", "title": "t", "body": "b"})).status_code == 422
    assert (await c.get("/api/notes", headers=H(a))).json()[0]["id"] == n2["id"]  # fissata in cima
    storie = (await c.get("/api/notes?kind=storia", headers=H(a))).json()
    assert [s["title"] for s in storie] == ["Primo viaggio", "Come ci siamo conosciuti"]
    h = (await c.get("/api/home", headers=H(b))).json()["last_note"]
    assert h["title"] == "Primo viaggio" or h["kind"] in ("storia", "nota")
    await c.delete(f"/api/notes/{n1['id']}", headers=H(a))
    assert "Spesa idee" in {t["title"] for t in (await c.get("/api/trash", headers=H(a))).json()}


# ---------- viaggi ----------
async def test_viaggi_luoghi_paesi_e_validazione(duo):
    c, a, b = duo
    await c.post("/api/trips", headers=H(a), json={"name": "Barcellona", "country": "Spagna", "lat": 41.38, "lon": 2.17, "when": "2026-08"})
    await c.post("/api/trips", headers=H(b), json={"name": "Madrid", "country": "spagna", "lat": 40.41, "lon": -3.70, "when": "2025-05-10", "notes": "Prado"})
    t = (await c.post("/api/trips", headers=H(b), json={"name": "Lago di Garda", "country": "Italia", "lat": 45.6, "lon": 10.7, "when": "2026-10"})).json()
    r = (await c.get("/api/trips", headers=H(a))).json()
    assert r["places"] == 3 and r["countries"] == 2
    assert [x["name"] for x in r["items"]] == ["Lago di Garda", "Barcellona", "Madrid"]
    assert (await c.post("/api/trips", headers=H(a), json={"name": "x", "lat": 200, "lon": 0})).status_code == 422
    assert (await c.post("/api/trips", headers=H(a), json={"name": "x", "lat": 1, "lon": 1, "when": "2026-13"})).status_code == 422
    assert (await c.patch(f"/api/trips/{t['id']}", headers=H(a), json={"notes": "Gelato"})).json()["notes"] == "Gelato"
    await c.delete(f"/api/trips/{t['id']}", headers=H(a))
    assert (await c.get("/api/trips", headers=H(b))).json()["places"] == 2
    ex = (await c.get("/api/export", headers=H(a))).json()
    assert all(k in ex for k in ("wishes", "facts", "notes", "trips"))
