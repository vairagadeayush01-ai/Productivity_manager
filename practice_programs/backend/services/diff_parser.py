"""
services/diff_parser.py — Git patch semantic parser.

Responsibilities:
  1. Skip generated/vendored files (node_modules, dist, *.lock, *.min.*, etc.)
  2. Cap total patch size at 8192 bytes across all files (hard limit for AI context)
  3. Classify each changed file by change type: feature|bugfix|refactor|test|config
  4. Detect programming language from file extension
  5. Extract added/removed function/class signatures from diff lines
  6. Return structured ParsedDiff object ready for AI prompt injection

This module is pure Python — no network calls, no AI, no DB.
Fast: designed to run synchronously without blocking the event loop.
"""
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

# ─── Config ──────────────────────────────────────────────────────────────────

MAX_PATCH_BYTES = 8192  # 8KB cap across all files in a commit

SKIP_PATTERNS = [
    r'node_modules/',
    r'dist/',
    r'build/',
    r'\.min\.[jt]s',
    r'\.lock$',
    r'__pycache__/',
    r'\.pyc$',
    r'\.git/',
    r'vendor/',
    r'package-lock\.json',
    r'yarn\.lock',
    r'Pipfile\.lock',
    r'poetry\.lock',
    r'composer\.lock',
    r'Gemfile\.lock',
    r'\.map$',
    r'\.snap$',           # Jest snapshot files
    r'coverage/',
    r'\.next/',
    r'\.nuxt/',
    r'__generated__/',
]

LANGUAGE_MAP = {
    '.py':    'Python',
    '.js':    'JavaScript',
    '.ts':    'TypeScript',
    '.jsx':   'React/JSX',
    '.tsx':   'React/TSX',
    '.java':  'Java',
    '.go':    'Go',
    '.rs':    'Rust',
    '.cpp':   'C++',
    '.cc':    'C++',
    '.c':     'C',
    '.h':     'C/C++ Header',
    '.cs':    'C#',
    '.rb':    'Ruby',
    '.php':   'PHP',
    '.swift': 'Swift',
    '.kt':    'Kotlin',
    '.sh':    'Shell',
    '.bash':  'Shell',
    '.sql':   'SQL',
    '.html':  'HTML',
    '.css':   'CSS',
    '.scss':  'SCSS',
    '.sass':  'SASS',
    '.yaml':  'YAML',
    '.yml':   'YAML',
    '.json':  'JSON',
    '.md':    'Markdown',
    '.toml':  'TOML',
    '.tf':    'Terraform',
    '.dart':  'Dart',
    '.ex':    'Elixir',
    '.exs':   'Elixir',
}

# Keywords that hint at the change type (checked against filename + patch content)
_BUGFIX_KEYWORDS    = frozenset(['fix', 'bug', 'error', 'exception', 'crash', 'issue', 'patch', 'hotfix', 'repair', 'correct'])
_REFACTOR_KEYWORDS  = frozenset(['refactor', 'rename', 'cleanup', 'clean up', 'reorganize', 'restructure', 'extract', 'simplify', 'optimize', 'improve'])

# Regex patterns for function/class signature detection in diff lines
_SIG_PATTERNS = re.compile(
    r'^[+-]\s*(?:'
    r'def\s+\w+|'            # Python function
    r'async def\s+\w+|'      # Python async
    r'class\s+\w+|'          # Python/JS class
    r'function\s+\w+|'       # JS function
    r'const\s+\w+\s*=.*=>|' # JS arrow function
    r'fn\s+\w+|'             # Rust
    r'pub fn\s+\w+|'         # Rust public
    r'func\s+\w+|'           # Go
    r'static\s+\w+|'         # Java/C# static method
    r'public\s+\w+|'         # Java/C# public method
    r'private\s+\w+|'        # Java/C# private method
    r'@\w+\s*\n?'            # Decorator (Python/Java)
    r')'
)


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class ParsedFile:
    filename: str
    language: str
    change_type: str                         # feature | bugfix | refactor | test | config | unknown
    additions: int
    deletions: int
    patch_snippet: str                       # truncated patch text
    added_signatures: list = field(default_factory=list)
    removed_signatures: list = field(default_factory=list)


@dataclass
class ParsedDiff:
    total_additions: int
    total_deletions: int
    languages: list                          # unique languages, sorted
    files: list                              # list of ParsedFile
    truncated: bool                          # True if 8KB cap was hit
    primary_change_type: str                 # most common change_type
    patch_text: str                          # full assembled patch for AI prompt
    file_count: int                          # total files analysed (after skip)
    skipped_count: int                       # files skipped (generated/vendor)


# ─── Core functions ───────────────────────────────────────────────────────────

def should_skip(filename: str) -> bool:
    """True if this file should be excluded from analysis."""
    return any(re.search(pat, filename) for pat in SKIP_PATTERNS)


def detect_language(filename: str) -> str:
    """Map file extension to human-readable language name."""
    if '.' not in filename:
        return 'Unknown'
    ext = '.' + filename.rsplit('.', 1)[-1].lower()
    return LANGUAGE_MAP.get(ext, 'Unknown')


