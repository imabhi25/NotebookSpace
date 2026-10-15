import io
import uuid

import pytest
from fastapi.testclient import TestClient

from api.main import app
from db.connection import get_connection
from ingestion.file_types import parse_uploaded_file, source_type_for

client = TestClient(app)


def _write(tmp_path, name: str, data: bytes):
    path = tmp_path / name
    path.write_bytes(data)
    return path


def _pptx_bytes() -> bytes:
    from pptx import Presentation

    deck = Presentation()
    layout = deck.slide_layouts[1]
    first = deck.slides.add_slide(layout)
    first.shapes.title.text = "Loop invariants"
    first.placeholders[1].text = "Initialization, maintenance, termination."
    first.notes_slide.notes_text_frame.text = "Mention the prefix-sum example."
    second = deck.slides.add_slide(layout)
    second.shapes.title.text = "Binary search"
    second.placeholders[1].text = "Invariant: target is in A[lo..hi]."
    buf = io.BytesIO()
    deck.save(buf)
    return buf.getvalue()


def _docx_bytes() -> bytes:
    import docx

    document = docx.Document()
    document.add_paragraph("Assignment 3 covers shell scripting.")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Due"
    table.rows[0].cells[1].text = "November 4"
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def _xlsx_bytes() -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Grades"
    sheet.append(["Component", "Weight"])
    sheet.append(["Midterm", "25%"])
    buf = io.BytesIO()
    workbook.save(buf)
    return buf.getvalue()


def test_source_types_cover_office_text_and_code():
    assert source_type_for("deck.PPTX") == "pptx"
    assert source_type_for("notes.docx") == "docx"
    assert source_type_for("grades.xlsx") == "xlsx"
    assert source_type_for("data.csv") == "csv"
    assert source_type_for("page.html") == "html"
    assert source_type_for("merge.c") == "code"
    assert source_type_for("readme.md") == "markdown"
    assert source_type_for("photo.png") is None


def test_pptx_keeps_slide_numbers_and_notes(tmp_path):
    pages = parse_uploaded_file(_write(tmp_path, "lecture.pptx", _pptx_bytes()), "lecture.pptx")
    assert [p[1] for p in pages] == [1, 2]
    assert "Loop invariants" in pages[0][2]
    assert "Speaker notes: Mention the prefix-sum example." in pages[0][2]
    assert "A[lo..hi]" in pages[1][2]


def test_docx_reads_paragraphs_and_tables(tmp_path):
    pages = parse_uploaded_file(_write(tmp_path, "a3.docx", _docx_bytes()), "a3.docx")
    text = " ".join(p[2] for p in pages)
    assert "shell scripting" in text
    assert "Due | November 4" in text


def test_xlsx_and_csv_read_rows(tmp_path):
    xlsx = " ".join(p[2] for p in parse_uploaded_file(_write(tmp_path, "g.xlsx", _xlsx_bytes()), "g.xlsx"))
    assert "Sheet: Grades" in xlsx and "Midterm | 25%" in xlsx
    csv_pages = parse_uploaded_file(_write(tmp_path, "g.csv", b"Component,Weight\nFinal,35%\n"), "g.csv")
    assert "Final | 35%" in csv_pages[0][2]


def test_html_and_code_are_read_as_text(tmp_path):
    html = parse_uploaded_file(
        _write(tmp_path, "p.html", b"<html><script>x()</script><p>Office hours Tuesday</p></html>"), "p.html"
    )
    assert "Office hours Tuesday" in html[0][2] and "x()" not in html[0][2]
    code = parse_uploaded_file(_write(tmp_path, "merge.c", b"void merge(int *a, int n) { }"), "merge.c")
    assert "merge(int" in code[0][2]


def test_image_only_deck_fails_with_a_clear_message(tmp_path):
    from pptx import Presentation

    deck = Presentation()
    deck.slides.add_slide(deck.slide_layouts[6])
    buf = io.BytesIO()
    deck.save(buf)
    with pytest.raises(ValueError, match="only images"):
        parse_uploaded_file(_write(tmp_path, "blank.pptx", buf.getvalue()), "blank.pptx")


@pytest.fixture
def auth_headers():
    email = f"filetypes_{uuid.uuid4().hex[:8]}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    user_id = resp.json()["user"]["id"]
    yield {"Authorization": f"Bearer {resp.json()['token']}"}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


def test_legacy_office_formats_explain_how_to_fix(auth_headers):
    sub_id = client.post("/subjects", json={"name": "Legacy"}, headers=auth_headers).json()["id"]
    resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("old.ppt", b"binary", "application/vnd.ms-powerpoint")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert ".pptx" in resp.json()["detail"]


def test_background_upload_returns_processing_then_becomes_ready(auth_headers):
    sub_id = client.post("/subjects", json={"name": "Background"}, headers=auth_headers).json()["id"]
    resp = client.post(
        f"/subjects/{sub_id}/sources/upload?background=true",
        files={"file": ("lecture.pptx", _pptx_bytes(), "application/octet-stream")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    created = resp.json()
    assert created["status"] == "processing"
    assert created["source_type"] == "pptx"

    # TestClient runs background tasks before returning, so the source is finished by now.
    detail = client.get(f"/subjects/{sub_id}/sources/{created['id']}", headers=auth_headers).json()
    assert detail["status"] == "ready"
    assert detail["page_count"] == 2
