"""
Unified persistence for learning entries: SQLite + ChromaDB + spaced repetition.
"""
from datetime import date

from sqlalchemy.orm import Session

from database import LearningEntry
from services import spaced_repetition, vector_store
from utils.datetime_helpers import today_start_end


def _build_embed_text(title: str, summary: str, topics: list, concepts: list) -> str:
    embed_text = f"Title: {title}\nSummary: {summary}\nTopics: {', '.join(topics)}"
    if concepts:
        embed_text += "\nKey concepts: " + ". ".join(
            f"{c['concept']}: {c['explanation']}" for c in concepts
        )
    return embed_text


def _upsert_vector(
    entry: LearningEntry,
    embed_text: str,
    source_type: str,
    title: str,
    url: str,
    topics: str,
    user_id: int,
    chroma_extra: dict | None = None,
) -> None:
    if entry.chroma_id:
        try:
            vector_store.collection.delete(ids=[entry.chroma_id])
        except Exception:
            pass
    chroma_id = f"{user_id}_{entry.id}"
    metadata = {
        "user_id": str(user_id),
        "source_type": source_type,
        "title": title[:200],
        "url": url or "",
        "topics": topics,
        "date": date.today().isoformat(),
    }
    if chroma_extra:
        metadata.update({k: str(v) for k, v in chroma_extra.items()})
    vector_store.add_entry(chroma_id, embed_text, metadata)
    entry.chroma_id = chroma_id


def _entry_response(entry: LearningEntry, topics: list, source_type: str) -> dict:
    return {
        "id": entry.id,
        "title": entry.title,
        "summary": entry.summary,
        "topics": topics,
        "source_type": source_type,
        "created_at": entry.created_at.isoformat(),
    }


def save_entry(
    db: Session,
    user_id: int,
    source_type: str,
    title: str,
    source_url: str,
    raw_content: str,
    summary_result: dict,
    *,
    dedupe_same_title_today: bool = False,
    chroma_extra: dict | None = None,
) -> dict:
    summary = summary_result.get("summary", "")
    topics = summary_result.get("topics", [])
    concepts = summary_result.get("key_concepts", [])
    title_trimmed = title[:200]
    topics_str = ", ".join(topics)
    embed_text = _build_embed_text(title, summary, topics, concepts)

    entry = None
    if dedupe_same_title_today:
        start, end = today_start_end()
        entry = (
            db.query(LearningEntry)
            .filter(
                LearningEntry.user_id == user_id,
                LearningEntry.source_type == source_type,
                LearningEntry.created_at >= start,
                LearningEntry.created_at <= end,
            )
            .first()
        )
        if entry and entry.title == title_trimmed:
            return _entry_response(
                entry,
                entry.topics.split(", ") if entry.topics else [],
                source_type,
            )

    if entry:
        entry.title = title_trimmed
        entry.source_url = source_url
        entry.raw_content = raw_content[:2000]
        entry.summary = summary
        entry.topics = topics_str
        db.commit()
        db.refresh(entry)
    else:
        entry = LearningEntry(
            user_id=user_id,
            source_type=source_type,
            title=title_trimmed,
            source_url=source_url,
            raw_content=raw_content[:2000],
            summary=summary,
            topics=topics_str,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

    _upsert_vector(entry, embed_text, source_type, title, source_url, topics_str, user_id, chroma_extra)
    db.commit()

    for topic in topics:
        spaced_repetition.record_topic_seen(db, user_id, topic)

    return _entry_response(entry, topics, source_type)


def update_entry_from_summary(
    db: Session,
    entry: LearningEntry,
    raw_content: str,
    summary_result: dict,
) -> dict:
    summary = summary_result.get("summary", "")
    topics = summary_result.get("topics", [])
    concepts = summary_result.get("key_concepts", [])
    topics_str = ", ".join(topics)

    entry.raw_content = raw_content[:2000]
    entry.summary = summary
    entry.topics = topics_str
    db.commit()
    db.refresh(entry)

    embed_text = _build_embed_text(entry.title, summary, topics, concepts)
    _upsert_vector(
        entry,
        embed_text,
        entry.source_type,
        entry.title,
        entry.source_url or "",
        topics_str,
        entry.user_id,
    )
    db.commit()

    for topic in topics:
        spaced_repetition.record_topic_seen(db, entry.user_id, topic)

    return _entry_response(entry, topics, entry.source_type)


def delete_entry(db: Session, entry_id: int, user_id: int) -> bool:
    entry = db.query(LearningEntry).filter(LearningEntry.id == entry_id, LearningEntry.user_id == user_id).first()
    if not entry:
        return False
    
    if entry.chroma_id:
        try:
            vector_store.collection.delete(ids=[entry.chroma_id])
        except Exception:
            pass

    db.delete(entry)
    db.commit()
    return True
