"""Typo-, prefix- and abbreviation-tolerant token matching (no database dependencies).

Generic on purpose: nothing here knows about any subject or document. A query term matches a token from
a passage when it is a prefix of it ("str" ~ "strgLen"), an in-order subsequence sharing its first letter
("stglen" ~ "strglen"), or a close edit-distance match (difflib ratio >= 0.72, "strleng" ~ "strglen").
"""
import re
from difflib import SequenceMatcher

_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")
_WORDLIKE_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
FUZZY_MATCH_RATIO = 0.72
MIN_PREFIX_LEN = 3


def _is_subsequence(needle: str, haystack: str) -> bool:
    it = iter(haystack)
    return all(ch in it for ch in needle)


def term_matches_token(term: str, token: str, ratio: float = FUZZY_MATCH_RATIO) -> bool:
    t, w = term.lower(), token.lower()
    if t == w:
        return True
    if len(t) >= MIN_PREFIX_LEN and w.startswith(t):
        return True
    if len(t) >= 3 and t[0] == w[0] and len(w) <= 2 * len(t) + 1 and _is_subsequence(t, w):
        return True
    if len(t) >= 4 and abs(len(w) - len(t)) <= 3:
        return SequenceMatcher(None, t, w).ratio() >= ratio
    return False


def fuzzy_term_in_text(term: str, text: str, ratio: float = FUZZY_MATCH_RATIO) -> bool:
    """True when a single word-like `term` approximately matches some token in `text`."""
    if len(term) < 2 or not _WORDLIKE_RE.fullmatch(term):
        return False
    return any(term_matches_token(term, tok, ratio) for tok in set(_TOKEN_RE.findall(text)))
