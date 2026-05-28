"""
services/git_hub_today.py — GitHub activity fetcher with semantic diff analysis.

Upgraded in Phase 2.2:
  - fetch_today_activity()  now fetches full commit diffs via /commits/{sha}
  - fetch_commit_diff()     new: returns a ParsedDiff for a single commit
  - analyze_commit()        new: Groq AI semantic summary of a parsed diff
  - get_user_pat()          new: resolve PAT from DB or env (DB takes priority)

Upgraded Architecture:
  - fetch_today_activity() queries active repos, then directly queries `/commits`.
    This avoids the empty SHA issue from the `/events` feed.
"""
import json
import logging
import os
from datetime import UTC, datetime, timedelta

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


# ─── Fetch a single commit's full diff ────────────────────────────────────────

async def fetch_commit_diff(owner: str, repo: str, sha: str, pat: str = "") -> ParsedDiff | None:
    """
    Fetches the full diff for a single commit SHA.
    Returns a ParsedDiff or None on failure.
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


# ─── AI commit analysis ───────────────────────────────────────────────────────

def analyze_commit(commit_msg: str, diff: ParsedDiff, username: str) -> dict:
    """
    Calls Groq to generate a semantic summary of a commit.
    Returns dict with semantic_summary, change_type, impact, patterns.
    """
    groq = _get_groq()
    if not groq:
        return {
            "semantic_summary": commit_msg[:300],
            "change_type": diff.primary_change_type,
            "impact": "unknown",
            "patterns": diff.languages[:3],
        }

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
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(text.strip())
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


# ─── Robust Commits Fetch (New Architecture) ──────────────────────────────────

async def fetch_today_activity(pat: str = "", username: str = "") -> dict:
    """
    Fetches the user's latest commits by explicitly querying active repositories
    instead of relying on the unreliably-formatted /events API.
    """
    gh_user = username or GITHUB_USERNAME
    if not gh_user:
        raise ValueError("GitHub username not set. Connect GitHub in your profile or set GITHUB_USERNAME in .env")

    # Fetch commits from up to 3 days ago
    since_date = (datetime.now(UTC) - timedelta(days=3)).replace(hour=0, minute=0, second=0, microsecond=0)
    since_iso = since_date.strftime("%Y-%m-%dT%H:%M:%SZ")

    commits = []
    repos_seen = set()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = _github_headers(pat)
            
            # 1. Fetch repositories updated recently
            url_repos = f"{_GITHUB_API}/users/{gh_user}/repos?sort=updated&per_page=15"
            resp = await client.get(url_repos, headers=headers)
            
            if resp.status_code == 401 or resp.status_code == 403:
                raise ValueError("GitHub API rate limit or auth failed. Add a PAT in your profile.")
            if resp.status_code == 404:
                raise ValueError(f"GitHub user '{gh_user}' not found.")
            if resp.status_code != 200:
                raise ValueError(f"GitHub API returned {resp.status_code}.")
            
            repos = resp.json()
            if not isinstance(repos, list):
                raise ValueError(f"Unexpected GitHub repos response: {repos}")
            
            # 2. Iterate through each repo to find recent commits
            for repo_obj in repos:
                repo_full = repo_obj.get("full_name")
                owner = repo_obj.get("owner", {}).get("login")
                repo_name = repo_obj.get("name")
                
                if not repo_full or not owner or not repo_name:
                    continue
                
                url_commits = f"{_GITHUB_API}/repos/{owner}/{repo_name}/commits?author={gh_user}&since={since_iso}"
                commits_resp = await client.get(url_commits, headers=headers)
                
                if commits_resp.status_code != 200:
                    logger.warning(f"Failed to fetch commits for {repo_full}: HTTP {commits_resp.status_code}")
                    continue
                    
                repo_commits = commits_resp.json()
                if not isinstance(repo_commits, list):
                    continue
                    
                # 3. Download the diff and analyze each commit
                for c_obj in repo_commits:
                    sha = c_obj.get("sha", "")
                    msg = c_obj.get("commit", {}).get("message", "").strip()
                    
                    if not sha or not msg:
                        continue
                        
                    repos_seen.add(repo_full)
                    
                    commit_data = {
                        "repo": repo_full,
                        "repo_name": repo_name,
                        "owner": owner,
                        "message": msg,
                        "sha": sha,
                        "parsed_diff": None,
                        "ai_analysis": None,
                        "patch_text": ""
                    }
                    
                    # Fetch full diff
                    diff = await fetch_commit_diff(owner, repo_name, sha, pat)
                    if diff:
                        ai = analyze_commit(msg, diff, gh_user)
                        commit_data["parsed_diff"] = parsed_diff_to_dict(diff)
                        commit_data["ai_analysis"] = ai
                        commit_data["patch_text"] = diff.patch_text
                        
                    commits.append(commit_data)
                    
    except httpx.TimeoutException:
        raise ValueError("GitHub API timed out. Check your connection.")
    except Exception as exc:
        if isinstance(exc, ValueError):
            raise
        raise ValueError(f"GitHub API error: {exc}")

    today = datetime.now(UTC).date()
    
    # Build summary text (backward compat)
    lines = [f"GitHub activity for {gh_user} on {today}:"]
    if commits:
        lines.append(f"\nCommits ({len(commits)}):")
        for c in commits:
            # truncate message for summary
            msg_trunc = c['message'].split('\n')[0][:100]
            lines.append(f"  - [{c['repo']}] {msg_trunc}")
    if not commits:
        lines.append("No commits found in the last 3 days.")

    return {
        "username":      gh_user,
        "date":          today.isoformat(),
        "commits":       commits,
        "repos_touched": sorted(repos_seen),
        "new_repos":     [], 
        "total_commits": len(commits),
        "summary_text":  "\n".join(lines),
    }
