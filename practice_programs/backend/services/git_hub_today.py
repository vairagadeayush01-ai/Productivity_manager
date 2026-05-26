"""
services/git_hub_today.py — GitHub activity fetcher with semantic diff analysis.

Upgraded in Phase 2.2:
  - fetch_today_activity()  now fetches full commit diffs via /commits/{sha}
  - fetch_commit_diff()     new: returns a ParsedDiff for a single commit
  - analyze_commit()        new: Groq AI semantic summary of a parsed diff
  - get_user_pat()          new: resolve PAT from DB or env (DB takes priority)

The AI analysis prompt asks for structured JSON:
  {semantic_summary, change_type, impact, patterns}

On failure (Groq unavailable, rate limit, etc.) the diff data is still stored
with the commit message as the summary — no data is lost.
"""
import json
import logging
import os
from datetime import UTC, datetime

import httpx
from dotenv import load_dotenv

from services.diff_parser import ParsedDiff, parse_commit_files, parsed_diff_to_dict

load_dotenv()

logger = logging.getLogger(__name__)

GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "")
GITHUB_TOKEN    = os.getenv("GITHUB_TOKEN", "")

_GROQ_MODEL  = "llama-3.3-70b-versatile"
_GITHUB_API  = "https://api.github.com"


def _github_headers(pat: str = "") -> dict:
    token = pat or GITHUB_TOKEN
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _get_groq():
    """Lazy Groq client. Returns None if GROQ_API_KEY not set."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None
    try:
        from groq import Groq
        return Groq(api_key=api_key)
    except Exception as exc:
        logger.warning("Could not init Groq client: %s", exc)
        return None


# ─── New: fetch a single commit's full diff ───────────────────────────────────

async def fetch_commit_diff(owner: str, repo: str, sha: str, pat: str = "") -> ParsedDiff | None:
    """
    Fetches the full diff for a single commit SHA.
    Returns a ParsedDiff or None on failure.

    owner/repo extracted from repo_name field ("owner/repo" format).
    """
    url = f"{_GITHUB_API}/repos/{owner}/{repo}/commits/{sha}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(url, headers=_github_headers(pat))
        if resp.status_code != 200:
            logger.warning("GitHub diff fetch returned %s for %s/%s@%s", resp.status_code, owner, repo, sha)
            return None
        data = resp.json()
        files = data.get("files", [])
        commit_msg = (data.get("commit") or {}).get("message", "")
        return parse_commit_files(files, commit_msg)
    except Exception as exc:
        logger.warning("Failed to fetch commit diff %s: %s", sha, exc)
        return None


# ─── New: AI commit analysis ──────────────────────────────────────────────────

def analyze_commit(commit_msg: str, diff: ParsedDiff, username: str) -> dict:
    """
    Calls Groq to generate a semantic summary of a commit.

    Returns dict with:
      semantic_summary: str
      change_type:      str (feature|bugfix|refactor|test|config)
      impact:           str (frontend|backend|database|algorithm|infrastructure|unknown)
      patterns:         list[str]

    Returns a safe fallback dict if Groq is unavailable or fails.
    """
    groq = _get_groq()
    if not groq:
        return {
            "semantic_summary": commit_msg[:300],
            "change_type": diff.primary_change_type,
            "impact": "unknown",
            "patterns": diff.languages[:3],
        }

    # Build a concise file list for the prompt
    file_summary = ", ".join(
        f"{pf.filename} (+{pf.additions} -{pf.deletions})"
        for pf in diff.files[:10]
    )
    lang_str = ", ".join(diff.languages) or "Unknown"
    patch_excerpt = diff.patch_text[:2500] if diff.patch_text else "(no patch available)"

    prompt = f"""Analyze this Git commit from developer '{username}'.

Commit message: {commit_msg[:200]}
Languages: {lang_str}
Files changed ({diff.file_count}): {file_summary}
Total: +{diff.total_additions} lines added, -{diff.total_deletions} lines removed

