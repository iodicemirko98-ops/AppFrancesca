"""Copia tutto il database da un cluster Atlas a un altro.
Uso: OLD_URI='mongodb+srv://...' NEW_URI='mongodb+srv://...' DB_NAME=noidue python scripts/migrate_db.py
(DB_NAME = lo stesso valore della variabile DB_NAME su Render)."""
import os
import sys

from pymongo import MongoClient

old, new, name = os.environ.get("OLD_URI"), os.environ.get("NEW_URI"), os.environ.get("DB_NAME")
if not (old and new and name):
    sys.exit("Servono OLD_URI, NEW_URI e DB_NAME")
src, dst = MongoClient(old)[name], MongoClient(new)[name]
for coll in src.list_collection_names():
    docs = list(src[coll].find())
    dst[coll].drop()
    if docs:
        dst[coll].insert_many(docs)
    for ix in src[coll].list_indexes():
        if ix["name"] != "_id_":
            dst[coll].create_index(list(ix["key"].items()), **{k: v for k, v in ix.items() if k in ("unique", "expireAfterSeconds")})
    print(f"{coll}: {len(docs)} documenti")
print("Fatto.")
