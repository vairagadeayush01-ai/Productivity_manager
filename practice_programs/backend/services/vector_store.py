import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
_embedding_fn  = embedding_functions.DefaultEmbeddingFunction()
_client        = chromadb.PersistentClient(path=CHROMA_DB_PATH)
_collection    = _client.get_or_create_collection(
    name="learning_entries",
    embedding_function=_embedding_fn,
    metadata={"hnsw:space": "cosine"}
)


def add_entry(entry_id: str, text: str, metadata: dict) -> str:
    _collection.add(documents=[text], metadatas=[metadata], ids=[entry_id])
    return entry_id


def search(query: str, n_results: int = 5) -> list[dict]:
    count = _collection.count()
    if count == 0:
        return []
    results = _collection.query(
        query_texts=[query],
        n_results=min(n_results, count)
    )
    output = []
    if results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            output.append({
                "id":       doc_id,
                "document": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i]
            })
    return output


def get_entries_by_date(date_str: str) -> list[dict]:
    try:
        results = _collection.get(where={"date": date_str})
        return [
            {"id": results["ids"][i], "document": results["documents"][i], "metadata": results["metadatas"][i]}
            for i in range(len(results["ids"]))
        ]
    except Exception:
        return []


def collection_count() -> int:
    return _collection.count()