Patch excerpt:
{patch_excerpt}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "semantic_summary": "2-3 sentences explaining what changed, why, and the approach used",
  "change_type": "feature|bugfix|refactor|test|config",
  "impact": "frontend|backend|database|algorithm|infrastructure|unknown",
  "patterns": ["pattern1", "pattern2"]
}}"""

    try:
        resp = groq.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=350,
        )
        text = resp.choices[0].message.content.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(text.strip())
        # Validate keys
        return {
            "semantic_summary": str(result.get("semantic_summary", commit_msg)),
            "change_type":      str(result.get("change_type", diff.primary_change_type)),
            "impact":           str(result.get("impact", "unknown")),
            "patterns":         list(result.get("patterns", [])),
        }
    except Exception as exc:
        logger.warning("Groq commit analysis failed for '%s': %s", commit_msg[:50], exc)
        return {
            "semantic_summary": commit_msg[:300],
            "change_type": diff.primary_change_type,
            "impact": "unknown",
            "patterns": diff.languages[:3],
        }


# ─── Original fetch_today_activity (upgraded) ─────────────────────────────────

async def fetch_today_activity(pat: str = "", username: str = "") -> dict:
    """
    Fetches today's GitHub activity. Now also retrieves full commit diffs.

    Each commit in the result dict now includes:
      - repo, message, sha (existing)
      - parsed_diff: dict from parsed_diff_to_dict(ParsedDiff) (new)
      - ai_analysis: dict from analyze_commit() (new)

    pat / username: pass per-user values from DB profile.
    Falls back to GITHUB_USERNAME / GITHUB_TOKEN env vars if not provided.
    """
    gh_user = username or GITHUB_USERNAME
    if not gh_user:
        raise ValueError("GitHub username not set. Connect GitHub in your profile or set GITHUB_USERNAME in .env")

    url = f"{_GITHUB_API}/users/{gh_user}/events"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=_github_headers(pat))
    except httpx.TimeoutException:
        raise ValueError("GitHub API timed out. Check your connection.")
    except Exception as exc:
        raise ValueError(f"GitHub API error: {exc}")

    if response.status_code == 403:
        raise ValueError("GitHub API rate limit hit. Add a PAT in your profile.")
    if response.status_code == 404:
        raise ValueError(f"GitHub user '{gh_user}' not found.")
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

        repo_full = event.get("repo", {}).get("name", "unknown")  # "owner/repo"
        repos_seen.add(repo_full)
        event_type = event.get("type", "")

        if event_type == "PushEvent":
            payload_commits = event.get("payload", {}).get("commits", [])
            repo_parts = repo_full.split("/") if "/" in repo_full else ["", repo_full]
            owner, repo_name = (repo_parts[0], repo_parts[1]) if len(repo_parts) == 2 else ("", repo_full)

            if payload_commits:
                for commit in payload_commits:
                    sha = commit.get("sha", "")
                    msg = commit.get("message", "").strip()
                    if msg:
                        commit_data = {
                            "repo": repo_full,
                            "repo_name": repo_name,
                            "owner": owner,
                            "message": msg,
                            "sha": sha,
                            "parsed_diff": None,
                            "ai_analysis": None,
                        }

                        # Fetch full diff if SHA is available
                        if sha and owner and repo_name:
                            diff = await fetch_commit_diff(owner, repo_name, sha, pat)
                            if diff:
                                ai = analyze_commit(msg, diff, gh_user)
                                commit_data["parsed_diff"] = parsed_diff_to_dict(diff)
                                commit_data["ai_analysis"] = ai
                                commit_data["patch_text"] = diff.patch_text

                        commits.append(commit_data)
            else:
                commits.append({
                    "repo": repo_full,
                    "repo_name": repo_name,
                    "owner": owner,
                    "message": "Pushed updates",
                    "sha": "",
                    "parsed_diff": None,
                    "ai_analysis": None,
                })

        elif event_type == "CreateEvent":
            ref_type = event.get("payload", {}).get("ref_type", "")
            if ref_type == "repository":
                new_repos.append(repo_full)

    # Build summary text (backward compat)
    lines = [f"GitHub activity for {gh_user} on {today}:"]
    if commits:
        lines.append(f"\nCommits ({len(commits)}):")
        for c in commits:
            lines.append(f"  - [{c['repo']}] {c['message']}")
    if new_repos:
        lines.append(f"\nNew repositories: {', '.join(new_repos)}")
    if not commits and not new_repos:
        lines.append("No push or create activity today.")

    return {
        "username":      gh_user,
        "date":          today.isoformat(),
        "commits":       commits,
        "repos_touched": sorted(repos_seen),
        "new_repos":     new_repos,
        "total_commits": len(commits),
        "summary_text":  "\n".join(lines),
    }
