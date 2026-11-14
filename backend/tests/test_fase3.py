from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app import logic
from app.main import app
from app.questions import QUESTIONS, question_for
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t3"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


def test_domanda_stabile_per_giorno_e_varia():
    d = date(2026, 11, 14)
    assert question_for(d) == question_for(d)
    assert question_for(d) != question_for(d + timedelta(days=1))
    assert question_for(d) == question_for(d + timedelta(days=len(QUESTIONS)))
    assert len(set(QUESTIONS)) == len(QUESTIONS)


async def test_risposta_segreta_finche_non_rispondono_entrambi(duo):
    c, a, b = duo
    q = (await c.get("/api/question/today", headers=H(a))).json()
    assert q["my_answer"] is None and not q["partner_answered"] and q["question"]
    r = (await c.put("/api/question/today", headers=H(a), json={"text": "Il primo bacio"})).json()
    assert r["my_answer"] == "Il primo bacio" and r["partner_answer"] is None
    # il partner non vede la risposta prima di rispondere, ma sa che l'altro ha risposto
    t = (await c.get("/api/question/today", headers=H(b))).json()
    assert t["partner_answered"] and t["partner_answer"] is None and not t["revealed"]
    n = (await c.get("/api/notifications", headers=H(b))).json()
    assert "Tocca a te" in n["items"][0]["text"]
    # ora risponde: si rivelano entrambe
    r = (await c.put("/api/question/today", headers=H(b), json={"text": "Il viaggio a Lisbona"})).json()
    assert r["partner_answer"] == "Il primo bacio" and r["revealed"]
    assert (await c.get("/api/question/today", headers=H(a))).json()["partner_answer"] == "Il viaggio a Lisbona"
    assert "leggervi" in (await c.get("/api/notifications", headers=H(a))).json()["items"][0]["text"]
    # modifica possibile, nessuna nuova notifica
    await c.put("/api/question/today", headers=H(a), json={"text": "Corretto"})
    assert (await c.get("/api/notifications", headers=H(b))).json()["unread"] == 1
    assert (await c.put("/api/question/today", headers=H(a), json={"text": "   "})).status_code == 422


async def test_storico_mostra_i_giorni_passati(duo):
    c, a, b = duo
    ieri = (logic.today_rome() - timedelta(days=1)).isoformat()
    db = dbmod.get_db()
    await db.answers.insert_many([
        {"_id": "1", "couple_id": a["user"]["couple_id"], "date": ieri, "user_id": a["user"]["id"], "text": "A"},
        {"_id": "2", "couple_id": a["user"]["couple_id"], "date": ieri, "user_id": b["user"]["id"], "text": "B"},
    ])
    h = (await c.get("/api/question/history", headers=H(a))).json()
    assert h[0]["date"] == ieri and h[0]["mine"] == "A" and h[0]["partner"] == "B"


async def test_home_riassume_la_domanda(duo):
    c, a, b = duo
    h = (await c.get("/api/home", headers=H(a))).json()["daily_question"]
    assert h["question"] and not h["answered"]
    await c.put("/api/question/today", headers=H(b), json={"text": "x"})
    h = (await c.get("/api/home", headers=H(a))).json()["daily_question"]
    assert h["partner_answered"] and not h["answered"]


# ---------- sondaggi ----------
async def test_sondaggio_voto_segreto_e_risultato(duo):
    c, a, b = duo
    p = (await c.post("/api/polls", headers=H(a), json={"title": "Dove si mangia?", "options": ["Pizza", "Sushi", "Pizza "]})).status_code
    assert p == 422  # opzioni duplicate
    p = (await c.post("/api/polls", headers=H(a), json={"title": "Dove si mangia?", "options": ["Pizza", "Sushi", "Tacos"]})).json()
    assert (await c.get("/api/notifications", headers=H(b))).json()["unread"] == 1
    pizza, sushi, tacos = [o["id"] for o in p["options"]]
    # A vota: non vede i risultati finché B non vota
    r = (await c.post(f"/api/polls/{p['id']}/vote", headers=H(a), json={"option_id": pizza})).json()
    assert r["my_vote"] == pizza and not r["revealed"] and "votes" not in r["options"][0]
    rb = (await c.get("/api/polls", headers=H(b))).json()[0]
    assert rb["partner_voted"] and not rb["revealed"]
    # B vota la stessa → si chiude con vincitore
    r = (await c.post(f"/api/polls/{p['id']}/vote", headers=H(b), json={"option_id": pizza})).json()
    assert r["status"] == "closed" and r["winner_id"] == pizza and r["revealed"]
    assert r["options"][0]["votes"] == 2
    assert (await c.post(f"/api/polls/{p['id']}/vote", headers=H(b), json={"option_id": sushi})).status_code == 409
    assert (await c.post(f"/api/polls/{p['id']}/vote", headers=H(b), json={"option_id": "boh"})).status_code in (409, 422)


