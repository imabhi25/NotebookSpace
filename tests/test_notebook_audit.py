import io
import time
import uuid
import numpy as np
import pytest
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from fastapi.testclient import TestClient

from api.main import app
from db.connection import get_connection

client = TestClient(app)


def make_large_lecture_pdf(num_pages: int = 20) -> bytes:
    """Generate a real, valid lecture PDF > 10 MB with mathematical diagrams and embedded text."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf)

    for page in range(num_pages):
        c.drawString(50, 800, f"Lecture Slide {page+1}: Finite Element Analysis & Eq. 3")
        c.drawString(50, 780, f"Notice the yield point at 68.5 Ksi according to Eq. 3.")

        # Distinct high-res slide graphic diagram with equations
        arr = np.random.randint(220, 255, (900, 1400, 3), dtype=np.uint8)
        img = Image.fromarray(arr)
        d = ImageDraw.Draw(img)
        d.rectangle([40, 40, 1360, 860], outline=(30, 64, 175), width=6)
        d.text((80, 80), f"Figure {page+1}: Stress-Strain Curve under Eq. 3", fill=(15, 23, 42))
        d.text((80, 130), f"Measured yield stress: 72.{page} Ksi", fill=(15, 23, 42))

        img_buf = io.BytesIO()
        img.save(img_buf, format="JPEG", quality=90)
        img_buf.seek(0)

        c.drawImage(ImageReader(img_buf), 50, 220, width=500, height=330)
        c.drawString(50, 160, f"Discussion for slide {page+1}: The critical shear stress threshold remains invariant.")
        c.showPage()

    c.save()
    buf.seek(0)
    return buf.getvalue()


def make_scanned_image_only_pdf() -> bytes:
    """Generate a valid PDF containing only a raster image and zero text layer."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    img = Image.new("RGB", (400, 400), color=(255, 255, 255))
    img_buf = io.BytesIO()
    img.save(img_buf, format="JPEG")
    img_buf.seek(0)
    c.drawImage(ImageReader(img_buf), 50, 50, width=400, height=400)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def auth_user():
    email = f"audit_user_{uuid.uuid4().hex[:8]}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    user_id = resp.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    yield {"headers": headers, "user_id": user_id}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


