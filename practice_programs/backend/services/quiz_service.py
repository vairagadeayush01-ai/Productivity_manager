import os
import logging
from pydantic import BaseModel, Field

from langchain_core.prompts import PromptTemplate
from core.llm import get_chat_groq

logger = logging.getLogger(__name__)


def _get_llm():
    try:
        return get_chat_groq(
            temperature=0.8,
            max_tokens=6000
        )
    except Exception as exc:
        logger.warning("LangChain ChatGroq init failed: %s", exc)
        return None


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class QuizQuestion(BaseModel):
    question: str = Field(description="Clear multiple choice question text")
    options: list[str] = Field(description="Exactly 4 options (A, B, C, D format as plain text)")
    answer: str = Field(description="Exact text of the correct option")
    explanation: str = Field(description="Concise 1-2 sentence explanation of why the answer is correct")
    topic: str = Field(description="Specific topic name")
    difficulty: str = Field(description="Difficulty level (easy, medium, hard)")
    source_title: str | None = Field(None, description="Title of the source entry this question is based on, if applicable")

class QuizQuestionList(BaseModel):
    questions: list[QuizQuestion] = Field(description="List of multiple choice questions")


# ─── Core Logic ───────────────────────────────────────────────────────────────

def generate_quiz(entries: list[dict], n_questions: int = 20, difficulty: str = "medium") -> list[dict]:
    """Generates MCQs from today's learning entries."""
    if not entries:
        return []

    llm = _get_llm()
    if not llm:
        return []

    structured_llm = llm.with_structured_output(QuizQuestionList)

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
- Each question must have exactly 4 options
- Only one correct answer per question
- Cover ALL topics — distribute questions proportionally across topics
- Wrong options should be plausible/tricky, not obviously wrong
- Include "why" and "how" questions, not just "what"
- HIGH VARIETY: You must generate novel, highly unique questions every time. Focus on different sub-topics, obscure details, and avoid typical predictable questions.
- No two questions should test the same fact
- Vary question styles: concept explanation, code behavior, tradeoff comparison, error identification
"""

    try:
        response = structured_llm.invoke(prompt)
        questions = [q.model_dump() for q in response.questions]
    except Exception as exc:
        logger.error("Quiz generation failed: %s", exc)
        return []

    # Ensure minimum question count — retry once with remaining topics if needed
    if len(questions) < n_questions and len(questions) > 0:
        remaining = n_questions - len(questions)
        retry_prompt = f"""Generate {remaining} MORE unique multiple choice questions from this content:
{context}

Same difficulty ({difficulty.upper()}): {diff_instr}

STRICT RULES:
- These must be DIFFERENT from these already-generated questions:
{[q.get('question','') for q in questions]}
"""
        try:
            extra_response = structured_llm.invoke(retry_prompt)
            extra = [q.model_dump() for q in extra_response.questions]
            questions.extend(extra[:remaining])
        except Exception as exc:
            logger.error("Quiz generation retry failed: %s", exc)

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
    llm = _get_llm()
    if not llm:
        return []

    structured_llm = llm.with_structured_output(QuizQuestionList)

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
"""

    try:
        response = structured_llm.invoke(prompt)
        return [q.model_dump() for q in response.questions]
    except Exception as exc:
        logger.error("Topic quiz generation failed: %s", exc)
        return []


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
"""

    llm = _get_llm()
    if not llm:
        return [], sources

    structured_llm = llm.with_structured_output(QuizQuestionList)

    try:
        response = structured_llm.invoke(prompt)
        raw_questions = [q.model_dump() for q in response.questions]
    except Exception as exc:
        logger.error("Contextual quiz generation failed: %s", exc)
        raw_questions = []

    # Deduplicate
    seen: set[str] = set()
    unique: list[dict] = []
    for q in raw_questions:
        key = q.get("question", "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(q)

    return unique[:n_questions], sources
