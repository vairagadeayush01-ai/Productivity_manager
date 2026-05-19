from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import date

from database import get_db, LearningEntry
from services.reader_service import extract_text_from_pdf_bytes, fetch_webpage_text
from services.summarizer import summarize_transcript
from services import vector_store, spaced_repetition

router = APIRouter(prefix="/ingest", tags=["reader"])


class WebPageRequest(BaseModel):
    url: str
    focus: str = ""

class PasteTextRequest(BaseModel):
    text: str
    title: str = ""


def _save(db, source_type, title, source_url, raw_content, result, extra_meta={}):
    summary  = result.get("summary", "")
    topics   = result.get("topics", [])
    concepts = result.get("key_concepts", [])
    embed    = f"Title: {title}\nSummary: {summary}\nTopics: {', '.join(topics)}"
    if concepts:
        embed += "\nKey concepts: " + ". ".join(f"{c['concept']}: {c['explanation']}" for c in concepts)

    entry = LearningEntry(source_type=source_type, title=title[:200],
                          source_url=source_url, raw_content=raw_content[:2000],
                          summary=summary, topics=", ".join(topics))
    db.add(entry); db.commit(); db.refresh(entry)

    chroma_id = str(entry.id)
    vector_store.add_entry(chroma_id, embed, {
        "source_type": source_type, "title": title[:200],
        "url": source_url or "", "topics": ", ".join(topics),
        "date": date.today().isoformat(), **extra_meta
    })
    entry.chroma_id = chroma_id; db.commit()

    for t in topics:
        spaced_repetition.record_topic_seen(db, t)

    return {"id": entry.id, "title": title, "summary": summary,
            "topics": topics, "source_type": source_type,
            "created_at": entry.created_at.isoformat()}


@router.post("/pdf")
async def ingest_pdf(file: UploadFile = File(...), focus: str = Form(""), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files supported.")
    pdf_bytes = await file.read()
    try:
        text, pages = extract_text_from_pdf_bytes(pdf_bytes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    title = file.filename.replace(".pdf","").replace("-"," ").replace("_"," ").title()
    content = text + (f"\nFocus on: {focus}" if focus.strip() else "")
    try:
        result = summarize_transcript(content, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return _save(db, "pdf", title, "", text, result, {"pages": str(pages)})


@router.post("/webpage")
async def ingest_webpage(req: WebPageRequest, db: Session = Depends(get_db)):
    if not req.url.startswith(("http://","https://")):
        raise HTTPException(400, "Include http:// or https:// in the URL.")
    try:
        text, title = fetch_webpage_text(req.url)
    except ValueError as e:
        raise HTTPException(422, str(e))
    content = text + (f"\nFocus on: {req.focus}" if req.focus.strip() else "")
    try:
        result = summarize_transcript(content, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return _save(db, "webpage", title, req.url, text, result)


@router.post("/paste")
async def ingest_paste(req: PasteTextRequest, db: Session = Depends(get_db)):
    if len(req.text.strip()) < 50:
        raise HTTPException(400, "Text too short.")
    title = req.title.strip() or "Pasted text"
    try:
        result = summarize_transcript(req.text, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return _save(db, "paste", title, "", req.text, result)