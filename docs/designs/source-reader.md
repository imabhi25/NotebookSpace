# NotebookSpace: Expanded Source Reader (Direction B)

> **Status (Nov 2026):** Implemented and merged to `main` (PR #23). This document is preserved from `backup/redesign-evidence-workspace` as the design record. The "Implementation Plan" below was written before the work and is not updated: sections that say "Nothing below is written yet" or "No change" for `SourceRow.tsx` / `SourceViewerModal.tsx` describe the plan, not the current code (the reader now also opens from the source list), and `SourceReader.test.tsx` was not added as a separate file.

*   **Author:** Abhi
*   **Status:** Draft
*   **Date:** 2026-11-07

--------------------------------------------------------------------------------

## Overview

NotebookSpace is a React study workspace with three areas: a collapsible
navigation on the left, a conversation with inline citation evidence in the
middle, and a floating context panel on the right. This design adds an
"Expand reader" action that lets a student read a cited source page at a
comfortable width without leaving the conversation, then return to exactly
where they were.

The design is based on the repository at branch `redesign/three-area-shell`,
commit `79e06edd` (Phase 1 of Direction B), which matches `origin` and has a
READY Vercel preview. Backend behavior has not been tested against a live
service; everything below about the API comes from reading the code.

Two facts from that reading change the scope of the work:

1.  **The reader does not exist yet.** Today the only way to read a source is
    `SourceViewerModal`, a modal dialog that prints the source's stored text in
    a `<pre>` block, with the `--- Page N ---` separator lines still visible. It
    has no page navigation, does not open at the cited page, and covers the
    conversation. The in-panel source view that the Direction B prototype
    showed was never built in production. "Add an Expand reader action to the
    existing source view" therefore means designing a compact in-panel reader
    first, and an expanded form of it second.
2.  **The data already carries page text.** `GET
    /subjects/{subject_id}/sources/{source_id}` returns `raw_content`: the
    extracted text of each page, joined with `--- Page N ---` lines. The server
    has its own parser for that format. The reader can likely get per-page text
    from this response. The response also carries every indexed chunk, which
    the reader never uses and which makes it about 3.4 times larger (measured,
    see Risks), so this design adds one small, backward-compatible backend
    option to leave the chunks out. "Per-page" is only as
    reliable as the marker format: the text is what the extractor produced (not
    a picture of the page), and a page boundary is wherever a marker line says
    it is. The Technical Plan covers the cases where this fails (empty content,
    very large sources, a page that contains marker-shaped text).

## The Problem

A student checking a claim opens a citation and sees the retrieved passage under
the answer. To judge whether the passage means what the answer says, they often
need the text around it. The current options are poor:

*   **The modal viewer** hides the answer they are checking and shows the whole
    source as one block of text, with page markers they have to scan for.
*   **The compact right panel** is 300 to 320px wide. At that width a line holds
    roughly 35 characters, which is too narrow to read a page of prose.
*   **Opening both** (inline evidence and a source view of the same page) shows
    the same passage twice, in two places, with no signal of which is
    authoritative.

The proposed solution is a reader inside the floating panel that opens at the
cited page when it is opened from a citation, can widen into a reading-sized
area on wide screens, and replaces the duplicate inline passage with a short
pointer while it is open and showing that same passage. Closing it returns the
student to their previous place as far as the page still allows: the same
navigation state, and focus and scroll position restored from the control and
answer they came from, with defined fallbacks when those no longer exist.

## Goals

*   **Open at the cited page, and say what is shown.** The reader opens only
    from a citation (an inline marker, an evidence block, a citation chip on a
    note, or a passage chosen in the Retrieval view). It opens at that source
    and the cited page, and always shows which source, which version and which
    page it is displaying. (Decision by the author: source rows keep opening the
    existing modal. Opening the reader from a source row is out of scope.)
*   **Readable width.** On wide screens, the expanded reader gives the page text
    a line length of roughly 60 to 70 characters, and the conversation column
    stays wide enough to read. The exact minimum width is an open question below
    and is settled with measurements in the Technical Plan.
*   **No duplicate passage.** An open inline evidence block shows a one-line
    pointer ("Shown in the reader") instead of its passage only while the
    expanded reader is displaying the same source, the same version and the same
    page as that block. If any of the three differs (for example the source was
    replaced, or the reader is on another page), the block keeps showing its own
    passage.
*   **Three ways back.** A visible Collapse button, the Escape key, and the
    evidence pointer all return to the compact state.
*   **Restore the previous state, with fallbacks.**
    *   The navigation is open or closed as it was before expanding.
    *   Focus returns to the control that expanded the reader, and the
        conversation scroll position is restored to what it was.
    *   The originating control or answer may be gone by then (the conversation
        was switched, the evidence block was closed, the answer was removed, the
        source was deleted). The design must define what happens in each case:
        focus moves to a stable landmark in the conversation, the scroll
        position is kept where it still applies, and nothing is scrolled to a
        wrong answer.
*   **Responsive.** The reader is the floating panel in a different state (a
    decision by the author, recorded below).
    *   **Wide screens:** the panel keeps its floating style (inset, rounded,
        elevated, below the header, bounded by the viewport height) and widens
        into the reader. It returns to its compact form on collapse.
    *   **Narrower desktop and tablet widths:** the reader is an overlay.
    *   **Phones:** a full-screen reader with a back control.
    *   **While the reader is expanded,** the compact panel content (materials,
        selected source, Notes and Retrieval tabs) is not visible. The composer's
        materials chip remains the way to change which materials a question
        uses. Opening Notes or Retrieval collapses the reader first.
*   **Honest evidence.** The reader never invents text, PDF coordinates or
    sentence-level highlights. It can mark a whole retrieved passage only when
    the data supports it, and says plainly when a page's text is missing.
*   **Accurate identity.** The reader always shows the source title, version and
    page it is actually displaying.
*   **Historical evidence stays historical.** When the cited source was replaced
    or deleted:
    *   What the answer saw is described as a historical snapshot: the excerpt
        saved with the citation, which is capped at 250 characters and so may be
        truncated, and the retrieved passage stored with the message where it
        exists.
    *   The reader never fetches the current page and shows it as the historical
        page, and never marks current text as the passage the answer used.
    *   If current content exists (a replaced source), it is reachable only
        through a separate, clearly labeled action such as "Open current
        version", and the reader then labels what it shows as the current
        version. If the source was deleted there is no such action.
*   **Source-row access is never lost.** The source-row "View" menu item and
    the selected-source card's "View full source" button keep opening the
    existing `SourceViewerModal`, unchanged.
*   **Accessible.** Light and dark themes, full keyboard access, visible focus,
    reduced-motion support, and long titles and long passages that do not
    overflow.

## Non-Goals

*   **Quick notes in the reader, and moving the note editor into the middle
    area.** These are later phases. This design names the places they would
    attach and builds nothing for them.
*   **Backend changes beyond one query option.** The only backend change is an
    optional `include_passages` parameter on the existing source-detail
    endpoint (Technical Plan, section 2). No schema, new endpoint or ingestion
    changes.
*   **PDF page rendering.** The reader shows extracted text, not page images.
    Layout, figures and tables are not reproduced.
*   **Sentence-level highlights.** Citations identify a page and an excerpt, not
    a sentence.
*   **Old versions of replaced sources.** Replacing a source deletes its old
    chunks. The reader can show only the current version, plus the historical
    snapshot that was saved with the answer.
*   **Changing or removing `SourceViewerModal`**, and **opening the reader from
    a source row.** Both were decided by the author: the modal stays as the
    viewer for source rows and the card's "View full source" button.
*   **Search, annotations or copy-to-note inside the reader.**
*   **A new visual identity.** The approved blue palette, system typography and
    the three-area workspace stay as they are.

## Open Questions

*   **Resolved: `SourceViewerModal`.** Kept unchanged for source rows and the
    card's "View full source"; the reader opens only from citations (option 1 of
    three; replacing it everywhere, and keeping it only as a fallback, were the
    others). Consequence: a student cannot browse a source's pages in the reader
    without a citation.
