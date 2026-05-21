import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL  = "llama-3.3-70b-versatile"


def _call_groq(prompt: str, max_tokens: int = 4096) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content.strip()


def _parse_json_list(text: str) -> list:
    # Strip markdown code fences if present
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("["):
                text = part
                break
    # Find the JSON array
    start = text.find("[")
    end   = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    try:
        result = json.loads(text.strip())
        return result if isinstance(result, list) else []
    except Exception:
        return []


def generate_quiz(entries: list[dict], n_questions: int = 20, difficulty: str = "medium") -> list[dict]:
    """Generates MCQs from today's learning entries.
    
    Args:
        entries: List of learning entry dicts
        n_questions: Minimum number of questions (default 20)
        difficulty: 'easy' | 'medium' | 'hard'
    """
    if not entries:
        return []

    # Build rich context from all entries
    context = ""
    topic_list = []
    for i, e in enumerate(entries, 1):
        context += f"\n{i}. [{e.get('source_type','').upper()}] {e.get('title','')}\n"
        context += f"   Summary: {e.get('summary','')}\n"
        topics_str = e.get('topics', '')
        context += f"   Topics: {topics_str}\n"
        if topics_str:
            topic_list.extend([t.strip() for t in topics_str.split(",") if t.strip()])

    difficulty_instructions = {
        "easy": "Focus on basic definitions, recognition, and simple recall questions.",
        "medium": "Focus on application, comparison, cause-effect, and conceptual understanding. Avoid trivial questions.",
        "hard": "Focus on deep analysis, edge cases, complex tradeoffs, implementation details, and questions that require connecting multiple concepts. Make wrong options plausible and tricky."
    }

    diff_instr = difficulty_instructions.get(difficulty, difficulty_instructions["medium"])

    prompt = f"""You are an expert quiz generator for a serious CS/engineering student.

The student studied the following today:
{context}

Topics covered: {', '.join(set(topic_list))}

Generate exactly {n_questions} multiple choice questions to deeply test their understanding.

DIFFICULTY: {difficulty.upper()}
{diff_instr}

STRICT RULES:
- Base questions ONLY on the content above
- Each question must have exactly 4 options (A, B, C, D format as plain text)
- Only one correct answer per question
- Cover ALL topics — distribute questions proportionally across topics
- Wrong options should be plausible/tricky, not obviously wrong
- Include "why" and "how" questions, not just "what"
- No two questions should test the same fact
- Vary question styles: concept explanation, code behavior, tradeoff comparison, error identification

Return ONLY a valid JSON array, no extra text, no markdown:
[
  {{
    "question": "clear question text",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "answer": "exact text of the correct option",
    "explanation": "concise 1-2 sentence explanation of why the answer is correct",
    "topic": "specific topic name",
    "difficulty": "{difficulty}"
  }}
]"""

    raw = _call_groq(prompt, max_tokens=6000)
    questions = _parse_json_list(raw)

    # Ensure minimum question count — retry once with remaining topics if needed
    if len(questions) < n_questions and len(questions) > 0:
        remaining = n_questions - len(questions)
        retry_prompt = f"""Generate {remaining} MORE unique multiple choice questions from this content:
{context}

Same difficulty ({difficulty.upper()}): {diff_instr}

These must be DIFFERENT from these already-generated questions:
{json.dumps([q.get('question','') for q in questions], indent=2)}

Return ONLY a valid JSON array:
[{{"question":"...","options":["A","B","C","D"],"answer":"...","explanation":"...","topic":"...","difficulty":"{difficulty}"}}]"""
        extra = _parse_json_list(_call_groq(retry_prompt, max_tokens=4000))
        questions.extend(extra[:remaining])

    return questions


def generate_topic_quiz(topic: str, context: str, n_questions: int = 10, difficulty: str = "medium") -> list[dict]:
    """Generates a focused quiz on a specific topic for spaced repetition."""
    diff_instructions = {
        "easy": "Focus on recall and recognition.",
        "medium": "Focus on application and understanding.",
        "hard": "Focus on deep analysis, edge cases, and connecting multiple concepts."
    }
    diff_instr = diff_instructions.get(difficulty, diff_instructions["medium"])

    prompt = f"""Generate {n_questions} challenging MCQ questions specifically about: {topic}
Difficulty: {difficulty.upper()} — {diff_instr}

Context from student's notes:
{context[:4000]}

Return ONLY a valid JSON array:
[
  {{
    "question": "question text",
    "options": ["A", "B", "C", "D"],
    "answer": "correct option text",
    "explanation": "brief explanation",
    "topic": "{topic}",
    "difficulty": "{difficulty}"
  }}
]"""

    return _parse_json_list(_call_groq(prompt, max_tokens=3000))