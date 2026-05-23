"""
git_hub_today.py — fetches today's GitHub activity (async HTTP).
"""

import logging
import os
from datetime import UTC, datetime

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")


def _headers() -> dict:
    h = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


async def fetch_today_activity() -> dict:
    """
    Hits the GitHub events API and filters to today's activity.
    """
    if not GITHUB_USERNAME:
        raise ValueError("GITHUB_USERNAME not set in .env")

    url = f"https://api.github.com/users/{GITHUB_USERNAME}/events"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=_headers(), timeout=10)
    except httpx.TimeoutException:
        raise ValueError("GitHub API timed out. Check your connection.")

    if response.status_code == 403:
        raise ValueError(
            "GitHub API rate limit hit. Add a GITHUB_TOKEN to your .env to raise the limit."
        )
    if response.status_code == 404:
        raise ValueError(f"GitHub user '{GITHUB_USERNAME}' not found.")
    if response.status_code != 200:
        raise ValueError(f"GitHub API returned {response.status_code}.")

    try:
        events = response.json()
    except Exception:
        raise ValueError("GitHub API returned unexpected data.")

    if not isinstance(events, list):
        raise ValueError(f"Unexpected GitHub response: {events}")

    today = datetime.now(UTC).date()

    commits = []
    new_repos = []
    repos_seen = set()

    for event in events:
        try:
            event_date = (
                datetime.strptime(event["created_at"], "%Y-%m-%dT%H:%M:%SZ")
                .replace(tzinfo=UTC)
                .date()
            )
        except (KeyError, ValueError):
            continue

        if event_date != today:
            continue

        repo_name = event.get("repo", {}).get("name", "unknown")
        repos_seen.add(repo_name)
        event_type = event.get("type", "")

        if event_type == "PushEvent":
            payload_commits = event.get("payload", {}).get("commits", [])
            if payload_commits:
                for commit in payload_commits:
                    msg = commit.get("message", "").strip()
                    if msg:
                        commits.append({"repo": repo_name, "message": msg})
            else:
                commits.append({"repo": repo_name, "message": "Pushed updates to repository"})

        elif event_type == "CreateEvent":
            ref_type = event.get("payload", {}).get("ref_type", "")
            if ref_type == "repository":
                new_repos.append(repo_name)

    lines = [f"GitHub activity for {GITHUB_USERNAME} on {today}:"]
    if commits:
        lines.append(f"\nCommits ({len(commits)}):")
        for c in commits:
            lines.append(f"  - [{c['repo']}] {c['message']}")
    if new_repos:
        lines.append(f"\nNew repositories created: {', '.join(new_repos)}")
    if not commits and not new_repos:
        lines.append("No push or create activity today.")

    return {
        "username": GITHUB_USERNAME,
        "date": today.isoformat(),
        "commits": commits,
        "repos_touched": sorted(repos_seen),
        "new_repos": new_repos,
        "total_commits": len(commits),
        "summary_text": "\n".join(lines),
    }