*   **Resolved: page text.** The frontend parses `raw_content` from the existing
    source-detail endpoint (option 1 of three; rebuilding pages from chunks, and
    a new backend per-page endpoint, were the others), requested with
    `include_passages=false` so the response carries the text only. This is
    the one backend change; see section 2 and Risks.
*   **Resolved: reader height (author, Nov 9, 2026).** While the reader is
    shown, in the compact and the expanded state, the panel fills the available
    height instead of fitting its content. Header and page controls stay put;
    only the page text scrolls. Sources, Notes and Retrieval keep today's
    content-height panel. See section 6.
*   **Resolved: scroll restoration timing.** Restore after the panel's width
    transition ends, with scroll anchoring switched off for that window, and
    detect the student's own scrolling from input events, not scroll events.
    See section 8.
*   **Resolved: opening with the panel collapsed.** The citation action opens
    the panel without changing the saved panel preference, and closing the
    reader puts the panel back as it was. See sections 4 and 5.
*   **Resolved: layout.** The expanded reader is the floating panel itself,
    widened (option A of three considered: a separate reader card beside the
    compact panel, and an always-overlay card, were the others). This replaces
    the earlier wording "the compact panel stays as it is": the compact panel's
    content is hidden while the reader is expanded. Docking width and the
    minimum conversation width are computed in the Technical Plan.
*   **Minimum conversation width while the reader is expanded.** A starting point
    is 560px of conversation. This needs a measurement at 1181px, the narrowest
    width at which the reader would dock beside the conversation.
*   **Resolved: very large sources.** Measured at 3.2 to 3.6 times the page
    text because of the chunk list. Decision (author, Nov 9, 2026): leave the
    chunks out with `include_passages=false`, which brings the response to
    about 1 times the page text. Not done: a per-page endpoint (Alternative D)
    and a size cap. Still open and outside this design: gzip on the API (the
    sample compresses to 11% of the passage-free size) and a measurement on a
    real near-50 MB PDF.
*   **Pages that contain the separator text.** A page whose own text contains a
    line shaped like `--- Page 7 ---` would be split wrongly by the server's
    parser and by any frontend copy of it. How often this happens is unknown.
*   **Minimum reader width.** `R = clamp(480px, 40vw, 600px)` gives about 52
    characters per line at 1,181px. A 560px minimum would give about 60 but
    leaves only 577px of conversation at 1,181px with the nav hidden. Which
    trade-off to take is undecided.
*   **Resolved: fallbacks for restoring focus and scroll.** Defined in Technical
    Plan section 8 and CUJ 5; tested with mocks.
*   **Reflow of single line breaks.** Whether to offer "show original line
    breaks" in the reader. Default in this design: no.
*   **Reader width on the overlay.** `min(480 to 600px, 100% - 24px)` between
    961 and 1,180px: whether the overlay should be narrower than the docked
    reader is untested.

## Critical User Journeys (CUJs)

These are the acceptance criteria. Each is testable with mocks unless marked.

### CUJ 1: Check a claim in the reader (wide screen)

*   **Given**: A wide desktop (1181px or wider) with the conversation open, an
    answer with a citation to a current source, and the compact panel showing
    materials.
*   **When**: The student opens the citation's evidence, chooses "Open source",
    then chooses "Expand reader".
*   **Then**:
    *   The panel shows the reader at the cited page, labelled with source
        title, version and page, with the retrieved passage marked as a whole
        passage (never a sentence).
    *   The panel widens. The conversation column stays at least 560px. If the
        navigation would take the conversation below that, it hides, and the
        saved navigation preference is not changed.
    *   The answer's evidence block shows "Shown in the reader" instead of the
        passage, because source, version and page all match.
    *   Collapse, Escape and the pointer each return to the compact state.
        Navigation is back as it was, focus is on the Expand button, and the
        conversation shows the same content at the same position.

### CUJ 2: Same flow at narrower widths

*   **Given**: A viewport of 961 to 1180px, or 960px and below.
*   **When**: The student opens the reader from a citation and expands it.
*   **Then**:
    *   At 961 to 1180px the reader is an overlay with a scrim. The
        conversation behind it is inert and focus stays inside the overlay.
    *   At 960px and below the reader is full-screen with a visible "Back to
        answer" control.
    *   Escape steps back one level: from the expanded reader to the compact
        reader, then from the compact reader to a closed panel. The back
        control closes the panel in one step. Where focus lands for each path
        is fixed by the table in section 8, not left to the overlay's default.

### CUJ 3: A cited source was replaced or deleted

*   **Given**: An answer citing source S at version 1, and S has since been
    replaced (now version 2) or deleted.
*   **When**: The student opens that citation's evidence.
*   **Then**:
    *   The evidence block shows a historical snapshot: the excerpt and
        retrieved passage saved with the answer, labelled as possibly
        truncated. The reader does not show that snapshot and does not fetch
        the current page as if it were the historical page.
    *   For a replaced source, a separate action "Open current version (v2)"
        opens the reader on the current text, labelled "Current version, not
        what the answer used", with no passage mark. The evidence block does
        not collapse to a pointer.
    *   For a deleted source there is no reader action.

### CUJ 4: Page text is unavailable

*   **Given**: A source whose `raw_content` is empty, whose request fails, or
    whose cited page has no text in `raw_content`.
*   **When**: The student opens the reader from its citation.
*   **Then**: The reader says what is wrong (loading failed with a Retry, no
    text stored for this source, or no text for page N), keeps the identity
    header, and offers "View as plain text", which opens the existing modal.
    No placeholder text is shown as if it were the page.

### CUJ 5: Returning when the starting point is gone

*   **Given**: The reader was expanded from an evidence block's controls.
*   **When**: Before returning, the student closes the evidence block, switches
    conversation, or the answer or source is removed.
*   **Then**: Return never scrolls to a wrong answer. Focus goes to the first
    available target in this order: the Expand button, the evidence pointer,
    the answer's Evidence button, the conversation landmark. The scroll
    position is restored only if the student has not scrolled the conversation
    while the reader was open.

## Technical Plan (Architecture)

### 1. What exists today (verified at `79e06edd`)

