import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL  = "llama-3.3-70b-versatile"


def _call_groq(prompt: str, max_tokens: int = 4096, temperature: float = 0.8) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
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
- HIGH VARIETY: You must generate novel, highly unique questions every time. Focus on different sub-topics, obscure details, and avoid typical predictable questions.
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

    # Deduplicate questions by question text
    seen = set()
    unique_questions = []
    for q in questions:
        q_text = q.get("question", "").strip().lower()
        if q_text and q_text not in seen:
            seen.add(q_text)
            unique_questions.append(q)
            
    return unique_questions


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


# ─── Phase 3.2: Contextual quiz (all source types) ────────────────────────────

def generate_contextual_quiz(
    topic: str,
    user_id: int,
    n_questions: int = 15,
    difficulty: str = "medium",
) -> tuple[list[dict], list[dict]]:
    """
    Generates quiz questions grounded in the user's ACTUAL learning history
    across ALL source types: YouTube lectures, LeetCode solutions, GitHub commits.

    Steps:
      1. Semantic search: retrieve top-10 entries related to topic
      2. Build rich context from those entries (title + summary + source type)
      3. Generate questions that specifically reference the user's own work
      4. Return (questions, sources) — sources let frontend show "From: [title]"

    Returns:
      (questions: list[dict], sources: list[dict])
      sources: [{ id, title, source_type, date, snippet }]
    """
    from services import vector_store  # lazy import to avoid circular

    # 1. Retrieve relevant entries from all source types
    raw = vector_store.search(query=topic, n_results=10, user_id=user_id)

    if not raw:
        return [], []

    # 2. Assemble context + source list
    sources = []
    context_lines = []
    for r in raw:
        meta        = r.get("metadata", {})
        doc         = r.get("document", "")
        title       = meta.get("title", "Untitled")
        source_type = meta.get("source_type", "manual")
        date        = meta.get("date", "")

        sources.append({
            "id":          r["id"],
            "title":       title,
            "source_type": source_type,
            "date":        date,
            "snippet":     doc[:200],
        })

        type_label = {
            "youtube":  "YouTube lecture",
            "leetcode": "LeetCode solution",
            "github":   "GitHub commit",
        }.get(source_type, "note")

        context_lines.append(
            f"• [{type_label.upper()}] {title}"
            + (f" ({date})" if date else "")
            + f"\n  {doc[:400]}"
        )

    context = "\n\n".join(context_lines)

    diff_instructions = {
        "easy":   "Focus on recall and recognition of key concepts.",
        "medium": "Focus on application, comparison, and understanding how concepts connect.",
        "hard":   "Focus on deep analysis, edge cases, implementation tradeoffs, and connections between multiple concepts.",
    }
    diff_instr = diff_instructions.get(difficulty, diff_instructions["medium"])

    prompt = f"""You are a quiz generator for a developer who is studying: "{topic}"

Here is their actual learning history on this topic — from YouTube videos they watched, LeetCode problems they solved, and GitHub commits they made:

{context}

Generate exactly {n_questions} multiple choice questions that TEST their understanding of this specific material.

DIFFICULTY: {difficulty.upper()} — {diff_instr}

STRICT RULES:
- Base EVERY question on the content above. Reference specific algorithms, patterns, or code they actually encountered.
- Each question must have exactly 4 options (A, B, C, D)
- Only one correct answer
- Wrong options must be plausible and tricky
- Include "why" and "how" questions, not just "what"
- Vary question styles: conceptual, implementation, complexity analysis, comparison
- Include a "source_title" field referencing which entry the question came from
- No two questions should test the same fact

Return ONLY a valid JSON array:
[
  {{
    "question": "question text",
    "options": ["option A", "option B", "option C", "option D"],
    "answer": "exact text of correct option",
    "explanation": "concise 1-2 sentence explanation",
    "topic": "{topic}",
    "difficulty": "{difficulty}",
    "source_title": "title of the source entry this question is based on"
  }}
]"""

    raw_questions = _parse_json_list(_call_groq(prompt, max_tokens=5000))

    # Deduplicate
    seen: set[str] = set()
    unique: list[dict] = []
    for q in raw_questions:
        key = q.get("question", "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(q)

    return unique[:n_questions], sources