"""
leetcode_service.py  — fetches today's accepted LeetCode submissions.

Your original script worked well. The GraphQL endpoint is valid and returns real data.
Changes made:
  1. Error handling — API failures, empty responses, network errors
  2. USERNAME from .env instead of hardcoded
  3. Added difficulty and tags to the GraphQL query (you were only fetching title)
  4. Returns structured data for FastAPI instead of printing
  5. Added a User-Agent header — LeetCode occasionally blocks bare requests without one
"""

import os
import httpx
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

LEETCODE_USERNAME = os.getenv("LEETCODE_USERNAME", "")

GRAPHQL_URL = "https://leetcode.com/graphql"

# Extended query — also fetches the problem's difficulty and topic tags
QUERY = """
query recentAcSubmissions($username: String!) {
  recentAcSubmissionList(username: $username) {
    title
    titleSlug
    timestamp
  }
}
"""

# Separate query to get difficulty + tags from a problem slug
PROBLEM_QUERY = """
query problemDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    difficulty
    topicTags { name }
  }
}
"""

_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; LearningTracker/1.0)",
    "Referer": "https://leetcode.com",
}


def _get_problem_detail(slug: str) -> dict:
    """Fetches difficulty and tags for a problem slug. Returns {} on failure."""
    try:
        r = httpx.post(
            GRAPHQL_URL,
            json={"query": PROBLEM_QUERY, "variables": {"titleSlug": slug}},
            headers=_HEADERS,
            timeout=8
        )
        q = r.json().get("data", {}).get("question") or {}
        return {
            "difficulty": q.get("difficulty", "Unknown"),
            "tags": [t["name"] for t in q.get("topicTags", [])]
        }
    except Exception:
        return {"difficulty": "Unknown", "tags": []}


def fetch_today_submissions() -> dict:
    """
    Fetches today's accepted LeetCode submissions for the configured user.
    Returns:
      {
        "username": str,
        "date": str,
        "problems": [
            {"title": str, "slug": str, "difficulty": str, "tags": [str]}
        ],
        "total_solved": int,
        "summary_text": str    # sent to Gemini for summarization
      }
    Raises ValueError on config or network errors.
    """
    if not LEETCODE_USERNAME:
        raise ValueError("LEETCODE_USERNAME not set in .env")

    try:
        response = httpx.post(
            GRAPHQL_URL,
            json={"query": QUERY, "variables": {"username": LEETCODE_USERNAME}},
            headers=_HEADERS,
            timeout=12
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

    # Handle "user not found" or private profile
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
        slug  = sub.get("titleSlug", "")

        if sub_date == today and title not in seen:
            seen.add(title)
            detail = _get_problem_detail(slug)
            problems.append({
                "title":      title,
                "slug":       slug,
                "difficulty": detail["difficulty"],
                "tags":       detail["tags"],
            })

    # Build summary text for Gemini
    lines = [f"LeetCode activity for {LEETCODE_USERNAME} on {today}:"]
    if problems:
        lines.append(f"Solved {len(problems)} problem(s) today:")
        for p in problems:
            tag_str = ", ".join(p["tags"][:4]) if p["tags"] else "no tags"
            lines.append(f"  - {p['title']} [{p['difficulty']}] — topics: {tag_str}")
    else:
        lines.append("No problems solved today.")

    return {
        "username":     LEETCODE_USERNAME,
        "date":         today.isoformat(),
        "problems":     problems,
        "total_solved": len(problems),
        "summary_text": "\n".join(lines),
    }