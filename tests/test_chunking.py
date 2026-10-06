import pytest
from ingestion.chunker import Chunk, chunk_pages, chunk_page_text


def test_chunk_never_crosses_pages():
    """Verify that chunks never contain text from multiple pages."""
    # Page 1 has words like 'alpha_1', 'alpha_2' ...
    # Page 2 has words like 'beta_1', 'beta_2' ...
    page_1_words = [f"alpha_{i}" for i in range(1, 601)]
    page_2_words = [f"beta_{i}" for i in range(1, 501)]

    pages = [
        ("math101.pdf", 1, " ".join(page_1_words)),
        ("math101.pdf", 2, " ".join(page_2_words)),
    ]

    chunks = chunk_pages(pages, chunk_size=300, overlap=50, max_chunk_size=400)

    assert len(chunks) > 2

    # Check each chunk's content belongs strictly to its page
    for chunk in chunks:
        if chunk.page_number == 1:
            assert chunk.file_name == "math101.pdf"
            assert all(w.startswith("alpha_") for w in chunk.text.split())
            assert not any(w.startswith("beta_") for w in chunk.text.split())
        elif chunk.page_number == 2:
            assert chunk.file_name == "math101.pdf"
            assert all(w.startswith("beta_") for w in chunk.text.split())
            assert not any(w.startswith("alpha_") for w in chunk.text.split())
        else:
            pytest.fail(f"Unexpected page number: {chunk.page_number}")


def test_page_and_file_metadata_preserved():
    """Verify that file name and page number are accurately preserved on each chunk."""
    pages = [
        ("lecture1.pdf", 1, "Short introductory content for lecture 1 page 1."),
        ("lecture1.pdf", 2, "More content on page 2 of lecture 1."),
        ("syllabus.pdf", 1, "Course syllabus content on page 1."),
    ]

    chunks = chunk_pages(pages)

    assert len(chunks) == 3
    assert chunks[0].file_name == "lecture1.pdf"
    assert chunks[0].page_number == 1
    assert chunks[1].file_name == "lecture1.pdf"
    assert chunks[1].page_number == 2
    assert chunks[2].file_name == "syllabus.pdf"
    assert chunks[2].page_number == 1


def test_chunk_overlap_works():
    """Verify that consecutive chunks on the same page have the expected word overlap."""
    words = [f"word_{i}" for i in range(600)]
    text = " ".join(words)

    chunk_size = 300
    overlap = 50
    chunks = chunk_page_text(
        text=text,
        file_name="doc.pdf",
        page_number=1,
        chunk_size=chunk_size,
        overlap=overlap,
        max_chunk_size=400,
    )

    assert len(chunks) == 2

    words_c1 = chunks[0].text.split()
    words_c2 = chunks[1].text.split()

    assert len(words_c1) == chunk_size
    # The tail of chunk 1 should match the start of chunk 2
    tail_c1 = words_c1[-overlap:]
    head_c2 = words_c2[:overlap]
    assert tail_c1 == head_c2


def test_chunk_size_roughly_200_to_400_words():
    """Verify that chunks generated from larger text are within the 200-400 word guideline."""
    words = [f"term_{i}" for i in range(1200)]
    text = " ".join(words)

    chunks = chunk_page_text(
        text=text,
        file_name="doc.pdf",
        page_number=1,
        chunk_size=300,
        overlap=50,
        max_chunk_size=400,
    )

    for chunk in chunks:
        assert 200 <= chunk.word_count <= 400


def test_empty_page_produces_no_chunks():
    """Verify that empty text does not generate spurious chunks."""
    chunks = chunk_page_text(
        text="   \n  \t ",
        file_name="empty.pdf",
        page_number=1,
    )
    assert chunks == []