| Area | Current state |
| --- | --- |
| Layout | `SubjectWorkspaceView.tsx` owns nav (`isNavCollapsed`, saved preference `notebookspace_nav_open`) and the right panel (`isContextCollapsed`, `notebookspace_context_open`, `contextView` of `sources`, `notes` or `retrieval`). Docked at 1181px and wider; the panel is an overlay at 1180px and below (`useMediaQuery`), and the nav is a drawer at 960px and below. |
| Panel geometry | `workspace-layout.css`: nav slot 240px plus 12px gap; panel slot `--ctx-w` (300 to 320px) plus 12px gap plus 20px inset; body left padding 12px; slots animate `width`. |
| Evidence | `InlineEvidence` / `EvidenceBody` in `EvidenceBody.tsx`. It already labels replaced and removed sources and shows the saved excerpt or retrieved passage. It has no "Open source" action. |
| Viewer | `SourceViewerModal.tsx`, reached from the source-row menu and the selected-source card. Unchanged by this design. |
| Focus | `useModalFocus.ts`: dialog stack, opener capture, fallback to `[data-focus-fallback]`. Already used for the nav drawer and the panel overlay. |
| Data | `api.getSourceDetail` returns the source with `raw_content` and `passages` (chunks). Citations carry `file`, `page`, `source_id`, `source_version`, `title`, `excerpt` (at most 250 characters). Messages carry `retrieved` entries with full chunk text. |

### 2. Page text from `raw_content`

The reader gets page text from `getSourceDetail(...).raw_content`.

*   **Format.** The server writes each page as a line `--- Page N ---`, a newline,
    then the page text, with a blank line between pages. The server parses it
    with `^--- Page (\d+) ---\n` (multi-line). The frontend uses the same
    pattern in a small pure module, `sourcePages.ts`.
*   **Parse rule.** A marker starts a new page only if its number is greater
    than the previous marker's number. A marker-shaped line with a lower or
    equal number is kept as page text. A marker-shaped line with a higher
    number cannot be told apart from a real boundary: this is a known
    limitation, shown to the student only through the wrong page count, and
    recorded in Risks.
*   **What a "page" is depends on the source.** Only PDFs have real pages.
    For pasted text, text and markdown uploads, and URL pages, the server
    runs `parse_text_source`, which splits the text into virtual pages of 350
    words joined with single spaces, and processing overwrites `raw_content`
    with `--- Page N ---` blocks of those virtual pages. A re-parse of saved
    content goes through the same function. So markers are present for every
    processed source, and for a non-PDF source "page 3" means words 701 to
    1050, not a page a student could find in a document. The reader therefore:
    *   keys its wording off `source_type`: PDFs say "Page N of M"; every other
        type says "Section N of M" with the hint "about 350 words". The
        citation's number is the same; only the label changes. The same
        label is used for the live region, the region label and the previous
        and next buttons ("Previous section", "Next section").
    *   makes no claim that text without markers is one page. If a source has
        no markers at all (possible only for content saved but never
        processed), the parser returns no pages and the reader shows the
        "No text was stored" state rather than inventing page 1.
    *   shows a 350-word virtual page as a block with no paragraph structure,
        because the server has already joined its words with single spaces.
        It is set at the reading measure in a single continuous block with
        generous line height, and the display step does not try to split it
        into paragraphs. A page that was real (PDF) keeps its blank-line
        paragraphs.
*   **Request: leave out the chunks.** The reader calls
    `getSourceDetail(subjectId, sourceId, { includePassages: false })`, which
    sends `?include_passages=false`. On the server,
    `get_source_detail_endpoint` gains `include_passages: bool = True` and
    skips `get_source_passages` (and the extra database query) when it is
    false, returning `passages: []`. The default stays true, so the modal and
    every other caller are unchanged. The reader takes passage text from the
    message's saved `retrieved` entries (section 3), not from `passages`.
    An older backend that does not know the parameter ignores it and returns
    the full response; the reader still works, only heavier, so deploy order
    does not matter. The reader tolerates `passages` being missing or empty.
*   **Caching.** Parsed pages are cached in memory per `sourceId:version`,
    keeping the three most recently used sources. The cache key uses the
    version returned by the detail response, so a replaced source never serves
    old pages. A request counter (the same pattern as the passage guard)
    discards a response that arrives after the student has moved on.
*   **No chunk fallback.** Chunks are not used to rebuild text. If `raw_content`
    is empty the reader reports it (CUJ 4).
*   **Display only.** For PDF pages, single line breaks inside a paragraph are
    shown as spaces and blank lines separate paragraphs. For virtual pages
    there are no line breaks to rebuild, so the text is shown as one block (see
    above). This changes how the text is laid out on screen and never the
    stored text or what is highlighted.

### 3. Marking the retrieved passage

Citations identify a page, not a sentence. The reader marks a whole retrieved
passage only when it can find that passage's exact text on the page.

1.  Take the retrieved chunk text for the same message, source and page from the
    message's `retrieved` entries (the full chunk text). If the message did not
    keep it, take `citation.excerpt` instead and label the mark "Excerpt saved
    with the answer", because the excerpt is only the first 250 characters.
2.  Collapse whitespace to single spaces in both the page text and the passage
    text (the chunker does the same when it builds chunks, with Python's
    `str.split()`). The browser's `\s` is not the same set, so the reader
    uses its own exact class, `SERVER_WHITESPACE`. Checked across all code
    points (Nov 9, 2026): Python treats U+001C to U+001F and U+0085 as
    whitespace and JavaScript does not; JavaScript treats U+FEFF as whitespace
    and Python does not. The class is therefore
    `[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+`
    (29 characters), with U+FEFF left as an ordinary character, exactly as on
    the server. Without this a passage containing one of those characters
    would show "could not be located" though it is on the page. Find the
    passage in the page text, find the passage in
    the page text, and map the match back to the original text positions.
3.  If several retrieved chunks sit on the page, mark each one found.
4.  If nothing is found, show no mark and say "The retrieved passage could not
    be located on this page." The reader never marks the nearest or a guessed
    span.
5.  The mark is a visual highlight plus visually hidden "start of retrieved
    passage" and "end of retrieved passage" text for screen readers. It spans
    whole passages up to about 400 words, never a sentence.
6.  Marking is only done for a current source at the cited version. It is never
    done for current text standing in for a replaced source.

### 4. State model

New state lives in `SubjectWorkspaceView`, with the logic split into a pure
module and one component so the 1,950-line file does not grow much. This split
is a mechanical choice.

```text
contextView          'sources' | 'notes' | 'retrieval' | 'reader'     (adds 'reader')
reader               { sourceId, page, mode: 'cited' | 'current',
                       cite: { messageId, citationIndex, version } | null,
                       previousView, panelWasCollapsed }   (captured when the reader opens)
readerExpanded       boolean
returnTarget         { opener, messageId, anchorTurnId, anchorOffset,
                       scrollTop, userScrolled }   (captured at expand, cleared at collapse)
navHiddenByReader    derived, not stored
```

*   **`mode`.** `cited` shows the cited version's text with the passage mark
    and exists only when the cited version equals the source's current version.
    `current` shows current text with no mark and is used only through the
    separate "Open current version" action for a replaced source.
*   **Pointer rule.** An evidence block is replaced by the pointer only when
    `readerExpanded`, `mode` is `cited`, and the reader's source id, version and
    page equal that block's citation. Otherwise the block shows its passage.
*   **Navigation without writing state.** The wide layout hides the nav when
    `readerExpanded` and the conversation would fall below 560px. That is a
    derived value. The stored preference is not changed, so "restore the
    previous navigation state" needs no restore step. If the student turns the
    nav on while it is hidden by the reader, the reader collapses first.
