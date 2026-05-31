"""
leetcode_today.py — fetches today's accepted LeetCode submissions (async HTTP).
"""

import logging
import os
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

LEETCODE_USERNAME = os.getenv("LEETCODE_USERNAME", "")

GRAPHQL_URL = "https://leetcode.com/graphql"

QUERY = """
query recentAcSubmissions($username: String!) {
  recentAcSubmissionList(username: $username) {
    title
    titleSlug
    timestamp
  }
}
"""

PROBLEM_QUERY = """
query problemDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    difficulty
    topicTags { name }
    content
  }
}
"""

# ─── Phase 2.3: AI Solution Analysis ──────────────────────────────────────────

_ANALYSIS_PROBLEM_QUERY = """
query problemDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    difficulty
    topicTags { name }
    content
  }
}
"""


_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; LearningTracker/1.0)",
    "Referer": "https://leetcode.com",
}


async def get_problem_detail(slug: str) -> dict:
    """Fetches difficulty and tags for a problem slug. Returns {} on failure."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                GRAPHQL_URL,
                json={"query": PROBLEM_QUERY, "variables": {"titleSlug": slug}},
                headers=_HEADERS,
                timeout=8,
            )
        q = r.json().get("data", {}).get("question") or {}
        return {
            "difficulty": q.get("difficulty", "Unknown"),
            "tags": [t["name"] for t in q.get("topicTags", [])],
        }
    except Exception as e:
        logger.debug("Problem detail fetch failed for %s: %s", slug, e)
        return {"difficulty": "Unknown", "tags": []}


async def fetch_today_submissions() -> dict:
    """
    Fetches today's accepted LeetCode submissions for the configured user.
    """
    if not LEETCODE_USERNAME:
        raise ValueError("LEETCODE_USERNAME not set in .env")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GRAPHQL_URL,
                json={"query": QUERY, "variables": {"username": LEETCODE_USERNAME}},
                headers=_HEADERS,
                timeout=12,
            )
    except httpx.TimeoutException:
        raise ValueError("LeetCode API timed out.")
    except Exception as e:
        raise ValueError(f"Could not reach LeetCode: {e}")

    if response.status_code != 200:
        raise ValueError(f"LeetCode returned HTTP {response.status_code}.")

    try:
        data = response.json()
    except Exception:
        raise ValueError("LeetCode returned unexpected data.")

    if "errors" in data:
        msg = data["errors"][0].get("message", "Unknown error")
        raise ValueError(f"LeetCode error: {msg}")

    submissions = (data.get("data") or {}).get("recentAcSubmissionList") or []

    today = datetime.now().date()
    seen = set()
    problems = []

    for sub in submissions:
        try:
            sub_date = datetime.fromtimestamp(int(sub["timestamp"])).date()
        except (KeyError, ValueError):
            continue

        title = sub.get("title", "")
        slug = sub.get("titleSlug", "")

        if sub_date == today and title not in seen:
            seen.add(title)
            detail = await get_problem_detail(slug)
            problems.append(
                {
                    "title": title,
                    "slug": slug,
                    "difficulty": detail["difficulty"],
                    "tags": detail["tags"],
                }
            )

    lines = [f"LeetCode activity for {LEETCODE_USERNAME} on {today}:"]
    if problems:
        lines.append(f"Solved {len(problems)} problem(s) today:")
        for p in problems:
            tag_str = ", ".join(p["tags"][:4]) if p["tags"] else "no tags"
            lines.append(f"  - {p['title']} [{p['difficulty']}] — topics: {tag_str}")
    else:
        lines.append("No problems solved today.")

    return {
        "username": LEETCODE_USERNAME,
        "date": today.isoformat(),
        "problems": problems,
        "total_solved": len(problems),
        "summary_text": "\n".join(lines),
    }


# ─── Phase 2.3: Solution analysis functions ───────────────────────────────────

import json as _json
import os as _os
import re as _re
from core.llm import create_chat_completion


async def get_problem_description(slug: str) -> str:
    """
    Fetch the full problem description HTML from LeetCode GraphQL.
    Returns plain-text excerpt (strips HTML tags) or '' on failure.
    Max 600 chars to keep AI prompts concise.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                GRAPHQL_URL,
                json={"query": _ANALYSIS_PROBLEM_QUERY, "variables": {"titleSlug": slug}},
                headers=_HEADERS,
            )
        q = (r.json().get("data") or {}).get("question") or {}
        content = q.get("content") or ""
        # Strip HTML tags
        plain = _re.sub(r'<[^>]+>', ' ', content)
        plain = _re.sub(r'\s+', ' ', plain).strip()
        return plain[:600]
    except Exception as exc:
        logger.debug("Problem description fetch failed for %s: %s", slug, exc)
        return ""


async def analyze_solution(
    problem_title: str,
    difficulty: str,
    tags: list,
    description: str,
    solution_code: str,
    language: str,
) -> dict:
    """
    AI analysis of an accepted LeetCode solution using Groq.

    Returns dict with keys:
      ds_used, pattern, time_complexity, space_complexity,
      edge_cases_handled (list), missed_edges (list),
      optimization_tip (str), summary (str)

    On failure: returns safe minimal dict with summary = "Analysis unavailable".
    """
    api_key = _os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return {
            "ds_used": "", "pattern": "",
            "time_complexity": "", "space_complexity": "",
            "edge_cases_handled": [], "missed_edges": [],
            "optimization_tip": "",
            "summary": "Analysis unavailable — GROQ_API_KEY not set.",
        }



    tag_str = ", ".join(tags[:6]) if tags else "none"
    code_excerpt = solution_code[:2000] if solution_code else "(no code provided)"
    desc_excerpt = description[:400] if description else "(no description)"

    prompt = f"""Analyze this accepted LeetCode solution.

Problem: {problem_title} ({difficulty})
Tags: {tag_str}
Description (excerpt): {desc_excerpt}

User's Solution ({language}):
{code_excerpt}

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{{
  "ds_used": "primary data structure used (e.g., hash map, stack, array)",
  "pattern": "algorithm pattern (e.g., two pointers, BFS, dynamic programming)",
  "time_complexity": "O(?) with one-line explanation",
  "space_complexity": "O(?) with one-line explanation",
  "edge_cases_handled": ["edge case 1", "edge case 2"],
  "missed_edges": ["potential edge case not handled, or empty string if none"],
  "optimization_tip": "one specific tip if applicable, or empty string",
  "summary": "2-3 sentence analysis of the approach and effectiveness"
}}"""

    try:
        resp = create_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500,
        )
        text = resp.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        result = _json.loads(text.strip())
        return {
            "ds_used":              str(result.get("ds_used", "")),
            "pattern":              str(result.get("pattern", "")),
            "time_complexity":      str(result.get("time_complexity", "")),
            "space_complexity":     str(result.get("space_complexity", "")),
            "edge_cases_handled":   list(result.get("edge_cases_handled", [])),
            "missed_edges":         list(result.get("missed_edges", [])),
            "optimization_tip":     str(result.get("optimization_tip", "")),
            "summary":              str(result.get("summary", "")),
        }
    except Exception as exc:
        logger.warning("Groq solution analysis failed for '%s': %s", problem_title, exc)
        return {
            "ds_used": "", "pattern": "",
            "time_complexity": "", "space_complexity": "",
            "edge_cases_handled": [], "missed_edges": [],
            "optimization_tip": "",
            "summary": f"AI analysis failed: {exc}",
        }

