import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app.main import app
from tests.test_fase2 import H


@pytest.fixture
async def duo():
    dbmod.set_db(AsyncMongoMockClient()["t8"])
    await dbmod.init_indexes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        a = (await c.post("/api/auth/register", json={"email": "a@x.it", "password": "password123", "name": "Marco"})).json()
        code = (await c.get("/api/couple", headers=H(a))).json()["invite_code"]
        b = (await c.post("/api/auth/register", json={"email": "b@x.it", "password": "password123", "name": "Giulia", "invite_code": code})).json()
        yield c, a, b


async def test_ricettario(duo):
    c, a, b = duo
    r = await c.post("/api/recipes", headers=H(b), json={"title": "Pasta cremosa", "url": "instagram.com/reel/abc", "category": "Primi", "ingredients": "200 g pasta\nlimone"})
    assert r.status_code == 201
    rec = r.json()
    assert rec["url"] == "https://instagram.com/reel/abc" and rec["source"] == "instagram" and rec["mine"] is True and rec["fav"] is False
    # il partner la vede e riceve la notifica
    lst = (await c.get("/api/recipes", headers=H(a))).json()
    assert len(lst) == 1 and lst[0]["mine"] is False
    assert any("Pasta cremosa" in n["text"] for n in (await c.get("/api/notifications", headers=H(a))).json()["items"])
    # entrambi possono modificare: preferita, provata, voto
    p = (await c.patch(f"/api/recipes/{rec['id']}", headers=H(a), json={"fav": True, "tried": True, "rating": 4})).json()
    assert p["fav"] and p["tried"] and p["rating"] == 4
    # validazioni
    assert (await c.post("/api/recipes", headers=H(a), json={"title": "x", "url": "non un link"})).status_code == 422
    assert (await c.post("/api/recipes", headers=H(a), json={"title": "x", "category": "Boh"})).status_code == 422
    assert (await c.post("/api/recipes", headers=H(a), json={"title": "x", "photo": "data:text/html;base64,AAA"})).status_code == 422
    assert (await c.patch(f"/api/recipes/{rec['id']}", headers=H(a), json={"rating": 9})).status_code == 422
    # cestino e ripristino
    assert (await c.delete(f"/api/recipes/{rec['id']}", headers=H(a))).status_code == 200
    assert (await c.get("/api/recipes", headers=H(a))).json() == []
    assert (await c.post(f"/api/trash/recipes/{rec['id']}/restore", headers=H(a))).status_code == 200
    assert len((await c.get("/api/recipes", headers=H(b))).json()) == 1
    # eliminazione multipla
    assert (await c.post("/api/bulk/recipes/delete", headers=H(a), json={"ids": [rec["id"]]})).status_code == 200


async def test_sfondo_sincronizzato(duo):
    c, a, b = duo
    foto = "data:image/jpeg;base64," + "A" * 1000
    r = (await c.put("/api/me/background", headers=H(a), json={"photo": foto})).json()
    assert r["bgv"] and r["look"]["bg"] == "foto"
    me = (await c.get("/api/me", headers=H(a))).json()
    assert me["look"]["bgv"] == r["bgv"] and "bg_photo" not in me and foto not in str(me)
    assert (await c.get("/api/me/background", headers=H(a))).json() == {"photo": foto, "bgv": r["bgv"]}
    # luminosità e trasparenza viaggiano col profilo
    p = await c.patch("/api/me", headers=H(a), json={"look": {"hue": 20, "bg": "foto", "dim": 40, "card": 70, "bgv": r["bgv"]}})
    assert p.json()["look"]["dim"] == 40 and p.json()["look"]["card"] == 70
    assert (await c.patch("/api/me", headers=H(a), json={"look": {"hue": 20, "bg": "foto", "dim": 5}})).status_code == 422
    assert (await c.put("/api/me/background", headers=H(a), json={"photo": "data:text/html;base64,AA"})).status_code == 422
    # il partner non vede la foto altrui
    assert (await c.get("/api/me/background", headers=H(b))).json()["photo"] is None
    d = (await c.delete("/api/me/background", headers=H(a))).json()
    assert d["look"]["bg"] == "nessuno" and "bgv" not in d["look"]
    assert (await c.get("/api/me/background", headers=H(a))).json()["photo"] is None
