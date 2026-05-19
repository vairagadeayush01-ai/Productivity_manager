import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# llama-3.3-70b-versatile is free, fast, and very capable for summarization
MODEL = "llama-3.3-70b-versatile"


def _call_groq(prompt: str) -> str:
    """Sends a prompt to Groq and returns the raw text response."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,   # low temperature = consistent, structured output
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()


def _parse_json(text: str) -> dict:
    """Strips markdown fences and parses JSON. Returns a fallback dict on failure."""
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {"summary": text[:500], "topics": [], "key_concepts": []}


def summarize_transcript(text: str, title: str = "") -> dict:
    """
    Summarizes any long text (YouTube transcript, PDF, webpage).
    Returns: { summary, topics[], key_concepts[] }
    """
    # Groq context window is large but let's keep requests reasonable
    max_chars = 60_000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[content truncated]"

    prompt = f"""You are a learning assistant. A student just studied this content and you need to create a concise summary for their personal revision diary.

Title: {title if title else "Unknown"}

Content:
{text}

Return ONLY valid JSON with this exact structure (no markdown, no backticks, no extra text):
{{
  "summary": "A clear 3-5 sentence summary of what was taught. Write it as if explaining to the student what they just learned.",
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