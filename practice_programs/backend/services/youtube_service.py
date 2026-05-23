"""
youtube_service.py — YouTube transcript extraction and video title fetching (async).
"""

import re
import httpx
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound


def extract_video_id(url: str) -> str | None:
    """Extract the 11-char video ID from any YouTube URL format."""
    match = re.search(r"(?:v=|youtu\.be/|shorts/)([a-zA-Z0-9_-]{11})", url)
    return match.group(1) if match else None


def get_transcript(video_id: str) -> str:
    """
    Fetches and returns transcript text for a YouTube video.
    Prefers English; falls back to any available language (translated if possible).
    Uses the youtube_transcript_api which is a synchronous library — kept sync intentionally.
    """
    try:
        # New API: class method, no instantiation needed
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            transcript = transcript_list.find_transcript(["en", "en-IN", "en-US", "en-GB"])
        except Exception:
            transcript = next(iter(transcript_list))

        try:
            if transcript.language_code != "en" and transcript.is_translatable:
                transcript = transcript.translate("en")
        except Exception:
            pass

        chunks = transcript.fetch()
        return " ".join(
            (chunk["text"] if isinstance(chunk, dict) else getattr(chunk, "text", ""))
            for chunk in chunks
        )
    except Exception as e:
        raise ValueError(f"Could not fetch transcript: {str(e)}")



async def get_video_title(video_id: str) -> str:
    """Async fetch the video title via YouTube oEmbed API."""
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(url)
            if response.status_code == 200:
                return response.json().get("title", video_id)
    except Exception:
        pass
    return video_id