def test_upload_size_limit_enforcement(auth_user, monkeypatch):
    import api.main as main_module

    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Size Limit Subject"}, headers=headers)
    assert subj_res.status_code == 200
    subj_id = subj_res.json()["id"]

    # The real limit is 100 MB; shrink it so the test doesn't build a 100 MB payload.
    monkeypatch.setattr(main_module, "MAX_UPLOAD_SIZE_BYTES", 2 * 1024 * 1024)
    over_limit_data = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024 + 500)
    resp = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("too_large.pdf", over_limit_data, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 413
    assert "exceeds maximum allowed size" in resp.json()["detail"].lower()
    assert "(2 mb)" in resp.json()["detail"].lower()


def test_valid_large_pdf_over_10mb_upload(auth_user):
    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Large Lecture Subject"}, headers=headers)
    assert subj_res.status_code == 200
    subj_id = subj_res.json()["id"]

    # Generate a real, valid lecture PDF > 10 MB (22 pages with diagrams and equations)
    pdf_bytes = make_large_lecture_pdf(num_pages=22)
    size_mb = len(pdf_bytes) / (1024 * 1024)
    assert size_mb > 10.0, f"Expected > 10 MB, got {size_mb:.2f} MB"

    start_upload = time.perf_counter()
    upload_res = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("Mechanics_Lecture_Slides.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    duration = time.perf_counter() - start_upload

    assert upload_res.status_code == 200
    source_data = upload_res.json()
    assert source_data["status"] == "ready"
    assert source_data["page_count"] == 22
    assert source_data["word_count"] > 200
    assert duration < 10.0, f"Upload and ingestion took too long: {duration:.2f}s"


def test_hybrid_keyword_retrieval_for_ksi_and_eq3(auth_user):
    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Materials Science"}, headers=headers)
    subj_id = subj_res.json()["id"]

    # Add source with Eq. 3 and Ksi
    lecture_content = (
        "Lecture 4: Solid Mechanics and Yield Criteria.\n\n"
        "Under multidirectional stress, the critical yield condition follows Eq. 3:\n"
        "sigma_yield = sqrt(sigma_x^2 - sigma_x*sigma_y + sigma_y^2).\n"
        "For titanium alloy Ti-6Al-4V, the ultimate tensile strength reaches 130 Ksi,\n"
        "whereas mild steel yields at approximately 36 Ksi.\n"
        "Refer to Eq. 3 when calculating safety factor allowances."
    )
    paste_res = client.post(
        f"/subjects/{subj_id}/sources/paste",
        json={"title": "Solid Mechanics Lecture", "text": lecture_content},
        headers=headers,
    )
    assert paste_res.status_code == 200
    src_id = paste_res.json()["id"]

    # Create conversation and ask about "Ksi"
    conv_res = client.post(f"/subjects/{subj_id}/conversations", json={"title": "Yield Chat"}, headers=headers)
    conv_id = conv_res.json()["id"]

    msg_res = client.post(
        f"/subjects/{subj_id}/conversations/{conv_id}/messages",
        json={"question": "What is the yield strength in Ksi according to Eq. 3?", "selected_source_ids": [src_id]},
        headers=headers,
    )
    assert msg_res.status_code == 200
    msg_data = msg_res.json()
    # Check that retrieved passages captured the chunk containing Eq. 3 and Ksi
    assert len(msg_data["retrieved"]) > 0
    top_retrieved = msg_data["retrieved"][0]
    chunk_text = top_retrieved.get("text") or top_retrieved.get("chunk_text") or ""
    assert "Eq. 3" in chunk_text or "Ksi" in chunk_text


def test_retry_flow_and_no_duplicate_questions(auth_user):
    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Retry Flow Test"}, headers=headers)
    subj_id = subj_res.json()["id"]

    paste_res = client.post(
        f"/subjects/{subj_id}/sources/paste",
        json={"title": "Algorithms Overview", "text": "Merge Sort runs in O(n log n) time in all cases."},
        headers=headers,
    )
    src_id = paste_res.json()["id"]

    conv_res = client.post(f"/subjects/{subj_id}/conversations", json={"title": "Conv 1"}, headers=headers)
    conv_id = conv_res.json()["id"]

    # Send first message
    first_res = client.post(
        f"/subjects/{subj_id}/conversations/{conv_id}/messages",
        json={"question": "What is the time complexity of Merge Sort?", "selected_source_ids": [src_id]},
        headers=headers,
    )
    assert first_res.status_code == 200
    first_msg = first_res.json()
    first_asst_id = first_msg["id"]

    # Verify message count: 1 user, 1 assistant
    msgs_before = client.get(f"/subjects/{subj_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_before) == 2
    assert msgs_before[0]["role"] == "user"
    assert msgs_before[1]["role"] == "assistant"

    # Now simulate retry on that turn
    retry_res = client.post(
        f"/subjects/{subj_id}/conversations/{conv_id}/messages",
        json={
            "question": "What is the time complexity of Merge Sort?",
            "selected_source_ids": [src_id],
            "is_retry": True,
            "retry_message_id": first_asst_id,
        },
        headers=headers,
    )
    assert retry_res.status_code == 200

    # Verify message count remains 2 (1 user, 1 assistant), NO duplicate user question
    msgs_after = client.get(f"/subjects/{subj_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_after) == 2
    assert msgs_after[0]["role"] == "user"
    assert msgs_after[1]["role"] == "assistant"
    # Old assistant message was replaced by new assistant message
    assert msgs_after[1]["id"] != first_asst_id


def test_replacement_version_and_filename_consistency(auth_user):
    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Version Test Subject"}, headers=headers)
    subj_id = subj_res.json()["id"]

    # Upload source version 1
    v1_content = b"Version 1 syllabus: Midterm weight is 30 percent."
    up_res = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("syllabus_v1.txt", v1_content, "text/plain")},
        headers=headers,
    )
    assert up_res.status_code == 200
    src = up_res.json()
    src_id = src["id"]
    assert src["version"] == 1
    assert src["file_name"] == "syllabus_v1.txt"

    # Replace with syllabus_v2.txt
    v2_content = b"Version 2 updated syllabus: Midterm weight is 40 percent."
    rep_res = client.post(
        f"/subjects/{subj_id}/sources/{src_id}/replace",
        files={"file": ("syllabus_v2.txt", v2_content, "text/plain")},
        headers=headers,
    )
    assert rep_res.status_code == 200
    src_v2 = rep_res.json()
    assert src_v2["version"] == 2
    assert src_v2["file_name"] == "syllabus_v2.txt"

    # Verify fetching source detail reflects version 2 and new file name
    detail = client.get(f"/subjects/{subj_id}/sources/{src_id}", headers=headers).json()
    assert detail["version"] == 2
    assert detail["file_name"] == "syllabus_v2.txt"


def test_scanned_pdf_actionable_error_message(auth_user):
    headers = auth_user["headers"]
    subj_res = client.post("/subjects", json={"name": "Scanned PDF Subject"}, headers=headers)
    subj_id = subj_res.json()["id"]

    scanned_pdf = make_scanned_image_only_pdf()
    up_res = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("scanned_document.pdf", scanned_pdf, "application/pdf")},
        headers=headers,
    )
    assert up_res.status_code == 200
    src = up_res.json()
    assert src["status"] == "failed"
    assert "OCR is currently unsupported" in src["error_message"]


def test_legacy_upload_blocks_anonymous_users(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    resp = client.post(
        "/upload",
        files={"file": ("test.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )
    assert resp.status_code == 403
    assert "disabled in demo mode" in resp.json()["detail"].lower()


def test_server_side_trimmed_input_validation(auth_user):
    headers = auth_user["headers"]

    # 1. Whitespace only subject name
    res1 = client.post("/subjects", json={"name": "   "}, headers=headers)
    assert res1.status_code == 422

    # 2. Whitespace only note title
    subj_res = client.post("/subjects", json={"name": "Valid Name"}, headers=headers)
    subj_id = subj_res.json()["id"]
    res2 = client.post(f"/subjects/{subj_id}/notes", json={"title": "   ", "content": "Some note"}, headers=headers)
    assert res2.status_code == 422

    # 3. Whitespace only question
    conv_res = client.post(f"/subjects/{subj_id}/conversations", json={"title": "Conv"}, headers=headers)
    conv_id = conv_res.json()["id"]
    res3 = client.post(
        f"/subjects/{subj_id}/conversations/{conv_id}/messages",
        json={"question": "   \n\t  ", "selected_source_ids": []},
        headers=headers,
    )
    assert res3.status_code == 422