def classify_change(filename: str, patch: str, commit_msg: str = '') -> str:
    """
    Classify a file change into one of: test|config|bugfix|refactor|feature|unknown.
    Uses filename heuristics + keyword search in patch + commit message.
    """
    fn_lower = filename.lower()
    combined = (patch + ' ' + commit_msg).lower()

    if any(x in fn_lower for x in ['test', 'spec', '__test__', '.test.', '.spec.']):
        return 'test'

    if any(fn_lower.endswith(x) for x in ['.yml', '.yaml', '.env', '.toml', '.ini',
                                             '.cfg', 'dockerfile', 'makefile',
                                             'requirements.txt', 'package.json',
                                             'pyproject.toml', 'setup.py']):
        return 'config'
    if 'config' in fn_lower or 'settings' in fn_lower:
        return 'config'

    if any(kw in combined for kw in _BUGFIX_KEYWORDS):
        return 'bugfix'

    if any(kw in combined for kw in _REFACTOR_KEYWORDS):
        return 'refactor'

    return 'feature'


def extract_signatures(patch: str) -> tuple[list, list]:
    """
    Extract function/class signatures from diff lines.
    Lines starting with '+' = added signatures.
    Lines starting with '-' = removed signatures.
    Returns (added, removed) — capped at 10 each.
    """
    added, removed = [], []
    for line in (patch or '').split('\n'):
        if _SIG_PATTERNS.match(line):
            # Strip the leading +/- and whitespace, truncate to 100 chars
            sig = line[1:].strip()[:100]
            if line.startswith('+'):
                added.append(sig)
            elif line.startswith('-'):
                removed.append(sig)
    return added[:10], removed[:10]


def parse_commit_files(files: list, commit_msg: str = '') -> ParsedDiff:
    """
    Parse a list of GitHub API commit file objects.

    Input format (from GET /repos/{owner}/{repo}/commits/{sha}):
      [
        {
          "filename": "src/api.py",
          "patch": "@@ ... @@\\n+def new_func():\\n ...",
          "additions": 10,
          "deletions": 3,
          "status": "modified"
        },
        ...
      ]

    Returns a ParsedDiff suitable for AI summarization.
    """
    parsed_files: list[ParsedFile] = []
    total_add = total_del = 0
    languages_seen: set[str] = set()
    patch_parts: list[str] = []
    total_bytes = 0
    truncated = False
    skipped_count = 0

    for f in (files or []):
        fname = f.get('filename', '')

        if should_skip(fname):
            skipped_count += 1
            continue

        additions = f.get('additions', 0) or 0
        deletions = f.get('deletions', 0) or 0
        patch = f.get('patch') or ''
        total_add += additions
        total_del += deletions

        lang = detect_language(fname)
        if lang != 'Unknown':
            languages_seen.add(lang)

        change_type = classify_change(fname, patch, commit_msg)
        added_sigs, removed_sigs = extract_signatures(patch)

        # ── Patch size guard ─────────────────────────────────────────────────
        patch_encoded = patch.encode('utf-8', errors='replace')
        patch_bytes = len(patch_encoded)

        if total_bytes >= MAX_PATCH_BYTES:
            # Already hit limit — record file metadata but no patch
            patch_snippet = '[patch omitted — 8KB limit reached]'
            truncated = True
        elif total_bytes + patch_bytes > MAX_PATCH_BYTES:
            # Partial include
            remaining = MAX_PATCH_BYTES - total_bytes
            patch_snippet = patch[:remaining] + '\n... [truncated at 8KB]'
            patch_parts.append(f'### {fname} (+{additions} -{deletions})\n{patch_snippet}')
            total_bytes = MAX_PATCH_BYTES
            truncated = True
        else:
            patch_snippet = patch
            patch_parts.append(f'### {fname} (+{additions} -{deletions})\n{patch}')
            total_bytes += patch_bytes

        parsed_files.append(ParsedFile(
            filename=fname,
            language=lang,
            change_type=change_type,
            additions=additions,
            deletions=deletions,
            patch_snippet=patch_snippet,
            added_signatures=added_sigs,
            removed_signatures=removed_sigs,
        ))

    # ── Determine primary change type ─────────────────────────────────────────
    if parsed_files:
        ct_counts = Counter(pf.change_type for pf in parsed_files)
        primary_ct = ct_counts.most_common(1)[0][0]
    else:
        primary_ct = 'unknown'

    return ParsedDiff(
        total_additions=total_add,
        total_deletions=total_del,
        languages=sorted(languages_seen),
        files=parsed_files,
        truncated=truncated,
        primary_change_type=primary_ct,
        patch_text='\n\n'.join(patch_parts),
        file_count=len(parsed_files),
        skipped_count=skipped_count,
    )


def parsed_diff_to_dict(diff: ParsedDiff) -> dict:
    """Convert ParsedDiff to a plain dict for JSON serialization / DB storage."""
    return {
        'total_additions':    diff.total_additions,
        'total_deletions':    diff.total_deletions,
        'languages':          diff.languages,
        'file_count':         diff.file_count,
        'skipped_count':      diff.skipped_count,
        'truncated':          diff.truncated,
        'primary_change_type': diff.primary_change_type,
        'files': [
            {
                'filename':          pf.filename,
                'language':          pf.language,
                'change_type':       pf.change_type,
                'additions':         pf.additions,
                'deletions':         pf.deletions,
                'added_signatures':  pf.added_signatures,
                'removed_signatures': pf.removed_signatures,
            }
            for pf in diff.files
        ],
    }
