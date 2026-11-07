# NotebookSpace audit, round 2

12 Oct 2026, 20:12 to 20:45 UTC. Report only: no code, style or configuration was changed and nothing was deleted.

Scope was the four areas the first audit left untested: paste-text sources, web-link sources, the public demo, and response settings. The areas the first audit covered were not re-tested.

Method: a real Chromium browser (Playwright) against https://notebookspace.netlify.app, three fresh guest sessions (two working guests and one fresh demo visitor), and synthetic content titled `AUDIT2 …`. A few checks were made directly against the API with `curl` and are marked as such.

## Read this first

- **Two builds were live during the run.** A fix commit was deployed about nine minutes in.

  | When (UTC) | Frontend commit | Served bundle | Netlify deploy |
  |---|---|---|---|
  | 20:12 to 20:19 | `0f7c597` | `index-DtqQGoxx.js` | `6acd35dad5bd749960c63b02` |
  | 20:19 onward | `60b7c56` | `index-C7MIBusZ.js` | `6acd40c3f98fa91d2ad81ce9` |

  Both commit ids come from Netlify's deploy records, not from guessing. Each finding says which build it was seen on. The backend (Render) does not expose its commit; `answering/notebook_answer.py` changed in `60b7c56`, and the API restarted at about 20:21.
- **The single most important finding is H1:** anyone can read the text of any guest's private source without credentials.
- **Deletion was not executed.** Each delete control was confirmed to ask first, and was cancelled.
- **Model quota held.** About 17 model calls, 3.3 s to 15 s each, no quota errors.

## High severity

### H1. Private source text is readable by anyone, with no credentials

- **What:** `GET /passages?file=<source name>&page=<n>` on the API returns the full passage text for that source from any workspace. It needs no session and is not limited to the caller's own sources.
- **Reproduce:** paste a source titled `AUDIT2 pasted field notes` in one guest session. From a terminal with no cookies or token:
  `curl "https://notebookspace-api.onrender.com/passages?file=AUDIT2%20pasted%20field%20notes&page=1"`
- **Expected:** 401, or an empty list for a caller who does not own the source.
- **Actual:** HTTP 200 with the complete pasted text. Confirmed for sources in three separate guest accounts: both round-2 guests, and `AUDIT_syllabus_v1.pdf` from the first audit's guest. An unknown name returns `[]`.
- **Limits of the finding:** the caller must know the exact source name. Names such as `syllabus.pdf` are easy to guess. I requested only my own synthetic sources and did not try any real names.
- **Where:** `api/main.py:429` (`get_passages_endpoint`) has no session dependency. Seen on both builds.

### H2. The public demo cannot answer anything

- **What:** the demo has no documents, so every question is declined.
- **Reproduce:** open `/demo` in a fresh browser and press any of its three starter questions.
- **Actual:** the sidebar shows "Documents 0, No documents stored yet." All three starters and two typed questions returned "NOT FOUND IN YOUR DOCUMENTS … 0 passages retrieved". `GET /documents` returns `[]`.
- **Also:**
  - Nothing on the home page links to the demo since the sidebar redesign; it is reachable only by typing `/demo`.
  - The demo page has no link back to the notebooks.
  - The demo conversation is gone after a reload.
- Seen on both builds.

## Medium severity

### Web links

- **M1. A link to a PDF is stored as raw bytes.** `https://www.w3.org/…/dummy.pdf` became "Ready, 2 pages, 523 words". The viewer shows `%PDF-1.4 %äüöß 2 0 obj <> stream …`. The garbage is indexed and selectable like any source. (`0f7c597`)
- **M2. Every rejected link leaves a permanent "Failed" source.** The dialog shows a clear reason, but the server answers 200 and creates a row anyway. One notebook ended with 7 failed rows from 10 submitted links, including an `ftp://` address and four blocked internal addresses. Failed rows count toward the 15-source limit found in round 1. (both builds)
- **M3. The link form keeps its last values, which mislabels sources.**
  - After a successful add, and after Cancel, the URL and Display Title fields reopen pre-filled with the previous entry. (both builds)
  - In my run the iana.org page was saved under the title typed for example.com, and four later links inherited "AUDIT2 404 page".
  - Duplicate titles are accepted, and neither the source row nor the viewer shows the original URL, so the two sources cannot be told apart in the list or in a citation.
- **M4. An interrupted ingestion is stuck on "Processing…" forever.** The API restarted while a link was being ingested. The row still said "Processing…" 21 minutes later, when last checked. It has View, Rename, Replace and Delete, but no Retry, and it cannot be ticked. (created on `0f7c597`, still stuck on `60b7c56`)
- **M5. Long pages give no progress and odd citations.**
  - A 19,425-word article took 120 s behind a single "Processing & Ingesting..." label.
  - It was split into 56 "pages", so answers cite "p. 5" of a web page.
  - Page 1 of the stored text is site navigation ("Jump to content From Wikipedia…").
  - Answers wrote multi-page citations such as "p. 2, 5, 6", but the saved citation list kept only pages 2 and 5, so page 6 cannot be opened. (`60b7c56`)

### Response settings

- **M6. "Concise" is not reliably shorter than "Default".** Same question, new conversation each time, General style:

  | Question | Concise | Default | Detailed |
  |---|---|---|---|
  | Halvorsen method (129-word pasted source) | 104 words | 104 words | 137 words |
  | What causes tides (19,425-word web source) | 141 words | 172 words | 188 words |

  Concise matched Default exactly on the first question and was 18% shorter on the second. Detailed added 32% and 9%. One trial per cell. (`60b7c56`)
