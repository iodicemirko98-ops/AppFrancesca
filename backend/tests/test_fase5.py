from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app import logic
from app.main import app
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t5"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


# ---------- risparmi ----------
async def test_obiettivo_versamenti_prelievi_e_raggiungimento(duo):
    c, a, b = duo
    g = (await c.post("/api/goals", headers=H(a), json={"name": "Vacanza in Giappone", "target": 3000})).json()
    assert g["saved"] == 0 and g["pct"] == 0
    r = (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": 500.5, "note": "Tredicesima"})).json()
    assert r["saved"] == 500.5 and r["pct"] == 16 and r["by_member"][a["user"]["id"]] == 500.5
    r = (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(b), json={"amount": 0.1})).json()
    r = (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(b), json={"amount": 0.2})).json()
    assert r["saved"] == 500.8  # niente errori da virgola mobile
    assert (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": 0})).status_code == 422
    assert (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": -9999})).status_code == 422
    r = (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": -100})).json()
    assert r["saved"] == 400.8
    n = (await c.get("/api/notifications", headers=H(b))).json()["items"]
    assert any("500,50" in i["text"] for i in n)
    r = (await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": 5000})).json()
    assert r["reached"] and r["pct"] == 100 and r["remaining"] == 0
    assert any("raggiunto" in i["text"] for i in (await c.get("/api/notifications", headers=H(b))).json()["items"])
    did = r["deposits"][0]["id"]
    assert (await c.delete(f"/api/goals/{g['id']}/deposits/{did}", headers=H(b))).json()["saved"] == 400.8


async def test_obiettivo_con_scadenza_calcola_il_mensile(duo):
    c, a, b = duo
    tra = (logic.today_rome() + timedelta(days=61)).isoformat()
    g = (await c.post("/api/goals", headers=H(a), json={"name": "Divano", "target": 1000, "deadline": tra})).json()
    assert g["days_left"] == 61 and 480 < g["monthly_needed"] < 520
    assert (await c.post("/api/goals", headers=H(a), json={"name": "x", "target": -5})).status_code == 422
    await c.delete(f"/api/goals/{g['id']}", headers=H(a))
    assert "Divano" in {t["title"] for t in (await c.get("/api/trash", headers=H(a))).json()}


# ---------- spese comuni ----------
async def test_saldo_spese_a_meta_e_saldo_finale(duo):
    c, a, b = duo
    ua, ub = a["user"]["id"], b["user"]["id"]
    oggi = logic.today_rome().isoformat()
    await c.post("/api/expenses", headers=H(a), json={"title": "Affitto", "amount": 850, "paid_by": ua, "category": "casa"})
    await c.post("/api/expenses", headers=H(b), json={"title": "Spesa", "amount": 110.9, "paid_by": ub, "category": "spesa"})
    await c.post("/api/expenses", headers=H(a), json={"title": "Regalo per lei", "amount": 40, "paid_by": ua, "category": "regali", "split": "other"})
    await c.post("/api/expenses", headers=H(b), json={"title": "Parrucchiere", "amount": 60, "paid_by": ub, "split": "self"})
    r = (await c.get("/api/expenses", headers=H(a))).json()
    # A: +425 (affitto) ; B: +55.45 (spesa) ; regalo: B deve 40 ad A ; personale: nulla
    # saldo = (425 - 55.45) + 40 = 409.55 : Giulia deve a Marco
    assert r["balance"] == {"amount": 409.55, "from": ub, "to": ua}
    assert r["total"] == 1000.9 + 60 and r["paid_by"][ua] == 890.0
    assert r["by_category"][0]["category"] == "casa" and sum(x["pct"] for x in r["by_category"]) in (99, 100, 101)
    s = (await c.post("/api/expenses/settle", headers=H(b))).json()
    assert s["settlement"] and s["amount"] == 409.55 and s["paid_by"] == ub
    r = (await c.get("/api/expenses", headers=H(a))).json()
    assert r["balance"]["amount"] == 0 and r["total"] == 1060.9  # il saldo non è una spesa
    assert (await c.post("/api/expenses/settle", headers=H(a))).status_code == 409


async def test_spese_validazione_mesi_e_importo_dispari(duo):
    c, a, b = duo
    ua, ub = a["user"]["id"], b["user"]["id"]
    assert (await c.post("/api/expenses", headers=H(a), json={"title": "x", "amount": 10, "paid_by": "chi"})).status_code == 422
    assert (await c.post("/api/expenses", headers=H(a), json={"title": "x", "amount": 0, "paid_by": ua})).status_code == 422
    assert (await c.post("/api/expenses", headers=H(a), json={"title": "x", "amount": 5, "paid_by": ua, "category": "saldo"})).status_code == 422
    e = (await c.post("/api/expenses", headers=H(a), json={"title": "Caffè", "amount": 0.05, "paid_by": ua, "date": "2025-01-10"})).json()
    r = (await c.get("/api/expenses?month=2025-01", headers=H(b))).json()
    assert [x["title"] for x in r["items"]] == ["Caffè"] and r["month_balance"]["amount"] == 0.02
    assert (await c.get("/api/expenses?month=2025-02", headers=H(b))).json()["items"] == []
    assert (await c.get("/api/expenses?month=boh", headers=H(b))).status_code == 422
    assert (await c.patch(f"/api/expenses/{e['id']}", headers=H(b), json={"amount": 20})).json()["amount"] == 20
    await c.delete(f"/api/expenses/{e['id']}", headers=H(a))
    assert (await c.get("/api/expenses?month=2025-01", headers=H(a))).json()["items"] == []


# ---------- cassaforte ----------
async def test_cassaforte_pin_cifratura_e_blocco(duo):
    c, a, b = duo
    assert (await c.get("/api/vault/status", headers=H(a))).json() == {"has_pin": False}
    assert (await c.get("/api/vault", headers=H(a))).status_code == 403
    assert (await c.post("/api/vault/pin", headers=H(a), json={"pin": "12"})).status_code == 422
    assert (await c.post("/api/vault/pin", headers=H(a), json={"pin": "abcd"})).status_code == 422
    tok = (await c.post("/api/vault/pin", headers=H(a), json={"pin": "4821"})).json()["token"]
    V = {**H(a), "X-Vault-Token": tok}
    it = (await c.post("/api/vault", headers=V, json={"label": "Codice allarme", "secret": "7741#", "kind": "codice"})).json()
    assert it["secret"] == "7741#"
    # nel database è cifrato
    raw = await dbmod.get_db().vault.find_one({"_id": it["id"]})
    assert "7741" not in raw["secret_enc"] and "secret" not in raw
    # il token di A non vale per B; B deve creare il proprio PIN
    assert (await c.get("/api/vault", headers={**H(b), "X-Vault-Token": tok})).status_code == 403
    tb = (await c.post("/api/vault/pin", headers=H(b), json={"pin": "9090"})).json()["token"]
    lst = (await c.get("/api/vault", headers={**H(b), "X-Vault-Token": tb})).json()
    assert lst[0]["label"] == "Codice allarme" and lst[0]["secret"] == "7741#"
    # modifica ed eliminazione
    r = (await c.patch(f"/api/vault/{it['id']}", headers=V, json={"secret": "0000"})).json()
    assert r["secret"] == "0000"
    # PIN sbagliato e blocco dopo 5 tentativi
    for _ in range(4):
        assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "0000"})).status_code == 403
    assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "0000"})).status_code == 403
    assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "4821"})).status_code == 429
    # esportazione: nessun segreto cifrato
    ex = (await c.get("/api/export", headers=H(b))).json()
    assert ex["vault"] and "secret_enc" not in ex["vault"][0]
    assert (await c.delete(f"/api/vault/{it['id']}", headers={**H(b), "X-Vault-Token": tb})).status_code == 200