async def test_sondaggio_pareggio_sorteggio_e_riapertura(duo):
    c, a, b = duo
    p = (await c.post("/api/polls", headers=H(a), json={"title": "Film", "options": ["A", "B"]})).json()
    x, y = [o["id"] for o in p["options"]]
    await c.post(f"/api/polls/{p['id']}/vote", headers=H(a), json={"option_id": x})
    assert (await c.post(f"/api/polls/{p['id']}/draw", headers=H(a))).status_code == 409  # manca il voto di B
    r = (await c.post(f"/api/polls/{p['id']}/vote", headers=H(b), json={"option_id": y})).json()
    assert r["status"] == "open" and r["tie"] and r["revealed"]
    r = (await c.post(f"/api/polls/{p['id']}/draw", headers=H(a))).json()
    assert r["status"] == "closed" and r["tie_broken"] and r["winner_id"] in (x, y)
    r = (await c.post(f"/api/polls/{p['id']}/reopen", headers=H(b))).json()
    assert r["status"] == "open" and r["my_vote"] is None


async def test_sondaggio_da_soli_si_rivela_dopo_il_proprio_voto():
    dbmod.set_db(AsyncMongoMockClient()["solo"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "s@x.it", "password": "password123", "name": "Solo"})).json()
        p = (await c.post("/api/polls", headers=H(a), json={"title": "T", "options": ["A", "B"]})).json()
        r = (await c.post(f"/api/polls/{p['id']}/vote", headers=H(a), json={"option_id": p["options"][0]["id"]})).json()
        assert r["revealed"] and r["status"] == "closed"


# ---------- da fare insieme ----------
async def test_bucket_list_completamento_e_casuale(duo):
    c, a, b = duo
    assert (await c.post("/api/bucket/random", headers=H(a))).status_code == 404
    i1 = (await c.post("/api/bucket", headers=H(a), json={"title": "Vedere l'alba al mare", "category": "natura"})).json()
    i2 = (await c.post("/api/bucket", headers=H(b), json={"title": "Corso di cucina", "category": "cibo"})).json()
    assert (await c.post("/api/bucket", headers=H(a), json={"title": "x", "category": "boh"})).status_code == 422
    r = (await c.patch(f"/api/bucket/{i1['id']}", headers=H(b), json={"done": True, "memory": "Freddo ma bellissimo"})).json()
    assert r["done"] and r["done_by"] == b["user"]["id"] and r["done_on"] and r["memory"] == "Freddo ma bellissimo"
    assert "Avete fatto" in (await c.get("/api/notifications", headers=H(a))).json()["items"][0]["text"]
    for _ in range(5):  # estrae solo ciò che non è ancora fatto
        assert (await c.post("/api/bucket/random", headers=H(a))).json()["id"] == i2["id"]
    lst = (await c.get("/api/bucket", headers=H(a))).json()
    assert [d["done"] for d in lst] == [False, True]
    r = (await c.patch(f"/api/bucket/{i1['id']}", headers=H(a), json={"done": False})).json()
    assert r["done_on"] is None


async def test_cestino_include_decisioni_e_idee(duo):
    c, a, b = duo
    p = (await c.post("/api/polls", headers=H(a), json={"title": "Sondaggio", "options": ["A", "B"]})).json()
    i = (await c.post("/api/bucket", headers=H(a), json={"title": "Idea"})).json()
    await c.delete(f"/api/polls/{p['id']}", headers=H(a)); await c.delete(f"/api/bucket/{i['id']}", headers=H(b))
    assert {t["title"] for t in (await c.get("/api/trash", headers=H(a))).json()} == {"Sondaggio", "Idea"}
    await c.post(f"/api/trash/polls/{p['id']}/restore", headers=H(a))
    assert len((await c.get("/api/polls", headers=H(a))).json()) == 1
    ex = (await c.get("/api/export", headers=H(a))).json()
    assert "answers" in ex and "polls" in ex and "bucket" in ex
