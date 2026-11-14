"""Sincronizzazione in tempo reale: una "stanza" WebSocket per ogni coppia.

I messaggi sono piccoli: {"entity", "op", "id", "origin", "data"?}. I client, quando ne ricevono
uno, aggiornano la sezione interessata (rileggendo i dati dal server)."""
from collections import defaultdict

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .config import settings
from .db import get_db

router = APIRouter()


class Rooms:
    def __init__(self):
        self.rooms: dict[str, list[tuple[str, WebSocket]]] = defaultdict(list)

    async def connect(self, couple_id: str, user_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms[couple_id].append((user_id, ws))

    def disconnect(self, couple_id: str, ws: WebSocket):
        self.rooms[couple_id] = [(u, w) for u, w in self.rooms[couple_id] if w is not ws]
        if not self.rooms[couple_id]:
            self.rooms.pop(couple_id, None)

    async def send(self, couple_id: str, msg: dict, only_user: str | None = None):
        for user_id, ws in list(self.rooms.get(couple_id, [])):
            if only_user and user_id != only_user:
                continue
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(couple_id, ws)

    def online_users(self, couple_id: str) -> set[str]:
        return {u for u, _ in self.rooms.get(couple_id, [])}


rooms = Rooms()


async def emit(couple_id: str, entity: str, op: str, id: str | None = None, origin: str | None = None,
               only_user: str | None = None, data: dict | None = None):
    msg = {"entity": entity, "op": op, "id": id, "origin": origin}
    if data is not None:
        msg["data"] = data
    await rooms.send(couple_id, msg, only_user)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = ""):
    try:
        user_id = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])["sub"]
    except jwt.PyJWTError:
        await ws.close(code=4401)
        return
    user = await get_db().users.find_one({"_id": user_id})
    if not user or not user.get("couple_id"):
        await ws.close(code=4401)
        return
    couple_id = user["couple_id"]
    await rooms.connect(couple_id, user_id, ws)
    try:
        await ws.send_json({"entity": "hello", "op": "ready"})
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        rooms.disconnect(couple_id, ws)