async def test_cassaforte_sblocco_e_cambio_pin(duo):
    c, a, b = duo
    await c.post("/api/vault/pin", headers=H(a), json={"pin": "1357"})
    assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "1357"})).status_code == 200
    assert (await c.post("/api/vault/pin/change", headers=H(a), json={"old_pin": "0000", "new_pin": "2468"})).status_code == 403
    assert (await c.post("/api/vault/pin/change", headers=H(a), json={"old_pin": "1357", "new_pin": "2468"})).status_code == 200
    assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "1357"})).status_code == 403
    assert (await c.post("/api/vault/unlock", headers=H(a), json={"pin": "2468"})).status_code == 200
    me = (await c.get("/api/me", headers=H(a))).json()
    assert "vault_pin_hash" not in me and "password_hash" not in me


# ---------- ciclo ----------
async def test_ciclo_previsione_e_privacy(duo):
    c, a, b = duo
    oggi = logic.today_rome()
    for n in (84, 56, 28):  # cicli di 28 giorni
        await c.post("/api/cycle/periods", headers=H(b), json={"start": (oggi - timedelta(days=n)).isoformat(), "end": (oggi - timedelta(days=n - 4)).isoformat()})
    r = (await c.get("/api/cycle", headers=H(b))).json()
    p = r["prediction"]
    assert p["cycle_length"] == 28 and not p["estimated"] and p["day"] == 29 and p["days_to_next"] == 0 or p["days_to_next"] <= 0
    assert p["ovulation"] and p["fertile_from"] < p["ovulation"] < p["fertile_to"]
    # privato di default: il partner non vede nulla
    assert (await c.get("/api/cycle/partner", headers=H(a))).json() is None
    assert (await c.get("/api/cycle", headers=H(a))).json()["periods"] == []
    # condivisione su scelta: solo il riassunto, non i dettagli
    await c.put("/api/cycle/settings", headers=H(b), json={"share": True})
    s = (await c.get("/api/cycle/partner", headers=H(a))).json()
    assert set(s) == {"day", "next_start", "days_to_next", "estimated"}
    await c.put("/api/cycle/settings", headers=H(b), json={"share": False})
    assert (await c.get("/api/cycle/partner", headers=H(a))).json() is None
    # validazioni
    assert (await c.post("/api/cycle/periods", headers=H(b), json={"start": (oggi + timedelta(days=3)).isoformat()})).status_code == 422
    assert (await c.post("/api/cycle/periods", headers=H(b), json={"start": (oggi - timedelta(days=28)).isoformat()})).status_code == 409
    # l'esportazione di A non contiene i dati di B, quella di B sì
    assert (await c.get("/api/export", headers=H(a))).json()["cycle"] == []
    assert len((await c.get("/api/export", headers=H(b))).json()["cycle"]) == 3
    pid = r["periods"][0]["id"]
    assert (await c.delete(f"/api/cycle/periods/{pid}", headers=H(a))).status_code == 404
    assert len((await c.delete(f"/api/cycle/periods/{pid}", headers=H(b))).json()["periods"]) == 2


