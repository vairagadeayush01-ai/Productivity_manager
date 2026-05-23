from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from core.limiter import limiter
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import User, get_db
from services import entry_store
from services.reader_service import extract_text_from_pdf_bytes, fetch_webpage_text
from services.summarizer import summarize_transcript

router = APIRouter(prefix="/ingest", tags=["reader"])


class WebPageRequest(BaseModel):
    url: str = Field(..., min_length=1)
    focus: str = ""


class PasteTextRequest(BaseModel):
    text: str = Field(..., min_length=50)
    title: str = ""


@router.post("/pdf")
@limiter.limit("10/minute")
async def ingest_pdf(
    request: Request,
    file: UploadFile = File(...),
    focus: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files supported.")
    pdf_bytes = await file.read()
    try:
        text, pages = extract_text_from_pdf_bytes(pdf_bytes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    title = file.filename.replace(".pdf", "").replace("-", " ").replace("_", " ").title()
    content = text + (f"\nFocus on: {focus}" if focus.strip() else "")
    try:
        result = summarize_transcript(content, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return entry_store.save_entry(
        db,
        current_user.id,
        "pdf",
        title,
        "",
        text,
        result,
        chroma_extra={"pages": str(pages)},
    )


@router.post("/webpage")
@limiter.limit("10/minute")
async def ingest_webpage(
    request: Request,
    req: WebPageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not req.url.startswith(("http://", "https://")):
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
    return entry_store.save_entry(
        db, current_user.id, "webpage", title, req.url, text, result
    )


@router.post("/paste")
@limiter.limit("15/minute")
async def ingest_paste(
    request: Request,
    req: PasteTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = req.title.strip() or "Pasted text"
    try:
        result = summarize_transcript(req.text, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return entry_store.save_entry(
        db, current_user.id, "paste", title, "", req.text, result
    )
