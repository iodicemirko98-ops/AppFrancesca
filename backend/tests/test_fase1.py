from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app import logic
from app.main import app


@pytest.fixture
async def client():
    dbmod.set_db(AsyncMongoMockClient()["test"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def reg(client, email, name, code=None):
    body = {"email": email, "password": "password123", "name": name}
    if code:
        body["invite_code"] = code
    return await client.post("/api/auth/register", json=body)


# ---------- logica pura ----------
def test_codice_invito_6_caratteri_senza_ambigui():
    for _ in range(200):
        c = logic.new_invite_code()
        assert len(c) == 6 and not set(c) & set("01OI")


def test_giorni_insieme_il_primo_giorno_conta_1():
    d = date(2025, 1, 1)
    assert logic.days_together(d, d) == 1
    assert logic.days_together(d, d + timedelta(days=99)) == 100


def test_date_tonde():
    start = date(2025, 1, 31)
    assert logic.add_months(start, 1) == date(2025, 2, 28)
    centesimo = start + timedelta(days=99)
    assert logic.milestone_info(start, centesimo)["today"] == "100 giorni"
    assert logic.milestone_info(start, date(2025, 7, 31))["today"] == "6 mesi"
    assert logic.milestone_info(start, date(2026, 1, 31))["today"] == "1 anno"
    nxt = logic.milestone_info(start, date(2025, 2, 1))["next"]
    assert nxt["label"] == "100 giorni"


# ---------- registrazione e login ----------
async def test_registrazione_crea_spazio_e_codice(client):
    r = await reg(client, "a@x.it", "Mirko")
    assert r.status_code == 200
    tok = r.json()["token"]
    c = (await client.get("/api/couple", headers=auth(tok))).json()
    assert len(c["invite_code"]) == 6 and c["paired"] is False
    assert c["modules"]["ciclo"] is False and c["modules"]["calendario"] is True


async def test_login_e_password_errata(client):
    await reg(client, "a@x.it", "Mirko")
    assert (await client.post("/api/auth/login", json={"email": "A@X.it", "password": "password123"})).status_code == 200
    assert (await client.post("/api/auth/login", json={"email": "a@x.it", "password": "sbagliata1"})).status_code == 401


async def test_email_duplicata_e_password_corta(client):
    await reg(client, "a@x.it", "Mirko")
    assert (await reg(client, "a@x.it", "Altro")).status_code == 409
    r = await client.post("/api/auth/register", json={"email": "b@x.it", "password": "corta", "name": "B"})
    assert r.status_code == 422


async def test_senza_token_401(client):
    assert (await client.get("/api/me")).status_code == 401
    assert (await client.get("/api/me", headers=auth("finto"))).status_code == 401


# ---------- abbinamento ----------
async def test_abbinamento_con_codice_in_registrazione(client):
    a = (await reg(client, "a@x.it", "Mirko")).json()
    code = (await client.get("/api/couple", headers=auth(a["token"]))).json()["invite_code"]
    b = await reg(client, "b@x.it", "Francesca", code.lower())  # il codice non distingue maiuscole
    assert b.status_code == 200
    c = (await client.get("/api/couple", headers=auth(b.json()["token"]))).json()
    assert c["paired"] is True and {m["name"] for m in c["members"]} == {"Mirko", "Francesca"}


async def test_codice_non_valido(client):
    r = await reg(client, "a@x.it", "Mirko", "ZZZZZZ")
    assert r.status_code == 404
    # e non resta un utente a metà
    assert (await reg(client, "a@x.it", "Mirko")).status_code == 200


async def test_registrazioni_chiuse_dopo_due_utenti(client):
    a = (await reg(client, "a@x.it", "A")).json()
    code = (await client.get("/api/couple", headers=auth(a["token"]))).json()["invite_code"]
    assert (await reg(client, "b@x.it", "B", code)).status_code == 200
    assert (await reg(client, "c@x.it", "C")).status_code == 403


async def test_join_di_chi_era_gia_registrato_da_solo(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "max_users", 5)
    a = (await reg(client, "a@x.it", "A")).json()
    b = (await reg(client, "b@x.it", "B")).json()
    code = (await client.get("/api/couple", headers=auth(a["token"]))).json()["invite_code"]
    await client.patch("/api/couple", headers=auth(b["token"]), json={"start_date": "2024-05-01"})
    r = await client.post("/api/couple/join", headers=auth(b["token"]), json={"invite_code": code})
    assert r.status_code == 200 and r.json()["paired"] is True
    # lo spazio solitario di B è sparito e la data di inizio è passata allo spazio condiviso
    assert r.json()["start_date"] == "2024-05-01"
    assert await dbmod.get_db().couples.count_documents({}) == 1


async def test_spazio_pieno_e_auto_join(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "max_users", 5)
    a = (await reg(client, "a@x.it", "A")).json()
    code = (await client.get("/api/couple", headers=auth(a["token"]))).json()["invite_code"]
    assert (await client.post("/api/couple/join", headers=auth(a["token"]), json={"invite_code": code})).status_code == 400
    await reg(client, "b@x.it", "B", code)
    assert (await reg(client, "c@x.it", "C", code)).status_code == 400


# ---------- profilo, impostazioni, home ----------
async def test_profilo_tema_notifiche(client):
    tok = (await reg(client, "a@x.it", "A")).json()["token"]
    r = await client.patch("/api/me", headers=auth(tok), json={
        "name": "Mirko", "theme": "scuro",
        "notifications": {"master": False, "types": {"solleciti": False, "inventata": True}}})
    u = r.json()
    assert u["theme"] == "scuro" and u["notifications"]["master"] is False
    assert u["notifications"]["types"]["solleciti"] is False and "inventata" not in u["notifications"]["types"]
    assert (await client.patch("/api/me", headers=auth(tok), json={"theme": "rosa"})).status_code == 422
    assert (await client.patch("/api/me", headers=auth(tok), json={"photo": "http://x"})).status_code == 422
    ok = await client.patch("/api/me", headers=auth(tok), json={"photo": "data:image/jpeg;base64,AAAA"})
    assert ok.json()["photo"].startswith("data:image/")


async def test_moduli_attivabili_e_data_inizio(client):
    tok = (await reg(client, "a@x.it", "A")).json()["token"]
    c = (await client.patch("/api/couple", headers=auth(tok), json={"modules": {"ciclo": True, "risparmi": False, "boh": True}})).json()
    assert c["modules"]["ciclo"] is True and c["modules"]["risparmi"] is False and "boh" not in c["modules"]
    futura = (date.today() + timedelta(days=30)).isoformat()
    assert (await client.patch("/api/couple", headers=auth(tok), json={"start_date": futura})).status_code == 400


async def test_home_giorni_insieme(client):
    tok = (await reg(client, "a@x.it", "A")).json()["token"]
    assert (await client.get("/api/home", headers=auth(tok))).json()["days_together"] is None
    start = (logic.today_rome() - timedelta(days=99)).isoformat()
    await client.patch("/api/couple", headers=auth(tok), json={"start_date": start})
    h = (await client.get("/api/home", headers=auth(tok))).json()
    assert h["days_together"] == 100 and h["milestone"]["today"] == "100 giorni"


async def test_esporta_e_cancella_account(client):
    a = (await reg(client, "a@x.it", "A")).json()
    code = (await client.get("/api/couple", headers=auth(a["token"]))).json()["invite_code"]
    b = (await reg(client, "b@x.it", "B", code)).json()
    exp = (await client.get("/api/export", headers=auth(a["token"]))).json()
    assert exp["user"]["email"] == "a@x.it" and "password_hash" not in str(exp)
    assert (await client.request("DELETE", "/api/me", headers=auth(a["token"]), json={"password": "no"})).status_code == 403
    assert (await client.request("DELETE", "/api/me", headers=auth(a["token"]), json={"password": "password123"})).status_code == 204
    assert (await client.get("/api/me", headers=auth(a["token"]))).status_code == 401
    c = (await client.get("/api/couple", headers=auth(b["token"]))).json()
    assert [m["name"] for m in c["members"]] == ["B"]
