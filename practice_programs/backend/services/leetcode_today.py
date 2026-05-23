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