async def test_ciclo_senza_dati_usa_la_durata_impostata(duo):
    c, a, b = duo
    await c.put("/api/cycle/settings", headers=H(a), json={"cycle_length": 30})
    await c.post("/api/cycle/periods", headers=H(a), json={"start": (logic.today_rome() - timedelta(days=10)).isoformat()})
    p = (await c.get("/api/cycle", headers=H(a))).json()["prediction"]
    assert p["estimated"] and p["cycle_length"] == 30 and p["days_to_next"] == 20


# ---------- disegno ----------
async def test_disegno_tratti_annulla_e_realtime(duo):
    c, a, b = duo
    d = (await c.post("/api/drawings", headers=H(a), json={"name": "Il nostro gatto"})).json()
    st = lambda i, by=0.1: {"id": i, "color": "#C2603F", "size": 0.01, "pts": [[0.1, 0.1], [by, 0.5]]}
    assert (await c.post(f"/api/drawings/{d['id']}/strokes", headers=H(a), json=st("s1"))).status_code == 201
    assert (await c.post(f"/api/drawings/{d['id']}/strokes", headers=H(b), json=st("s2"))).status_code == 201
    assert (await c.post(f"/api/drawings/{d['id']}/strokes", headers=H(b), json={**st("s3"), "color": "rosso"})).status_code == 422
    assert (await c.post(f"/api/drawings/{d['id']}/strokes", headers=H(b), json={**st("s3"), "pts": [[5, 5]]})).status_code == 422
    r = (await c.get(f"/api/drawings/{d['id']}", headers=H(b))).json()
    assert [s["id"] for s in r["strokes"]] == ["s1", "s2"] and r["strokes"][1]["by"] == b["user"]["id"]
    assert (await c.delete(f"/api/drawings/{d['id']}/strokes/s1", headers=H(b))).status_code == 403
    assert (await c.delete(f"/api/drawings/{d['id']}/strokes/s1", headers=H(a))).status_code == 200
    assert (await c.get("/api/drawings", headers=H(a))).json()[0]["strokes_count"] == 1
    await c.post(f"/api/drawings/{d['id']}/clear", headers=H(b))
    assert (await c.get(f"/api/drawings/{d['id']}", headers=H(a))).json()["strokes"] == []
    await c.delete(f"/api/drawings/{d['id']}", headers=H(a))
    assert (await c.get(f"/api/drawings/{d['id']}", headers=H(a))).status_code == 404