*   **Panel preference is never written by the reader.** The panel's saved
    open or closed preference (the existing `writePanelPref`) is a student's
    choice about the Sources panel. Opening the reader calls
    `setContextCollapsed(false, remember = false)`, and closing it calls
    `setContextCollapsed(panelWasCollapsed, remember = false)`, so a reload
    or a later session starts as the student left it.
*   **Closing the reader** means the header Back control, the panel's close
    control, or Escape on a compact reader in an overlay. It switches
    `contextView` back to `previousView` and restores `panelWasCollapsed`. Collapsing
    an expanded reader (Collapse, Escape, or the pointer) goes back to the
    compact reader only; the panel stays open.
*   **Switching views.** Opening Notes or Retrieval from the nav or an action
    collapses the reader and switches `contextView`. Leaving the reader view
    also clears `readerExpanded`.
*   **Lifetime.** The reader closes (collapses and clears) when the
    conversation changes. If its source is deleted while it is open, the reader
    stays open and shows "This source was removed" with a Back control. If its
    source is replaced while it is open, the reader reloads the current
    version, switches to `current` mode, and shows "This source was replaced
    (now vN)".

### 5. Entry points

The reader opens only from citations, always through one handler that
receives `{ messageId, citation }`:

*   An "Open source" button added to the evidence block's footer (for a current
    source), or "Open current version (vN)" for a replaced one. Deleted sources
    get neither.
*   The selected-source card shown for a citation that has no answer on screen
    (a note's citation chip, or a passage chosen in the Retrieval view) gets the
    same two actions. The card's existing "View full source" button still opens
    the modal.
*   If the panel is collapsed when the student chooses one of these actions
    (docked at 1181px and wider, or the usual collapsed state of an overlay),
    the action opens it: docked, the panel slot widens and the reader appears
    in the compact state; in an overlay, the overlay opens with focus per
    section 8. The student's saved panel preference is not changed, and closing
    the reader collapses the panel again (section 4). If the panel was already
    open on Sources, Notes or Retrieval, closing the reader returns to that
    view.
*   Evidence is never closed by opening the reader. It stays open and shows the
    pointer only while the pointer rule holds.

### 6. Responsive layout

The reader is the panel in another state, so the panel's existing slots and
width transition do the work. Widths below are computed from the CSS
constants, with reader width `R = clamp(480px, 40vw, 600px)`, body padding
12px, panel slot `R + 32px`, and the nav slot 252px when open. They are
estimates to confirm by measurement.

| Viewport | Layout | Conversation width (nav hidden / nav open) |
| --- | --- | --- |
| 1600px | Docked | 956px / 704px |
| 1440px | Docked | 820px / 568px |
| 1280px | Docked, nav hidden | 724px / 472px (below 560, so nav hides) |
| 1181px | Docked, nav hidden | 657px / 405px (below 560, so nav hides) |
| 961 to 1180px | Overlay with scrim, width `min(R, 100% - 24px)` | Conversation inert behind it |
| 960px and below | Full-screen, "Back to answer" | Not shown while reading |

*   **Height.** Today the panel is content-height (`height: auto`, with only
    the tab content scrolling), which is right for a list. A reader is
    different: Previous and Next would change the card's height on every page,
    and a short page would leave an unfinished-looking short card. While the
    reader is shown (`data-reader` set, compact or expanded), the panel instead
    fills its slot: docked, `height: 100%` of the slot; overlay,
    `height: calc(100% - var(--space-6))`; full-screen, `100dvh`. The header
    and the page controls are fixed; the page text is the one scroller
    (existing `sidebar-tab-content`, `flex: 1 1 auto`, `overflow-y: auto`,
    `overscroll-behavior: contain`). Moving to another page resets the body to
    the top, except the first open, which scrolls to the passage mark. When
    the reader closes the panel goes back to content height, which is why the
    height is tied to the `data-reader` attribute and not to a new panel
    class.
*   The nav stays open while the reader is expanded only where the conversation
    is still at least 560px, which is about 1,427px and wider.
*   In the compact state the reader sits in the 300 to 320px panel, where a
    line holds about 35 characters. Reading is possible there but cramped,
    which is why the expanded state exists.
*   In the expanded state the page text is capped at about 64 characters per
    line (`max-width` in `ch`), so a wide reader does not produce overlong
    lines. With 28px side padding the text area is `R - 56px`, which is about
    424px (roughly 52 characters, estimated at 8px per character) at the
    narrowest dock and reaches the 64-character cap from about 1,250px up. The
    Goal's "roughly 60 to 70" is therefore met only on wider screens; whether
    the minimum `R` should be larger is an open question.

### 7. Screens and states of the reader

Header: back control, source title (wraps; long titles never truncate to a
single line), version, "Page N of M" (PDF) or "Section N of M" (other types,
with "about 350 words" as secondary text), and the Expand or Collapse button. Body:
page text, previous and next page buttons, and a page indicator.

| State | What the student sees |
| --- | --- |
| Loading | Header shown at once from the known source and page; skeleton body; `role="status"` "Loading source". |
| Loaded, cited, passage found | Page text with the passage mark; the body scrolls to the mark on open only (never again). |
| Loaded, cited, passage not found | Page text, no mark, plus the sentence in section 3. |
| Loaded, `current` mode | Banner "Current version (vN), not what the answer used"; no mark. |
| Page has no text | "No text was stored for page N" with Previous and Next still available (PDF only; a virtual section is never empty). |
| Non-PDF source (pasted, text upload, URL) | Label "Section N of M", hint "about 350 words", text as one continuous block, passage mark as usual. |
| `raw_content` empty | "No text was stored for this source" with "View as plain text". |
| Request failed | Error message, Retry, and "View as plain text". |
| Source deleted while open | "This source was removed"; Back only. |
| Source replaced while open | Reload, then `current` mode with the replaced banner. |

### 8. Focus, scroll, screen reader, reduced motion

*   **Focus on open.** The reader's heading (tabIndex -1) receives focus when
    the reader opens from the keyboard (`:focus-visible`). Opened by pointer,
    focus stays where the pointer left it.
*   **Docked is non-modal.** At 1181px and wider nothing is made inert and
    focus is not trapped. Tab order is: conversation, then the panel.
*   **Overlays are modal.** At 1180px and below the existing `useModalFocus`
    traps Tab and makes the conversation inert.
*   **Escape: who handles it.** Today `useModalFocus` listens on `window` in the
    capture phase, so for an open overlay it runs before the workspace's
    bubble-phase Escape handler and calls its `onClose` directly. Today that
    `onClose` is `closeContextPanel`, which collapses the panel and moves focus
    to the toolbar's Sources toggle; `useModalFocus` then skips its own opener
    restore because focus was already moved. Editing the bubble handler alone
    therefore has no effect in overlay and phone modes. The design changes the
    `onClose` passed to `useModalFocus` for the panel instead: it becomes
    `handlePanelEscape`, which runs this order and stops at the first match:
    1.  Expanded reader: collapse to the compact reader (focus per the table
        below). The overlay stays open and the dialog stack is untouched.
    2.  Compact reader or any other panel view in an overlay: close the panel
        (focus per the table below).
    3.  Docked (1181px and wider) at any level: the panel is non-modal, so
        `useModalFocus` is not active and Escape collapses an expanded reader
        only, through the workspace handler (same step 1). A docked compact
        reader ignores Escape.
    The workspace handler's `contextOverlayOpen` branch calls the same
    `handlePanelEscape`, so there is one implementation of the steps.
*   **Where focus goes on every close path.** `closeContextPanel` is split into
    `collapseReader()` and `closePanel()`; each takes the focus target
    explicitly, and the generic "focus the toolbar toggle" is used only as the
    last fallback.

    | Path | Focus goes to | If that is gone |
    | --- | --- | --- |
    | Expanded reader: Collapse button, Escape, or the pointer | The Expand button | CUJ 5 order |
    | Compact reader in overlay: Escape or the panel's close control | The control that opened the reader (evidence Open-source button, or a note's citation chip), captured at open | CUJ 5 order, ending at the toolbar's Sources toggle |
    | Full-screen at 960px and below: "Back to answer" | The same opener as the row above | CUJ 5 order |
    | Close from the toolbar's Sources toggle | The toolbar toggle (unchanged) | n/a |

    The opener is captured when the reader opens and kept in `returnTarget`;
    `useModalFocus`'s own opener capture is not relied on, because the panel can
    already be open as an overlay when the reader opens from a citation.
