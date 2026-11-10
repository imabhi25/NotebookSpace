"""Typo-tolerant identifier matching (no database dependencies)."""
import re
from difflib import SequenceMatcher

_IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
FUZZY_MATCH_RATIO = 0.72


def fuzzy_term_in_text(term: str, text: str, ratio: float = FUZZY_MATCH_RATIO) -> bool:
    """True when `term` is a slight misspelling of an identifier in `text` (e.g. 'stglen' ~ 'strgLen').

    Only single-word identifier-like terms of 4+ characters are compared, against tokens of similar length,
    so short words and numbers never match by accident.
    """
    t = term.lower()
    if len(t) < 4 or not _IDENT_RE.fullmatch(t):
        return False
    for tok in set(_IDENT_RE.findall(text)):
        w = tok.lower()
        if abs(len(w) - len(t)) > 3:
            continue
        if SequenceMatcher(None, t, w).ratio() >= ratio:
            return True
    return False

