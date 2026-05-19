import httpx
from bs4 import BeautifulSoup
import fitz  # PyMuPDF

_BLOCKED = {"medium.com", "wsj.com", "nytimes.com", "ft.com"}


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> tuple[str, int]:
    doc   = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = [page.get_text("text").strip() for page in doc if page.get_text("text").strip()]
    doc.close()
    if not pages:
        raise ValueError("No text found. This may be a scanned PDF — use Paste Text instead.")
    return "\n\n".join(pages), len(pages)


def fetch_webpage_text(url: str) -> tuple[str, str]:
    from urllib.parse import urlparse
    domain = urlparse(url).netloc.replace("www.", "")
    if domain in _BLOCKED:
        raise ValueError("This site blocks automated access. Copy the text and use Paste Text instead.")

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = httpx.get(url, headers=headers, follow_redirects=True, timeout=15)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise ValueError(f"Page returned HTTP {e.response.status_code}.")
    except Exception as e:
        raise ValueError(f"Could not fetch page: {str(e)}")

    soup  = BeautifulSoup(r.text, "html.parser")
    title = soup.find("title")
    title = title.get_text(strip=True) if title else url

    for tag in soup(["script","style","nav","footer","header","aside","form","iframe"]):
        tag.decompose()

    main = soup.find("article") or soup.find("main") or soup.find("body")
    text = main.get_text(separator="\n", strip=True) if main else soup.get_text()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    cleaned = "\n".join(lines)

    if len(cleaned) < 200:
        raise ValueError("Not enough text found. Try Paste Text instead.")
    return cleaned, title