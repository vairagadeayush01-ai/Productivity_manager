import os

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
_embedding_fn = embedding_functions.DefaultEmbeddingFunction()
_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
_collection = _client.get_or_create_collection(
    name="learning_entries",
    embedding_function=_embedding_fn,
    metadata={"hnsw:space": "cosine"},
)


def add_entry(entry_id: str, text: str, metadata: dict) -> str:
    _collection.add(documents=[text], metadatas=[metadata], ids=[entry_id])
    return entry_id


def search(query: str, n_results: int = 5, user_id: int | None = None) -> list[dict]:
    count = _collection.count()
    if count == 0:
        return []
    kwargs = {"query_texts": [query], "n_results": min(n_results, count)}
    if user_id is not None:
        kwargs["where"] = {"user_id": str(user_id)}
    try:
        results = _collection.query(**kwargs)
    except Exception:
        # Legacy vectors without user_id metadata
        if user_id is not None:
            results = _collection.query(
                query_texts=[query],
                n_results=min(n_results, count),
            )
        else:
            return []
    output = []
    if results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            if user_id is not None and meta.get("user_id") not in (str(user_id), None):
                continue
            output.append(
                {
                    "id": doc_id,
                    "document": results["documents"][0][i],
                    "metadata": meta,
                    "distance": results["distances"][0][i],
                }
            )
    return output[:n_results]


def get_entries_by_date(date_str: str, user_id: int | None = None) -> list[dict]:
    try:
        where = {"date": date_str}
        if user_id is not None:
            where = {"$and": [{"date": date_str}, {"user_id": str(user_id)}]}
        results = _collection.get(where=where)
        return [
            {
                "id": results["ids"][i],
                "document": results["documents"][i],
                "metadata": results["metadatas"][i],
            }
            for i in range(len(results["ids"]))
        ]
    except Exception:
        return []


def collection_count() -> int:
    return _collection.count()


# Expose collection for entry_store deletes
collection = _collection
