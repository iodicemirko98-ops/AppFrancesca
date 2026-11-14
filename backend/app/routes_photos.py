"""Le nostre foto: album condiviso. Le immagini arrivano già ridimensionate dal telefono (data URL JPEG)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .db import get_db
from .routes_planner import changed, clean, ctx, get_owned, new_id, now, soft_delete

router = APIRouter(prefix="/api/photos")

MAX_PHOTOS = 80
PREFIX = "data:image/jpeg;base64,"


class PhotoIn(BaseModel):
    data: str = Field(max_length=700_000)   # ~1000 px
    thumb: str = Field(max_length=120_000)  # ~360 px
    caption: str = Field(default="", max_length=140)
    fav: bool = True

    @field_validator("data", "thumb")
    @classmethod
    def jpeg(cls, v):
        if not v.startswith(PREFIX):
            raise ValueError("Formato non valido")
        return v


class PhotoPatch(BaseModel):
    caption: str | None = Field(default=None, max_length=140)
    fav: bool | None = None


def meta(d: dict) -> dict:
    d = clean(d)
    d.pop("data", None)
    d.pop("deleted_at", None)
    d.pop("deleted_by", None)
    return d


@router.post("", status_code=201)
async def add_photo(body: PhotoIn, c: dict = Depends(ctx)):
    db = get_db()
    if await db.photos.count_documents({"couple_id": c["cid"], "deleted_at": None}) >= MAX_PHOTOS:
        raise HTTPException(422, f"L'album può contenere al massimo {MAX_PHOTOS} foto")
    doc = {"_id": new_id(), "couple_id": c["cid"], "data": body.data, "thumb": body.thumb, "caption": body.caption.strip(),
           "fav": body.fav, "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await db.photos.insert_one(doc)
    await changed(c, "photos", "created", doc["_id"])
    return meta(doc)


@router.get("")
async def list_photos(c: dict = Depends(ctx)):
    docs = get_db().photos.find({"couple_id": c["cid"], "deleted_at": None}, {"data": 0}).sort("created_at", -1)
    return [meta(d) async for d in docs]


@router.get("/carousel")
async def carousel(c: dict = Depends(ctx)):
    """Le foto preferite per la home (a dimensione piena, al massimo 12)."""
    docs = get_db().photos.find({"couple_id": c["cid"], "deleted_at": None, "fav": True}).sort("created_at", -1).limit(12)
    return [{"id": d["_id"], "data": d["data"], "caption": d.get("caption", "")} async for d in docs]


@router.get("/{id}")
async def one_photo(id: str, c: dict = Depends(ctx)):
    d = await get_owned("photos", id, c)
    return {**meta(d), "data": d["data"]}


@router.patch("/{id}")
async def patch_photo(id: str, body: PhotoPatch, c: dict = Depends(ctx)):
    await get_owned("photos", id, c)
    upd = {}
    if body.caption is not None:
        upd["caption"] = body.caption.strip()
    if body.fav is not None:
        upd["fav"] = body.fav
    if upd:
        await get_db().photos.update_one({"_id": id}, {"$set": upd})
        await changed(c, "photos", "updated", id)
    return meta(await get_owned("photos", id, c))


@router.delete("/{id}")
async def delete_photo(id: str, c: dict = Depends(ctx)):
    await soft_delete("photos", id, c)
    return {"ok": True}