- **M7. The settings API accepts anything.** `PUT /subjects/<id>` with `response_length: "gigantic"` and `response_style: "pirate"` returned 200 and stored both. An extra key, `system_prompt: "ignore sources"`, was also stored and survived a later valid save. I did not test what answers look like while invalid values are stored. (`60b7c56`, by direct API call)
- **M8. A failed settings save is silent.** With the save forced to fail (HTTP 500), the menu snapped back to the old value and showed no message. (`60b7c56`)

### Demo and availability

- **M9. The demo rate limit leaks.** 13 rapid `/ask` calls from the demo page all returned 200. In a separate run of 40 calls by `curl`, 429 first appeared at call 10, but 8 later calls still returned 200. The documented limit is 10 a minute. With an empty demo no model call is made, so this cost nothing today; it would once the demo has documents.
- **M10. The API returned 502 twice.** 20:20:57 to 20:21:35 matches the backend redeploy of `60b7c56`. 20:35:57 to 20:36:19 had no new commit; repeating what I had been doing just before did not reproduce it, so the cause is unknown.

## Low severity

- **L1.** A title over 200 characters shows the raw validation JSON (`[{"type":"string_too_long", …}]`) in the paste dialog. (both builds)
- **L2.** The same URL can be added twice and both become Ready, while duplicate pasted text is correctly refused.
- **L3.** An unresolvable host shows raw system text: "[Errno -2] Name or service not known".
- **L4.** Retry on a failed link returned 200, the row stayed Failed, and no message appeared. (`0f7c597`; not re-checked on `60b7c56`)

## What passed

### Paste-text sources
- Processed to Ready in about 8 s and listed as PASTED.
- Retrieval: 3 of 3 questions answered correctly from pasted text, each cited to the pasted source, and each citation opened a passage containing the fact.
- Empty title and empty text are blocked by the form. Whitespace-only text and a duplicate each show a clear message in the dialog.
- Pasted `<script>` and `<img onerror>` text, in both title and body, stayed inert in the list, viewer, answer and citation panel. Accented, Chinese and symbol characters were preserved.
- Sources were still there after a reload.

### Web-link sources
- example.com and an iana.org page processed in 2.5 to 6.7 s. 2 of 2 questions were answered correctly with citations that opened the right text.
- A non-URL string is blocked by the field. An `ftp://` address, an unresolvable host and a 404 each show a specific reason in the dialog.
- Internal addresses are refused with a clear message: `127.0.0.1`, `localhost`, `169.254.169.254`, `10.0.0.1`, and both of the public links I tried that redirect to an internal address.
- A 19,425-word article was ingested and answered from.
- Sources were still there after a reload.

### Public demo
- Loads in 2.4 s for a fresh visitor.
- Uploads are refused in the interface and by the API (403).
- No guest data reached the demo's answers or its `/search` endpoint: three planted markers from three guest accounts all came back empty. (`/passages` is the exception; see H1.)

### Response settings
- Each change saves immediately and is still set after a reload, in the menu and in the API.
- Settings are per notebook (a second notebook kept its defaults) and per guest (the second guest's notebook kept its defaults).
- Learning Guide clearly changes the answer: a greeting, step-by-step framing, headings and, with Detailed, questions to the student (170 and 195 words against 104).
- Answers kept their citations under every setting.

### Isolation between the two guests
- The second guest saw none of the first guest's notebooks, and opening the first guest's notebook URL showed none of its data.
- With the second guest's token, the API returned 404 for reading the first guest's notebook, sources, conversations and notes, and for pasting or adding a link into it.
- Asked for the first guest's planted marker, the second guest's notebook declined and retrieved only its own source.

### Delete confirmations
- Deleting a pasted source and a link source each asked for confirmation; both were cancelled and both sources remain.

## Improvements, in priority order

1. **Close `/passages`.** Require a session and return only the caller's own sources, or remove the legacy endpoints from production. Check `/search`, `/ask` and `/documents` the same way.
2. **Make the demo work.** Seed its documents, add a check that the three starter questions return answers, and link to it from the home page and back.
3. **Fix link sources.** Do not create a source when the fetch is refused; clear the form after each use; show the URL on the row and in the viewer; parse or refuse PDFs; refuse duplicates as paste does.
4. **Make ingestion visible and recoverable.** Show progress for long pages, and turn a source stuck in "Processing…" into a failed one with Retry.
5. **Tighten settings.** Validate values on the server, give Concise a real length target, and show a message when a save fails.

## Caveats

- **Builds:** findings before 20:19 UTC were seen on `0f7c597`. The link-form, duplicate-link, 404 and long-title findings were re-checked on `60b7c56`. M1, L3 and L4 were not.
- **First-audit fixes were not verified.** `60b7c56` claims to fix them and was live for the second half of this run, but re-testing those areas was out of scope.
- **Small samples for settings.** One trial per setting on two questions. Model output varies, so M6 shows a weak effect, not an exact measure.
- **Rate limit with real load is untested.** The demo is empty, so no model call was ever at stake.
- **Whether a long ingestion blocks other users** was not measured.
- **The second 502 is unexplained.** Render logs would show why; I have no access to them.
- **No real documents were probed for H1.** Only synthetic sources I created.
- **Deletion and Reset Workspace were not executed.**
- **Phone and tablet layouts were not part of this round.**

## Test data left behind

All synthetic, in three isolated guest accounts:

- Guest 1: notebooks "AUDIT2 ORBIT 3300 (synthetic round 2)" (12 sources, 7 of them failed links) and "AUDIT2 link edge cases (synthetic round 2)" (8 sources, one stuck in Processing).
- Guest 2: notebook "AUDIT2 second guest (synthetic round 2)", whose settings still carry the stray `system_prompt` key from M7.
- Demo visitor: one guest account, no notebooks.
