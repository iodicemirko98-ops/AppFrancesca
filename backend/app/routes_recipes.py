"""Il nostro ricettario: ricette trovate su Instagram (o altrove), con link, ingredienti e passaggi."""
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .db import get_db
from .routes_planner import changed, clean, ctx, get_owned, new_id, notify, now, soft_delete

router = APIRouter(prefix="/api/recipes")

MAX_RECIPES = 300
CATEGORIES = ["Antipasti", "Primi", "Secondi", "Contorni", "Dolci", "Colazione", "Lievitati", "Altro"]
PREFIX = "data:image/jpeg;base64,"


def clean_url(v: str | None) -> str | None:
    v = (v or "").strip()
    if not v:
        return None
    if "://" not in v:
        v = "https://" + v
    p = urlparse(v)
    if p.scheme not in ("http", "https") or not p.netloc or "." not in p.netloc:
        raise ValueError("Link non valido")
    return v[:500]


class RecipeIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    url: str | None = Field(default=None, max_length=600)
    category: str = "Altro"
    ingredients: str = Field(default="", max_length=3000)
    steps: str = Field(default="", max_length=6000)
    notes: str = Field(default="", max_length=1000)
    photo: str | None = Field(default=None, max_length=90_000)

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        return clean_url(v)

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in CATEGORIES:
            raise ValueError("Categoria non valida")
        return v

    @field_validator("photo")
    @classmethod
    def _photo(cls, v):
        if v and not v.startswith(PREFIX):
            raise ValueError("Formato foto non valido")
        return v or None


class RecipePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    url: str | None = Field(default=None, max_length=600)
    category: str | None = None
    ingredients: str | None = Field(default=None, max_length=3000)
    steps: str | None = Field(default=None, max_length=6000)
    notes: str | None = Field(default=None, max_length=1000)
    photo: str | None = Field(default=None, max_length=90_000)
    fav: bool | None = None
    tried: bool | None = None
    rating: int | None = Field(default=None, ge=0, le=5)


def view(d: dict, me: str) -> dict:
    d = clean(d)
    d.pop("deleted_at", None)
    d.pop("deleted_by", None)
    d["mine"] = d.get("created_by") == me
    d["source"] = "instagram" if d.get("url") and "instagram.com" in d["url"].lower() else ("link" if d.get("url") else None)
    return d


@router.get("/categories")
async def categories():
    return CATEGORIES


@router.post("", status_code=201)
async def add_recipe(body: RecipeIn, c: dict = Depends(ctx)):
    db = get_db()
    if await db.recipes.count_documents({"couple_id": c["cid"], "deleted_at": None}) >= MAX_RECIPES:
        raise HTTPException(422, f"Il ricettario può contenere al massimo {MAX_RECIPES} ricette")
    doc = {"_id": new_id(), "couple_id": c["cid"], "title": body.title.strip(), "url": body.url, "category": body.category,
           "ingredients": body.ingredients.strip(), "steps": body.steps.strip(), "notes": body.notes.strip(), "photo": body.photo,
           "fav": False, "tried": False, "rating": 0, "created_by": c["user"]["_id"], "created_at": now(), "deleted_at": None}
    await db.recipes.insert_one(doc)
    await changed(c, "recipes", "created", doc["_id"])
    await notify(c, "ricette", f"{c['user']['name']} ha salvato una ricetta: {doc['title']}", "/ricette")
    return view(doc, c["user"]["_id"])


@router.get("")
async def list_recipes(c: dict = Depends(ctx)):
    docs = get_db().recipes.find({"couple_id": c["cid"], "deleted_at": None}).sort("created_at", -1)
    return [view(d, c["user"]["_id"]) async for d in docs]


@router.patch("/{id}")
async def patch_recipe(id: str, body: RecipePatch, c: dict = Depends(ctx)):
    await get_owned("recipes", id, c)
    upd = body.model_dump(exclude_unset=True)
    if "title" in upd:
        upd["title"] = upd["title"].strip()
    if "url" in upd:
        try:
            upd["url"] = clean_url(upd["url"])
        except ValueError as e:
            raise HTTPException(422, str(e))
    if "category" in upd and upd["category"] not in CATEGORIES:
        raise HTTPException(422, "Categoria non valida")
    if upd.get("photo") and not upd["photo"].startswith(PREFIX):
        raise HTTPException(422, "Formato foto non valido")
    for k in ("ingredients", "steps", "notes"):
        if upd.get(k) is not None:
            upd[k] = upd[k].strip()
    if upd:
        await get_db().recipes.update_one({"_id": id}, {"$set": upd})
        await changed(c, "recipes", "updated", id)
    return view(await get_owned("recipes", id, c), c["user"]["_id"])


@router.delete("/{id}")
async def delete_recipe(id: str, c: dict = Depends(ctx)):
    await soft_delete("recipes", id, c)
    return {"ok": True}