*   **Expand and collapse.** The button has `aria-expanded` and `aria-controls`
    pointing at the reader region. After collapse, focus goes to the Expand
    button; if it does not exist, the fallback order in CUJ 5 applies.
*   **Scroll restoration.** At expand, record the scroll position and an
    anchor: the first fully visible conversation turn and its offset from the
    top of the scroller. The conversation reflows when its width changes, so a
    stored pixel offset alone is not reliable. On collapse, if the student has
    not scrolled the conversation meanwhile, restore using the anchor if that
    turn still exists, otherwise the stored pixel offset if it is still in
    range, otherwise leave the scroll alone. If the student did scroll, leave
    it alone. The reader never scrolls the conversation on open.
*   **When restoration runs.** The panel slot animates its width for about
    250ms (`--motion-panel-resize`) while the conversation rewraps, and the
    browser can move `scrollTop` on its own through scroll anchoring. So on
    collapse:
    1.  Set `overflow-anchor: none` on the conversation scroller and start the
        collapse.
    2.  Wait for the slot's `transitionend` for `width` (with a timer of the
        transition duration plus 50ms as a fallback, because the event does
        not fire if the width does not change, for example in an overlay).
        Under reduced motion, or when no width change is expected (overlay,
        full-screen), run step 3 on the next animation frame instead.
    3.  Restore with the anchor, then the pixel offset, as above, set
        `overflow-anchor` back to `auto`, and then move focus per the table
        above. Focus is moved after the scroll so the focused control is not
        scrolled into view over the restored position (`focus({ preventScroll: true })`).
    On expand the scroller keeps `overflow-anchor: auto`, so the browser keeps
    the student's place while the conversation narrows, and the recorded
    anchor is only used on return.
*   **Detecting that the student scrolled.** Scroll events cannot be used for
    this, because the conversation rewrapping fires them too. `userScrolled`
    is set by `wheel`, `touchmove`, `keydown` for scroll keys (arrows, Page Up
    and Down, Home, End, Space) while focus is in the conversation, and
    `pointerdown` on the scroller's scrollbar, all listened to on the
    conversation scroller only while the reader is expanded.
*   **Reduced motion.** Under `prefers-reduced-motion: reduce` the panel's
    width change, the overlay slide and any fade complete in one frame, and
    scrolling to the mark uses instant scrolling.
*   **Announcements.** A polite live region says "Reader expanded", "Returned
    to the answer", "Page N of M" and "Source removed".
*   **Region.** The reader is labelled "Source reader: {title}, page N of M".
    Previous and next page buttons are real buttons named "Previous page" and
    "Next page", disabled at the ends.

### 9. Integration points for later phases (not built here)

*   **Quick note.** A reserved, empty footer slot at the bottom of the reader
    body. A later phase adds a drawer there that saves a note through the
    existing `onCreateNote` with a `{ file, page, source_id, source_version }`
    citation, which the current API already accepts. Nothing in this design
    reads or writes notes.
*   **Note editor in the middle area.** Opening it already collapses the
    reader (section 4). That rule stays when the editor moves.

### Data flow

```text
citation click -> evidence block (existing)
                     |
        "Open source" / "Open current version"
                     v
        handler: sets reader {sourceId, page, mode, cite}
                     v
    useSourceText(subjectId, sourceId) -> cache hit? -> pages
                     |   miss: api.getSourceDetail -> raw_content
                     |         -> sourcePages.parse -> cache (3 sources)
                     v
        SourceReader renders page N
                     |   cited mode: find retrieved text on the page
                     |               (message.retrieved, else excerpt)
                     v
        Expand -> readerExpanded = true, returnTarget captured
                     |   wide: panel slot widens, nav derived-hidden if < 560px
                     v
        pointer rule -> evidence block shows "Shown in the reader"
                     v
        Collapse | Escape | pointer -> readerExpanded = false,
                                       focus + scroll restored per section 8
```

## Alternatives Considered

Rejections marked "Rejected by author" were decided by the author at a design
gate. Rejections marked "Not chosen in drafting" were mechanical choices made
while writing the plan, with the reasoning given so they can be challenged.

### Alternative A: A separate reader card beside the compact panel

*   **Mechanism**: Wide layout becomes conversation, reader card, compact
    panel. The compact panel stays visible and unchanged while reading.
*   **Pros**: Keeps materials, the selected-source card and the Notes and
    Retrieval tabs reachable while reading. Matches the original wording "keep
    the right panel in its compact state".
*   **Cons**: Needs about 1,376px (440px reader) to 1,416px (480px reader) to
    dock with a 560px conversation, so it would be an overlay on common laptop
    widths (1,280 to 1,366px). A third column means a new slot, new width
    transitions, and a second place focus can land.
*   **Reason for Rejection**: Rejected by author: the panel itself widening
    docks from 1,181px and reuses the existing slot, accepting that the compact
    panel's content is hidden while the reader is expanded.

### Alternative B: A floating overlay at every width

*   **Mechanism**: The reader is a floating card over the right side of the
    conversation at all viewport widths, with a scrim only below 1,181px.
*   **Pros**: No layout change at any width and the least new layout code.
*   **Cons**: It covers part of the conversation on wide screens, so the answer
    and the source cannot be read side by side, which defeats the purpose of
    expanding.
*   **Reason for Rejection**: Rejected by author: reading beside the answer on
    wide screens is a goal.

### Alternative C: Rebuild pages from the chunk passages

*   **Mechanism**: Use the `passages` array returned with the source detail,
    group by page, and drop the first 50 words of each chunk after the first.
*   **Pros**: No backend change. Works when `raw_content` is empty. Each chunk is
    tagged with its page by the server, so no marker parsing is involved.
*   **Cons**: The chunker joins all words with single spaces, so paragraph
    breaks and line structure are lost. The 50-word trim depends on ingestion
    settings (`chunk_size` 300, `overlap` 50) staying the same, and nothing in
    the API reports them. A future change would silently duplicate or drop
    text.
*   **Reason for Rejection**: Rejected by author: parsing `raw_content` keeps
    the original page structure and does not depend on chunker parameters.

### Alternative D: A new per-page backend endpoint

*   **Mechanism**: Add something like `GET /subjects/{id}/sources/{id}/pages/{n}`
    that parses `raw_content` on the server and returns one page.
