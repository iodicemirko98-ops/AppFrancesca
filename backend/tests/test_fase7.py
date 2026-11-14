import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app.main import app
from app.routes_trivia import options_for, points
from app.trivia_bank import QUESTIONS
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t7"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


async def test_domande_e_punti():
    assert len(QUESTIONS) >= 100
    assert points(False, 100) == 0 and points(True, 0) == 150 and points(True, 15000) == 100 and points(True, 99999) == 100
    q = next(iter(QUESTIONS.values()))
    o1, r1 = options_for("m1", q)
    assert options_for("m1", q) == (o1, r1) and o1[r1] == q["right"] and sorted(o1) == sorted([q["right"], *q["wrong"]])


async def test_sfida_risultati_nascosti_fino_alla_fine(duo):
    c, a, b = duo
    cats = (await c.get("/api/trivia/categories", headers=H(a))).json()
    assert len(cats) == 8 and all(x["count"] >= 10 for x in cats)
    assert (await c.post("/api/trivia/matches", headers=H(a), json={"cat": "boh"})).status_code == 422
    m = (await c.post("/api/trivia/matches", headers=H(a), json={"cat": "geografia"})).json()
    mid = m["id"]
    assert m["total"] == 10 and len(m["questions"]) == 10 and "right" not in m["questions"][0]
    assert any("sfidato a Trivia" in n["text"] for n in (await c.get("/api/notifications", headers=H(b))).json()["items"])
    # il partner vede le stesse domande nello stesso ordine
    mb = (await c.get(f"/api/trivia/matches/{mid}", headers=H(b))).json()
    assert [q["options"] for q in mb["questions"]] == [q["options"] for q in m["questions"]]
    # non si può saltare una domanda né rispondere due volte
    assert (await c.post(f"/api/trivia/matches/{mid}/answer", headers=H(a), json={"q": 3, "choice": 0, "ms": 1000})).status_code == 409
    r = await c.post(f"/api/trivia/matches/{mid}/answer", headers=H(a), json={"q": 0, "choice": None, "ms": 15000})
    assert r.status_code == 200 and r.json()["ok"] is False and r.json()["points"] == 0 and "right" in r.json()
    assert (await c.post(f"/api/trivia/matches/{mid}/answer", headers=H(a), json={"q": 0, "choice": 1, "ms": 1000})).status_code == 409
    v = (await c.get(f"/api/trivia/matches/{mid}", headers=H(a))).json()
    assert v["questions"][0]["right"] in range(4) and v["questions"][0]["mine"] is None and "right" not in v["questions"][1]
    # A finisce: B non vede il punteggio di A finché non finisce anche lui
    for i in range(1, 10):
        r = await c.post(f"/api/trivia/matches/{mid}/answer", headers=H(a), json={"q": i, "choice": 0, "ms": 2000})
    assert r.json()["done"] and not r.json()["finished"]
    vb = (await c.get(f"/api/trivia/matches/{mid}", headers=H(b))).json()
    assert vb["partner_done"] is True and "partner_score" not in vb and not vb["finished"]
    lst = (await c.get("/api/trivia/matches", headers=H(b))).json()
    assert lst["matches"][0]["status"] == "tocca_a_te" and lst["stats"]["played"] == 0
    # B finisce con tutte le risposte giuste (le conosce dopo aver risposto: prima sbaglia apposta la 1ª)
    total = 0
    for i in range(10):
        probe = (await c.get(f"/api/trivia/matches/{mid}", headers=H(b))).json()
        r = await c.post(f"/api/trivia/matches/{mid}/answer", headers=H(b), json={"q": i, "choice": 0, "ms": 0})
        total += r.json()["points"]
    assert r.json()["finished"]
    va = (await c.get(f"/api/trivia/matches/{mid}", headers=H(a))).json()
    vb = (await c.get(f"/api/trivia/matches/{mid}", headers=H(b))).json()
    assert va["finished"] and va["partner_score"] == vb["score"] == total and vb["partner_score"] == va["score"]
    assert len(va["partner_choices"]) == 10
    lst = (await c.get("/api/trivia/matches", headers=H(a))).json()
    assert lst["stats"]["played"] == 1 and lst["matches"][0]["status"] == "finita"
    assert sum(lst["stats"]["wins"].values()) + lst["stats"]["draws"] == 1
    assert any("conclusa" in n["text"] for n in (await c.get("/api/notifications", headers=H(a))).json()["items"])
    # un'altra coppia non può vedere la sfida
    assert (await c.get("/api/trivia/matches/xxx", headers=H(a))).status_code == 404


async def test_nuove_domande_evitano_le_recenti(duo):
    c, a, b = duo
    seen = set()
    for _ in range(3):
        m = (await c.post("/api/trivia/matches", headers=H(a), json={"cat": "mix"})).json()
        qs = {q["q"] for q in m["questions"]}
        assert not (qs & seen)
        seen |= qs


JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="


async def test_album_foto_e_carosello(duo):
    c, a, b = duo
    p1 = (await c.post("/api/photos", headers=H(a), json={"data": JPG, "thumb": JPG, "caption": " Roma ", "fav": True})).json()
    p2 = (await c.post("/api/photos", headers=H(b), json={"data": JPG, "thumb": JPG, "fav": False})).json()
    assert p1["caption"] == "Roma" and "data" not in p1
    for bad in ({"data": "http://x/y.jpg", "thumb": JPG}, {"data": JPG, "thumb": "data:image/png;base64,AAA"}, {"data": JPG + "A" * 700_001, "thumb": JPG}):
        assert (await c.post("/api/photos", headers=H(a), json=bad)).status_code == 422
    lst = (await c.get("/api/photos", headers=H(b))).json()
    assert len(lst) == 2 and all("data" not in x and x["thumb"] for x in lst)  # la lista non porta le immagini piene
    car = (await c.get("/api/photos/carousel", headers=H(b))).json()
    assert [x["id"] for x in car] == [p1["id"]] and car[0]["data"] == JPG
    assert (await c.get(f"/api/photos/{p2['id']}", headers=H(a))).json()["data"] == JPG
    await c.patch(f"/api/photos/{p2['id']}", headers=H(a), json={"fav": True, "caption": "Mare"})
    assert len((await c.get("/api/photos/carousel", headers=H(a))).json()) == 2
    # eliminazione in blocco con ripristino dal cestino
    r = await c.post("/api/bulk/photos/delete", headers=H(a), json={"ids": [p1["id"], p2["id"]]})
    assert len(r.json()["deleted"]) == 2 and (await c.get("/api/photos", headers=H(a))).json() == []
    tr = [t for t in (await c.get("/api/trash", headers=H(a))).json() if t["collection"] == "photos"]
    assert {t["title"] for t in tr} == {"Roma", "Mare"}
    await c.post(f"/api/trash/photos/{p1['id']}/restore", headers=H(a))
    assert len((await c.get("/api/photos", headers=H(a))).json()) == 1
