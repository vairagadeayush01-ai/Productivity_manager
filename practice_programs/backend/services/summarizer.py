"""
summarizer.py — Groq-backed AI summarizer with retry logic and circuit breaker.
"""

import json
import logging
import os
import threading
import time

from dotenv import load_dotenv
from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential

load_dotenv()

logger = logging.getLogger(__name__)
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODEL = "llama-3.3-70b-versatile"


# ---------------------------------------------------------------------------
# Circuit Breaker — pauses Groq calls if it fails too many times in a row
# ---------------------------------------------------------------------------
class _CircuitBreaker:
    """
    Simple thread-safe circuit breaker.
    States: CLOSED (normal) → OPEN (paused) → HALF-OPEN (testing recovery)
    Opens after `failure_threshold` consecutive failures.
    Resets after `recovery_timeout` seconds.
    """

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 300.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures = 0
        self._state = self.CLOSED
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        with self._lock:
            if self._state == self.OPEN:
                if self._opened_at and (time.monotonic() - self._opened_at) >= self.recovery_timeout:
                    self._state = self.HALF_OPEN
                    logger.info("Groq circuit breaker → HALF-OPEN (testing recovery)")
            return self._state

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            if self._state != self.CLOSED:
                logger.info("Groq circuit breaker → CLOSED (recovered)")
            self._state = self.CLOSED
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self.failure_threshold:
                self._state = self.OPEN
                self._opened_at = time.monotonic()
                logger.error(
                    "Groq circuit breaker → OPEN after %d consecutive failures. "
                    "Pausing calls for %.0f seconds.",
                    self._failures,
                    self.recovery_timeout,
                )

    def is_open(self) -> bool:
        return self.state == self.OPEN


_breaker = _CircuitBreaker(failure_threshold=5, recovery_timeout=300.0)


# ---------------------------------------------------------------------------
# Core Groq call with retry + circuit breaker
# ---------------------------------------------------------------------------
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _call_groq(prompt: str) -> str:
    """Sends a prompt to Groq with retry logic and circuit-breaker protection."""
    if _breaker.is_open():
        raise RuntimeError(
            "Groq API is temporarily unavailable (circuit breaker open). "
            "Please try again in a few minutes."
        )
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024,
        )
        _breaker.record_success()
        return response.choices[0].message.content.strip()
    except Exception as exc:
        _breaker.record_failure()
        logger.warning("Groq call failed (failure #%d): %s", _breaker._failures, exc)
        raise


def _parse_json(text: str) -> dict:
    """Strips markdown fences and parses JSON. Returns a fallback dict on failure."""
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {"summary": text[:500], "topics": [], "key_concepts": []}


# ---------------------------------------------------------------------------
# Public summarizer functions
# ---------------------------------------------------------------------------
def summarize_transcript(text: str, title: str = "") -> dict:
    """
    Summarizes any long text (YouTube transcript, PDF, webpage, or activity logs).
    Returns: { summary, topics[], key_concepts[] }
    """
    max_chars = 60_000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[content truncated]"

    prompt = f"""You are a learning assistant. A student just studied this content and you need to create a concise summary for their personal revision diary.

Title: {title if title else "Unknown"}

Content:
{text}

Return ONLY valid JSON with this exact structure (no markdown, no backticks, no extra text):
{{
  "summary": "A clear 3-5 sentence summary. CRITICAL: If the content is a list of LeetCode problems, GitHub commits, or specific activities, you MUST explicitly state the exact names of the problems solved or repositories touched. Do not generalize.",
  "topics": ["topic1", "topic2", "topic3"],
  "key_concepts": [
    {{"concept": "name", "explanation": "one sentence"}},
    {{"concept": "name", "explanation": "one sentence"}}
  ]
}}

Keep topics short (2-3 words each). Include 3-6 key concepts max."""

    return _parse_json(_call_groq(prompt))


def summarize_manual_log(note: str) -> dict:
    """
    Summarizes a short manual log entry like 'read about JWT today'.
    Returns: { summary, topics[], key_concepts[] }
    """
    prompt = f"""A student wrote this quick note about what they learned today:

"{note}"

Return ONLY valid JSON (no markdown, no backticks, no extra text):
{{
  "summary": "Restate what they learned in 1-2 clear sentences.",
  "topics": ["topic1", "topic2"],
  "key_concepts": []
}}"""

    return _parse_json(_call_groq(prompt))


def summarize_daily_diary(entries_text: str, date_str: str) -> str:
    """
    Takes a combined string of all learning activities for the day and generates a cohesive,
    journal-style diary entry summarizing the student's progress.
    """
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

    return _call_groq(prompt)