*   **Pros**: Small responses for very large sources. One parser, so the
    marker-collision rule lives in one place and cannot drift from the
    ingestion format. Page 7 can be loaded without loading page 700.
*   **Cons**: A backend change that has to be deployed before or with the
    frontend, and tested against a real backend, which is not available in the
    current test setup. A lagging backend deploy breaks the reader.
*   **Reason for Rejection**: Rejected by author for now: parse `raw_content` in
    the frontend, with the chunk list left out (`include_passages=false`),
    which removes most of the size cost without a second endpoint. Revisit
    only if a real large source is still slow with that change (see Risks).

### Alternative E: Retire the modal, or keep it only as a fallback

*   **Mechanism**: Send every entry point (source row "View", "View full
    source") to the reader, either deleting the modal later or keeping it only
    for sources the reader cannot load.
*   **Pros**: One reader in normal use. The fallback variant covers a source
    the parser cannot handle.
*   **Cons**: Changes behavior for rows and the card on phones (a panel view
    replaces a dialog). The retire-later variant leaves no viewer if the reader
    fails. The fallback variant keeps two code paths to maintain.
*   **Reason for Rejection**: Rejected by author: the modal stays for source
    rows and the card's "View full source"; the reader opens only from
    citations. The cost is that two viewers exist and a student cannot browse a
    source's pages in the reader without a citation.

### Alternative F: Add an "Open in reader" action to source rows

*   **Mechanism**: Keep the modal's "View" and add a second row action that
    opens the reader at the first page with text.
*   **Pros**: Lets a student browse a source in the reader without a citation.
*   **Cons**: Two similar row actions open two different viewers.
*   **Reason for Rejection**: Rejected by author: the reader opens only from
    citations, and the Goals were changed to say so.

### Alternative G: Mark the retrieved span at sentence level

*   **Mechanism**: Within a retrieved passage, find the sentence that best
    matches the answer's claim (by overlap or similarity) and mark only that.
*   **Pros**: A tighter visual link between claim and evidence.
*   **Cons**: The data has no sentence coordinates. Any sentence choice would be
    a guess presented as evidence, and a wrong guess misleads a student about
    what supports the answer.
*   **Reason for Rejection**: Not chosen in drafting, and excluded by the data
    limits in the brief: the reader marks whole passages only, and only when the
    exact text is found.

### Alternative H: Store and restore the navigation state explicitly

*   **Mechanism**: On expand, save the nav's open or closed value and close the
    nav. On collapse, write the saved value back.
*   **Pros**: Easy to follow in code.
*   **Cons**: It mutates the saved preference. A reload, a second tab, a crash
    or an Escape path that skips the restore step leaves the nav closed with the
    preference overwritten.
*   **Reason for Rejection**: Not chosen in drafting: hiding the nav is derived
    from "reader expanded and not enough room", so the stored preference is
    never touched and there is nothing to restore.

### Alternative I: Restore scroll by pixel offset only

*   **Mechanism**: Save `scrollTop` at expand and set it back at collapse.
*   **Pros**: Simplest possible implementation.
*   **Cons**: The conversation's width changes while the reader is expanded, so
    lines rewrap and content heights change. The same pixel offset then points
    at different content.
*   **Reason for Rejection**: Not chosen in drafting: use an anchor (the first
    fully visible turn and its offset), with the pixel offset only as a
    fallback, and skip restoration if the student scrolled in the meantime.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Privacy.** `raw_content` is the full text of the student's source. It is
    held in memory only: never written to `localStorage`, `sessionStorage` or
    logs, never sent anywhere except the existing authenticated request. The
    cache is cleared when the notebook changes or the user signs out.
*   **Performance.** One request per source open (none on a cache hit). Parsing
    is a single pass over the string. Only the current page is rendered. Worst
    case is a source near the 50 MB upload limit; the extracted text of such a
    source is not measured (see Risks).
*   **Rollout and rollback.** Frontend only, on branch
    `redesign/three-area-shell`, verified on the Vercel preview. No migration,
    no flag. Rollback is reverting the commit; entry points exist only in the
    evidence block and the selected-source card, so removing them removes the
    feature.
*   **Compatibility.** `SourceViewerModal` and every existing API call are
    unchanged. The one API change is additive: an optional query parameter
    whose default keeps today's response.

## Risks and Unresolved Decisions

| Risk or decision | Why it matters | Current handling |
| --- | --- | --- |
| Very large `raw_content` | **Measured** (Nov 9, 2026) on 15 real PDFs in `data/` through the repo's own parser and chunker, building the same JSON the detail endpoint returns: the response is 3.2 to 3.6 times the page text (average 3.4), because each chunk is sent twice (`text` and `chunk_text`) and chunks overlap by 50 words. A 33-page article is 99 KB of text and a 345 KB response; the reader never uses the `passages` array (it takes passage text from the saved message). Projected: a 800-page textbook (about 2.5 MB of text) is about 9 MB; a 10 MB text upload (the text limit) is about 35 MB. The API has no gzip middleware; gzip alone cuts the sample response to 22% (342 KB to 76 KB), and gzip of the page text alone is 11% of the current response. Not measured: a real near-50 MB PDF, and the production host's own compression. | Decided (author, Nov 9, 2026): the reader requests the detail without `passages` (`include_passages=false`, section 2), about 1 times the page text. Remaining risk: a 10 MB text upload is still about 10 MB of JSON (about 3.5 MB if the host compresses), and a near-50 MB PDF is unmeasured; loading state and the 3-source cache cap stay. Revisit Alternative D if that is still slow. |
| Marker collision | A page containing a higher-numbered `--- Page N ---` line splits wrongly. | Increasing-number rule removes most cases; the rest is accepted and covered by a test that documents the behavior. Frequency unknown. |
| Real `raw_content` shape | Verified by reading the server code, not against stored data: blank pages, page numbering, text type. | NOT TESTED against a real backend (see Verification Plan). |
| Minimum reader width | 480px gives about 52 characters per line at 1,181px; 560px gives about 60 but leaves 577px of conversation. | Open; default 480px until you decide. |
| Nav-room breakpoint (about 1,427px) | It is a number derived from CSS constants. If those constants change, the query must change. | One named constant with a comment, a browser check at 1,426px and 1,428px, and a unit test (`ReaderLayoutConstants.test.ts`) that reads `workspace-layout.css` as text, pulls the nav slot width, the reader width clamp, the panel slot extras and the body padding, recomputes the threshold for a 560px conversation, and fails if it differs from `READER_NAV_ROOM_MIN_WIDTH`. It also fails if any of those declarations can no longer be found, so a renamed token cannot pass silently. |
| Layout, focus and scroll tests (M5) | Width thresholds, scroll anchoring and overlay focus cannot be observed in jsdom. The repository has no browser test runner and adding one is a separate dependency decision. | Decided (Nov 9, 2026): these are a manual gate before merge, not committed tests. The Verification Plan's browser checks are the checklist, run against the dev server with the mock API. The jsdom tests cover everything that can be (state, focus order, Escape, the pointer rule, the CSS derivation test below). Revisit by adding Playwright to the repository if the gate is skipped or regressions slip through. |
| Reflow rule | Showing single line breaks as spaces helps narrow reading but can mangle tables and poems. | Display-only; open whether to offer "show original line breaks". |
| Notes and Retrieval while expanded | Opening them collapses the reader, which could surprise a student mid-read. | Defined in section 4; revisit after the quick-note phase. |
| Two viewers | The modal and the reader coexist. | Author decision; documented in Alternatives. |

## Detailed Implementation Plan

Work happens on `redesign/three-area-shell`. Nothing below is written yet.

### Target Files to Create/Modify

#### 1. `frontend/src/sourcePages.ts` (Create)

*   **Type / Scope**: Pure TypeScript module, no React.
*   **Proposed Changes**:
    *   `parseSourcePages(rawContent)` returns `{ pages: Map<number, string>, order: number[] }`. It splits on the server's marker pattern and applies the increasing-number rule. Text with no markers returns no pages (the reader then shows "No text was stored"); it never invents page 1. Empty or whitespace-only input returns no pages.
    *   `pageLabel(sourceType)` returns `{ unit: 'Page' | 'Section', hint?: string }`; PDFs get `Page`, every other type gets `Section` with "about 350 words".
    *   `SERVER_WHITESPACE` (exported): the exact class from section 3, used by `locatePassages` and nowhere else; never the JavaScript `\s`.
    *   `locatePassages(pageText, passages)` takes the page text and a list of `{ text, kind: 'passage' | 'excerpt' }`, collapses whitespace in both, finds each exactly, and returns non-overlapping `{ start, end, kind }` ranges in the original text's coordinates (using an index map built while collapsing). Not found means no range. It never searches approximately.
    *   `toParagraphs(pageText, sourceType)` returns paragraphs split on blank lines with single newlines replaced by a space one-for-one, so offsets stay valid, for PDFs. For other source types it returns the text as one block.
    *   A small in-memory cache keyed `sourceId:version`, keeping the three most recently used, with `getCachedPages`, `setCachedPages` and `clearSourceTextCache`.

#### 2. `frontend/src/useSourceText.ts` (Create)

*   **Type / Scope**: React hook.
*   **Proposed Changes**: `useSourceText(subjectId, sourceId, enabled)` returns `{ status: 'idle' | 'loading' | 'ready' | 'empty' | 'error', pages, order, version, retry }`. It calls `api.getSourceDetail`, parses `raw_content`, caches by `sourceId:version` using the response's `version`, and uses a request counter so a late response for a previous source or page is dropped. `empty` means `raw_content` is missing or has no text. Clears nothing itself; the cache is cleared by the workspace on notebook change.

#### 3. `frontend/src/components/SourceReader.tsx` (Create)

*   **Type / Scope**: React component rendered inside the floating panel.
*   **Proposed Changes**:
    *   Props: the source (title, file name, current version, page count), the reader state (`page`, `mode`, `cite`), the retrieved passages for the cited message and page, `expanded`, and callbacks `onBack`, `onPageChange`, `onToggleExpand`, `onViewPlainText`.
    *   Renders the header, the states table in section 7 of the Technical Plan, the page text as paragraphs with passage marks (visually hidden start and end text for screen readers), and previous and next page buttons.
    *   Renders `role="region"` with the label "Source reader: {title}, page N of M".
    *   Scrolls the body to the first mark once on open (instant when reduced motion is requested) and never again.
    *   Exposes a reserved, empty footer container with a stable class for the later quick-note phase.
    *   The Expand button carries `aria-expanded` and `aria-controls`.

#### 4. `frontend/src/components/EvidenceBody.tsx` (Modify)

*   **Type / Scope**: Existing component.
*   **Proposed Changes**: `InlineEvidence` gains props for the action row ("Open source" or "Open current version (vN)" or none) and for the pointer state. When the pointer rule holds it renders the one-line pointer and a "Return to answer" button instead of the passage. Otherwise the passage renders as today. The historical wording changes to "Historical snapshot, may be truncated". No change to how excerpts and retrieved text are chosen.

#### 5. `frontend/src/components/SubjectWorkspaceView.tsx` (Modify)

*   **Type / Scope**: Existing 1,950-line component. Changes are limited to wiring.
*   **Proposed Changes**:
    *   Add `reader`, `readerExpanded` and `returnTarget` state; add `'reader'` to `contextView`.
    *   One handler, `openReader({ messageId, citation, intent })`, used by the evidence block and the selected-source card. `intent` is `cited` or `current`.
    *   Derive `navHiddenByReader` from `readerExpanded`, the room query, and the docked layout; combine with `isNavCollapsed` for the nav's visibility, inert state and data attribute. The nav toggle collapses the reader first when it is the cause of the hidden nav.
    *   Replace `closeContextPanel` with `collapseReader()` and `closePanel(focusTarget)`, and pass one `handlePanelEscape` (section 8) as the `onClose` of the panel's `useModalFocus`. The global Escape handler keeps its order (popovers, modals) and its `contextOverlayOpen` branch calls `handlePanelEscape`; a docked expanded reader is collapsed there. Every call site of `closeContextPanel` (the scrim click, the panel's close control, the toolbar toggle) is updated to pass its focus target.
    *   Close and clear the reader when the active conversation changes, show the removed and replaced states when the source list changes under it, and clear the source-text cache when the subject changes.
    *   Capture `returnTarget` on expand (opener, first fully visible turn id and offset, scroll position, and a flag set by input events: wheel, touchmove, scroll keys and scrollbar pointerdown, never by `scroll`); restore on collapse per section 8; add `data-turn-id` to turn elements for the anchor.
    *   Add a visually hidden polite live region for the announcements in section 8.
    *   Set a `data-reader` attribute on the layout root so the stylesheet can switch widths.
    *   The panel's `aria-label` becomes "Source reader" while the reader is shown; the Sources, Notes and Retrieval switcher is hidden while it is.

