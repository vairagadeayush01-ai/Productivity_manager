"""
routes/profile.py — User profile management and connected account integration.

Endpoints:
  GET  /profile/              — full profile + connection status
  PATCH /profile/             — update display_name, username
  PUT  /profile/github        — store encrypted GitHub PAT + validate
  DELETE /profile/github      — disconnect GitHub
  PUT  /profile/leetcode      — validate + store LeetCode username
  DELETE /profile/leetcode    — disconnect LeetCode

Security:
  - GitHub PATs are encrypted with AES-256-GCM before storage (core.encryption)
  - PATs are NEVER returned to the frontend (only github_username + connected status)
  - GitHub validation: calls GET /user with the PAT to verify it works
  - LeetCode validation: calls GraphQL recentAcSubmissionList — if no GraphQL error, valid
"""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from core.encryption import decrypt, encrypt
from database import User, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["profile"])

_GITHUB_API = "https://api.github.com"
_LC_GRAPHQL = "https://leetcode.com/graphql"
_LC_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; Antigravity/2.0)",
    "Referer": "https://leetcode.com",
}


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=80)
    username: str | None = Field(None, max_length=40, pattern=r'^[a-zA-Z0-9_-]+$')


class GitHubConnect(BaseModel):
    pat: str = Field(..., min_length=10, description="GitHub Personal Access Token")
    username: str = Field(..., min_length=1, max_length=80, description="GitHub username")


class LeetCodeConnect(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _validate_github_pat(pat: str, username: str) -> dict:
    """
    Calls GitHub GET /user with the provided PAT.
    Returns {login, name, public_repos} or raises HTTPException on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"{_GITHUB_API}/user",
                headers={
                    "Authorization": f"Bearer {pat}",
                    "Accept": "application/vnd.github+json",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(502, "GitHub API timed out. Try again.")
    except Exception as exc:
        raise HTTPException(502, f"Could not reach GitHub: {exc}")

    if resp.status_code == 401:
        raise HTTPException(400, "Invalid GitHub token — check your PAT.")
    if resp.status_code == 403:
        raise HTTPException(400, "GitHub token doesn't have required permissions.")
    if resp.status_code != 200:
        raise HTTPException(502, f"GitHub returned {resp.status_code}.")

    data = resp.json()
    actual_login = data.get("login", "").lower()
    if actual_login != username.lower():
        raise HTTPException(400,
            f"PAT belongs to GitHub user '{actual_login}', not '{username}'. "
            "Enter the username that matches this token."
        )
    return {"login": data["login"], "name": data.get("name", ""), "repos": data.get("public_repos", 0)}


async def _validate_leetcode_username(username: str) -> bool:
    """
    Validates a LeetCode username by calling the GraphQL API.
    Returns True if user exists, raises HTTPException otherwise.
    """
    query = """
    query checkUser($username: String!) {
      matchedUser(username: $username) {
        username
        profile { realName }
      }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _LC_GRAPHQL,
                json={"query": query, "variables": {"username": username}},
                headers=_LC_HEADERS,
            )
        data = resp.json()
    except Exception as exc:
        raise HTTPException(502, f"Could not reach LeetCode: {exc}")

    if resp.status_code != 200:
        raise HTTPException(502, f"LeetCode returned {resp.status_code}.")

    if "errors" in data:
        err = data["errors"][0].get("message", "GraphQL error")
        raise HTTPException(400, f"LeetCode error: {err}")

    matched = (data.get("data") or {}).get("matchedUser")
    if matched is None:
        raise HTTPException(400, f"LeetCode user '{username}' not found.")

    return True


def _profile_response(user: User) -> dict:
    """Serialize user to safe profile dict — NEVER includes github_pat_enc."""
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "github_username": user.github_username,
        "github_connected": bool(user.github_pat_enc),
        "leetcode_username": user.leetcode_username,
        "leetcode_connected": bool(user.leetcode_username),
        "calendar_connected": bool(user.google_credentials_enc),
        "extension_installed": bool(user.extension_installed),
        "last_sync_at": user.last_sync_at.isoformat() if user.last_sync_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/")
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full profile. PAT is never included."""
    return _profile_response(current_user)


@router.patch("/")
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update display_name and/or username."""
    if body.username is not None:
        # Check uniqueness
        existing = db.query(User).filter(
            User.username == body.username,
            User.id != current_user.id,
        ).first()
        if existing:
            raise HTTPException(409, f"Username '{body.username}' is already taken.")
        current_user.username = body.username

    if body.display_name is not None:
        current_user.display_name = body.display_name

    db.commit()
    db.refresh(current_user)
    logger.info("[Profile] Updated profile for user_id=%s", current_user.id)
    return _profile_response(current_user)


@router.put("/github")
async def connect_github(
    body: GitHubConnect,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Validate GitHub PAT + username, then encrypt and store.
    Returns connection info (no PAT in response).
    """
    gh_info = await _validate_github_pat(body.pat, body.username)

    current_user.github_username = gh_info["login"]
    current_user.github_pat_enc = encrypt(body.pat)
    db.commit()
    db.refresh(current_user)

    logger.info("[Profile] GitHub connected for user_id=%s → @%s", current_user.id, gh_info["login"])
    return {
        **_profile_response(current_user),
        "github_info": {
            "login": gh_info["login"],
            "name": gh_info["name"],
            "public_repos": gh_info["repos"],
        },
    }


@router.delete("/github")
def disconnect_github(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove GitHub PAT and username."""
    current_user.github_pat_enc = None
    current_user.github_username = None
    db.commit()
    logger.info("[Profile] GitHub disconnected for user_id=%s", current_user.id)
    return {"success": True, "message": "GitHub disconnected."}


@router.put("/leetcode")
async def connect_leetcode(
    body: LeetCodeConnect,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate LeetCode username exists, then store it."""
    await _validate_leetcode_username(body.username)
    current_user.leetcode_username = body.username
    db.commit()
    db.refresh(current_user)
    logger.info("[Profile] LeetCode connected for user_id=%s → %s", current_user.id, body.username)
    return _profile_response(current_user)


@router.delete("/leetcode")
def disconnect_leetcode(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove LeetCode username."""
    current_user.leetcode_username = None
    db.commit()
    logger.info("[Profile] LeetCode disconnected for user_id=%s", current_user.id)
    return {"success": True, "message": "LeetCode disconnected."}
