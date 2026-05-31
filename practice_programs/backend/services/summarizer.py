"""
summarizer.py — Groq-backed AI summarizer with LangChain retry and fallback logic.
"""

import logging
import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from core.llm import get_chat_groq
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableLambda

load_dotenv()

logger = logging.getLogger(__name__)


def _get_llm():
    try:
        return get_chat_groq(
            temperature=0.3,
            max_tokens=1024
        )
    except Exception as exc:
        logger.warning("LangChain ChatGroq init failed: %s", exc)
        return None


# ─── Pydantic Schemas for Structured Output ───────────────────────────────────

class KeyConcept(BaseModel):
    concept: str = Field(description="Name of the concept")
    explanation: str = Field(description="One sentence explanation")

class SummaryOutput(BaseModel):
    summary: str = Field(description="A clear 3-5 sentence summary.")
    topics: list[str] = Field(description="List of 2-3 word topics.")
    key_concepts: list[KeyConcept] = Field(default_factory=list, description="3-6 key concepts")


# ─── Fallbacks ────────────────────────────────────────────────────────────────

def _fallback_summary(inputs: dict) -> SummaryOutput:
    logger.error("Summarization LLM failed after retries. Using fallback.")
    return SummaryOutput(
        summary="Content saved, but AI summarization failed (API unavailable).",
        topics=["Uncategorized"],
        key_concepts=[]
    )


def _fallback_diary(inputs: dict) -> str:
    logger.error("Diary generation LLM failed after retries. Using fallback.")
    return "Your learning activities have been saved, but the daily AI summary could not be generated at this time."


# ─── Public summarizer functions ──────────────────────────────────────────────

def summarize_transcript(text: str, title: str = "") -> dict:
    """
    Summarizes any long text (YouTube transcript, PDF, webpage, or activity logs).
    Returns: { summary, topics[], key_concepts[] }
    """
    max_chars = 60_000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[content truncated]"

    llm = _get_llm()
    if not llm:
        return _fallback_summary({}).model_dump()

    structured_llm = llm.with_structured_output(SummaryOutput)
    
    # Configure retry and fallback
    # stop_after_attempt=3 is the default in ChatGroq actually, but we explicitly wrap it
    chain = structured_llm.with_retry(stop_after_attempt=3).with_fallbacks([RunnableLambda(_fallback_summary)])

    prompt = f"""You are a learning assistant. A student just studied this content and you need to create a concise summary for their personal revision diary.

Title: {title if title else "Unknown"}

Content:
{text}

CRITICAL: If the content is a list of LeetCode problems, GitHub commits, or specific activities, you MUST explicitly state the exact names of the problems solved or repositories touched. Do not generalize.
Keep topics short (2-3 words each). Include 3-6 key concepts max."""

    try:
        response = chain.invoke(prompt)
        return response.model_dump()
    except Exception as exc:
        logger.error("Summarize transcript failed completely: %s", exc)
        return _fallback_summary({}).model_dump()


def summarize_manual_log(note: str) -> dict:
    """
    Summarizes a short manual log entry like 'read about JWT today'.
    Returns: { summary, topics[], key_concepts[] }
    """
    llm = _get_llm()
    if not llm:
        return _fallback_summary({}).model_dump()

    structured_llm = llm.with_structured_output(SummaryOutput)
    chain = structured_llm.with_retry(stop_after_attempt=3).with_fallbacks([RunnableLambda(_fallback_summary)])

    prompt = f"""A student wrote this quick note about what they learned today:

"{note}"

Restate what they learned in 1-2 clear sentences as the summary.
"""

    try:
        response = chain.invoke(prompt)
        return response.model_dump()
    except Exception as exc:
        logger.error("Summarize manual log failed completely: %s", exc)
        return _fallback_summary({}).model_dump()


def summarize_daily_diary(entries_text: str, date_str: str) -> str:
    """
    Takes a combined string of all learning activities for the day and generates a cohesive,
    journal-style diary entry summarizing the student's progress.
    """
    llm = _get_llm()
    if not llm:
        return _fallback_diary({})

    from langchain_core.output_parsers import StrOutputParser
    chain = llm | StrOutputParser()
    chain = chain.with_retry(stop_after_attempt=3).with_fallbacks([RunnableLambda(_fallback_diary)])

    prompt = f"""You are a personal AI learning assistant helping a student maintain a learning diary.
Today is {date_str}.

The student has completed the following learning activities today:
{entries_text}

Write a comprehensive, engaging, and cohesive diary entry summarizing everything they learned today.
The summary should read like a personal journal entry.
CRITICAL INSTRUCTIONS:
- You must be HIGHLY SPECIFIC. Do not use generic phrases like "you solved 6 problems".
- You MUST explicitly name the exact problems solved, the specific repositories committed to, and the precise concepts learned.
- Structure it chronologically. For example: "Today started with a focus on [Specific Topic/Repo], where you... Then, you moved on to solve [Problem A] and [Problem B], which reinforced your understanding of [Concept]..."
- Make it feel like a rich, detailed narrative of their specific accomplishments today.

Use paragraphs to make it readable. Do not output JSON. Do not use markdown headers. Just write the diary entry text."""

    try:
        response = chain.invoke(prompt)
        return response
    except Exception as exc:
        logger.error("Summarize daily diary failed completely: %s", exc)
        return _fallback_diary({})