#### 6. `frontend/src/workspace-layout.css` (Modify)

*   **Type / Scope**: Layout stylesheet (geometry only, existing tokens).
*   **Proposed Changes**:
    *   `--reader-w: clamp(480px, 40vw, 600px)`.
    *   When `data-reader="expanded"` and docked, the panel slot width becomes `--reader-w + 12px + 20px`, using the existing width transition.
    *   At 1180px and below, the expanded panel is an overlay of width `min(--reader-w, 100% - 24px)`; at 960px and below it covers the whole layout with no radius and respects the safe-area insets and `dvh`.
    *   Reader typography: 16.5px text, 1.65 line height, `max-width: 64ch`, 28px side padding; marks use `--color-evidence` with a left accent bar; long titles use `overflow-wrap: anywhere`.
    *   While `data-reader` is set, the panel fills its slot (docked `height: 100%`; overlay `calc(100% - var(--space-6))`; full-screen `100dvh`) and only its body scrolls; other views keep content height.
    *   The conversation scroller gets `overflow-anchor: none` through a class the workspace adds only during the collapse transition (section 8).
    *   The reserved footer container has no height when empty.
    *   Reduced motion: no width, slide or fade transition for the reader.

#### 7. `frontend/src/viewport.ts` (Modify)

*   **Type / Scope**: Existing hook file.
*   **Proposed Changes**: None to the hooks. Export one named constant, `READER_NAV_ROOM_MIN_WIDTH = 1427`, with a comment tying it to the CSS values, used with `useMediaQuery` (and a `window.innerWidth` fallback for jsdom).

#### 8. `frontend/src/components/SourceRow.tsx`, `SourceViewerModal.tsx` (No change)

