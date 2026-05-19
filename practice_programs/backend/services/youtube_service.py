from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re
import httpx


def extract_video_id(url: str) -> str | None:
    match = re.search(r"(?:v=|youtu\.be/|shorts/)([a-zA-Z0-9_-]{11})", url)
    return match.group(1) if match else None


def get_transcript(video_id: str) -> str:
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            transcript = transcript_list.find_manually_created_transcript(["en"])
        except Exception:
            try:
                transcript = transcript_list.find_generated_transcript(["en"])
            except Exception:
                transcript = next(iter(transcript_list))
        chunks = transcript.fetch()
        return " ".join(chunk["text"] for chunk in chunks)
    except TranscriptsDisabled:
        raise ValueError("Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise ValueError("No transcript found for this video.")
    except Exception as e:
        raise ValueError(f"Could not fetch transcript: {str(e)}")


def get_video_title(video_id: str) -> str:
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        response = httpx.get(url, timeout=5)
        if response.status_code == 200:
            return response.json().get("title", video_id)
    except Exception:
        pass
    return video_id