# ---------- il nostro anno ----------
async def test_riepilogo_annuale_conta_solo_l_anno_richiesto(duo):
    c, a, b = duo
    y = logic.today_rome().year
    await c.patch("/api/couple", headers=H(a), json={"start_date": f"{y - 1}-03-01"})
    await c.post("/api/trips", headers=H(a), json={"name": "Parigi", "country": "Francia", "lat": 48.8, "lon": 2.3, "when": f"{y}-03"})
    await c.post("/api/trips", headers=H(a), json={"name": "Roma", "country": "Italia", "lat": 41.9, "lon": 12.5, "when": f"{y - 1}-05"})
    i = (await c.post("/api/bucket", headers=H(a), json={"title": "Picnic"})).json()
    await c.patch(f"/api/bucket/{i['id']}", headers=H(a), json={"done": True, "memory": "Zanzare"})
    t = (await c.post("/api/tasks", headers=H(a), json={"title": "x"})).json()
    await c.patch(f"/api/tasks/{t['id']}", headers=H(b), json={"done": True})
    await c.post("/api/expenses", headers=H(a), json={"title": "Cena", "amount": 80, "paid_by": a["user"]["id"], "category": "uscite"})
    g = (await c.post("/api/goals", headers=H(a), json={"name": "G", "target": 100})).json()
    await c.post(f"/api/goals/{g['id']}/deposits", headers=H(a), json={"amount": 25})
    await c.put("/api/question/today", headers=H(a), json={"text": "a"})
    r = (await c.get("/api/year", headers=H(a))).json()
    assert r["year"] == y and [p["name"] for p in r["places"]] == ["Parigi"] and r["countries"] == 1
    assert r["together_done"][0]["title"] == "Picnic" and r["tasks_done"] == 1
    assert r["expenses_total"] == 80 and r["top_expense_category"] == "uscite" and r["saved"] == 25
    assert r["questions_answered"] == 1 and r["questions_both"] == 0
    assert r["years"] == [y - 1, y]
    old = (await c.get(f"/api/year?year={y - 1}", headers=H(a))).json()
    assert [p["name"] for p in old["places"]] == ["Roma"] and old["tasks_done"] == 0 and old["expenses_total"] == 0
    assert (await c.get("/api/year?year=1800", headers=H(a))).status_code == 422


def test_websocket_avvisa_quando_il_partner_si_collega():
    from starlette.testclient import TestClient
    dbmod.set_db(AsyncMongoMockClient()["t5ws"])
    with TestClient(app) as tc:
        a = tc.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "A"}).json()
        code = tc.get("/api/couple", headers=H(a)).json()["invite_code"]
        with tc.websocket_connect(f"/ws?token={a['token']}") as ws:
            assert ws.receive_json()["entity"] == "hello"
            tc.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "B", "invite_code": code})
            m = ws.receive_json()
            assert m["entity"] == "couple" and m["op"] == "updated"
