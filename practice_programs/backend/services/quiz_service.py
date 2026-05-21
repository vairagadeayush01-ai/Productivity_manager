import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL  = "llama-3.3-70b-versatile"


def _call_groq(prompt: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=2048,
    )
    return response.choices[0].message.content.strip()


def _parse_json_list(text: str) -> list:
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    try:
        result = json.loads(text.strip())
        return result if isinstance(result, list) else []
    except Exception:
        return []


def generate_quiz(entries: list[dict], n_questions: int = 20, difficulty: str = "medium") -> list[dict]:
    """Generates MCQs from today's learning entries with difficulty level."""
    if not entries:
        return []

    context = ""
    for i, e in enumerate(entries, 1):
        context += f"\n{i}. [{e.get('source_type','').upper()}] {e.get('title','')}\n"
        context += f"   Summary: {e.get('summary','')}\n"
        context += f"   Topics: {e.get('topics','')}\n"

    difficulty_guide = {
        "easy": "Generate mostly foundational and definition-based questions. Focus on recall.",
        "medium": "Mix basic recall with understanding questions. Include some application-level questions.",
        "hard": "Focus on critical thinking, application, and analysis. Include scenario-based and complex questions."
    }

    prompt = f"""You are a quiz generator for a student's personal learning tracker.

The student learned the following today:
{context}

Generate exactly {n_questions} multiple choice questions to help them revise.

Difficulty Level: {difficulty.upper()}
{difficulty_guide.get(difficulty, difficulty_guide['medium'])}

Rules:
- Base questions ONLY on the content above
- Each question has exactly 4 options
- One correct answer only
- Cover different topics
- Ensure good coverage of all materials

Return ONLY a valid JSON array (no markdown, no backticks):
[
  {{
    "question": "question text",
    "options": ["A", "B", "C", "D"],
    "answer": "correct option text",
    "explanation": "one sentence explanation",
    "topic": "topic name",
    "difficulty": "{difficulty}"
  }}
]"""

    return _parse_json_list(_call_groq(prompt))


def generate_topic_quiz(topic: str, context: str, n_questions: int = 5) -> list[dict]:
    """Generates a focused quiz on a specific topic for spaced repetition."""
    prompt = f"""Generate {n_questions} MCQ questions specifically about: {topic}

Context from the student's notes:
{context[:3000]}

Return ONLY a valid JSON array (no markdown, no backticks):
[
  {{
    "question": "question text",
    "options": ["A", "B", "C", "D"],
    "answer": "correct answer",
    "explanation": "brief explanation",
    "topic": "{topic}"
  }}
]"""

    return _parse_json_list(_call_groq(prompt))