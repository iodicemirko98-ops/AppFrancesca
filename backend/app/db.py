from motor.motor_asyncio import AsyncIOMotorClient

from .config import settings

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(settings.mongo_url)
        _db = _client[settings.db_name]
    return _db


def set_db(db):
    """Usato dai test per iniettare un database simulato."""
    global _db
    _db = db


async def init_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.couples.create_index("invite_code", unique=True)