*   **Type / Scope**: Listed so the decision is explicit.
*   **Proposed Changes**: None. The source-row "View" and the modal remain exactly as they are.

#### 9. `frontend/src/api.ts`, `frontend/src/types.ts` (Modify)

*   **Type / Scope**: One optional argument; no new types.
*   **Proposed Changes**: `getSourceDetail(subjectId, sourceId, options?: { includePassages?: boolean })` appends `?include_passages=false` only when `includePassages === false`; with no options the request is exactly as today. `Source.passages` is already optional in use; the reader does not read it.

#### 9b. `api/main.py` (Modify)

*   **Type / Scope**: `get_source_detail_endpoint`, a few lines.
*   **Proposed Changes**: Add `include_passages: bool = True` as a query parameter. When false, skip `get_source_passages` and return `passages: []`. No change to other routes, the schema or ingestion.
*   **Tests**: A backend test that the default response still includes `passages`, that `include_passages=false` returns an empty list and still returns `raw_content`, and that the source stays scoped to the signed-in user and subject in both cases. A frontend test that the reader's request carries the parameter and the modal's does not.

#### 10. `frontend/src/SourcePages.test.ts` (Create)

*   **Type / Scope**: Unit test for the pure module.
*   **Proposed Changes**: Whitespace class: a fixture of the 29 code points Python's `str.split()` splits on (listed in the test, generated once with `chr(c).split() == []` over all code points) must each match `SERVER_WHITESPACE`; nothing else may match it, including U+FEFF; a passage containing U+001F, U+0085 and U+FEFF is located correctly. Parsing with markers, without markers (returns no pages, not page 1), empty input, a 350-word virtual page from a non-PDF source (one block, labelled Section), the label for each source type, repeated and lower-numbered marker lines kept as text, a higher-numbered marker line (documents the known limitation), CRLF line endings, and cache eviction at three sources. Passage location: exact match, whitespace differences, two chunks on one page, not found returns nothing, and the excerpt path. Offsets map back to the original text.

#### 11. `frontend/src/SourceReader.test.tsx` (Create)

*   **Type / Scope**: Component test with mocked `api.getSourceDetail`.
*   **Proposed Changes**: Every row of the states table; page navigation and disabled ends; heading and region names; mark boundaries present for screen readers; scroll-to-mark happens once; "View as plain text" opens the modal; request counter drops a stale response; a replaced version changes the cache key.

#### 12. `frontend/src/ReaderFlow.test.tsx` (Create)

*   **Type / Scope**: Integration test through `SubjectWorkspaceView` with mocked API.
*   **Proposed Changes**: Entry from the evidence block and from a note's citation chip; the pointer rule (same source, version and page shows it; different page, version or non-expanded does not); replaced source offers only "Open current version" and the historical evidence makes no `getSourceDetail` call; deleted source offers nothing; collapse by button, Escape and pointer; navigation derived-hidden without changing `localStorage`; toggling the nav while hidden collapses the reader; opening with the panel collapsed (it opens, the saved panel preference in `localStorage` is not written, and closing the reader collapses it again; with the panel open on Notes, closing returns to Notes); scroll restoration waits for the width `transitionend` (fire it by hand in the test) and falls back to the timer, runs on the next frame under reduced motion, and `userScrolled` is set by wheel and scroll keys but not by a `scroll` event; overlay behavior at 1024 (focus trap, inert conversation); Escape in overlay mode fired at `window` with the reader expanded (collapses, overlay stays open, focus on Expand), then with the compact reader (closes, focus on the opener), then with the opener removed (fallback order); the same sequence at 390 full-screen; Escape docked with an expanded reader (collapses) and with a compact reader (ignored); full-screen attributes at 390; conversation switch closes the reader; focus fallback order; scroll restore with mocked layout, including the "student scrolled meanwhile" and "anchor gone" cases; source replaced or deleted while open.

#### 12b. `frontend/src/ReaderLayoutConstants.test.ts` (Create)

*   **Type / Scope**: Node-side unit test (`fs` reads the CSS file; no DOM).
*   **Proposed Changes**: Recompute the nav-room breakpoint from `workspace-layout.css` and compare it with `READER_NAV_ROOM_MIN_WIDTH` (1,427 today); fail with a message naming the constant to update. Fail if a needed declaration is missing.

#### 13. `frontend/src/EvidencePanel.test.tsx`, `EvidenceStale.test.tsx`, `WorkspaceLayout.test.tsx` (Modify)

*   **Type / Scope**: Existing tests.
*   **Proposed Changes**: Update assertions that count buttons in the evidence block or depend on the "Historical Verified Excerpt" wording; add that the existing "View full source" still opens the modal. No existing behavior assertion is removed.

#### 14. `design_draft.md` becomes `docs/designs/source-reader.md` (Create, at finalization)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: The repository has no `docs/designs/` folder or `SITEMAP.md`. At finalization the folder is created (or another path is chosen) and this document is saved there.

### Verification Plan

*   **Compilation/Build**: `npm run build` in `frontend/` (runs `tsc` then `vite build`).
*   **Unit and component tests**: `npm test` in `frontend/` (Vitest with jsdom). All existing tests must still pass; the new files in items 10 to 12 must pass. No ESLint configuration exists in the repository, so there is no lint step.
*   **Browser checks** (Playwright against the dev server and a mock API, scripts kept outside the repository). The mock extends the existing one: a source-detail route returning `raw_content` with markers; a source with empty content; a source with a marker-shaped line in a page; a slow response; a failing response; replace and delete operations that change versions.
*   **Screenshots**, light and dark, each for the compact reader and the expanded reader unless noted:

    | Width | Frames |
    | --- | --- |
    | 1440px | Docked, nav hidden; the same with nav open (room is 568px, so it must hide); evidence pointer visible; long title; long page; historical evidence with "Open current version"; error state |
    | 1024px | Overlay with scrim; focus ring visible inside; evidence behind it inert |
    | 390px | Compact sheet; full-screen reader with back control; keyboard-open state; error state |

*   **Browser assertions**: reader panel height equals its slot's height on page 1 and on a one-line page (no height change when paging), and returns to content height on Back; no horizontal overflow at each width; conversation at least 560px wherever the reader docks; nav hides exactly at the computed threshold (check 1,426px and 1,428px); conversation scroll content unchanged after a collapse; focus lands where section 8 says; reduced motion yields no width animation; no control under 44px on touch (inline markers excepted, as before).

#### Mocks versus the real backend

| Behavior | Mocks | Real backend |
| --- | --- | --- |
| Parsing, cache, passage location | Fully tested | Needs real `raw_content` samples to confirm marker format and blank-page behavior |
| Layout, focus, scroll, responsive | Fully tested | Not backend-dependent |
| Evidence, pointer rule, replaced and deleted flows | Tested with simulated versions | Needs a real replace and delete to confirm `source_version` and `retrieved` contents on stored messages |
| Authorization of the source-detail request | Cannot be tested | Needs a real session |
| Response size and latency for large sources | Cannot be tested | Passage-free response size confirmed by calculation on 15 real PDFs only; needs a large real PDF (up to 50 MB) and the production host |

Real-backend verification stays NOT TESTED until it is run. It needs a running
backend with its database and an embeddings or model key, which this
environment does not currently have.

--------------------------------------------------------------------------------

*Drafted with EGM*
