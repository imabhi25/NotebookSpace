# Antigravity prompts — NotebookSpace differentiation

Paste **one phase at a time**. Don't start the next phase until the current one passes its tests and you've looked at it in the browser.

---

## Phase 1 — Make "sources change and disagree" the headline

```
You are working in the NotebookSpace repo: FastAPI + PostgreSQL/pgvector backend
(api/, answering/, db/) and a React + TypeScript + Vite frontend (frontend/src).
The LLM is Gemini, called through answering/llm.py.

GOAL
NotebookSpace already detects when two sources disagree. I want that to be the
product's headline feature, and I want it to go one step further: tell the student
which source is CURRENT when the documents make that clear. The positioning is
"NotebookLM summarizes your sources; NotebookSpace tells you when they disagree and
which one is current."

READ FIRST (don't change anything until you've read these)
- answering/notebook_answer.py: build_system_prompt() (the JSON contract, including
  the "conflicts" field) and the conflict validation block (~line 378 onward)
- answering/answer.py: the older /ask path with the same conflict rules. Keep both
  consistent.
- frontend/src/types.ts: ConflictClaim, ConflictItem, the answer result types
- frontend/src/components/AssistantMessage.tsx: the "These documents disagree" section
- frontend/src/components/SourcePanel.tsx
- db/notebook_store.py and db/migrations/: check what metadata a source has
  (created_at, title, etc.)
- tests/test_notebook.py, tests/test_answering.py, frontend/src/Notebook.test.tsx
- evaluation/README.md: how conflict precision is measured

WHAT TO BUILD

1. Backend: resolve conflicts when the documents allow it
   - Extend each conflict object in the LLM JSON contract with an optional
     "resolution":
       {"current_file": "<file>", "current_page": N,
        "basis": "explicit_supersede" | "newer_dated_document",
        "evidence": "<short quote or date that justifies it>"}
   - Only fill it in when (a) a document explicitly says it replaces or updates the
     other (e.g. "updated syllabus", "this announcement replaces..."), or (b) both
     claims carry dates in their text and one is clearly newer. Otherwise use null.
     Never guess. Keep the existing rule that the answer must present both values;
     add one line saying which is current when there is a resolution.
   - Validate it server-side the same way claims are validated: current_file must be
     one of the conflict's claim files, and basis must be one of the two enum values.
     Drop an invalid resolution (set it to null) rather than failing the whole answer.
   - Make the same change in answer.py so both paths agree.

2. Frontend: conflict card
   - When a conflict has a resolution, mark the current claim card "Current" and the
     other(s) "Superseded" (muted, but still readable and clickable to open the
     citation). Show the evidence text under the badge.
   - When there's no resolution, keep today's neutral "These documents disagree" view
     and add a short line: "The sources don't say which is newer. Check with your
     instructor."
   - Put a compact one-line summary ABOVE the answer body when there's a resolved
     conflict, e.g. "Heads up: Syllabus (Sep 14) updates the A2 due date." It should
     be scannable in under 2 seconds.

3. Frontend: source panel
   - If any answer in the current conversation resolved a source as superseded, show a
     small "Superseded" tag next to that source in SourcePanel, with a tooltip naming
     the newer source. Derive it client-side from messages; no new endpoint.

CONSTRAINTS
- Match existing code style, CSS variables and component patterns. No new UI
  libraries.
- Keep the security rules in the system prompt (passages are untrusted input).
- Must work in both the light and dark themes, at 390px, 768px and 1440px widths.
- Accessible: badges need text, not just colour; cards stay keyboard-focusable.
- Don't rename existing API fields; only add optional ones (backwards compatible).

TESTS (required)
- Backend unit tests: valid resolution kept; resolution pointing at a file not in the
  claims dropped; null resolution OK; bad basis dropped. Mock the LLM, the same way
  the existing tests do.
- Frontend tests: resolved conflict shows the Current/Superseded badges and the
  summary line; unresolved conflict shows the neutral message.
- Add 2–3 resolved-conflict questions to evaluation/questions.json using the
  EECS2031 syllabus versions (0906 / 0907 / 0914) and data/page_dumps/
  announcement_update.txt. Extend the eval to report "resolution accuracy".
- Run: pytest, and `cd frontend && npm test && npm run build`. All must pass.

DONE WHEN
Asking "When is assignment 2 due?" in the demo subject shows both dates, marks the
newer source as Current with evidence, and the old syllabus shows a Superseded tag in
the source panel. Show me screenshots at 1440px and 390px, light and dark.

Before writing code, give me a short plan listing the files you'll change, and wait
for my OK.
```

---

## Phase 2 — Course convention callouts

```
Continue in the NotebookSpace repo. Phase 1 (resolving conflicts / Current vs
Superseded) is done; reuse its patterns.

GOAL
Course materials often use different notation for the same thing: 1-indexed vs
0-indexed arrays, log base 2 vs ln, inclusive vs exclusive ranges, different
pseudocode conventions. Surface which convention an answer is following, and warn
when the selected sources disagree on a convention.

BUILD
1. Add an optional "conventions" array to the answer JSON contract in
   answering/notebook_answer.py:
     [{"topic": "array indexing", "value": "0-indexed", "file": "...", "page": N}]
   Only include conventions that are relevant to THIS answer and stated or clearly
   shown in the cited passages. Empty list otherwise. Validate them server-side the
   same way citations are (the file must be among the retrieved passages).
2. If two conventions share a topic but have different values from different files,
   treat it as a "convention mismatch". Show it as a softer, informational variant of
   the conflict card (not a red warning), e.g. "Lecture 03 uses 1-indexed arrays;
   Tutorial 02 uses 0-indexed. This answer follows Tutorial 02."
3. In AssistantMessage, render conventions as small pills at the top of the answer
   ("0-indexed arrays · Tutorial 02"). Clicking a pill opens the citation in the
   source viewer, like the existing citation chips.

CONSTRAINTS: same as Phase 1 (style, themes, responsive, a11y, backwards compatible).
TESTS: backend validation tests; a frontend test for the pills and the mismatch card;
1–2 eval questions against data/lecture_algorithms_math_code.pdf.
Plan first, wait for OK.
```

