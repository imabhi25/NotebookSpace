import html
from html.parser import HTMLParser
import io
import ipaddress
from pathlib import Path
import re
import socket
from typing import BinaryIO
from urllib.parse import urlparse
import httpx
import pypdf

from ingestion.parser import parse_pdf


class _HTMLContentExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self._in_title = False
        self._ignored_depth = 0
        self._ignored_tags = {"script", "style", "noscript", "svg", "header", "footer", "nav"}
        self.text_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        tag_lower = tag.lower()
        if tag_lower in self._ignored_tags:
            self._ignored_depth += 1
        elif tag_lower == "title":
            self._in_title = True
        elif tag_lower in {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "article", "section"}:
            self.text_chunks.append("\n")

    def handle_endtag(self, tag: str):
        tag_lower = tag.lower()
        if tag_lower in self._ignored_tags:
            if self._ignored_depth > 0:
                self._ignored_depth -= 1
        elif tag_lower == "title":
            self._in_title = False
        elif tag_lower in {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "article", "section"}:
            self.text_chunks.append("\n")

    def handle_data(self, data: str):
        if self._in_title:
            self.title += data
        elif self._ignored_depth == 0:
            self.text_chunks.append(data)


def is_ip_private_or_restricted(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_reserved
        or ip_obj.is_multicast
        or ip_obj.is_unspecified
    )


def validate_url_safe(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: hostname missing.")

    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise ValueError(f"Could not resolve host '{hostname}': {e}")

    for family, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            if is_ip_private_or_restricted(ip_obj):
                raise ValueError(
                    f"Access to private/local network address ({ip_str}) is blocked for security."
                )
        except ValueError as ve:
            if "blocked" in str(ve):
                raise
            continue


def parse_pdf_source(
    source: str | Path | BinaryIO,
    file_name: str | None = None,
) -> list[tuple[str, int, str]]:
    """
    Parse a PDF file while detecting scanned PDFs lacking text layers.
    Raises ValueError if extraction produces no usable text.
    """
    pages = parse_pdf(source, file_name=file_name, skip_empty=False)

    total_chars = sum(len(p[2].strip()) for p in pages)
    if total_chars < 15:
        raise ValueError(
            "Scanned PDF without text layer detected. OCR is currently unsupported. "
            "Please upload a PDF with embedded text or an OCR-processed document."
        )

    return pages


def parse_text_source(
    content: str,
    file_name: str,
    words_per_page: int = 350,
) -> list[tuple[str, int, str]]:
    """
    Partition plain text or markdown into virtual pages (~350 words).
    Preserves 1-indexed page numbering for citation consistency.
    """
    cleaned = content.replace("\x00", "").strip()
    if not cleaned:
        raise ValueError("The source text is empty.")

    words = cleaned.split()
    if not words:
        raise ValueError("The source text contains no readable words.")

    pages: list[tuple[str, int, str]] = []
    page_idx = 1
    for i in range(0, len(words), words_per_page):
        page_words = words[i : i + words_per_page]
        pages.append((file_name, page_idx, " ".join(page_words)))
        page_idx += 1

    return pages


def fetch_and_parse_url(
    url: str,
    title: str | None = None,
    words_per_page: int = 350,
) -> tuple[str, list[tuple[str, int, str]]]:
    """
    Safely fetch a public webpage, protect against SSRF, extract article text,
    and partition into virtual pages.
    """
    # 1. SSRF validation
    validate_url_safe(url)

    # 2. Fetch with size and timeout safeguards
    max_bytes = 5 * 1024 * 1024  # 5 MB
    headers = {
        "User-Agent": "NotebookSpace/2.0 (Study Document Assistant; +https://notebookspace.netlify.app)",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.9,*/*;q=0.8",
    }

    current_url = url
    try:
        with httpx.Client(timeout=10.0, follow_redirects=False) as client:
            resp = None
            for _ in range(5):
                validate_url_safe(current_url)
                resp = client.get(current_url, headers=headers)
                if resp.is_redirect:
                    next_url = resp.headers.get("location")
                    if not next_url:
                        break
                    from urllib.parse import urljoin
                    current_url = urljoin(current_url, next_url)
                    continue
                break
            else:
                raise ValueError("Too many redirects (exceeded 5 redirect limit).")

            if resp is None:
                raise ValueError("Failed to retrieve URL.")

            if resp.status_code >= 400:
                raise ValueError(f"HTTP error {resp.status_code} when fetching URL.")

            content_bytes = resp.content
            if len(content_bytes) > max_bytes:
                raise ValueError("Webpage content exceeds maximum allowed size limit (5 MB).")

            content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
            html_text = resp.text
    except httpx.TimeoutException:
        raise ValueError("Request timed out while fetching the webpage (10s limit).")
    except httpx.RequestError as e:
        raise ValueError(f"Network error while fetching URL: {e}")

    # 3. A link to a PDF is parsed as a PDF. Servers mislabel downloads, so the bytes decide.
    if content_type == "application/pdf" or content_bytes[:1024].lstrip().startswith(b"%PDF-"):
        path_name = Path(urlparse(current_url).path).name
        doc_title = (title or path_name or urlparse(url).netloc or "PDF Source").strip()
        try:
            pages = parse_pdf_source(io.BytesIO(content_bytes), file_name=doc_title)
        except Exception:
            raise ValueError(
                "Couldn't fetch this PDF: the file could not be read as text. "
                "It may be scanned, password-protected, or damaged. Download it and upload the file instead."
            )
        return doc_title, pages

    # Anything else that is not text cannot be read as a web page.
    is_text_type = (
        not content_type
        or content_type.startswith("text/")
        or content_type in ("application/xhtml+xml", "application/xml", "application/json")
    )
    if not is_text_type or b"\x00" in content_bytes[:2048]:
        raise ValueError("This link is not a web page or a PDF, so it cannot be added as a source.")

    # 4. Extract text and title
    extractor = _HTMLContentExtractor()
    extractor.feed(html_text)

    doc_title = (title or extractor.title or urlparse(url).netloc or "Web Source").strip()
    # Normalize excessive whitespace
    raw_text = "".join(extractor.text_chunks)
    cleaned_lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    full_text = "\n\n".join(cleaned_lines)

    if len(full_text.split()) < 15:
        raise ValueError("No readable text content could be extracted from the specified webpage.")

    # 5. Partition into pages
    pages = parse_text_source(full_text, file_name=doc_title, words_per_page=words_per_page)
    return doc_title, pages