---

## Phase 3 — "Check My Proof" mode

```
Continue in the NotebookSpace repo.

GOAL
Add a third composer mode next to the existing response styles: "Check my proof".
Instead of writing the answer, the student submits their own attempt and gets
targeted, cited feedback. NotebookLM has a tutoring mode, but it doesn't grade the
student's own work against their course materials. That's the difference here.

BUILD
1. Composer (frontend/src/components/Composer.tsx): a mode toggle,
   Explain | Check my proof. In Check mode, show a prompt field ("What are you
   proving?") plus three labelled textareas: Initialization, Maintenance, Termination.
   Add a "Free-form" option for proofs that aren't loop invariants.
2. Backend: a new response_style "proof-check" in answering/notebook_answer.py with
   its own prompt and JSON contract:
     {"supported": bool,
      "sections": [{"part": "initialization"|"maintenance"|"termination"|"general",
                    "verdict": "correct"|"partially_correct"|"incorrect"|"missing",
                    "feedback": "<targeted feedback; do NOT write the full proof>",
                    "hint": "<one nudge toward the fix>",
                    "citations": [{"file": "...", "page": N}]}],
      "overall": "<one sentence>"}
   The feedback must be grounded in the course passages (the rubric or lecture
   definitions) and cited. It must not reveal a complete correct proof. Validate the
   citations like the existing path does.
3. Rendering: one card per part, with a verdict badge (text + colour), feedback, and a
   "Show hint" button that reveals the hint on click. Citation chips reuse the
   existing component.
4. Store these exchanges in the conversation like normal messages so they persist.

TESTS: validation of the new contract (bad verdicts dropped, citations validated),
the hint stays hidden until clicked, mode switching keeps the draft text.
Plan first, wait for OK.
```

---

## Phase 4 — Algorithm dry-run stepper (generated, not hard-coded)

```
Continue in the NotebookSpace repo.

GOAL
When an answer explains an array algorithm (loop invariant, binary search,
insertion sort, two pointers, prefix sums...), embed an interactive step-through
trace in the answer. It MUST be generated from the model's output for the actual
question. No hard-coded demo data.

BUILD
1. Add an optional "trace" field to the answer JSON contract. Only include it when
   the question is about an algorithm that works on an array:
     {"algorithm": "prefix sum",
      "array": [3, 1, 4, 1, 5],
      "steps": [{"label": "i = 0",
                 "pointers": {"i": 0},            // index markers to draw
                 "highlight": [0, 0],             // inclusive range, or null
                 "vars": {"sum": 0},
                 "phase": "initialization"|"maintenance"|"termination"|null,
                 "note": "<one short sentence>"}]}
   Cap it at 12 steps and 16 array cells.
2. Server-side validation: re-check every index against the array bounds and the
   step/size caps. If anything is invalid, drop the whole trace (the answer still
   renders). Never execute model-provided code.
3. New component frontend/src/components/TraceStepper.tsx:
   - Array cells; pointer labels under the cells; the highlighted range shaded
     (e.g. the invariant region [0..i-1]); a variables strip; the step note.
   - Prev / Next buttons, plus Left/Right arrow keys when it's focused. Play/pause is
     optional. Respect prefers-reduced-motion.
   - If the answer has a markdown table with Initialization / Maintenance /
     Termination rows, highlight the row matching the current step's phase.
   - Works at 390px (the cells shrink or scroll inside the component, never the page).
4. Render it inside AssistantMessage, below the answer body.

TESTS: validator (out-of-bounds index → trace dropped; too many steps → dropped);
stepper navigation and keyboard; phase-row sync. Add 2 eval questions against
data/lecture_algorithms_math_code.pdf that should produce a trace, and 2 syllabus
questions that must NOT produce one.
Plan first, wait for OK.
```

---

## Phase 5 — Reposition the README and add an accuracy page

```
Continue in the NotebookSpace repo.

1. Rewrite the opening of README.md. Remove "inspired by Gemini Notebook /
   NotebookLM". New first paragraph: a notebook that knows how courses work. It flags
   when sources disagree and which one is current, follows the course's notation, and
   checks your work against your materials. And it's measured. Then a "How it differs
   from NotebookLM" section of 4 short bullets (conflicts + resolution, conventions,
   proof checking, algorithm traces, published evaluation). Don't make absolute
   claims about what NotebookLM can't do; describe what this app does.
2. Add an "Accuracy" page in the frontend (linked from the dashboard and the demo)
   that reads the latest results from evaluation/results and shows: retrieval hit
   rate, citation accuracy, unsupported-answer rate, false abstention, conflict
   precision, resolution accuracy, p50/p95 latency, and cost per question. Plain
   table plus one sentence explaining each metric. Note the date of the eval run.
3. Make sure the numbers come from real eval runs; re-run the eval if the results
   are stale.
Plan first, wait for OK.
```
